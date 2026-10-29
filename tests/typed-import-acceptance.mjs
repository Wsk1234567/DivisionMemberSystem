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
  let designedTemplate;
  const guide = page.locator('#import-guide-body');
  await guide.waitFor({ state: 'visible' });
  const guideText = await guide.innerText();
  const memberInfo = await page.evaluate(() => KPTWorkbook.templateInfo('Members'));
  for (const column of memberInfo.columns) assert.ok(guideText.includes(column.label), 'The on-page guide covers ' + column.label);
  for (const value of ['00001234', 'Active', 'Graduated', 'Withdrawn', 'YYYY-MM-DD']) assert.ok(guideText.includes(value), 'The guide explains ' + value);
  await action('toggleImportGuide').click();
  await guide.waitFor({ state: 'hidden' });
  await action('toggleImportGuide').click();
  await guide.waitFor({ state: 'visible' });
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
    const meta = await page.evaluate(table => KPTWorkbook.templateInfo(table), table);
    assert.ok(meta && meta.columns.length, table + ' exposes filling instructions.');
    assert.equal(book.Sheets[table].A1.v, meta.title);
    assert.deepEqual(meta.columns.map((_, c) => book.Sheets[table][XLSX.utils.encode_cell({ r: 11, c })].v), meta.columns.map(column => column.label));
    assert.ok(download.suggestedFilename().includes(table));
    if (table === 'Members') {
      const sheet = book.Sheets.Members;
      designedTemplate = bytes;
      assert.equal(sheet.A1.v, 'TCCD 会员资料导入表 · 新会员');
      const headings = Array.from({ length: 7 }, (_, c) => sheet[XLSX.utils.encode_cell({ r: 11, c })].v);
      assert.deepEqual(headings, ['姓名 *', 'SJAM 会员编号', '身份证号码', '种族', '年级', '加入日期', '会员状态']);
      assert.ok(!Object.values(sheet).some(cell => cell?.c?.length), 'No overlaying comments or notes.');
      const zip = XLSX.CFB.read(bytes, { type: 'buffer' });
      const xml = name => Buffer.from(zip.FileIndex[zip.FullPaths.indexOf('Root Entry/' + name)].content).toString('utf8');
      assert.match(xml('xl/worksheets/sheet1.xml'), /&quot;Active,Graduated,Withdrawn&quot;|"Active,Graduated,Withdrawn"/, 'New templates keep English status choices.');
      assert.match(xml('xl/worksheets/sheet1.xml'), /state="frozen"/, 'The downloaded workbook freezes the header.');
      assert.match(xml('xl/worksheets/sheet1.xml'), /<dataValidations\b/, 'The downloaded workbook contains actual Excel dropdowns.');
      assert.ok((xml('xl/styles.xml').match(/<fill>/g) || []).length > 2, 'Downloaded bytes contain designed fills.');
      assert.ok((xml('xl/styles.xml').match(/<border>/g) || []).length > 1, 'Entry cells have real borders.');
      assert.ok(!zip.FullPaths.some(path => /comments|vmlDrawing/.test(path)), 'No drawing overlays in the archive.');
      const empty = await page.evaluate(bytes => KPTWorkbook.parse(new Uint8Array(bytes), { table: 'Members' }), [...bytes]);
      assert.equal(empty.workbook.Members?.length, 0, 'Examples are excluded from parsed data.');
    }
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

  const designedBook = XLSX.read(designedTemplate, { type: 'buffer' });
  Object.assign(designedBook.Sheets.Members, {
    A13: { t: 's', v: 'Designed template fictional graduate' },
    B13: { t: 's', v: '00007777', z: '@' },
    G13: { t: 's', v: '已毕业' },
    A14: { t: 's', v: 'Designed template fictional active' }
  });
  await page.locator('#excel-file').setInputFiles({ name: 'designed-members.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(XLSX.write(designedBook, { type: 'array', bookType: 'xlsx' })) });
  await action('previewImport').click();
  await action('commitImport').waitFor();
  const v2Request = await page.evaluate(() => window.__importCalls.filter(r => r.action === 'previewImport').at(-1));
  assert.equal(v2Request.workbook.Members.length, 2);
  assert.equal(v2Request.workbook.Members[0].status, 'Graduated');
  assert.equal(v2Request.workbook.Members[0].__excelRow, 13);
  await action('commitImport').click();
  await page.waitForFunction(async () => (await KPTTransport.call({ action: 'bootstrap' })).state.Members.some(row => row.name === 'Designed template fictional graduate'));
  const designedAfter = await page.evaluate(() => KPTTransport.call({ action: 'bootstrap' }));
  assert.equal(designedAfter.state.Members.length, after.state.Members.length + 2);
  assert.equal(designedAfter.state.Members.find(r => r.name === 'Designed template fictional graduate').sjamId, '00007777');
  assert.equal(designedAfter.state.Members.find(r => r.name === 'Designed template fictional active').status, 'Active');
  assert.ok(!designedAfter.state.Members.some(r => r.name === '示例学员甲'));
  console.log('PASS: designed template ignores example, imports row 13, translates Chinese status and preserves zeros/defaults');

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
