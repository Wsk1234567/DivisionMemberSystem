import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.dismiss());
  await page.goto((process.env.HUB_UI_BASE || 'http://127.0.0.1:4173') + '/admin.html');
  await page.waitForFunction(() => document.querySelector('#account')?.textContent.includes('@'));
  const pkg = await page.evaluate(async () => {
    const boot = await KPTTransport.call({ action: 'bootstrap' });
    const created = await KPTTransport.call({ action: 'createDocPackage', activityType: 'AGM', year: 2026, revision: boot.state.revision, osEmail: 'preview-os@example.test', otEmail: 'preview-ot@example.test', ocEmail: 'preview-oc@example.test' });
    return created.state.DocPackages.at(-1);
  });
  const boot = () => page.evaluate(() => KPTTransport.call({ action: 'bootstrap' }));
  async function waitState(predicate) {
    for (let i = 0; i < 60; i++) {
      if (predicate((await boot()).state)) return;
      await page.waitForTimeout(100);
    }
    throw new Error('State did not update: ' + await page.locator('#notice').innerText());
  }
  async function role(name) {
    await page.evaluate(name => KPTTransport.setDemoRole(name), name);
    await page.locator('#reload').click();
    const email = { admin: 'preview-secretary', treasurer: 'preview-treasurer' }[name] || 'preview-' + name;
    await page.waitForFunction(email => document.querySelector('#account').textContent === email + '@example.test', email);
    if (['os', 'ot', 'oc'].includes(name)) await page.locator('[data-action="hubTab"][data-id="studio"]').first().waitFor();
  }
  const tab = name => page.locator('[data-action="hubTab"][data-id="' + name + '"]').first().click();
  const action = (name, id) => page.locator('[data-action="' + name + '"]' + (id ? '[data-id="' + id + '"]' : '')).first();
  await role('os');
  const upload = page.locator('input[data-doc-upload]').first();
  const itemId = await upload.getAttribute('data-doc-upload');
  await upload.setInputFiles({ name: 'proposal.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nFictional proposal') });
  await waitState(state => state.DocItems.find(row => row.id === itemId).status === 'Draft');
  assert.equal(await action('docSubmit', itemId).count(), 0);
  await role('oc');
  assert.equal(await action('docCheck', itemId).count(), 0);
  assert.ok(await action('docDownload', itemId).count(), 'OC reads saved drafts before formal submission.');
  await tab('notifications');
  await page.locator('[data-action="hubOpenNotif"]').first().waitFor();
  const event = await page.evaluate(async id => (await KPTTransport.call({ action: 'getHubNotifications' })).notifications.find(row => row.entityId === id), itemId);
  assert.equal(event.unread, true, 'Opening list does not clear unread.');
  await action('hubOpenNotif', event.id).click();
  await page.waitForFunction(() => document.querySelector('[data-action="hubTab"][data-id="studio"]').getAttribute('aria-current') === 'page');
  for (let i = 0; i < 30; i++) {
    const feed = await page.evaluate(() => KPTTransport.call({ action: 'getHubNotifications' }));
    if (!feed.notifications.find(row => row.id === event.id).unread) break;
    if (i === 29) throw new Error('Visible document was not marked read.');
    await page.waitForTimeout(50);
  }
  await role('os'); await tab('hall'); await action('docSubmit', itemId).click();
  await waitState(s => s.DocItems.find(r => r.id === itemId).status === 'AwaitingOC');
  await role('oc');
  await page.locator('[data-action="docCheck"][data-id="' + itemId + '"][data-table="pass"]').click();
  await waitState(s => s.DocItems.find(r => r.id === itemId).status === 'OCChecked');
  assert.equal(await action('docForward', itemId).count(), 0);
  await tab('hall'); await action('docForward', itemId).click();
  await waitState(s => s.DocItems.find(r => r.id === itemId).status === 'Submitted');
  await role('admin'); await action('docOpen', pkg.id).click(); await tab('hall'); await action('docApprove', itemId).click();
  await waitState(s => s.DocItems.find(r => r.id === itemId).status === 'Approved');
  console.log('PASS: OS draft → OC read → submit/check/forward → Admin approval');
  await role('ot'); await action('financeAddBook').click();
  await page.locator('#finance-activity-name').fill('Fictional activity accounts');
  await action('financeSave').click();
  await waitState(s => s.FinBooks.some(r => r.packageId === pkg.id));
  const bookId = (await boot()).state.FinBooks.find(r => r.packageId === pkg.id).id;
  await action('financeAddIncome').click();
  await page.locator('[data-fin="income"][data-key="description"]').fill('Receipt autosave check');
  await page.locator('[data-fin="income"][data-key="amount"]').fill('10');
  await tab('hall');
  assert.equal(await page.locator('#finance-activity-name').count(), 1, 'Cancel leave preserves dirty form.');
  await page.locator('#hub-receipt-file').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  await waitState(s => s.finAttachments?.some(r => r.bookId === bookId && r.active));
  assert.ok((await boot()).state.FinIncomes.some(r => r.description === 'Receipt autosave check'));
  await action('hubPreviewAttach').click();
  await page.waitForFunction(() => document.querySelector('[data-attach-preview]')?.src.startsWith('data:image/png'));
  if (process.env.HUB_SCREENSHOT) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: process.env.HUB_SCREENSHOT, fullPage: true });
  }
  await role('ot');
  await page.locator('#finance-activity-name').waitFor();
  assert.equal(await page.locator('#finance-activity-name').inputValue(), 'Fictional activity accounts');
  await role('oc'); await action('financeOpenBook', bookId).click();
  assert.equal(await page.locator('#finance-activity-name').isEditable(), false);
  assert.equal(await action('financeSave').count(), 0);
  assert.equal(await page.locator('#hub-receipt-file').count(), 0);
  assert.ok(await action('hubDownloadAttach').count());
  await role('ot'); await tab('hall'); await action('finSubmit', bookId).click();
  await waitState(s => s.FinBooks.find(r => r.id === bookId).status === 'AwaitingOC');
  await role('oc');
  await page.locator('[data-action="finCheck"][data-id="' + bookId + '"][data-table="pass"]').click();
  await waitState(s => s.FinBooks.find(r => r.id === bookId).status === 'OCChecked');
  await tab('hall'); await action('finForward', bookId).click();
  await waitState(s => s.FinBooks.find(r => r.id === bookId).status === 'Submitted');
  await role('treasurer');
  if (!await action('finApprove', bookId).count()) await action('financeOpenBook', bookId).click();
  await action('finApprove', bookId).click();
  await waitState(s => s.FinBooks.find(r => r.id === bookId).status === 'Approved');
  console.log('PASS: OT create/save/autosave receipt → OC read/check/forward → Treasurer approval');
  await page.evaluate(({ packageId, bookId }) => history.replaceState({}, '', '?mode=oc&package=' + encodeURIComponent(packageId) + '&entity=' + encodeURIComponent(bookId)), { packageId: pkg.id, bookId });
  await page.locator('#reload').click();
  await page.locator('#finance-activity-name').waitFor();
  assert.equal(await page.locator('#finance-activity-name').isEditable(), false, 'Telegram-style deep link opens the authorised finance entity read-only.');
  await page.evaluate(() => history.replaceState({}, '', location.pathname));
  await role('owner');
  const second = await page.evaluate(async () => {
    const boot = await KPTTransport.call({ action: 'bootstrap' });
    const created = await KPTTransport.call({ action: 'createDocPackage', activityType: 'AGM', year: 2027, revision: boot.state.revision, osEmail: 'preview-os@example.test', otEmail: 'preview-os@example.test', ocEmail: 'preview-os@example.test' });
    return created.state.DocPackages.at(-1);
  });
  await role('os');
  assert.equal(await page.locator('input[data-doc-upload]').count(), 0, 'Multiple activities require a selection.');
  await action('hubPick', second.id).click();
  assert.ok(await page.locator('input[data-doc-upload]').count(), 'Concurrent OS role is available: ' + await page.locator('#notice').innerText() + ' · ' + (await page.locator('#content').innerText()).slice(0, 400));
  await action('financeAddBook').click();
  await page.locator('#finance-activity-name').fill('Concurrent role accounts');
  await action('financeSave').click();
  await waitState(s => s.FinBooks.some(r => r.packageId === second.id));
  await page.locator('#finance-activity-name').fill('Keep this unsaved text');
  await page.evaluate(() => {
    window.hubTestActions = [];
    const call = KPTTransport.call;
    KPTTransport.call = request => { hubTestActions.push(request.action); return call(request); };
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#finance-activity-name').inputValue(), 'Keep this unsaved text');
  assert.deepEqual(await page.evaluate(() => hubTestActions), ['getHubNotifications'], 'Focus refresh does not bootstrap or overwrite draft.');
  await page.locator('[data-action="hubPick"][data-id=""]').click();
  assert.equal(await page.locator('#finance-activity-name').inputValue(), 'Keep this unsaved text', 'Activity picker also guards dirty data.');
  await action('financeSave').click();
  await waitState(s => s.FinBooks.some(r => r.activityName === 'Keep this unsaved text'));
  await tab('hall');
  const hallButton = page.locator('[data-action="hubTab"][data-id="hall"]').first();
  await page.waitForTimeout(100);
  assert.ok(await hallButton.locator('.hub-badge.quiet').count(), 'Pending tasks remain separate from unread count.');
  assert.ok(await hallButton.locator('.hub-badge:not(.quiet)').count(), 'Unread badge is independent.');
  await tab('notifications');
  await page.locator('[data-action="hubOpenNotif"]').first().waitFor();
  const ownEvent = await page.evaluate(async id => (await KPTTransport.call({ action: 'getHubNotifications' })).notifications.find(r => r.packageId === id && r.destination === 'hall'), second.id);
  await page.evaluate(() => {
    const call = KPTTransport.call;
    window.hubRestoreCall = call;
    KPTTransport.call = request => request.action === 'markHubNotificationsRead' ? Promise.reject(new Error('Fictional read-marker outage')) : call(request);
  });
  await action('hubOpenNotif', ownEvent.id).click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Fictional read-marker outage'));
  const failedFeed = await page.evaluate(() => KPTTransport.call({ action: 'getHubNotifications' }));
  assert.equal(failedFeed.notifications.find(r => r.id === ownEvent.id).unread, true, 'Read-marker failure preserves unread.');
  await page.evaluate(() => { KPTTransport.call = hubRestoreCall; });
  console.log('PASS: multiple activities, concurrent roles, dirty polling/navigation, badge separation and failed read markers');
  await role('os'); await page.setViewportSize({ width: 375, height: 812 });
  await action('toggleLang').click();
  assert.match(await page.locator('[data-action="hubTab"][data-id="studio"]').first().innerText(), /^我的工作室(?:\s+\d+)?$/);
  await action('toggleLang').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
  assert.deepEqual(errors, []);
  console.log('PASS: mobile layout and no uncaught browser errors');
} finally { await browser.close(); }
