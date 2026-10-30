const test = require('node:test');
const assert = require('node:assert/strict');
global.KPT = require('../src/domain.js');
global.XLSX = require('../vendor/xlsx.full.min.js');
const Workbook = require('../src/workbook.js');
const { fixture } = require('../src/demo-data.js');
function populate(table, values, references) {
  const book = Workbook.create(KPT.empty(), true, null, { table });
  Workbook.templateInfo(table).columns.forEach((column, c) => {
    let value = values[column.field] ?? '';
    if (column.reference && references && value) value = references[column.reference].find(row => row.id === value)?.name || value;
    book.Sheets[table][XLSX.utils.encode_cell({ r: 12, c })] = { t: typeof value === 'boolean' ? 'b' : typeof value === 'number' ? 'n' : 's', v: value };
  });
  return Workbook.parse(XLSX.write(book, { type: 'array', bookType: 'xlsx' }), { table, references });
}
for (const table of Workbook.TYPED_TABLES) test(table + ': styled bytes have a single sheet, English enums, borders, and no importable examples', () => {
  const info = Workbook.templateInfo(table);
  assert.ok(info.columns.every(c => !['id', 'version'].includes(c.field)));
  const data = Workbook.createStyledBytes(KPT.empty(), true, null, { table });
  const book = XLSX.read(data, { type: 'array' });
  assert.deepEqual(book.SheetNames, [table]);
  assert.equal(book.Sheets[table].A1.v, info.title);
  assert.deepEqual(info.columns.map((_, c) => book.Sheets[table][XLSX.utils.encode_cell({ r: 11, c })].v), info.columns.map(c => c.label));
  const parsed = Workbook.parse(data, { table });
  assert.equal(parsed.workbook[table].length, 0);
  const zip = XLSX.CFB.read(data, { type: 'array' });
  const xml = name => new TextDecoder().decode(zip.FileIndex[zip.FullPaths.indexOf('Root Entry/' + name)].content);
  assert.ok(!zip.FullPaths.some(p => /comments|vmlDrawing/.test(p)));
  assert.match(xml('xl/worksheets/sheet1.xml'), /state="frozen"/);
  assert.ok((xml('xl/styles.xml').match(/<border>/g) || []).length > 1);
  if (['Members', 'Enrolments'].includes(table)) {
    assert.match(xml('xl/worksheets/sheet1.xml'), /"Active,Graduated,Withdrawn"/);
    assert.equal(info.columns.find(c => c.field === 'status').example, 'Active');
  }
  if (table === 'Awards') assert.deepEqual(info.columns.find(c => c.field === 'category').options, KPT.categories);
  if (table === 'Exams') assert.deepEqual(info.columns.find(c => c.field === 'result').options, KPT.results);
});

test('all seven populated guided forms survive domain validation with English values', () => {
  let state = fixture(1, 2026, 2026), sequence = 0;
  const memberId = state.Members[0].id;
  const exam = state.Catalog.find(c => c.kind === 'Exam' && !c.archived);
  const award = state.Catalog.find(c => c.kind === 'Award' && !c.archived && !state.Awards.some(a => a.memberId === memberId && a.catalogId === c.id));
  let activityId;
  const values = {
    Members: () => ({ name: 'Fictional new member', sjamId: '00008880', status: 'Graduated' }),
    Activities: () => ({ name: 'Fictional new activity', date: '2030-01-15', tags: 'DIM|Inspection', archived: false }),
    Attendance: () => ({ memberId, activityId, present: false }),
    Exams: () => ({ memberId, type: exam.name, date: '2030-01-15', result: 'Fail', attended: true, certificate: '0000-CERT', archived: false }),
    Duty: () => ({ memberId, year: 2030, hours: 60.5 }),
    Awards: () => ({ memberId, catalogId: award.id, date: '2030-01-15', certificate: '0000-AWARD', archived: false }),
    Enrolments: () => ({ memberId, year: 2030, form: 'Form 1', status: 'Active' })
  };
  for (const table of Object.keys(values)) {
    const parsed = populate(table, values[table](), state);
    assert.deepEqual(parsed.errors, [], JSON.stringify(parsed.errors));
    assert.equal(parsed.workbook[table].length, 1);
    assert.equal(parsed.workbook[table][0].__excelRow, 13);
    const count = state[table].length;
    const result = KPT.importRows(state, parsed.workbook, { actor: 'fictional-test', now: '2030-01-15T00:00:00Z', uuid: () => 'guided-' + ++sequence });
    assert.deepEqual(result.errors, [], table + ': ' + JSON.stringify(result.errors));
    state = result.state;
    assert.equal(state[table].length, count + 1);
    if (table === 'Activities') activityId = state.Activities.at(-1).id;
    if (table === 'Attendance') assert.equal(state.Attendance.at(-1).present, false, 'FALSE is an answer, not missing');
  }
  assert.equal(state.Members.at(-1).sjamId, '00008880');
  assert.equal(state.Awards.at(-1).name, award.name);
  assert.ok(!state.Members.some(m => m.name === '示例学员甲'));
});

test('guide metadata is copied, has no private state, and unknown types are rejected', () => {
  const first = Workbook.templateInfo('Members');
  first.columns[0].label = 'Changed';
  first.columns.at(-1).options.push('Changed');
  assert.equal(Workbook.templateInfo('Members').columns[0].label, '姓名 *');
  assert.deepEqual(Workbook.templateInfo('Members').columns.at(-1).options, KPT.statuses);
  for (const table of ['ALL', '__proto__', 'constructor', 'FinBooks']) assert.equal(Workbook.templateInfo(table), null);
});

test('required enrolment status and referenced numeric IDs cannot be silently imported', () => {
  const missing = populate('Enrolments', { memberId: 'STU-000001', year: 2030 });
  assert.ok(missing.errors.some(e => e.row === 13 && /required/.test(e.message)));
  const numeric = populate('Attendance', { memberId: 123, activityId: 'ACT-1', present: false });
  assert.ok(numeric.errors.some(e => e.row === 13 && /leading zeros/.test(e.message)));
  assert.equal(numeric.workbook.Attendance.length, 0);
});
