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

test('typed download filenames include table name and Members template returns styled ZIP bytes', () => {
  let lastFile = null;
  const origWriteFile = global.XLSX.writeFile;
  const fs = require('fs');
  const origWriteFileSync = fs.writeFileSync;
  global.XLSX.writeFile = (book, name) => { lastFile = name; };
  fs.writeFileSync = () => { /* capture only, never write to disk */ };
  try {
    const state = fixture(1, 2026, 2026);
    // Members template: returns styled bytes (PK magic), uses triggerDownload (fs mocked above)
    const membersBytes = Workbook.download(state, true, undefined, { table: 'Members' });
    assert.ok(membersBytes instanceof Uint8Array, 'Members template download returns bytes');
    assert.equal(membersBytes[0], 0x50, 'PK byte 0');
    assert.equal(membersBytes[1], 0x4B, 'PK byte 1');
    // Non-Members typed: writeFile mock captures filename
    Workbook.download(state, false, undefined, { table: 'Attendance' });
    assert.match(lastFile, /^TCCD_Attendance_Export_\d{4}-\d{2}-\d{2}\.xlsx$/);
    Workbook.download(state, true);
    assert.equal(lastFile, 'TCCD_Import_Template.xlsx');
    Workbook.download(state, false);
    assert.match(lastFile, /^TCCD_Export_\d{4}-\d{2}-\d{2}\.xlsx$/);
  } finally {
    global.XLSX.writeFile = origWriteFile;
    fs.writeFileSync = origWriteFileSync;
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

test('Members styled bytes: ZIP PK, dynamic style counts match, header s-refs, dataValidations order', () => {
  const state = global.KPT.empty();
  const styled = Workbook.createStyledBytes(state, true, undefined, { table: 'Members' });
  assert.ok(styled instanceof Uint8Array, 'returns Uint8Array');
  assert.equal(styled[0], 0x50, 'PK byte 0');
  assert.equal(styled[1], 0x4B, 'PK byte 1');
  const cfb = global.XLSX.CFB.read(styled, { type: 'array' });
  function getXml(p) {
    const i = cfb.FullPaths.indexOf(p);
    if (i < 0) return '';
    return new TextDecoder().decode(cfb.FileIndex[i].content);
  }
  const stylesXml = getXml('Root Entry/xl/styles.xml');
  const sheetXml = getXml('Root Entry/xl/worksheets/sheet1.xml');
  // Dynamic counts: declared must equal actual in cellXfs section
  const cellXfsBlock = stylesXml.match(/<cellXfs[\s\S]*?<\/cellXfs>/);
  const declaredXf = parseInt((stylesXml.match(/<cellXfs count="(\d+)"/) || [0, 0])[1], 10);
  const actualXf = (cellXfsBlock[0].match(/<xf /g) || []).length;
  assert.equal(declaredXf, actualXf, 'cellXfs declared count matches actual');
  // Header s-refs exist for all 9 columns
  const sRefs = [...sheetXml.matchAll(/<c r="([A-I])1"[^>]*s="(\d+)"/g)];
  assert.equal(sRefs.length, 9, 'all 9 header cells have s refs');
  // system=grey, required=accent, optional=blue — distinct values
  const sA = (sheetXml.match(/<c r="A1"[^>]*s="(\d+)"/) || [])[1];
  const sC = (sheetXml.match(/<c r="C1"[^>]*s="(\d+)"/) || [])[1];
  const sD = (sheetXml.match(/<c r="D1"[^>]*s="(\d+)"/) || [])[1];
  assert.ok(sA && sC && sD && sA !== sC && sC !== sD && sA !== sD, 'system/required/optional styles distinct');
  // dataValidations after autoFilter, before ignoredErrors
  const order = [...sheetXml.matchAll(/<(\/?)(\w+)/g)].map(m => m[1] ? '/' + m[2] : m[2]).filter((v, i, a) => a.indexOf(v) === i);
  const af = order.indexOf('autoFilter');
  const dv = order.indexOf('dataValidations');
  const ie = order.indexOf('ignoredErrors');
  assert.ok(af >= 0 && dv > af, 'dataValidations after autoFilter');
  assert.ok(ie < 0 || dv < ie, 'dataValidations before ignoredErrors');
  // Freeze pane
  assert.ok(sheetXml.includes('state="frozen"'), 'frozen pane present');
});

test('Members styled bytes: 9 comments with bilingual help, no sample data rows', () => {
  const state = global.KPT.empty();
  const styled = Workbook.createStyledBytes(state, true, undefined, { table: 'Members' });
  const cfb = global.XLSX.CFB.read(styled, { type: 'array' });
  const commentsXml = new TextDecoder().decode(cfb.FileIndex[cfb.FullPaths.indexOf('Root Entry/xl/comments1.xml')].content);
  const commentCount = (commentsXml.match(/<comment /g) || []).length;
  assert.equal(commentCount, 9, '9 header comments');
  assert.ok(commentsXml.includes('内部编号'), 'bilingual id comment');
  assert.ok(commentsXml.includes('必填'), 'name required noted');
  assert.ok(commentsXml.includes('preserve leading zeros'), 'sjamId leading zeros noted');
  assert.ok(commentsXml.includes('年级'), 'form uses 年级');
  assert.ok(commentsXml.includes('在籍'), 'status Active meaning');
  assert.ok(commentsXml.includes('毕业'), 'status Graduated meaning');
  assert.ok(commentsXml.includes('退出'), 'status Withdrawn meaning');
  assert.ok(commentsXml.includes('Do not copy the fictional example'), 'IC example warning');
  assert.ok(commentsXml.includes('000000-00-0000'), 'IC fictional example only in comment');
  // Parse the styled template: no data rows imported, only headers
  const parsed = Workbook.parse(styled, { table: 'Members' });
  assert.equal(parsed.workbook.Members.length, 0, 'template has zero data rows');
});

test('Members template parse without data reports empty, no sample records invented', () => {
  const state = global.KPT.empty();
  const styled = Workbook.createStyledBytes(state, true, undefined, { table: 'Members' });
  const parsed = Workbook.parse(styled, { table: 'Members' });
  assert.equal(parsed.workbook.Members.length, 0, 'no sample data rows');
  assert.ok(parsed.errors.some(e => /no data/i.test(e.message)), 'empty template parse reports no data');
});

test('styled bytes are browser-safe Uint8Array without Node Buffer dependency', () => {
  const state = global.KPT.empty();
  const styled = Workbook.createStyledBytes(state, true, undefined, { table: 'Members' });
  assert.ok(styled instanceof Uint8Array, 'returns Uint8Array (browser-safe)');
  assert.equal(typeof Buffer !== 'undefined' ? Buffer.isBuffer(styled) : false, false, 'not a Node Buffer');
  // Round-trip through parse works with Uint8Array input
  const parsed = Workbook.parse(styled, { table: 'Members' });
  assert.ok(parsed.errors.some(e => /no data/i.test(e.message)), 'parse works on Uint8Array');
});
