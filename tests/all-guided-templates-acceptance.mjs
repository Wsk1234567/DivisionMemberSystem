import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('../vendor/xlsx.full.min.js');
const KPT = require('../src/domain.js');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const base = process.env.IMPORT_BASE || 'http://127.0.0.1:4197';
try {
  const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/admin.html?mode=admin');
  await page.waitForFunction(() => document.querySelector('#account')?.textContent.includes('@'));
  await page.locator('[data-nav="Import"]').click();
  const choice = page.locator('#import-type');
  const action = name => page.locator(`[data-action="${name}"]`).first();
  const snapshot = () => page.evaluate(() => KPTTransport.call({ action: 'bootstrap' }));
  let state = (await snapshot()).state;
  const memberId = state.Members[0].id;
  const examType = state.Catalog.find(row => row.kind === 'Exam' && !row.archived).name;
  const award = state.Catalog.find(row => row.kind === 'Award' && !row.archived && !state.Awards.some(a => a.memberId === memberId && a.catalogId === row.id));
  assert.ok(award);
  let activityId;
  const fixtures = {
    Activities: () => ({ name: 'Guided fictional activity', date: '2030-01-15', tags: 'DIM|Inspection', archived: 'FALSE' }),
    Attendance: () => ({ activityId, memberId, present: 'TRUE' }),
    Exams: () => ({ memberId, type: examType, date: '2030-01-15', result: 'Pass', attended: 'TRUE', certificate: '0000-TEST', archived: 'FALSE' }),
    Duty: () => ({ memberId, year: 2030, hours: 60.5 }),
    Awards: () => ({ memberId, catalogId: award.id, date: '2030-01-15', certificate: '0000-AWARD', notes: 'Fictional browser test', archived: 'FALSE' }),
    Enrolments: () => ({ memberId, year: 2030, form: 'Form 1', status: 'Active' })
  };
  for (const table of Object.keys(fixtures)) {
    await choice.selectOption(table);
    const meta = await page.evaluate(table => KPTWorkbook.templateInfo(table), table);
    assert.equal(meta.dataStartRow, 13);
    assert.ok(!meta.columns.some(column => ['id', 'version'].includes(column.field)));
    const guideText = await page.locator('#import-guide-body').innerText();
    for (const column of meta.columns) assert.ok(guideText.includes(column.label), 'Guide covers ' + table + '.' + column.field);
    const downloadEvent = page.waitForEvent('download');
    await action('importTemplate').click();
    const downloaded = await downloadEvent;
    const bytes = await fs.readFile(await downloaded.path());
    const book = XLSX.read(bytes, { type: 'buffer' });
    assert.deepEqual(book.SheetNames.filter((_, i) => !book.Workbook?.Sheets?.[i]?.Hidden), [table]);
    const sheet = book.Sheets[table];
    assert.equal(sheet.A1.v, meta.title);
    const zip = XLSX.CFB.read(bytes, { type: 'buffer' });
    const xml = path => Buffer.from(zip.FileIndex[zip.FullPaths.indexOf('Root Entry/' + path)].content).toString('utf8');
    const sheetXml = xml('xl/worksheets/sheet1.xml');
    assert.match(sheetXml, /state="frozen"/);
    assert.ok(!zip.FullPaths.some(path => /comments|vmlDrawing/.test(path)));
    assert.ok((xml('xl/styles.xml').match(/<border>/g) || []).length > 1);
    const parsedEmpty = await page.evaluate(({ bytes, table }) => KPTWorkbook.parse(new Uint8Array(bytes), { table }), { bytes: [...bytes], table });
    assert.equal(parsedEmpty.workbook[table]?.length, 0, table + ' example must not be imported.');
    const values = fixtures[table]();
    for (const [column, descriptor] of meta.columns.entries()) {
      let value = values[descriptor.field] ?? '';
      if (descriptor.reference && value) value = state[descriptor.reference].find(row => row.id === value)?.name || value;
      sheet[XLSX.utils.encode_cell({ r: 12, c: column })] = { t: typeof value === 'number' ? 'n' : 's', v: value };
    }
    await page.locator('#excel-file').setInputFiles({ name: table + '-fictional.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(XLSX.write(book, { type: 'array', bookType: 'xlsx' })) });
    await action('previewImport').click();
    await action('commitImport').waitFor();
    const before = state;
    await action('commitImport').click();
    await page.waitForFunction(async ({ table, count }) => (await KPTTransport.call({ action: 'bootstrap' })).state[table].length === count + 1, { table, count: before[table].length });
    state = (await snapshot()).state;
    assert.equal(state[table].length, before[table].length + 1);
    const added = state[table].at(-1);
    assert.ok(added.id && added.version >= 1);
    if (table === 'Activities') {
      activityId = added.id;
      assert.deepEqual(added.tags, ['DIM', 'Inspection']);
    }
    if (table === 'Attendance') assert.equal(added.present, true);
    if (table === 'Exams') { assert.equal(added.result, 'Pass'); assert.equal(added.certificate, '0000-TEST'); }
    if (table === 'Duty') assert.equal(added.hours, 60.5);
    if (table === 'Awards') { assert.equal(added.name, award.name); assert.equal(added.category, award.category); }
    if (table === 'Enrolments') assert.equal(added.status, 'Active');
    const exportEvent = page.waitForEvent('download');
    await action('importExisting').click();
    const exported = await exportEvent;
    const exportBook = XLSX.read(await fs.readFile(await exported.path()), { type: 'buffer' });
    assert.deepEqual(XLSX.utils.sheet_to_json(exportBook.Sheets[table], { header: 1 })[0], KPT.fields[table], 'Update exports preserve id/version machine headers.');
    console.log('PASS: ' + table + ' guide, styled download, example excluded, populated preview/commit, and legacy export');
  }
  for (const table of ['Members', ...Object.keys(fixtures)]) {
    await choice.selectOption(table);
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, table + ' mobile overflow');
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: all seven guides work on mobile without uncaught errors');
} finally {
  await browser.close();
}
