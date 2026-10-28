const test = require('node:test');
const assert = require('node:assert/strict');
global.KPT = require('../src/domain.js');
global.XLSX = require('../vendor/xlsx.full.min.js');
const Workbook = require('../src/workbook.js');

test('designed worksheet keeps Excel schema order and one style per cell', () => {
  const data = Workbook.createStyledBytes(KPT.empty(), true, null, { table: 'Members' });
  const zip = XLSX.CFB.read(data, { type: 'array' });
  const xml = new TextDecoder().decode(zip.FileIndex[zip.FullPaths.indexOf('Root Entry/xl/worksheets/sheet1.xml')].content);
  const ordered = ['<sheetData', '<autoFilter', '<mergeCells', '<dataValidations', '<ignoredErrors'].map(tag => xml.indexOf(tag));
  assert.ok(ordered.every(n => n >= 0));
  assert.deepEqual(ordered, [...ordered].sort((a,b) => a-b), 'Excel rejects merges before the autofilter');
  for (const cell of xml.match(/<c\b[^>]*>/g)) assert.equal((cell.match(/\ss="/g) || []).length, 1, 'one style reference per cell');
});

test('V2 rejects unexpected header columns and blank cached formulas beyond entry columns', () => {
  for (const address of ['H12', 'H13']) {
    const book = Workbook.create(KPT.empty(), true, null, { table: 'Members' });
    book.Sheets.Members.A13 = { t:'s', v:'Fictional row' };
    book.Sheets.Members[address] = { t:'s', v:'', f:'""' };
    book.Sheets.Members['!ref'] = 'A1:H212';
    const parsed = Workbook.parse(XLSX.write(book, { type:'array', bookType:'xlsx' }), {table:'Members'});
    assert.ok(parsed.errors.some(e => e.row === Number(address.slice(1))), 'reject '+address+' even when cached value is empty');
  }
});
