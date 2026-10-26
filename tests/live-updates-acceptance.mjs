import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.LIVE_BASE || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const errors = [];
try {
  const controller = await browser.newPage();
  await controller.goto(base + '/index.html');
  await controller.addScriptTag({ url: base + '/domain.js' });
  await controller.addScriptTag({ url: base + '/demo-transport.js' });
  let tail = Promise.resolve();
  const rpc = (role, request) => {
    const operation = tail.then(() => controller.evaluate(async ({ role, request }) => {
      await KPTTransport.setDemoRole(role);
      return KPTTransport.call(request);
    }, { role, request }));
    tail = operation.catch(() => {});
    return operation;
  };
  const mutation = async (role, request) => rpc(role, { ...request, revision: (await rpc(role, { action: 'bootstrap' })).state.revision });
  const created = await mutation('owner', { action: 'createDocPackage', activityType: 'AGM', year: 2032, ocEmail: 'preview-oc@example.test', osEmail: 'preview-os@example.test', otEmail: 'preview-ot@example.test' });
  const pkg = created.state.DocPackages.at(-1);
  const item = created.state.DocItems.find(row => row.packageId === pkg.id);
  const pages = [];
  async function open(role) {
    const page = await browser.newPage();
    pages.push(page);
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('__shared', request => rpc(role, request));
    await page.route('**/demo-transport.js', route => route.fulfill({ contentType: 'application/javascript', body: `window.__calls=[];window.KPTTransport={demo:true,publicUrl:'index.html',call:async r=>{window.__calls.push(r.action);return window.__shared(r);}};` }));
    await page.goto(base + '/admin.html?package=' + pkg.id);
    await page.waitForFunction(() => document.querySelector('#account')?.textContent.includes('@'));
    await page.locator('[data-action="hubTab"]').first().waitFor();
    await page.evaluate(() => { window.__calls = []; });
    return page;
  }
  const oc = await open('oc');
  const os = await open('os');
  const ot = await open('ot');
  const passDoc = () => oc.locator(`[data-action="docCheck"][data-id="${item.id}"][data-table="pass"]`);
  assert.equal(await passDoc().count(), 0);
  await mutation('os', { action: 'docItemUpload', itemId: item.id, fileName: 'fictional.pdf', fileBase64: Buffer.from('%PDF-1.4 fictional').toString('base64') });
  await mutation('os', { action: 'docItemSubmit', itemId: item.id });
  await passDoc().waitFor({ timeout: 16000 });
  const feed = await rpc('oc', { action: 'getHubNotifications' });
  assert.ok(feed.notifications.find(row => row.entityId === item.id && row.kind === 'SubmittedToOC').unread, 'Automatic refresh must not mark a submission read.');
  await os.locator('[data-action="hubTab"][data-id="notifications"]').first().click();
  await passDoc().click();
  await os.waitForFunction(() => document.querySelector('#content').textContent.includes('OC checked'), null, { timeout: 16000 });
  await os.waitForFunction(() => window.__calls.includes('liveSnapshot'), { timeout: 16000 });
  console.log('PASS: OS → OC task appears without reload; unread survives; OS receives a live snapshot after OC review');

  await ot.locator('[data-action="financeAddBook"]').first().click();
  await ot.locator('#finance-activity-name').fill('Unsaved local book');
  const before = await ot.evaluate(() => window.__calls.filter(action => action === 'liveSnapshot').length);
  await mutation('owner', { action: 'saveDocPackageMeta', packageId: pkg.id, ocEmail: 'preview-oc@example.test', osEmail: 'preview-os@example.test', otEmail: 'preview-ot@example.test', eventDate: '2032-11-20' });
  await ot.locator('#live-update-banner').waitFor({ timeout: 16000 });
  assert.equal(await ot.locator('#finance-activity-name').inputValue(), 'Unsaved local book');
  const stagedCount = await ot.evaluate(() => window.__calls.filter(action => action === 'liveSnapshot').length);
  assert.ok(stagedCount > before);
  await ot.waitForTimeout(5500);
  assert.equal(await ot.evaluate(() => window.__calls.filter(action => action === 'liveSnapshot').length), stagedCount, 'The same pending update must not reload full state every five seconds.');
  ot.on('dialog', dialog => dialog.accept());
  await ot.locator('[data-action="hubTab"][data-id="hall"]').first().click();
  await ot.waitForFunction(() => !document.querySelector('#live-update-banner'), { timeout: 16000 });
  console.log('PASS: dirty input retained, pending snapshot fetched once, deferred update applies after leaving the editor');

  const saved = await mutation('ot', { action: 'saveFinanceBook', book: { packageId: pkg.id, activityName: 'Remote finance', incomes: [{ date: '2032-10-26', description: 'Entry', amount: 5 }], expenses: [], reimbursements: [] } });
  const book = saved.state.FinBooks.at(-1);
  await mutation('ot', { action: 'submitFinBook', bookId: book.id });
  const finCheck = oc.locator(`[data-action="finCheck"][data-id="${book.id}"][data-table="pass"]`);
  await finCheck.waitFor({ timeout: 16000 });
  console.log('PASS: OT finance submission appears automatically in the already-open OC studio');

  await oc.evaluate(() => { window.__calls=[]; Object.defineProperty(document, 'hidden', { configurable:true, get:()=>true }); document.dispatchEvent(new Event('visibilitychange')); });
  await oc.waitForTimeout(5500);
  assert.equal(await oc.evaluate(() => window.__calls.filter(action => action === 'liveProbe').length), 0, 'Hidden pages do not poll.');
  await oc.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable:true, get:()=>false }); document.dispatchEvent(new Event('visibilitychange')); });
  await oc.waitForFunction(() => window.__calls.includes('liveProbe'));

  await mutation('owner', { action: 'saveDocPackageMeta', packageId: pkg.id, ocEmail: 'replacement@example.test', osEmail: 'preview-os@example.test', otEmail: 'preview-ot@example.test' });
  await finCheck.waitFor({ state: 'detached', timeout: 16000 });
  assert.equal(await oc.locator(`[data-action="docCheck"][data-id="${item.id}"]`).count(), 0);
  console.log('PASS: hidden polling pauses, returning resumes, revoked activity disappears without reload');
  for (const page of pages) {
    assert.equal(await page.evaluate(() => window.__calls.includes('bootstrap')), false, 'Automatic updates do not bootstrap or reload the page.');
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
