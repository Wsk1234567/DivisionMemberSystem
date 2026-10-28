const test = require('node:test');
const assert = require('node:assert/strict');
global.KPT = require('../src/domain.js');
global.XLSX = require('../vendor/xlsx.full.min.js');
const Workbook = require('../src/workbook.js');
const { fixture } = require('../src/demo-data.js');
const bytes = book => global.XLSX.write(book, { bookType: 'xlsx', type: 'array' });

const TYPED = ['Members', 'Attendance', 'Exams', 'Duty', 'Awards', 'Activities', 'Enrolments'];

test('typed template creates exactly one sheet with headers and text ID format, no Instructions', () => {
  for (const table of TYPED) {
    const book = Workbook.create(global.KPT.empty(), true, undefined, { table });
    assert.deepEqual(book.SheetNames, [table], table + ' template must have exactly one sheet');
    assert.ok(!book.SheetNames.includes('Instructions'));
    const headers = global.XLSX.utils.sheet_to_json(book.Sheets[table], { header: 1 })[0];
    assert.deepEqual(headers, global.KPT.fields[table], table + ' headers match fields');
    const textHeaders = ['id', 'memberId', 'activityId', 'ic', 'sjamId', 'certificate'].filter(h => global.KPT.fields[table].includes(h));
    if (textHeaders.length) {
      const colIndex = global.KPT.fields[table].indexOf(textHeaders[0]);
      const addr = global.XLSX.utils.encode_cell({ r: 1, c: colIndex });
      assert.equal(book.Sheets[table][addr].z, '@', table + ' text column must have z:@');
    }
  }
});

test('typed create(false) exports only real state records for that table', () => {
  const state = fixture(3, 2026, 2026);
  const book = Workbook.create(state, false, undefined, { table: 'Members' });
  assert.deepEqual(book.SheetNames, ['Members']);
  const rows = global.XLSX.utils.sheet_to_json(book.Sheets.Members, { header: 1 });
  assert.equal(rows.length, state.Members.length + 1, 'header + data rows');
  assert.equal(rows[1][global.KPT.fields.Members.indexOf('name')], state.Members[0].name);
});

test('typed create ignores summaryRows and never appends Summary', () => {
  const state = fixture(1, 2026, 2026);
  const book = Workbook.create(state, false, [{ note: 'should not appear' }], { table: 'Members' });
  assert.ok(!book.SheetNames.includes('Summary'), 'typed mode must not add Summary');
});

test('old full template still has Instructions and all admin sheets with Summary support', () => {
  const state = fixture(1, 2026, 2026);
  const book = Workbook.create(state, false, [{ name: 'Total', value: 1 }]);
  assert.ok(book.SheetNames.includes('Instructions'));
  assert.ok(book.SheetNames.includes('Summary'));
  assert.ok(book.SheetNames.includes('Members'));
  assert.ok(book.SheetNames.includes('Catalog'));
  assert.ok(book.SheetNames.includes('Duty'));
});

test('typed download filenames include table name', () => {
  let lastFile = null;
  const origWriteFile = global.XLSX.writeFile;
  global.XLSX.writeFile = (book, name) => { lastFile = name; };
  try {
    const state = fixture(1, 2026, 2026);
    Workbook.download(state, true, undefined, { table: 'Members' });
    assert.equal(lastFile, 'TCCD_Members_Import_Template.xlsx');
    Workbook.download(state, false, undefined, { table: 'Attendance' });
    assert.match(lastFile, /^TCCD_Attendance_Export_\d{4}-\d{2}-\d{2}\.xlsx$/);
    Workbook.download(state, true);
    assert.equal(lastFile, 'TCCD_Import_Template.xlsx');
    Workbook.download(state, false);
    assert.match(lastFile, /^TCCD_Export_\d{4}-\d{2}-\d{2}\.xlsx$/);
  } finally {
    global.XLSX.writeFile = origWriteFile;
  }
});

test('parse rejects unknown/null/malicious table with clear error', () => {
  const buf = bytes(Workbook.create(global.KPT.empty(), true));
  for (const bad of [null, 42, {}, [], 'Catalog', 'FinBooks', 'DocItems', '__proto__', 'constructor', 'toString', '']) {
    assert.throws(() => Workbook.parse(buf, { table: bad }), /Unknown import type|Options must be/, 'table=' + JSON.stringify(bad) + ' must reject');
  }
});

