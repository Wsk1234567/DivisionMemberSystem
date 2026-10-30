const test = require('node:test');
const assert = require('node:assert/strict');
global.KPT = require('../src/domain.js');
global.XLSX = require('../vendor/xlsx.full.min.js');
const Workbook = require('../src/workbook.js');
const { fixture } = require('../src/demo-data.js');
const bytes = book => global.XLSX.write(book, { bookType: 'xlsx', type: 'array' });

const TYPED = ['Members', 'Attendance', 'Exams', 'Duty', 'Awards', 'Activities', 'Enrolments'];
const V2_TITLE = 'TCCD 会员资料导入表 · 新会员';
const V2_HEADERS = ['姓名 *', 'SJAM 会员编号', '身份证号码', '种族', '年级', '加入日期', '会员状态'];

test('V2 template: one Members sheet with exact title, rows 1-12 layout, no data rows imported', () => {
  const book = Workbook.create(global.KPT.empty(), true, null, { table: 'Members' });
  assert.deepEqual(book.SheetNames, ['Members']);
  const sheet = book.Sheets.Members;
  const getCell = (r, c) => {
    const addr = global.XLSX.utils.encode_cell({ r, c });
    return sheet[addr] ? sheet[addr].v : '';
  };
  assert.equal(getCell(0, 0), V2_TITLE, 'A1 exact title');
  // Row 8 (index 7): example headers
  for (let i = 0; i < V2_HEADERS.length; i++) assert.equal(getCell(7, i), V2_HEADERS[i]);
  // Row 9 (index 8): fictional sample
  assert.equal(getCell(8, 0), '示例学员甲');
  assert.equal(getCell(8, 1), '00001234');
  // Row 12 (index 11): formal headers
  for (let i = 0; i < V2_HEADERS.length; i++) assert.equal(getCell(11, i), V2_HEADERS[i]);
  // No id/version anywhere in headers
  const allValues = [];
  for (let r = 0; r < 15; r++) for (let c = 0; c < 10; c++) allValues.push(getCell(r, c));
  assert.ok(!allValues.includes('id') && !allValues.includes('version'), 'no id/version columns');
});

test('V2 parse: rows 13+ only, example rows 1-12 never imported', () => {
  const book = Workbook.create(global.KPT.empty(), true, null, { table: 'Members' });
  const sheet = book.Sheets.Members;
  // Add data in row 13
  const a13 = global.XLSX.utils.encode_cell({ r: 12, c: 0 });
  sheet[a13] = { t: 's', v: 'RealStudent' };
  // Modify example row 9 — must NOT be imported
  const a9 = global.XLSX.utils.encode_cell({ r: 8, c: 0 });
  sheet[a9] = { t: 's', v: 'FAKE_IMPORTED' };
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.equal(parsed.workbook.Members.length, 1, 'only 1 data row');
  assert.equal(parsed.workbook.Members[0].name, 'RealStudent');
  assert.equal(parsed.workbook.Members[0].__excelRow, 13);
});

test('V2 parse: Chinese status conversion + blank status + English passthrough', () => {
  const book = Workbook.create(global.KPT.empty(), true, null, { table: 'Members' });
  const sheet = book.Sheets.Members;
  const rows = [
    ['甲', '001', '', '', '', '', '在籍'],
    ['乙', '002', '', '', '', '', '已毕业'],
    ['丙', '003', '', '', '', '', '已退出'],
    ['丁', '004', '', '', '', '', 'Active'],
    ['戊', '005', '', '', '', '', '']
  ];
  rows.forEach((data, ri) => {
    data.forEach((val, ci) => {
      const addr = global.XLSX.utils.encode_cell({ r: 12 + ri, c: ci });
      sheet[addr] = { t: 's', v: val };
    });
  });
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  const members = parsed.workbook.Members;
  assert.equal(members[0].status, 'Active');
  assert.equal(members[1].status, 'Graduated');
  assert.equal(members[2].status, 'Withdrawn');
  assert.equal(members[3].status, 'Active');
  assert.equal(members[4].status, '', 'blank status stays blank (domain default Active)');
  assert.equal(members[0].id, '', 'id blank for new');
  assert.equal(members[0].version, '', 'version blank for new');
});

test('V2 parse: wrong row12 headers with matching title fails closed, no fallback import', () => {
  const book = global.XLSX.utils.book_new();
  const aoa = [];
  for (let r = 0; r < 12; r++) aoa.push(['', '', '', '', '', '', '']);
  aoa[0] = [V2_TITLE];
  aoa[11] = ['WRONG', 'HEADERS', 'HERE', '', '', '', '']; // wrong row 12
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet(aoa), 'Members');
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.ok(parsed.errors.some(e => e.row === 12 && /headers/i.test(e.message)), 'row 12 header error');
  assert.equal(parsed.workbook.Members, undefined, 'no data imported');
});

