// Live-update race tests with a shared fictional demo backend (port 4183).
// Controller owns demo-transport. Other pages proxy through it with a role-bound bridge,
// so OS/OT/OC share one state without leaking demoRole across pages.
// No real messages. Timeouts are not swallowed.
import assert from 'node:assert/strict';

const playwrightUrl = process.env.PLAYWRIGHT_MODULE || 'playwright';
const chromiumPath = process.env.CHROMIUM_EXECUTABLE || undefined;
const BASE = process.env.LIVE_BASE || 'http://127.0.0.1:4183';

const { chromium } = await import(playwrightUrl);

const PROXY_TRANSPORT = `window.KPTTransport = {
  demo: true,
  publicUrl: 'index.html',
  async setDemoRole(role) {
    return window.__liveSharedCall({ kind: 'setDemoRole', role: String(role) });
  },
  async call(request) {
    return window.__liveSharedCall({ kind: 'call', request: request });
  }
};`;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const errors = [];
  try {
    const controller = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    controller.on('pageerror', e => errors.push('controller: ' + e.message));
    await controller.goto(BASE + '/admin.html');
    await controller.waitForFunction(() => window.KPTTransport && document.querySelector('#account'));

    // page -> bound demo role (shared transport is single-threaded via evaluate).
    const pageRole = new Map();

    async function sharedCall(page, payload) {
      const role = pageRole.get(page) || 'owner';
      return controller.evaluate(async (p) => {
        // Always bind the calling page's role before any action.
        await window.KPTTransport.setDemoRole(p.role);
        if (p.kind === 'setDemoRole') return window.KPTTransport.setDemoRole(p.role);
        return window.KPTTransport.call(p.request);
      }, { kind: payload.kind, role, request: payload.request });
    }

    async function armProxy(page, role) {
      pageRole.set(page, role);
      await page.exposeFunction('__liveSharedCall', async (payload) => sharedCall(page, payload));
      await page.route('**/demo-transport.js', route => route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: PROXY_TRANSPORT
      }));
    }

    pageRole.set(controller, 'owner');
    const boot0 = await sharedCall(controller, { kind: 'call', request: { action: 'bootstrap' } });
    assert.equal(typeof boot0.changeKey === 'string' && boot0.changeKey.length > 0, true, 'bootstrap.changeKey baseline exists');

    const pkg = await sharedCall(controller, {
      kind: 'call',
      request: {
        action: 'createDocPackage',
        activityType: 'AGM',
        year: 2031,
        ocEmail: 'preview-oc@example.test',
        osEmail: 'preview-os@example.test',
        otEmail: 'preview-ot@example.test',
        revision: boot0.state.revision
      }
    }).then(r => r.state.DocPackages.at(-1));

    // OC page opens first (draft), then OS submits, then OC DOM must update live.
    const ocPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    ocPage.on('pageerror', e => errors.push('oc: ' + e.message));
    await armProxy(ocPage, 'oc');
    await ocPage.goto(BASE + '/admin.html?package=' + encodeURIComponent(pkg.id));
    await ocPage.waitForFunction(() => window.KPTTransport && document.querySelector('#account'));
    // Force OC identity through the shared bridge before reload/bootstrap.
    await sharedCall(ocPage, { kind: 'setDemoRole', role: 'oc' });
    await ocPage.locator('#reload').click();
    await ocPage.waitForFunction(() => (document.querySelector('#account').textContent || '').includes('preview-oc'));
    await ocPage.locator('[data-action="hubTab"], input[data-doc-upload]').first().waitFor();
    assert.equal(await ocPage.locator('[data-action="docCheck"]').count(), 0, 'OC has no check control before submit');

    const itemId = await sharedCall(controller, {
      kind: 'call',
      request: { action: 'bootstrap' }
    }).then(boot => boot.state.DocItems.find(i => i.packageId === pkg.id && !i.archived).id);

    await ocPage.evaluate(() => {
      window.__liveCalls = [];
      const call = KPTTransport.call;
      KPTTransport.call = request => {
        window.__liveCalls.push(request && request.action);
        return call(request);
      };
    });

    // OS work on controller (role bound to controller page).
    pageRole.set(controller, 'os');
    await controller.evaluate(async id => {
      await window.KPTTransport.setDemoRole('os');
      const boot = await window.KPTTransport.call({ action: 'bootstrap' });
      await window.KPTTransport.call({ action: 'docItemUpload', itemId: id, fileName: 'shared-race.pdf', fileBase64: 'JVBERi0xLjQgc2hhcmVk', revision: boot.state.revision });
      const after = await window.KPTTransport.call({ action: 'bootstrap' });
      await window.KPTTransport.call({ action: 'docItemSubmit', itemId: id, revision: after.state.revision });
    }, itemId);

    // OC DOM updates via live polling only — no reload, no bootstrap.
    await ocPage.locator('[data-action="docCheck"][data-table="pass"]').first().waitFor({ timeout: 20000 });
    const ocCalls = await ocPage.evaluate(() => window.__liveCalls.slice());
    assert.equal(ocCalls.includes('bootstrap'), false, 'OC live update used no bootstrap: ' + ocCalls.join(','));
    console.log('PASS: shared backend OS submit → OC DOM docCheck without reload/bootstrap');

    // Dirty real input on OT/OS page must survive live ticks.
    pageRole.set(controller, 'ot');
    await controller.evaluate(() => window.KPTTransport.setDemoRole('ot'));
    await controller.locator('#reload').click();
    await controller.waitForFunction(() => (document.querySelector('#account').textContent || '').includes('preview-ot'));
    const openFin = controller.locator('[data-action="financeOpenBook"], [data-action="financeAddBook"]').first();
    await openFin.waitFor();
    await openFin.click();
    await controller.locator('#finance-activity-name').waitFor();
    await controller.locator('#finance-activity-name').fill('DIRTY-DRAFT-KEEP-ME');
    await controller.evaluate(() => { window.dispatchEvent(new Event('focus')); });
    await controller.waitForTimeout(300);
    assert.equal(await controller.locator('#finance-activity-name').inputValue(), 'DIRTY-DRAFT-KEEP-ME', 'real dirty input is not overwritten');

    // Permission fingerprint changes.
    pageRole.set(controller, 'owner');
    const keys = await controller.evaluate(async () => {
      await window.KPTTransport.setDemoRole('owner');
      const boot = await window.KPTTransport.call({ action: 'bootstrap' });
      const before = (await window.KPTTransport.call({ action: 'liveProbe' })).changeKey;
      await window.KPTTransport.call({ action: 'setAccess', admins: ['preview-secretary@example.test'], treasurers: ['preview-treasurer@example.test'], ocs: ['preview-oc@example.test', 'preview-oc2@example.test'] });
      const after = (await window.KPTTransport.call({ action: 'liveProbe' })).changeKey;
      return { before, after };
    });
    assert.notEqual(keys.before, keys.after, 'setAccess changes permission changeKey');
    console.log('PASS: dirty real input preserved; permission changeKey moves');

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
