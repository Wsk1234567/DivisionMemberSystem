// Service Stripe & Star — strict end-to-end browser acceptance (port 4197).
// Main flow asserts REAL success at every step. Failure-keeps-input is a
// separate fault-injection test below. No "either success or failure" branches.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { PDFDocument } = require(path.join(__dirname, '..', 'vendor', 'pdf-lib.min.js'));

const playwrightUrl = process.env.PLAYWRIGHT_MODULE || 'playwright';
const chromiumPath = process.env.CHROMIUM_EXECUTABLE || undefined;
const BASE = process.env.SERVICE_BASE || 'http://127.0.0.1:4197';

const { chromium } = await import(playwrightUrl);

// A real one-page PDF — not just magic bytes — so upload validation and
// downstream PDF merging both see a valid document.
async function makePdfBytes(title) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawText(String(title || 'QA'), { x: 50, y: 780, size: 14 });
  return Buffer.from(await doc.save());
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const errors = [];
  try {
    const dutyPdf = await makePdfBytes('Combined duty QA');

    // ---- Controller page owns the shared demo transport ----
    const controller = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    controller.on('pageerror', e => errors.push('controller: ' + e.message));
    await controller.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
    await controller.waitForFunction(() => window.KPTTransport && document.querySelector('#account'));

    const pageRole = new Map();
    async function sharedCall(page, payload) {
      // An explicit payload.role wins and rebinds the page; otherwise use the
      // page's current binding. Never silently ignore a requested role.
      if (payload && payload.kind === 'setDemoRole' && payload.role) {
        pageRole.set(page, String(payload.role));
      }
      const role = pageRole.get(page) || 'owner';
      return controller.evaluate(async (p) => {
        await window.KPTTransport.setDemoRole(p.role);
        if (p.kind === 'setDemoRole') return window.KPTTransport.setDemoRole(p.role);
        return window.KPTTransport.call(p.request);
      }, { kind: payload.kind, role, request: payload.request });
    }
    const PROXY = `window.KPTTransport = { demo: true, publicUrl: 'index.html',
      async setDemoRole(role) { return window.__liveSharedCall({ kind: 'setDemoRole', role: String(role) }); },
      async call(request) { return window.__liveSharedCall({ kind: 'call', request: request }); } };`;
    async function armProxy(page, role) {
      pageRole.set(page, role);
      await page.exposeFunction('__liveSharedCall', async (payload) => sharedCall(page, payload));
      await page.route('**/demo-transport.js', route => route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: PROXY }));
    }
    async function enterAdminWork(page) {
      const modeBtn = page.locator('[data-action="setMode"][data-id="admin"]');
      if (await modeBtn.count()) {
        await modeBtn.first().click();
        await page.waitForTimeout(250);
      }
    }

    // ---- 1) Public anonymous submit must truly succeed ----
    const publicPage = await browser.newPage({ viewport: { width: 375, height: 800 } });
    publicPage.on('pageerror', e => errors.push('public: ' + e.message));
    await armProxy(publicPage, 'owner');
    await publicPage.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await publicPage.locator('#service-open').click();
    await publicPage.locator('#service-form').waitFor();
    await publicPage.locator('#svc-name').fill('Strict QA Cadet');
    await publicPage.locator('#svc-ic').fill('STRICT-IC-4TH');
    await publicPage.locator('#svc-declaredYear').selectOption('4');
    // 4th year maps to both awards on the live strip.
    const mapText = await publicPage.locator('#svc-year-map').innerText();
    assert.match(mapText, /Stripe/);
    assert.match(mapText, /Star/);
    await publicPage.locator('#svc-submit').click();
    await publicPage.locator('#svc-result').waitFor();
    // Wait for the async submit to settle on the success message (not "Sending…").
    await publicPage.waitForFunction(() => {
      const el = document.querySelector('#svc-result');
      return el && /reference|编号|received|已收到/i.test(el.textContent || '');
    }, null, { timeout: 15000 });
    const resultText = await publicPage.locator('#svc-result').innerText();
    // STRICT: the submit must be acknowledged with a reference.
    assert.match(resultText, /reference|编号/i, 'submit returns a reference');
    assert.equal(resultText.includes('STRICT-IC-4TH'), false, 'IC is not echoed');

    // ---- 2) Secretary's list must contain the new application ----
    const secretary = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    secretary.on('pageerror', e => errors.push('secretary: ' + e.message));
    await armProxy(secretary, 'admin');
    await secretary.goto(BASE + '/admin.html?mode=admin', { waitUntil: 'domcontentloaded' });
    await secretary.waitForFunction(() => window.KPTTransport && document.querySelector('#account'));
    await enterAdminWork(secretary);
    await secretary.waitForTimeout(200);
    await secretary.locator('#navigation [data-nav="Service"]').click();
    await secretary.waitForTimeout(500);
    const listText = await secretary.locator('#content').innerText();
    assert.match(listText, /Strict QA Cadet/, 'the submitted application appears in the Secretary list');

    // ---- 3) Red dot badge updates on the Service nav ----
    const badge = secretary.locator('#navigation [data-nav="Service"] .hub-badge');
    assert.ok(await badge.count() > 0, 'a red-dot badge is shown for the new application');

    // ---- 4) Member binding + reference + confirm 4th year ----
    await secretary.locator('[data-svc-open]').first().click();
    await secretary.waitForTimeout(300);
    const memberPick = secretary.locator('#svc-member-pick');
    assert.ok(await memberPick.count(), 'member picker rendered');
    await memberPick.selectOption({ index: 1 }); // first real member
    await secretary.locator('#svc-confYear').selectOption('4');
    await secretary.locator('#svc-year').fill('2026');
    assert.match(await secretary.locator('#svc-member-selection').innerText(), /待保存|unsaved/);
    assert.equal(await secretary.locator('#svc-reference').getAttribute('readonly'), '');
    // First-time binding may raise an IC mismatch confirm — answer it explicitly.
    secretary.once('dialog', d => d.accept());
    await secretary.locator('[data-svc-save]').first().click();
    await secretary.waitForTimeout(700);
    assert.match(await secretary.locator('#svc-admin-notice').innerText(), /保存|Saved/i, 'the save is acknowledged');
    assert.match(await secretary.locator('.svc-detail .svc-status-Preparing').innerText(), /待定-文件缺失|documents missing/);

    assert.equal(await secretary.locator('#svc-reference').inputValue(), '2026-G001');
    assert.match(await secretary.locator('#svc-member-selection').innerText(), /已绑定|Linked/);

    // 4th-year forms are generated and attached together, without downloading first.
    secretary.on('console', msg => { if (msg.text().startsWith('[Service awards]')) console.log(msg.text()); });
    await secretary.evaluate(() => {
      const original = KPTTransport.call.bind(KPTTransport);
      KPTTransport.call = request => {
        if (request.action === 'serviceGetTemplates') {
          KPTTransport.call = original;
          return Promise.reject(new Error('QA: template temporarily unavailable'));
        }
        return original(request);
      };
    });
    await secretary.locator('#svc-signing-date').fill('2026-11-06');
    await secretary.locator('[data-svc-generate]').click();
    await secretary.getByText('QA: template temporarily unavailable', { exact: true }).first().waitFor();
    assert.equal(await secretary.locator('#svc-signing-date').inputValue(), '2026-11-06');
    assert.equal(await secretary.locator('#svc-reference').inputValue(), '2026-G001');
    await secretary.locator('[data-svc-generate]').click();
    await secretary.waitForFunction(() => !document.querySelector('#svc-admin')?.inert);
    const generationMessage = await secretary.locator('[data-svc-feedback="2"]').innerText();
    assert.match(generationMessage, /2/, generationMessage);
    await secretary.getByText('SS-02_2026-G001.pdf', { exact: false }).first().waitFor();
    await secretary.getByText('SSTR-02_2026-G001.pdf', { exact: false }).first().waitFor();
    assert.match(await secretary.locator('[data-svc-feedback="2"]').innerText(), /2/);

    const input = secretary.locator('input[data-svc-upload-for^="application:"]').first();
    await input.setInputFiles({ name: 'duty-detail.pdf', mimeType: 'application/pdf', buffer: dutyPdf });
    await secretary.getByText('duty-detail.pdf', { exact: false }).first().waitFor();

    await secretary.locator('[data-svc-document-status="AwaitingOwner"]').click();
    await secretary.locator('.svc-detail .svc-status-AwaitingOwner').waitFor();
    assert.match(await secretary.locator('.svc-detail .svc-status-AwaitingOwner').innerText(), /待定-文件齐全|documents complete/);

    // ---- 7) Create batch and add the application ----
    // Must switch to batches tab first
    await secretary.locator('[data-svc-tab="batches"]').click();
    await secretary.waitForTimeout(300);
    const beforeBatches = await secretary.locator('[data-svc-batch-open]').count();
    // newBatch asks two prompts in order: title, then year (language-independent).
    let promptCount = 0;
    secretary.on('dialog', async d => {
      promptCount += 1;
      await d.accept(promptCount === 1 ? 'QA Batch' : '2026');
    });
    await secretary.locator('[data-svc-new-batch]').click();
    await secretary.waitForTimeout(800);
    const afterBatches = await secretary.locator('[data-svc-batch-open]').count();
    assert.ok(afterBatches > beforeBatches, 'a batch was created');
    if (!(await secretary.locator('.svc-batch-detail').count())) await secretary.locator('[data-svc-batch-open]').last().click();
    await secretary.waitForTimeout(300);
    const addBtn = secretary.locator('[data-svc-batch-add]').first();
    assert.ok(await addBtn.count(), 'applications can be added to the batch');
    await addBtn.click();
    await secretary.waitForTimeout(500);
    assert.match(await secretary.locator('#svc-admin-notice').innerText(), /保存|Saved/i, 'batch change acknowledged');

    await secretary.locator('#svc-check-covering').selectOption('N');
    await secretary.locator('[data-svc-save-checks]').click();
    assert.equal(await secretary.locator('#svc-check-covering').inputValue(), 'N');

    // ---- 8) ZIP package must contain Duty + checklists + signed forms ----
    const zipDownloads = [];
    secretary.on('download', d => zipDownloads.push(d));
    await secretary.locator('[data-svc-batch-zip]').first().click();
    await secretary.waitForTimeout(1500);
    assert.ok(zipDownloads.length >= 1, 'a ZIP was downloaded');
    const zipPath = await zipDownloads[zipDownloads.length - 1].path();
    const zipBytes = await import('node:fs').then(fs => fs.readFileSync(zipPath));
    const zipText = zipBytes.toString('latin1');
    assert.match(zipText, /Checklist/i, 'ZIP contains a checklist PDF');
    assert.match(zipText, /Signed-Stripe|signed-stripe/i, 'ZIP contains the signed Stripe PDF');
    assert.match(zipText, /Signed-Star|signed-star/i, 'ZIP contains the signed Star PDF');
    assert.match(zipText, /duty-detail|Duty/i, 'ZIP contains the duty PDF');

    // ---- 9) Secretary marks the batch ready, without switching to Owner ----
    await secretary.locator('[data-svc-batch-status][data-svc-to="Ready"]').click();
    await secretary.locator('[data-svc-batch-status][data-svc-to="Submitted"]').waitFor();
    assert.match(await secretary.locator('#content').innerText(), /已符合资格|Eligible/);

    assert.deepEqual(errors, [], 'no page errors during the main flow');
    console.log('PASS: strict submit → list → badge → member/ref/year → generate and attach dual PDFs → Duty upload → batch → ZIP contents → Secretary Ready');

    // ---- 10) Tab switching: applications / batches (reuses secretary) ----
    await secretary.locator('[data-svc-tab="applications"]').click();
    await secretary.waitForTimeout(300);
    const appTab = secretary.locator('[data-svc-tab="applications"]');
    const batchTab = secretary.locator('[data-svc-tab="batches"]');
    assert.ok(await appTab.count(), 'applications tab exists');
    assert.ok(await batchTab.count(), 'batches tab exists');
    await batchTab.click();
    await secretary.waitForTimeout(300);
    assert.match(await secretary.locator('#content').innerText(), /QA Batch|批次/, 'batch list visible after tab switch');
    await appTab.click();
    await secretary.waitForTimeout(300);
    assert.match(await secretary.locator('#content').innerText(), /Strict QA Cadet/, 'applications list visible after tab switch');
    console.log('PASS: tab switching applications ↔ batches');

    // ---- 11) Status filter (reuses secretary page) ----
    const SCREENSHOT_DIR = process.env.SERVICE_SCREENSHOT_DIR || path.join(os.tmpdir(), 'tccd-service-qa');
    await secretary.locator('[data-svc-tab="applications"]').click();
    await secretary.waitForTimeout(300);
    const statusFilter = secretary.locator('#svc-status-filter');
    assert.ok(await statusFilter.count(), 'status filter exists');
    // Filter Ready: the QA Batch is Ready, but apps inside it are also Ready via cascade
    await statusFilter.selectOption('Ready');
    await secretary.waitForTimeout(300);
    let filterText = await secretary.locator('#content').innerText();
    assert.match(filterText, /Strict QA Cadet|QA Batch/, 'Ready filter shows ready items');
    // Filter PendingSecretary: the Ready application should NOT appear
    await statusFilter.selectOption('PendingSecretary');
    await secretary.waitForTimeout(300);
    filterText = await secretary.locator('#content').innerText();
    assert.equal(filterText.includes('Strict QA Cadet'), false, 'PendingSecretary excludes Ready application');
    // Empty = show all
    await statusFilter.selectOption('');
    await secretary.waitForTimeout(300);
    filterText = await secretary.locator('#content').innerText();
    assert.match(filterText, /Strict QA Cadet/, 'empty filter shows all');
    console.log('PASS: status filter Ready shown, PendingSecretary excludes Ready app');

    // ---- 12) Desktop screenshots (reuses secretary page) ----
    if (await secretary.locator('.svc-detail').count()) await secretary.locator('[data-svc-open]').first().click();
    await secretary.screenshot({ path: SCREENSHOT_DIR + '/desktop-applications.png', fullPage: true });
    await secretary.locator('[data-svc-tab="batches"]').click();
    await secretary.waitForTimeout(300);
    if (await secretary.locator('.svc-batch-detail').count()) await secretary.locator('[data-svc-batch-open]').first().click();
    await secretary.screenshot({ path: SCREENSHOT_DIR + '/desktop-batches.png', fullPage: true });
    const batchOpen = secretary.locator('[data-svc-batch-open]').first();
    if (await batchOpen.count()) {
      if (!(await secretary.locator('.svc-batch-detail').count())) await batchOpen.click();
      await secretary.waitForTimeout(300);
      assert.equal(await secretary.locator('.svc-table').evaluate(table => table.scrollWidth <= table.parentElement.clientWidth + 1), true, 'batch detail fits its table');
      await secretary.screenshot({ path: SCREENSHOT_DIR + '/desktop-batch-detail.png', fullPage: true });
    }
    console.log('PASS: desktop screenshots captured to ' + SCREENSHOT_DIR);

    // ---- 13) Mobile screenshots (375px, separate page for mobile viewport) ----
    const mobileShot = await browser.newPage({ viewport: { width: 375, height: 812 } });
    mobileShot.on('pageerror', e => errors.push('mobile: ' + e.message));
    await armProxy(mobileShot, 'admin');
    await mobileShot.goto(BASE + '/admin.html?mode=admin', { waitUntil: 'domcontentloaded' });
    await mobileShot.waitForFunction(() => window.KPTTransport && document.querySelector('#account'));
    await enterAdminWork(mobileShot);
    await mobileShot.waitForTimeout(200);
    await mobileShot.locator('#navigation [data-nav="Service"]').click();
    await mobileShot.waitForTimeout(500);
    await mobileShot.screenshot({ path: SCREENSHOT_DIR + '/mobile-applications.png', fullPage: true });
    await mobileShot.locator('[data-svc-tab="batches"]').click();
    await mobileShot.waitForTimeout(300);
    await mobileShot.screenshot({ path: SCREENSHOT_DIR + '/mobile-batches.png', fullPage: true });
    await mobileShot.locator('[data-svc-batch-open]').first().click();
    assert.equal(await mobileShot.locator('.svc-table').evaluate(table => table.scrollWidth <= table.parentElement.clientWidth + 1), true, 'mobile batch detail fits its table');
    // Check no horizontal overflow on mobile
    const hasHScroll = await mobileShot.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(hasHScroll, false, 'no horizontal overflow on mobile');
    await mobileShot.close();
    console.log('PASS: mobile screenshots captured to ' + SCREENSHOT_DIR + ', no horizontal overflow');

    assert.deepEqual(errors, [], 'no page errors during acceptance tests');
    console.log('PASS: all acceptance additions — tabs, filter, screenshots, checklist, save, ZIP');

    // ---- Separate test: failure keeps every input (network fault injection) ----
    const faultPage = await browser.newPage({ viewport: { width: 375, height: 800 } });
    faultPage.on('pageerror', e => errors.push('fault: ' + e.message));
    await armProxy(faultPage, 'owner');
    await faultPage.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await faultPage.locator('#service-open').click();
    await faultPage.locator('#service-form').waitFor();
    await faultPage.locator('#svc-name').fill('Fault Cadet');
    await faultPage.locator('#svc-ic').fill('FAULT-IC-1');
    await faultPage.locator('#svc-declaredYear').selectOption('2');
    await faultPage.evaluate(() => {
      const orig = window.KPTTransport.call.bind(window.KPTTransport);
      window.KPTTransport.call = request => {
        if (request && request.action === 'submitServiceApplication') return Promise.reject(new Error('Network fault injected'));
        return orig(request);
      };
    });
    await faultPage.locator('#svc-submit').click();
    await faultPage.locator('#svc-result').waitFor();
    const faultText = await faultPage.locator('#svc-result').innerText();
    assert.match(faultText, /未能送出|not sent/i, 'the failure is reported');
    assert.equal(await faultPage.locator('#svc-name').inputValue(), 'Fault Cadet', 'name survives the failure');
    assert.equal(await faultPage.locator('#svc-ic').inputValue(), 'FAULT-IC-1', 'IC survives the failure');
    assert.deepEqual(errors, [], 'no page errors during fault injection');
    console.log('PASS: fault injection keeps every input');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
