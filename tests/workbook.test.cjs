const test = require('node:test');
const assert = require('node:assert/strict');
global.KPT = require('../src/domain.js');
global.XLSX = require('../vendor/xlsx.full.min.js');
const Workbook = require('../src/workbook.js');
const { fixture } = require('../src/demo-data.js');
const bytes = book => global.XLSX.write(book, { bookType: 'xlsx', type: 'array' });
test('Excel export round trips text IC and SJAM ID with leading zeros', () => {
  const state = fixture(3, 2026, 2026);
  const parsed = Workbook.parse(bytes(Workbook.create(state, false)));
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.workbook.Members[0].ic, '000000-00-0001');
  assert.equal(parsed.workbook.Members[0].sjamId, '010001');
  const preview = global.KPT.importRows(state, parsed.workbook, { uuid: () => 'new', actor: 'owner', now: '2026-01-01T00:00:00Z' });
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.changes.length, 0);
});
test('template has fixed sheets and headers', () => {
  const book = Workbook.create(global.KPT.empty(), true);
  assert.ok(book.SheetNames.includes('Duty'));
  assert.deepEqual(global.XLSX.utils.sheet_to_json(book.Sheets.Members, { header: 1 })[0], global.KPT.fields.Members);
  assert.equal(book.Sheets.Members.D2.z, '@');
  assert.equal(book.Sheets.Members.E1001.z, '@');
});
test('formula cells and numeric identifiers are rejected with cell row', () => {
  const book = Workbook.create(global.KPT.empty(), true);
  book.Sheets.Members = global.XLSX.utils.aoa_to_sheet([global.KPT.fields.Members, ['', 0, 'Student', 123, '001', '', '1', '', 'Active']]);
  book.Sheets.Members.C2.f = 'HYPERLINK("https://example.com","Student")';
  const parsed = Workbook.parse(bytes(book));
  assert.ok(parsed.errors.some(row => row.row === 2 && row.message.includes('formulas')));
  assert.ok(parsed.errors.some(row => row.row === 2 && row.message.includes('preserve leading zeros')));
});
test('column reordering works; blank rows retain actual Excel error positions', () => {
  const book = global.XLSX.utils.book_new();
  const headers = [...global.KPT.fields.Members].reverse();
  const values = { name: 'New Student', ic: '000-000', status: 'Active' };
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet([headers, [], [], headers.map(key => values[key] || '')]), 'Members');
  const parsed = Workbook.parse(bytes(book));
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.workbook.Members[0].name, 'New Student');
  assert.equal(parsed.workbook.Members[0].__excelRow, 4);
});
test('exported strings that look like formulas stay literal text', () => {
  const state = fixture(1, 2026, 2026);
  state.Members[0].name = '=HYPERLINK("https://example.com")';
  const book = global.XLSX.read(bytes(Workbook.create(state, false)), { type: 'array' });
  assert.equal(book.Sheets.Members.C2.t, 's');
  assert.equal(book.Sheets.Members.C2.f, undefined);
});
