// Service Stripe & Star — strict end-to-end browser acceptance (port 4197).
// Main flow asserts REAL success at every step. Failure-keeps-input is a
// separate fault-injection test below. No "either success or failure" branches.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
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
    const stripePdf = await makePdfBytes('Signed stripe QA');
    const starPdf = await makePdfBytes('Signed star QA');

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
    // The official form needs the Secretary-entered reference.
    await secretary.locator('#svc-reference').fill('QA-2026-001');
    // First-time binding may raise an IC mismatch confirm — answer it explicitly.
    secretary.once('dialog', d => d.accept());
    await secretary.locator('[data-svc-save]').first().click();
    await secretary.waitForTimeout(700);
    assert.match(await secretary.locator('#svc-admin-notice').innerText(), /保存|Saved/i, 'the save is acknowledged');

    // ---- 5) 4th year shows BOTH PDF buttons and both downloads fire ----
    const stripeBtn = secretary.locator('[data-svc-pdf][data-svc-pdf-kind="Stripe"]');
    const starBtn = secretary.locator('[data-svc-pdf][data-svc-pdf-kind="Star"]');
    assert.ok(await stripeBtn.count(), 'Stripe PDF button present for 4th year');
    assert.ok(await starBtn.count(), 'Star PDF button present for 4th year');
    const downloads = [];
    secretary.on('download', d => downloads.push(d.suggestedFilename()));
    await stripeBtn.first().click();
    await secretary.waitForTimeout(1000);
    await starBtn.first().click();
    await secretary.waitForTimeout(1000);
    assert.ok(downloads.length >= 2, 'both PDFs downloaded: ' + JSON.stringify(downloads));

    // ---- 6) Upload the three required 4th-year PDFs (duty + both signed) ----
    const uploadPair = async (kindValue, fileName, bytes) => {
      await secretary.locator('[data-svc-kind-for^="application:"]').first().selectOption(kindValue);
      const input = secretary.locator('input[data-svc-upload-for^="application:"]').first();
      await input.setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: bytes });
      await secretary.waitForTimeout(700);
    };
    await uploadPair('duty', 'duty-detail.pdf', dutyPdf);
    await uploadPair('signedStripe', 'signed-stripe.pdf', stripePdf);
    await uploadPair('signedStar', 'signed-star.pdf', starPdf);
    const filesText = await secretary.locator('#content').innerText();
    assert.match(filesText, /duty-detail\.pdf/, 'duty PDF listed');
    assert.match(filesText, /signed-stripe\.pdf/, 'signed stripe PDF listed');
    assert.match(filesText, /signed-star\.pdf/, 'signed star PDF listed');

    // ---- 7) Create batch and add the application ----
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
    await secretary.locator('[data-svc-batch-open]').last().click();
    await secretary.waitForTimeout(300);
    const addBtn = secretary.locator('[data-svc-batch-add]').first();
    assert.ok(await addBtn.count(), 'applications can be added to the batch');
    await addBtn.click();
    await secretary.waitForTimeout(500);
    assert.match(await secretary.locator('#svc-admin-notice').innerText(), /保存|Saved/i, 'batch change acknowledged');

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
    assert.match(await secretary.locator('#content').innerText(), /可提交|Ready to submit/);

    assert.deepEqual(errors, [], 'no page errors during the main flow');
    console.log('PASS: strict submit → list → badge → member/ref/year → dual PDFs → 3 uploads → batch → ZIP contents → Secretary Ready');

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
