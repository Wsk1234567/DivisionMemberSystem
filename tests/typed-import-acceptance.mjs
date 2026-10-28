import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('../vendor/xlsx.full.min.js');
const KPT = require('../src/domain.js');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const base = process.env.IMPORT_BASE || 'http://127.0.0.1:4197';
function file(rows, extras = {}) {
  const book = XLSX.utils.book_new();
  for (const [table, values] of Object.entries({ ...rows, ...extras })) {
    const headers = KPT.fields[table] || ['unexpected'];
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ...values.map(row => headers.map(key => row[key] ?? ''))]), table);
  }
  return { name: 'fictional-import.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(XLSX.write(book, { type: 'array', bookType: 'xlsx' })) };
}
try {
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/admin.html?mode=admin');
  await page.waitForFunction(() => document.querySelector('#account')?.textContent.includes('@'));
  await page.locator('[data-nav="Import"]').click();
  const choice = page.locator('#content select').first();
  await choice.waitFor();
  assert.equal(await choice.inputValue(), 'Members', 'Beginner import defaults to members.');
  const action = name => page.locator(`[data-action="${name}"]`).first();
  const before = await page.evaluate(() => KPTTransport.call({ action: 'bootstrap' }));
  await page.evaluate(() => {
    window.__importCalls = [];
    const call = KPTTransport.call;
    KPTTransport.call = request => { if (['previewImport', 'commitImport'].includes(request.action)) window.__importCalls.push(JSON.parse(JSON.stringify(request))); return call(request); };
  });
  for (const table of ['Members', 'Attendance', 'Exams', 'Duty', 'Awards', 'Activities', 'Enrolments']) {
    await choice.selectOption(table);
    const downloadEvent = page.waitForEvent('download');
    await action('importTemplate').click();
    const download = await downloadEvent;
    const bytes = await fs.readFile(await download.path());
    const book = XLSX.read(bytes, { type: 'buffer' });
    assert.deepEqual(book.SheetNames, [table]);
    assert.deepEqual(XLSX.utils.sheet_to_json(book.Sheets[table], { header: 1 })[0], KPT.fields[table]);
    assert.ok(download.suggestedFilename().includes(table));
  }
  await choice.selectOption('Members');
  await page.locator('#excel-file').setInputFiles(file({ Members: [{ name: 'Typed import fictional member', sjamId: '00009999' }] }, { Awards: [{ name: 'MUST_NOT_IMPORT', memberId: 'missing' }], UnknownSheet: [{ unexpected: 'ignore me' }] }));
  await action('previewImport').click();
  await action('commitImport').waitFor();
  assert.ok((await page.locator('#content').innerText()).includes('Awards'), 'Other sheets are explicitly listed as ignored.');
  const preview = await page.evaluate(() => window.__importCalls.find(request => request.action === 'previewImport'));
  assert.deepEqual(Object.keys(preview.workbook), ['Members']);
  await action('commitImport').click();
  await page.waitForFunction(async () => (await KPTTransport.call({ action: 'bootstrap' })).state.Members.some(row => row.name === 'Typed import fictional member'));
  const after = await page.evaluate(() => KPTTransport.call({ action: 'bootstrap' }));
  assert.equal(after.state.Members.length, before.state.Members.length + 1);
  const imported = after.state.Members.find(row => row.name === 'Typed import fictional member');
  assert.equal(imported.sjamId, '00009999');
  assert.equal(imported.status, 'Active');
  for (const table of ['Attendance', 'Activities', 'Exams', 'Duty', 'Awards', 'Enrolments', 'Catalog']) assert.deepEqual(after.state[table], before.state[table], table + ' must remain unchanged.');
  console.log('PASS: seven single-sheet templates; selected Members payload only; leading zeros and defaults; unrelated records unchanged');

  await page.locator('#excel-file').setInputFiles(file({ Members: [{ name: 'Must not survive type change' }] }));
  await action('previewImport').click();
  await action('commitImport').waitFor();
  await choice.selectOption('Attendance');
  assert.equal(await action('commitImport').count(), 0, 'Changing type clears the pending confirmation.');
  await page.locator('#excel-file').setInputFiles(file({ Members: [{ name: 'Wrong sheet for Attendance' }] }));
  const callsBefore = await page.evaluate(() => window.__importCalls.length);
  await action('previewImport').click();
  await page.waitForTimeout(200);
  assert.equal(await action('commitImport').count(), 0);
  assert.equal(await page.evaluate(() => window.__importCalls.length), callsBefore, 'Missing selected sheet does not reach the server.');
  assert.ok((await page.locator('#content').innerText()).includes('Attendance'));

  await choice.selectOption('Members');
  await page.locator('#excel-file').setInputFiles(file({ Members: [{ name: 'Stale async preview must not import' }] }));
  await page.evaluate(() => {
    const call = KPTTransport.call;
    window.__previewWaiting = false;
    KPTTransport.call = async request => {
      const result = await call(request);
      if (request.action === 'previewImport') {
        window.__previewWaiting = true;
        await new Promise(resolve => { window.__releasePreview = resolve; });
      }
      return result;
    };
  });
  await action('previewImport').click();
  await page.waitForFunction(() => window.__previewWaiting);
  await choice.selectOption('Duty');
  await page.evaluate(() => window.__releasePreview());
  await page.waitForTimeout(200);
  assert.equal(await action('commitImport').count(), 0, 'A stale asynchronous response cannot restore an old confirmation.');
  console.log('PASS: type changes clear confirmation, missing selected sheet blocks preview, stale asynchronous previews are discarded');

  const advanced = await choice.locator('option').evaluateAll(options => options.find(option => /高级|advanced/i.test(option.textContent))?.value);
  assert.ok(advanced, 'Advanced full workbook import remains available.');
  await choice.selectOption(advanced);
  const completeEvent = page.waitForEvent('download');
  await action('importTemplate').click();
  const complete = await completeEvent;
  assert.ok(XLSX.read(await fs.readFile(await complete.path()), { type: 'buffer' }).SheetNames.includes('Instructions'));
  await choice.selectOption('Members');
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.env.IMPORT_SCREENSHOT) await page.screenshot({ path: process.env.IMPORT_SCREENSHOT, fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: advanced format retained, mobile layout, no uncaught browser errors');
} finally {
  await browser.close();
}