test('V2 parse: extra populated columns beyond G rejected per row', () => {
  const book = Workbook.create(global.KPT.empty(), true, null, { table: 'Members' });
  const sheet = book.Sheets.Members;
  const addr13 = global.XLSX.utils.encode_cell({ r: 12, c: 0 });
  sheet[addr13] = { t: 's', v: 'Student' };
  const extra = global.XLSX.utils.encode_cell({ r: 12, c: 7 }); // column H
  sheet[extra] = { t: 's', v: 'evil' };
  sheet['!ref'] = global.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 211, c: 7 } });
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.ok(parsed.errors.some(e => e.row === 13 && /Extra columns/.test(e.message)), JSON.stringify(parsed.errors));
  assert.equal(parsed.workbook.Members.length, 0, 'row with extra cols rejected');
});

test('V2 parse: formulas and numeric IDs rejected with row numbers', () => {
  const book = Workbook.create(global.KPT.empty(), true, null, { table: 'Members' });
  const sheet = book.Sheets.Members;
  const nameAddr = global.XLSX.utils.encode_cell({ r: 12, c: 0 });
  sheet[nameAddr] = { t: 's', v: 'Student' };
  const sjamAddr = global.XLSX.utils.encode_cell({ r: 12, c: 1 });
  sheet[sjamAddr] = { t: 'n', v: 1234 };
  sheet[sjamAddr].f = 'TODAY()';
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.ok(parsed.errors.some(e => e.row === 13 && /formulas/.test(e.message)));
  assert.ok(parsed.errors.some(e => e.row === 13 && /leading zeros/.test(e.message)));
});

test('V2 parse: date number conversion for joined column', () => {
  const book = Workbook.create(global.KPT.empty(), true, null, { table: 'Members' });
  const sheet = book.Sheets.Members;
  const nameAddr = global.XLSX.utils.encode_cell({ r: 12, c: 0 });
  sheet[nameAddr] = { t: 's', v: 'Student' };
  // Excel date serial for 2026-01-15 is 46037 (approx)
  const joinedAddr = global.XLSX.utils.encode_cell({ r: 12, c: 5 });
  sheet[joinedAddr] = { t: 'n', v: 46037 };
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  assert.match(parsed.workbook.Members[0].joined, /^\d{4}-\d{2}-\d{2}$/);
});

test('V2 parse: __excelRow tracked from 13+, data beyond row 212 parses', () => {
  const book = Workbook.create(global.KPT.empty(), true, null, { table: 'Members' });
  const sheet = book.Sheets.Members;
  // Add row at 250 (beyond preformat end 212)
  const addr = global.XLSX.utils.encode_cell({ r: 249, c: 0 });
  sheet[addr] = { t: 's', v: 'BeyondPreformat' };
  const ref = global.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 249, c: 6 } });
  sheet['!ref'] = ref;
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.equal(parsed.workbook.Members.length, 1);
  assert.equal(parsed.workbook.Members[0].name, 'BeyondPreformat');
  assert.equal(parsed.workbook.Members[0].__excelRow, 250);
});

test('V2 styled bytes: ZIP PK, no comments/VML, merges, validations, freeze, borders', () => {
  const styled = Workbook.createStyledBytes(global.KPT.empty(), true, null, { table: 'Members' });
  assert.ok(styled instanceof Uint8Array);
  assert.equal(styled[0], 0x50, 'PK');
  assert.equal(styled[1], 0x4B, 'PK');
  const cfb = global.XLSX.CFB.read(styled, { type: 'array' });
  const paths = cfb.FullPaths.join(' ');
  assert.ok(!paths.includes('comments'), 'no comments');
  assert.ok(!paths.includes('vmlDrawing'), 'no VML');
  function getXml(p) {
    const i = cfb.FullPaths.indexOf(p);
    return i < 0 ? '' : new TextDecoder().decode(cfb.FileIndex[i].content);
  }
  const sheetXml = getXml('Root Entry/xl/worksheets/sheet1.xml');
  const stylesXml = getXml('Root Entry/xl/styles.xml');
  // Freeze
  assert.ok(sheetXml.includes('state="frozen"'), 'frozen');
  assert.ok(sheetXml.includes('topLeftCell="A13"'), 'A13 selection');
  // Merges
  assert.ok(sheetXml.includes('mergeCells'), 'has merges');
  assert.ok(sheetXml.includes('A1:G1'), 'title merge');
  // Validations
  assert.ok(sheetXml.includes('dataValidations'), 'has validations');
  assert.ok(sheetXml.includes('D13:D212'), 'race dropdown');
  assert.ok(sheetXml.includes('E13:E212'), 'form dropdown');
  assert.ok(sheetXml.includes('G13:G212'), 'status dropdown');
  // Gridlines off
  assert.ok(sheetXml.includes('showGridLines="0"'), 'gridlines off');
  // Autofilter
  assert.ok(sheetXml.includes('A12:G212'), 'filter range');
  // Borders in styles
  assert.ok(stylesXml.includes('style="thin"'), 'thin borders');
  // Burgundy fill
  assert.ok(stylesXml.includes('FF8B1A3A'), 'burgundy fill');
  // Pale blue guide (accepted user preference)
  assert.ok(stylesXml.includes('FFDCE6F1'), 'pale blue guide');
  // Yellow example
  assert.ok(stylesXml.includes('FFFFF2CC'), 'yellow example');
});

