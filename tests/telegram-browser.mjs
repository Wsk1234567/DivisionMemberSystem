import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage();
  const errors = [];
  let telegramRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.route('https://api.telegram.org/**', route => { telegramRequests++; return route.abort(); });
  await page.goto((process.env.HUB_UI_BASE || 'http://127.0.0.1:4173') + '/admin.html');
  await page.waitForFunction(() => document.querySelector('#account')?.textContent.includes('@'));
  const button = name => page.locator('[data-action="' + name + '"]').first();
  await button('telegramSettings').click();
  await page.locator('#editor[open]').waitFor();
  assert.equal(await button('telegramCreate').count(), 0, 'Preview does not fake a configured bot.');
  assert.match(await page.locator('#editor-body').innerText(), /preview does not contact Telegram/);
  await page.locator('#close-editor').click();
  const revision = await page.evaluate(async () => (await KPTTransport.call({ action: 'bootstrap' })).state.revision);
  await page.evaluate(() => {
    const original = KPTTransport.call;
    window.telegramTestState = { configured: true, botUsername: 'tccdnotifybot', linked: false, enabled: false, telegramUser: null, pending: null, delivery: { pending: 0, failed: 0, lastError: '' }, workerInstalled: true };
    window.telegramTestRequests = [];
    KPTTransport.call = async request => {
      if (!['getTelegramStatus', 'createTelegramBinding', 'confirmTelegramBinding', 'cancelTelegramBinding', 'setTelegramEnabled', 'unlinkTelegram'].includes(request.action)) return original(request);
      telegramTestRequests.push(request);
      const state = telegramTestState;
      if (request.action === 'createTelegramBinding') return { ...state, binding: { url: 'https://t.me/tccdnotifybot?start=fictional_test_only', expiresAt: new Date(Date.now() + 600000).toISOString() } };
      if (request.action === 'confirmTelegramBinding') {
        if (request.bindingId !== state.pending.id) throw new Error('Wrong confirmation request.');
        state.telegramUser = { id: state.pending.userId, username: state.pending.username, displayName: state.pending.displayName };
        state.linked = true; state.enabled = true; state.pending = null;
      }
      if (request.action === 'cancelTelegramBinding') state.pending = null;
      if (request.action === 'setTelegramEnabled') state.enabled = request.enabled;
      if (request.action === 'unlinkTelegram') { state.linked = false; state.enabled = false; state.telegramUser = null; state.pending = null; }
      return JSON.parse(JSON.stringify(state));
    };
  });
  await button('telegramSettings').click();
  await button('telegramCreate').click();
  const link = page.locator('#editor-body a[href^="https://t.me/"]');
  assert.equal(await link.getAttribute('href'), 'https://t.me/tccdnotifybot?start=fictional_test_only');
  assert.equal(await button('telegramConfirm').count(), 0, 'Start link alone does not confirm the identity.');
  await page.evaluate(() => { telegramTestState.pending = { id: 'fictional-confirm', userId: '123456', username: 'fictional_user', displayName: '<img src=x onerror=alert(1)>', expiresAt: new Date(Date.now() + 600000).toISOString() }; });
  await button('telegramRefresh').click();
  assert.equal(await page.locator('#editor-body img').count(), 0, 'External identity text is escaped.');
  assert.ok((await page.locator('#editor-body').innerText()).includes('123456'));
  await button('telegramConfirm').click();
  assert.match(await page.locator('#editor-body').innerText(), /Notifications on/);
  await button('telegramEnable').click();
  assert.match(await page.locator('#editor-body').innerText(), /Notifications paused/);
  await button('telegramEnable').click();
  await button('telegramUnlink').click();
  assert.equal(await button('telegramEnable').count(), 0);
  await button('telegramCreate').click();
  await button('telegramCancel').click();
  assert.equal(await page.locator('#editor-body a[href^="https://t.me/"]').count(), 0);
  const requests = await page.evaluate(() => telegramTestRequests);
  assert.ok(requests.some(request => request.action === 'confirmTelegramBinding' && request.bindingId === 'fictional-confirm'));
  assert.equal(requests.some(request => 'email' in request || 'chatId' in request || 'token' in request), false);
  await page.locator('#close-editor').click();
  assert.equal(await page.evaluate(async () => (await KPTTransport.call({ action: 'bootstrap' })).state.revision), revision);
  assert.equal(telegramRequests, 0);
  assert.deepEqual(errors, []);
  console.log('PASS: Telegram modal, pending identity confirmation, escaping, pause/resume/unlink, no credentials or real Telegram requests');
} finally { await browser.close(); }