test('typed parse returns only selected sheet and lists other sheets in ignoredSheets', () => {
  const state = fixture(3, 2026, 2026);
  const fullBook = Workbook.create(state, false);
  global.XLSX.utils.book_append_sheet(fullBook, global.XLSX.utils.aoa_to_sheet([['x'], ['evil']]), 'EvilSheet');
  const parsed = Workbook.parse(bytes(fullBook), { table: 'Members' });
  assert.equal(parsed.errors.length, 0, parsed.errors.map(e => e.message).join('; '));
  assert.deepEqual(Object.keys(parsed.workbook), ['Members']);
  assert.ok(parsed.ignoredSheets.includes('EvilSheet'), 'evil sheet listed in ignoredSheets');
  assert.ok(!parsed.ignoredSheets.includes('Instructions'), 'standard ignored not listed');
  assert.ok(parsed.workbook.Members.length > 0);
});

test('typed parse of missing selected sheet reports error(sheet:selected,row:1)', () => {
  const book = global.XLSX.utils.book_new();
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet([['a'], [1]]), 'SomeOtherSheet');
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.ok(parsed.errors.some(e => e.sheet === 'Members' && e.row === 1 && /not found/i.test(e.message)));
  assert.equal(parsed.workbook.Members, undefined);
});

test('typed parse of selected sheet with no data rows reports error', () => {
  const book = global.XLSX.utils.book_new();
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet([global.KPT.fields.Members]), 'Members');
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.ok(parsed.errors.some(e => e.sheet === 'Members' && e.row === 1 && /no data/i.test(e.message)));
});

test('typed parse preserves all protections: formulas, numeric IDs, dates, empty-row excelRow', () => {
  const book = global.XLSX.utils.book_new();
  const headers = global.KPT.fields.Members;
  const rows = [headers, [], headers.map((h, i) => (h === 'name' ? 'Student' : h === 'ic' ? 123 : h === 'joined' ? 44562 : ''))];
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet(rows), 'Members');
  book.Sheets.Members.G3.f = 'TODAY()';
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.ok(parsed.errors.some(e => e.row === 3 && e.message.includes('formulas')));
  assert.ok(parsed.errors.some(e => e.row === 3 && e.message.includes('leading zeros')));
  assert.equal(parsed.workbook.Members.length, 1);
  assert.equal(parsed.workbook.Members[0].__excelRow, 3);
});

test('typed parse with extra malicious sheets does not validate or import them', () => {
  const state = fixture(1, 2026, 2026);
  const book = Workbook.create(state, false, undefined, { table: 'Members' });
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet([['formula'], ['=HYPERLINK("x")']]), 'Evil');
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet([global.KPT.fields.FinBooks, ['x']]), 'FinBooks');
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.equal(parsed.errors.length, 0, 'ignored sheets must not generate errors: ' + JSON.stringify(parsed.errors));
  assert.equal(parsed.workbook.Members.length > 0, true);
  assert.equal(parsed.workbook.FinBooks, undefined);
  assert.ok(parsed.ignoredSheets.includes('Evil'));
  assert.ok(parsed.ignoredSheets.includes('FinBooks'));
});

test('typed parse Members from multi-sheet file then importRows only touches Members', () => {
  const state = fixture(3, 2026, 2026);
  const fullBook = Workbook.create(state, false);
  const parsed = Workbook.parse(bytes(fullBook), { table: 'Members' });
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  assert.deepEqual(Object.keys(parsed.workbook), ['Members']);
  const context = { uuid: () => 'imp-1', actor: 'owner', now: '2026-06-01T00:00:00Z' };
  const result = global.KPT.importRows(state, parsed.workbook, context);
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  assert.equal(result.changes.length, 0, 'no changes when importing same data');
  assert.equal(result.state.Activities.length, state.Activities.length);
  assert.equal(result.state.Attendance.length, state.Attendance.length);
  assert.equal(result.state.Exams.length, state.Exams.length);
});

test('typed parse detects version conflict on existing record', () => {
  const state = fixture(1, 2026, 2026);
  const book = global.XLSX.utils.book_new();
  const headers = global.KPT.fields.Members;
  const row = headers.map(h => {
    if (h === 'id') return state.Members[0].id;
    if (h === 'version') return 99;
    return state.Members[0][h] || '';
  });
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet([headers, row]), 'Members');
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.equal(parsed.errors.length, 0);
  const result = global.KPT.importRows(state, parsed.workbook, { uuid: () => 'v', actor: 'owner', now: '2026-06-01T00:00:00Z' });
  assert.ok(result.errors.some(e => /Conflict/i.test(e.message)));
});