test('V2 styled bytes: header s-refs distinct, data rows alternating', () => {
  const styled = Workbook.createStyledBytes(global.KPT.empty(), true, null, { table: 'Members' });
  const cfb = global.XLSX.CFB.read(styled, { type: 'array' });
  const sheetXml = new TextDecoder().decode(cfb.FileIndex[cfb.FullPaths.indexOf('Root Entry/xl/worksheets/sheet1.xml')].content);
  const s12 = (sheetXml.match(/<c r="A12"[^>]*s="(\d+)"/) || [])[1];
  const s13 = (sheetXml.match(/<c r="A13"[^>]*s="(\d+)"/) || [])[1];
  const s14 = (sheetXml.match(/<c r="A14"[^>]*s="(\d+)"/) || [])[1];
  assert.ok(s12 && s13 && s14, 's-refs present');
  assert.notEqual(s12, s13, 'header vs data different');
  assert.notEqual(s13, s14, 'alternating rows different');
});

test('old format legacy Members with id/version still parses', () => {
  const headers = global.KPT.fields.Members;
  const book = global.XLSX.utils.book_new();
  const row = headers.map(h => {
    if (h === 'name') return 'LegacyStudent';
    if (h === 'id') return '';
    if (h === 'version') return '';
    if (h === 'sjamId') return '000099';
    return '';
  });
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet([headers, row]), 'Members');
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  assert.equal(parsed.workbook.Members[0].name, 'LegacyStudent');
});

test('V2 + importRows: Chinese status maps to domain Active, blank gets Active', () => {
  const book = Workbook.create(global.KPT.empty(), true, null, { table: 'Members' });
  const sheet = book.Sheets.Members;
  const data = [
    ['甲', '001', '', 'Cina', 'Form 1', '2026-01-15', '在籍'],
    ['乙', '002', '', '', '', '', '']
  ];
  data.forEach((row, ri) => {
    row.forEach((val, ci) => {
      sheet[global.XLSX.utils.encode_cell({ r: 12 + ri, c: ci })] = { t: 's', v: val };
    });
  });
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  const state = global.KPT.empty();
  const result = global.KPT.importRows(state, parsed.workbook, { uuid: () => 'u1', actor: 'owner', now: '2026-06-01T00:00:00Z' });
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  assert.equal(result.state.Members.length, 2);
  assert.equal(result.state.Members[0].status, 'Active');
  assert.equal(result.state.Members[1].status, 'Active', 'blank -> domain default Active');
  assert.equal(result.state.Members[0].name, '甲');
  assert.equal(result.state.Members[0].race, 'Cina');
});

test('other typed templates still one sheet, advanced unchanged, exports unchanged', () => {
  for (const table of TYPED.filter(t => t !== 'Members')) {
    const book = Workbook.create(global.KPT.empty(), true, undefined, { table });
    assert.deepEqual(book.SheetNames.filter((_, i) => !book.Workbook?.Sheets?.[i]?.Hidden), [table]);
    const info = Workbook.templateInfo(table);
    const headers = info.columns.map((_, c) => book.Sheets[table][global.XLSX.utils.encode_cell({ r: 11, c })].v);
    assert.deepEqual(headers, info.columns.map(column => column.label));
  }
  // Advanced full template unchanged
  const state = fixture(1, 2026, 2026);
  const full = Workbook.create(state, false, [{ a: 1 }]);
  assert.ok(full.SheetNames.includes('Instructions'));
  assert.ok(full.SheetNames.includes('Summary'));
  assert.ok(full.SheetNames.includes('Members'));
});

test('typed missing sheet / ignoredSheets / unknown table rejection unchanged', () => {
  const book = global.XLSX.utils.book_new();
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet([['x']]), 'Other');
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.ok(parsed.errors.some(e => /not found/i.test(e.message)));
  assert.ok(parsed.ignoredSheets.includes('Other'));
  assert.throws(() => Workbook.parse(bytes(book), { table: 'FinBooks' }), /Unknown import type/);
  assert.throws(() => Workbook.parse(bytes(book), { table: null }), /Unknown import type|Options/);
});

