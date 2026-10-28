// Workbench navigation browser tests (port 4184). Fictional data only.
import assert from 'node:assert/strict';

const playwrightUrl = process.env.PLAYWRIGHT_MODULE || 'playwright';
const chromiumPath = process.env.CHROMIUM_EXECUTABLE || undefined;
const BASE = process.env.WORKBENCH_BASE || 'http://127.0.0.1:4184';

const { chromium } = await import(playwrightUrl);

const PROXY_TRANSPORT = `window.KPTTransport = {
  demo: true,
  publicUrl: 'index.html',
  async setDemoRole(role) { return window.__liveSharedCall({ kind: 'setDemoRole', role: String(role) }); },
  async call(request) { return window.__liveSharedCall({ kind: 'call', request: request }); }
};`;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const errors = [];
  try {
    const controller = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    controller.on('pageerror', e => errors.push('controller: ' + e.message));
    await controller.goto(BASE + '/admin.html');
    await controller.waitForFunction(() => window.KPTTransport && document.querySelector('#account'));
    const pageRole = new Map();
    async function sharedCall(page, payload) {
      const role = pageRole.get(page) || 'owner';
      return controller.evaluate(async (p) => {
        await window.KPTTransport.setDemoRole(p.role);
        if (p.kind === 'setDemoRole') return window.KPTTransport.setDemoRole(p.role);
        return window.KPTTransport.call(p.request);
      }, { kind: payload.kind, role, request: payload.request });
    }
    async function armProxy(page, role) {
      pageRole.set(page, role);
      await page.exposeFunction('__liveSharedCall', async (payload) => sharedCall(page, payload));
      await page.route('**/demo-transport.js', route => route.fulfill({
        status: 200, contentType: 'application/javascript; charset=utf-8', body: PROXY_TRANSPORT
      }));
    }
    pageRole.set(controller, 'owner');

    const pkg = await controller.evaluate(async () => {
      const boot = await KPTTransport.call({ action: 'bootstrap' });
      const created = await KPTTransport.call({
        action: 'createDocPackage', activityType: 'AGM', year: 2032,
        ocEmail: 'preview-oc@example.test', osEmail: 'preview-os@example.test', otEmail: 'preview-ot@example.test',
        revision: boot.state.revision
      });
      return created.state.DocPackages.at(-1);
    });

    // --- Sidebar has the three fixed entries ---
    await controller.evaluate(async () => { await KPTTransport.setDemoRole('os'); });
    await controller.locator('#reload').click();
    await controller.waitForFunction(() => (document.querySelector('#account').textContent || '').includes('preview-os'));
    const navText = await controller.locator('#navigation').innerText();
    assert.match(navText, /工作台|Workbench/);
    assert.match(navText, /提交与审批|Submissions/);
    assert.match(navText, /通知|Notifications/);
    assert.match(navText, /Telegram/);
    assert.ok(await controller.locator('#navigation [data-action="toggleLang"]').count(), 'language switch in sidebar');
    assert.ok(await controller.locator('#navigation [data-action="hubTab"][data-id="studio"]').getAttribute('aria-current') === 'page', 'sidebar active on workbench');

    // --- OS defaults to workbench with plain title and CTA ---
    const contentText = await controller.locator('#content').innerText();
    assert.match(contentText, /OS文书工作台|OS document workbench/);
    assert.ok(await controller.locator('[data-action="hubTab"][data-id="hall"]').first().count(), 'ready CTA targets submissions');
    assert.match(contentText, /准备好了，去提交|Ready — go to submissions/);

    // --- OS hands in; OC defaults to submissions and checks there ---
    const itemId = await controller.evaluate(async (packageId) => {
      const boot = await KPTTransport.call({ action: 'bootstrap' });
      return boot.state.DocItems.find(i => i.packageId === packageId && !i.archived).id;
    }, pkg.id);
    await controller.evaluate(async id => {
      await KPTTransport.setDemoRole('os');
      const boot = await KPTTransport.call({ action: 'bootstrap' });
      await KPTTransport.call({ action: 'docItemUpload', itemId: id, fileName: 'wb.pdf', fileBase64: 'JVBERi0xLjQ=', revision: boot.state.revision });
      const after = await KPTTransport.call({ action: 'bootstrap' });
      await KPTTransport.call({ action: 'docItemSubmit', itemId: id, revision: after.state.revision });
    }, itemId);

    const ocPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    ocPage.on('pageerror', e => errors.push('oc: ' + e.message));
    await armProxy(ocPage, 'oc');
    await ocPage.goto(BASE + '/admin.html?package=' + encodeURIComponent(pkg.id));
    await ocPage.waitForFunction(() => window.KPTTransport && document.querySelector('#account'));
    await sharedCall(ocPage, { kind: 'setDemoRole', role: 'oc' });
    await ocPage.locator('#reload').click();
    await ocPage.waitForFunction(() => (document.querySelector('#account').textContent || '').includes('preview-oc'));
    // OC default is submissions page — check happens here, not on workbench.
    assert.equal(await ocPage.locator('#navigation [data-action="hubTab"][data-id="hall"]').first().getAttribute('aria-current'), 'page', 'OC defaults to submissions');
    await ocPage.locator('[data-action="docCheck"][data-table="pass"]').first().waitFor({ timeout: 15000 });
    const hallText = await ocPage.locator('#content').innerText();
    assert.match(hallText, /我看过，没问题|I have seen it, looks good/);
    assert.match(hallText, /退回给 OS 修改|Return to OS for edits/);
    // Send on → plain language, no "final approval"
    await ocPage.locator('[data-action="docCheck"][data-table="pass"]').first().click();
    await ocPage.locator('[data-action="docForward"]').first().waitFor({ timeout: 10000 });
    const forwardLabel = await ocPage.locator('[data-action="docForward"]').first().innerText();
    assert.match(forwardLabel, /交给 Owner\/Admin 批准|Send to Owner\/Admin for approval/);

    // --- 375px mobile: sidebar present, page has no horizontal overflow ---
    await ocPage.setViewportSize({ width: 375, height: 800 });
    const overflow = await ocPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(overflow, false, 'no horizontal overflow at 375px');
    assert.ok(await ocPage.locator('#navigation [data-action="hubTab"]').count() >= 3, 'sidebar nav visible on mobile');

    // --- Language toggle reachable ---
    await ocPage.locator('#navigation [data-action="toggleLang"]').click();
    await ocPage.waitForTimeout(100);
    const zhNav = await ocPage.locator('#navigation').innerText();
    assert.match(zhNav, /工作台|Workbench/);

    assert.deepEqual(errors, []);
    console.log('PASS: workbench sidebar, OC submissions flow, plain labels, 375px, lang toggle');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
