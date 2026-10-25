// Browser smoke for hub UI on port 4181. Requires local preview server.
// Run: node tests/hub-browser.mjs  (after npm start with PORT=4181)
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.HUB_UI_BASE || 'http://127.0.0.1:4181';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/admin.html');
    await page.waitForFunction(() => window.KPTTransport && document.querySelector('#account'));
    // Hub tabs should appear for package-role shell after login/bootstrap.
    const studio = page.locator('[data-action="hubTab"][data-id="studio"]');
    const hall = page.locator('[data-action="hubTab"][data-id="hall"]');
    const notifications = page.locator('[data-action="hubTab"][data-id="notifications"]');
    if (await studio.count()) {
      assert.ok(await hall.count(), 'hall tab');
      assert.ok(await notifications.count(), 'notifications tab');
      await hall.first().click();
      await notifications.first().click();
      await studio.first().click();
      // 375px: no horizontal overflow
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      assert.equal(overflow, false, 'no horizontal overflow at 375px');
    }
    assert.deepEqual(errors, []);
    console.log('hub-browser smoke done (hub shell present or demo without package roles)');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