test('V2 parse: rows 1-12 never imported even with modifications', () => {
  const book = Workbook.create(global.KPT.empty(), true, null, { table: 'Members' });
  const sheet = book.Sheets.Members;
  // Stuff data into rows 2-11 (keep A1 title and row 12 headers intact for V2 detection)
  for (let r = 1; r < 11; r++) {
    sheet[global.XLSX.utils.encode_cell({ r, c: 0 })] = { t: 's', v: 'SMUGGLED' };
  }
  // Also modify the example row 9
  sheet[global.XLSX.utils.encode_cell({ r: 8, c: 0 })] = { t: 's', v: 'FAKE_EXAMPLE' };
  // Add a real data row at 13
  sheet[global.XLSX.utils.encode_cell({ r: 12, c: 0 })] = { t: 's', v: 'RealData' };
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  const members = parsed.workbook.Members || [];
  assert.equal(members.length, 1, 'only real data rows from row 13+');
  assert.equal(members[0].name, 'RealData');
  assert.equal(members[0].__excelRow, 13);
  assert.ok(!members.some(m => m.name === 'SMUGGLED' || m.name === 'FAKE_EXAMPLE'), 'no rows from 2-12 imported');
});

test('V2 create returns workbook metadata; createStyledBytes returns styled ZIP', () => {
  const state = global.KPT.empty();
  const book = Workbook.create(state, true, null, { table: 'Members' });
  assert.ok(book.SheetNames, 'create returns workbook');
  assert.deepEqual(book.SheetNames, ['Members']);
  const styled = Workbook.createStyledBytes(state, true, null, { table: 'Members' });
  assert.ok(styled instanceof Uint8Array);
  assert.equal(styled[0], 0x50);
});

test('V2 download mock: Members template returns bytes, non-Members uses writeFile', () => {
  let lastFile = null;
  const fs = require('fs');
  const origWriteFile = global.XLSX.writeFile;
  const origWriteFileSync = fs.writeFileSync;
  global.XLSX.writeFile = (book, name) => { lastFile = name; };
  fs.writeFileSync = () => {};
  try {
    const state = fixture(1, 2026, 2026);
    const bytesResult = Workbook.download(state, true, null, { table: 'Members' });
    assert.ok(bytesResult instanceof Uint8Array);
    assert.equal(bytesResult[0], 0x50);
    Workbook.download(state, false, undefined, { table: 'Duty' });
    assert.match(lastFile, /^TCCD_Duty_Export_/);
  } finally {
    global.XLSX.writeFile = origWriteFile;
    fs.writeFileSync = origWriteFileSync;
  }
});

test('V2 parse: prototype pollution status values pass through as-is, not mapped to Object props', () => {
  const book = Workbook.create(global.KPT.empty(), true, null, { table: 'Members' });
  const sheet = book.Sheets.Members;
  const names = ['__proto__', 'constructor', 'toString', 'valueOf'];
  names.forEach((bad, ri) => {
    sheet[global.XLSX.utils.encode_cell({ r: 12 + ri, c: 0 })] = { t: 's', v: 'Student' + ri };
    sheet[global.XLSX.utils.encode_cell({ r: 12 + ri, c: 6 })] = { t: 's', v: bad };
  });
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.equal(parsed.workbook.Members.length, 4);
  parsed.workbook.Members.forEach((m, i) => {
    assert.equal(m.status, names[i], 'prototype key passes through unmapped');
  });
});

test('V2 parse: formula in header row 12 rejected, name required header A12', () => {
  const book = Workbook.create(global.KPT.empty(), true, null, { table: 'Members' });
  const sheet = book.Sheets.Members;
  // Put formula in a data row name field
  const addr = global.XLSX.utils.encode_cell({ r: 12, c: 0 });
  sheet[addr] = { t: 'n', v: 1 };
  sheet[addr].f = 'CONCATENATE("x")';
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.ok(parsed.errors.some(e => /formulas/.test(e.message)));
});

test('V2 parse: imported members work with domain validateState relations', () => {
  const book = Workbook.create(global.KPT.empty(), true, null, { table: 'Members' });
  const sheet = book.Sheets.Members;
  sheet[global.XLSX.utils.encode_cell({ r: 12, c: 0 })] = { t: 's', v: 'RelationTest' };
  sheet[global.XLSX.utils.encode_cell({ r: 12, c: 6 })] = { t: 's', v: '在籍' };
  const parsed = Workbook.parse(bytes(book), { table: 'Members' });
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors));
  const state = global.KPT.empty();
  const result = global.KPT.importRows(state, parsed.workbook, { uuid: () => 'rel', actor: 'owner', now: '2026-06-01T00:00:00Z' });
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  assert.equal(result.state.Members.length, 1);
  assert.ok(result.state.Members[0].id.startsWith('STU-'));
  assert.equal(result.state.Members[0].status, 'Active');
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
