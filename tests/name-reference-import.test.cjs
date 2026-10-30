const test = require('node:test');
const assert = require('node:assert/strict');
global.KPT = require('../src/domain.js');
global.XLSX = require('../vendor/xlsx.full.min.js');
const Workbook = require('../src/workbook.js');
const references = () => ({
  Members: [
    { id: 'STU-A', name: 'Alex Lee', sjamId: '00001' },
    { id: 'STU-B', name: 'Alex Lee', sjamId: '00002' },
    { id: 'STU-C', name: 'Unique Member', sjamId: '00003' }
  ],
  Activities: [
    { id: 'ACT-A', name: 'Monthly Meeting', date: '2030-01-15', archived: false },
    { id: 'ACT-B', name: 'Monthly Meeting', date: '2030-02-15', archived: false },
    { id: 'ACT-C', name: 'Single Activity', date: '2030-03-15', archived: false }
  ]
});
function parseRow(activity, member, options = {}) {
  const book = Workbook.create(references(), true, null, { table: 'Attendance' });
  Object.assign(book.Sheets.Attendance, { A13: { t: 's', v: activity }, B13: { t: 's', v: member }, C13: { t: 'b', v: false } });
  return Workbook.parse(XLSX.write(book, { type: 'array', bookType: 'xlsx' }), { table: 'Attendance', references: references(), ...options });
}
test('full names and selected labels resolve to current IDs, preserving FALSE', () => {
  const result = parseRow('Single Activity', '  UNIQUE   MEMBER  ');
  assert.deepEqual(result.errors, []);
  assert.equal(result.workbook.Attendance[0].activityId, 'ACT-C');
  assert.equal(result.workbook.Attendance[0].memberId, 'STU-C');
  assert.equal(result.workbook.Attendance[0].present, false);
  const specific = parseRow('Monthly Meeting · 2030-02-15', 'Alex Lee · SJAM 00002');
  assert.deepEqual(specific.errors, []);
  assert.equal(specific.workbook.Attendance[0].activityId, 'ACT-B');
  assert.equal(specific.workbook.Attendance[0].memberId, 'STU-B');
});
test('missing, partial and ambiguous names never select a record', () => {
  for (const [activity, member] of [['Monthly Meeting', 'Unique Member'], ['Single Activity', 'Alex Lee'], ['Single Activity', 'Unique'], ['Missing Activity', 'Unique Member']]) {
    const result = parseRow(activity, member);
    assert.ok(result.errors.some(error => error.row === 13 && /找不到|多个匹配/.test(error.message)));
    assert.equal(result.workbook.Attendance.length, 0);
  }
  const missingState = parseRow('Single Activity', 'Unique Member', { references: undefined });
  assert.ok(missingState.errors.some(error => /名单未加载/.test(error.message)));
});
test('large lists are real named-range dropdowns on one very hidden helper sheet', () => {
  const state = references();
  state.Members = Array.from({ length: 500 }, (_, i) => ({ id: 'STU-' + i, name: 'Fictional Member ' + i, sjamId: String(i).padStart(6, '0'), ic: 'MUST_NOT_BE_INCLUDED' }));
  const bytes = Workbook.createStyledBytes(state, true, null, { table: 'Attendance' });
  const book = XLSX.read(bytes, { type: 'array' });
  assert.deepEqual(book.Workbook.Sheets.filter(sheet => !sheet.Hidden).map(sheet => sheet.name), ['Attendance']);
  assert.equal(book.Workbook.Sheets.find(sheet => sheet.name === '_TCCD_Choices').Hidden, 2);
  assert.ok(book.Workbook.Names.some(name => name.Name === 'TCCD_MembersChoices' && /500$/.test(name.Ref)));
  const labels = XLSX.utils.sheet_to_json(book.Sheets._TCCD_Choices, { header: 1 });
  assert.ok(!JSON.stringify(labels).includes('MUST_NOT_BE_INCLUDED'));
  const zip = XLSX.CFB.read(bytes, { type: 'array' });
  const xml = new TextDecoder().decode(zip.FileIndex[zip.FullPaths.indexOf('Root Entry/xl/worksheets/sheet1.xml')].content);
  assert.match(xml, /<formula1>TCCD_MembersChoices<\/formula1>/);
  assert.match(xml, /<formula1>TCCD_ActivitiesChoices<\/formula1>/);
  assert.ok(!xml.includes('Fictional Member 499'), 'list is not a truncated inline validation');
});
test('hidden list edits and removed members cannot override current system records', () => {
  const book = Workbook.create(references(), true, null, { table: 'Attendance' });
  book.Sheets._TCCD_Choices.A1 = { t: 's', v: 'Fake Person' };
  Object.assign(book.Sheets.Attendance, { A13: { t: 's', v: 'Single Activity' }, B13: { t: 's', v: 'Fake Person' }, C13: { t: 's', v: 'TRUE' } });
  const result = Workbook.parse(XLSX.write(book, { type: 'array', bookType: 'xlsx' }), { table: 'Attendance', references: references() });
  assert.ok(result.errors.some(error => /找不到/.test(error.message)));
  const removed = parseRow('Single Activity', 'Unique Member', { references: { ...references(), Members: [] } });
  assert.ok(removed.errors.some(error => /找不到/.test(error.message)));
});
test('previous guided ID headers and old exported machine headers remain compatible', () => {
  const book = Workbook.create(KPT.empty(), true, null, { table: 'Attendance' });
  Object.assign(book.Sheets.Attendance, { A12: { t: 's', v: '活动内部编号 *' }, B12: { t: 's', v: '会员内部编号 *' }, A13: { t: 's', v: 'ACT-C' }, B13: { t: 's', v: 'STU-C' }, C13: { t: 's', v: 'TRUE' } });
  const parsed = Workbook.parse(XLSX.write(book, { type: 'array', bookType: 'xlsx' }), { table: 'Attendance' });
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.workbook.Attendance[0].memberId, 'STU-C');
  const legacy = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(legacy, XLSX.utils.aoa_to_sheet([KPT.fields.Attendance, ['', '', 'ACT-C', 'STU-C', 'TRUE']]), 'Attendance');
  assert.deepEqual(Workbook.parse(XLSX.write(legacy, { type: 'array', bookType: 'xlsx' }), { table: 'Attendance' }).errors, []);
});
