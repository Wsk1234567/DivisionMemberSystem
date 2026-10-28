import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const base = process.env.HUB_UI_BASE || 'http://127.0.0.1:4195';
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.dismiss());
  await page.goto(base + '/admin.html');
  await page.waitForFunction(() => document.querySelector('#account')?.textContent.includes('@'));
  const pkg = await page.evaluate(async () => {
    const boot = await KPTTransport.call({ action: 'bootstrap' });
    const created = await KPTTransport.call({ action: 'createDocPackage', activityType: 'AGM', year: 2033, revision: boot.state.revision, osEmail: 'preview-os@example.test', otEmail: 'preview-ot@example.test', ocEmail: 'preview-oc@example.test' });
    return created.state.DocPackages.at(-1);
  });
  const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`).first();
  const nav = tab => page.locator(`#navigation [data-action="hubTab"][data-id="${tab}"]`);
  async function role(value) {
    await page.evaluate(async value => { await KPTTransport.setDemoRole(value); }, value);
    await page.locator('#reload').click();
    await page.waitForFunction(value => document.querySelector('#account')?.textContent.includes('preview-' + value), value);
    await nav(value === 'oc' ? 'hall' : 'studio').waitFor();
    await page.waitForFunction(tab => document.querySelector(`#navigation [data-action="hubTab"][data-id="${tab}"]`)?.getAttribute('aria-current') === 'page', value === 'oc' ? 'hall' : 'studio');
  }
  await role('os');
  assert.equal(await nav('studio').count(), 1);
  assert.equal(await nav('hall').count(), 1);
  assert.equal(await nav('notifications').count(), 1);
  assert.match(await page.locator('#content').innerText(), /OS/);
  assert.equal(await action('docSubmit').count(), 0, 'OS prepares documents in the workbench.');
  const upload = page.locator('input[data-doc-upload]').first();
  const itemId = await upload.getAttribute('data-doc-upload');
  await upload.setInputFiles({ name: 'workbench-letter.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fictional workbench') });
  await page.waitForFunction(async id => (await KPTTransport.call({ action: 'bootstrap' })).state.DocItems.find(item => item.id === id)?.status === 'Draft', itemId);
  await nav('hall').click();
  await action('docSubmit', itemId).click();
  await page.waitForFunction(async id => (await KPTTransport.call({ action: 'bootstrap' })).state.DocItems.find(item => item.id === id)?.status === 'AwaitingOC', itemId);

  await role('oc');
  const submittedNotification = await page.evaluate(async entityId => (await KPTTransport.call({ action: 'getHubNotifications' })).notifications.find(row => row.entityId === entityId && row.kind === 'SubmittedToOC'), itemId);
  assert.equal(submittedNotification.destination, 'studio', 'Historical backend destination remains supported.');
  await nav('notifications').click();
  await action('hubOpenNotif', submittedNotification.id).click();
  await page.waitForFunction(() => document.querySelector('#navigation [data-action="hubTab"][data-id="hall"]')?.getAttribute('aria-current') === 'page');
  const review = page.locator(`[data-action="docCheck"][data-id="${itemId}"][data-table="pass"]`);
  await review.waitFor();
  assert.match(await review.innerText(), /looks good|no issues|我看过|没问题/i);
  await review.click();
  await action('docForward', itemId).waitFor();
  assert.equal(await nav('hall').getAttribute('aria-current'), 'page', 'OC stays in submissions for both steps.');
  assert.match(await action('docForward', itemId).innerText(), /Owner|Admin/);
  await action('docForward', itemId).click();
  await nav('studio').click();
  assert.equal(await action('docCheck').count(), 0, 'OC personal area contains no document review queue.');
  assert.equal(await action('finCheck').count(), 0, 'OC personal area contains no finance review queue.');
  console.log('PASS: sidebar navigation, OS workbench submission, OC review and handoff in one page, personal OC area separated');

  await role('ot');
  await action('financeAddBook').click();
  await page.locator('#finance-activity-name').fill('Fictional personal OT book');
  await nav('hall').click();
  assert.equal(await page.locator('#finance-activity-name').inputValue(), 'Fictional personal OT book', 'Sidebar respects unsaved draft cancellation.');
  assert.equal(await nav('studio').getAttribute('aria-current'), 'page');
  await action('financeSave').click();
  const bookId = await page.evaluate(async packageId => (await KPTTransport.call({ action: 'bootstrap' })).state.FinBooks.find(book => book.packageId === packageId).id, pkg.id);
  await nav('hall').click();
  await action('finSubmit', bookId).click();
  await role('oc');
  await action('financeOpenBook', bookId).click();
  await page.locator('#finance-activity-name').waitFor();
  assert.equal(await page.locator('#finance-activity-name').isEditable(), false);
  assert.equal(await action('financeSave').count(), 0);
  assert.equal(await nav('hall').getAttribute('aria-current'), 'page', 'Viewing the submitted book does not redirect OC to the personal workbench.');
  await page.locator(`[data-action="finCheck"][data-id="${bookId}"][data-table="pass"]`).first().click();
  await action('finForward', bookId).waitFor();
  assert.match(await action('finForward', bookId).innerText(), /Treasurer|财政/i);
  await action('finForward', bookId).click();
  console.log('PASS: OT personal draft, dirty sidebar guard, OC read-only finance and explicit Treasurer handoff');

  await page.setViewportSize({ width: 375, height: 812 });
  await action('toggleLang').click();
  assert.match(await nav('studio').innerText(), /我的工作台/);
  assert.match(await nav('hall').innerText(), /提交与审批/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.env.WORKBENCH_SCREENSHOT) await page.screenshot({ path: process.env.WORKBENCH_SCREENSHOT, fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: conversational bilingual navigation, mobile sidebar and no uncaught browser errors');
} finally {
  await browser.close();
}