test('typed parse preserves relationship validation via domain importRows', () => {
  const state = fixture(1, 2026, 2026);
  const book = global.XLSX.utils.book_new();
  const headers = global.KPT.fields.Attendance;
  const row = headers.map(h => {
    if (h === 'id') return 'ATT-BAD-1';
    if (h === 'version') return 0;
    if (h === 'activityId') return 'nonexistent';
    if (h === 'memberId') return 'nonexistent';
    return h === 'present' ? true : '';
  });
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet([headers, row]), 'Attendance');
  const parsed = Workbook.parse(bytes(book), { table: 'Attendance' });
  assert.equal(parsed.errors.length, 0);
  const result = global.KPT.importRows(state, parsed.workbook, { uuid: () => 'r', actor: 'owner', now: '2026-06-01T00:00:00Z' });
  assert.ok(result.errors.length > 0, 'relationship errors still detected');
});

test('old parse mode returns ignoredSheets and keeps all previous behavior', () => {
  const state = fixture(1, 2026, 2026);
  const book = Workbook.create(state, false, [{ a: 1 }]);
  const parsed = Workbook.parse(bytes(book));
  assert.ok(Array.isArray(parsed.ignoredSheets));
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  assert.ok(parsed.workbook.Members);
  assert.ok(parsed.workbook.Catalog);
  assert.equal(parsed.workbook.Instructions, undefined);
});

test('typed export round-trips leading zeros in text ID columns', () => {
  const state = fixture(2, 2026, 2026);
  const buf = bytes(Workbook.create(state, false, undefined, { table: 'Members' }));
  const parsed = Workbook.parse(buf, { table: 'Members' });
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  assert.equal(parsed.workbook.Members[0].ic, state.Members[0].ic);
  assert.equal(parsed.workbook.Members[0].sjamId, state.Members[0].sjamId);
});

test('typed parse empty workbook (zero sheets matching) reports not found', () => {
  const book = global.XLSX.utils.book_new();
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet([['x']]), 'Other');
  const parsed = Workbook.parse(bytes(book), { table: 'Duty' });
  assert.ok(parsed.errors.some(e => e.sheet === 'Duty' && /not found/i.test(e.message)));
  assert.ok(parsed.ignoredSheets.includes('Other'));
});

test('typed parse sheet with only headers is empty error, not silently zero records', () => {
  const book = global.XLSX.utils.book_new();
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet([global.KPT.fields.Duty, []]), 'Duty');
  const parsed = Workbook.parse(bytes(book), { table: 'Duty' });
  assert.ok(parsed.errors.some(e => e.sheet === 'Duty' && /no data/i.test(e.message)));
});

test('typed export of 1500 records keeps every row, last record survives round-trip', () => {
  const headers = global.KPT.fields.Members;
  const members = [];
  for (let i = 1; i <= 1500; i++) {
    members.push({ id: 'STU-' + String(i).padStart(6, '0'), version: 1, name: 'Student ' + i, ic: '000' + String(i).padStart(3, '0') + '-00-0001', sjamId: '0' + String(i).padStart(5, '0'), race: '', form: '', joined: '2026-01-01', status: 'Active' });
  }
  const state = Object.assign(global.KPT.empty(), { Members: members });
  const book = Workbook.create(state, false, undefined, { table: 'Members' });
  const rows = global.XLSX.utils.sheet_to_json(book.Sheets.Members, { header: 1 });
  assert.equal(rows.length, 1501, 'header + 1500 data rows');
  assert.equal(rows[1500][headers.indexOf('name')], 'Student 1500', 'last record must not be truncated');
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  assert.equal(parsed.workbook.Members.length, 1500, 'round-trip record count complete');
  assert.equal(parsed.workbook.Members[1499].name, 'Student 1500');
  assert.equal(parsed.workbook.Members[1499].ic, '0001500-00-0001', 'IC leading zeros preserved');
  assert.equal(parsed.workbook.Members[1499].sjamId, '001500', 'SJAM ID leading zeros preserved');
});

test('typed export round-trips record count and leading zeros for large set', () => {
  const headers = global.KPT.fields.Duty;
  const duties = [];
  for (let i = 1; i <= 1201; i++) {
    duties.push({ id: 'DUT-' + String(i).padStart(4, '0'), version: 1, memberId: 'STU-' + String(i).padStart(6, '0'), year: 2026, hours: i });
  }
  const state = Object.assign(global.KPT.empty(), { Duty: duties });
  const parsed = Workbook.parse(bytes(Workbook.create(state, false, undefined, { table: 'Duty' })), { table: 'Duty' });
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  assert.equal(parsed.workbook.Duty.length, 1201);
  assert.equal(parsed.workbook.Duty[1200].id, 'DUT-1201');
  assert.equal(parsed.workbook.Duty[1200].memberId, 'STU-001201');
});
