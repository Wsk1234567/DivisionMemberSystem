const test = require('node:test');
const assert = require('node:assert/strict');
global.KPT = require('../src/domain.js');
global.XLSX = require('../vendor/xlsx.full.min.js');
const Workbook = require('../src/workbook.js');
const member = { id: 'STU-TEST', name: 'Fictional Member', sjamId: '00001' };
const bytes = book => XLSX.write(book, { type: 'array', bookType: 'xlsx' });

test('new guided exams reject empty and all-archived current exam catalogues', () => {
  for (const Catalog of [[], [{ id: 'CAT-OLD', kind: 'Exam', name: 'Archived Exam', archived: true }]]) {
    const state = { Members: [member], Activities: [], Catalog };
    const book = Workbook.create(state, true, null, { table: 'Exams' });
    Object.assign(book.Sheets.Exams, {
      A13: { t: 's', v: member.name }, C13: { t: 's', v: 'Archived Exam' },
      D13: { t: 's', v: '2030-01-15' }, E13: { t: 's', v: 'Pass' }, F13: { t: 's', v: 'TRUE' }
    });
    const parsed = Workbook.parse(bytes(book), { table: 'Exams', references: state });
    assert.ok(parsed.errors.some(error => error.row === 13 && /当前目录没有/.test(error.message)));
    assert.equal(parsed.workbook.Exams.length, 0);
  }
});

test('old nine-column guided Awards accepts a valid Catalog ID without redundant name/category/level', () => {
  const award = { id: 'CAT-TEST', kind: 'Award', category: 'Probadge', name: 'Fictional Award', level: 'Category 0', archived: false };
  const state = { Members: [member], Catalog: [award] };
  const book = Workbook.create(state, true, null, { table: 'Awards' });
  const headers = ['会员姓名 *', '奖项目录编号（Catalog ID）', '奖项类别（Category）', '奖项名称（Award Name）', '日期 *', '奖项等级（Level）', '证书编号', '备注', 'Archived（归档）'];
  headers.forEach((value, c) => book.Sheets.Awards[XLSX.utils.encode_cell({ r: 11, c })] = { t: 's', v: value });
  [member.name, award.id, '', '', '2030-01-15', '', '', '', 'FALSE'].forEach((value, c) => book.Sheets.Awards[XLSX.utils.encode_cell({ r: 12, c })] = { t: 's', v: value });
  book.Sheets.Awards['!ref'] = 'A1:I212';
  const parsed = Workbook.parse(bytes(book), { table: 'Awards', references: state });
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.workbook.Awards[0].catalogId, award.id);
  assert.equal(parsed.workbook.Awards[0].name, award.name);
  assert.equal(parsed.workbook.Awards[0].level, award.level);
});
