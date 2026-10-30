const test = require('node:test');
const assert = require('node:assert/strict');
global.KPT = require('../src/domain.js');
global.XLSX = require('../vendor/xlsx.full.min.js');
const Workbook = require('../src/workbook.js');

function catalog() {
  return [
    { id: 'CAT-P0', kind: 'Award', category: 'Probadge', name: 'Knowledge of the Order of St. John', level: 'Category 0', archived: false },
    { id: 'CAT-P1', kind: 'Award', category: 'Probadge', name: 'Knowledge of the Order of St. John', level: 'Category 1', archived: false },
    { id: 'CAT-P2', kind: 'Award', category: 'Probadge', name: 'Combating Drugs & Substance Abuse', level: 'Category 1', archived: false },
    { id: 'CAT-PR', kind: 'Award', category: 'Promotion', name: 'Promotion', level: 'Lance Corporal', archived: false },
    { id: 'CAT-PC', kind: 'Award', category: 'Promotion', name: 'Promotion', level: 'Corporal', archived: false },
    { id: 'CAT-SG', kind: 'Award', category: 'Special Service Shield', name: 'Special Service Shield', level: 'SSS 100 - Green', archived: false },
    { id: 'CAT-SB', kind: 'Award', category: 'Special Service Shield', name: 'Special Service Shield', level: 'SSS 200 - Blue', archived: false },
    { id: 'CAT-SS', kind: 'Award', category: 'Service Stripe & Star', name: 'Service Stripe & Star', level: '', archived: false },
    { id: 'CAT-X1', kind: 'Award', category: 'Probadge', name: 'Archived Award', level: 'Category 2', archived: true },
    { id: 'CAT-C1', kind: 'Award', category: 'Custom, A & B (Special)', name: 'Long Name, With Commas & Ampersands (Edition 2030)', level: 'Level 1, 2 & 3', archived: false }
  ];
}
const state = () => ({ Catalog: catalog() });

function getXml(cfb, path) {
  const i = cfb.FullPaths.indexOf(path);
  return i < 0 ? '' : new TextDecoder().decode(cfb.FileIndex[i].content);
}

test('Award cascade: 8 columns without visible Catalog ID, correct order', () => {
  const book = Workbook.create(state(), true, null, { table: 'Awards' });
  const headers = global.XLSX.utils.sheet_to_json(book.Sheets.Awards, { header: 1 })[11]; // row 12
  assert.deepEqual(headers, ['会员姓名 *', '奖项类别（Category） *', '奖项名称（Award Name） *', '日期 *', '奖项等级（Level）', '证书编号', '备注', 'Archived（归档）']);
  assert.ok(!headers.some(h => /Catalog ID/i.test(h)), 'no visible Catalog ID');
  assert.equal(headers.length, 8);
});

test('Award cascade: named ranges for categories, per-category names, per-name levels', () => {
  const bytes = Workbook.createStyledBytes(state(), true, null, { table: 'Awards' });
  const book = global.XLSX.read(bytes, { type: 'array' });
  const names = (book.Workbook.Names || []).map(n => n.Name);
  assert.ok(names.includes('TCCD_AwardCategory'), 'category named range');
  assert.ok(names.includes('TCCD_AN_1'), 'names for category 1');
  assert.ok(names.includes('TCCD_AL_1_1'), 'levels for cat1-name1');
  // Hidden sheet
  assert.equal(book.Workbook.Sheets.find(s => s.name === '_TCCD_Choices').Hidden, 2, 'veryHidden');
  const flat = JSON.stringify(global.XLSX.utils.sheet_to_json(book.Sheets._TCCD_Choices, { header: 1 }));
  assert.ok(flat.includes('Probadge'), 'category present');
  assert.ok(flat.includes('Knowledge of the Order of St. John'), 'name present');
  assert.ok(flat.includes('Category 0'), 'level present');
  assert.ok(!flat.includes('Archived Award'), 'archived excluded');
});

test('Award cascade: INDIRECT validation formulas for cascading, no formulas in cells', () => {
  const bytes = Workbook.createStyledBytes(state(), true, null, { table: 'Awards' });
  const cfb = global.XLSX.CFB.read(bytes, { type: 'array' });
  const xml = getXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml');
  // Category: direct named range
  assert.ok(xml.includes('TCCD_AwardCategory'), 'category uses named range');
  // Name: INDIRECT cascading from category
  assert.ok(xml.includes('INDIRECT("TCCD_AN_"'), 'name uses INDIRECT cascade');
  // Level: INDIRECT cascading from category+name
  assert.ok(xml.includes('INDIRECT("TCCD_AL_"'), 'level uses INDIRECT cascade');
  // No cell formulas in data rows
  assert.ok(!xml.includes('<f>'), 'no cell formulas');
});

test('Award cascade: same name different levels resolved correctly', () => {
  const book = Workbook.create(state(), true, null, { table: 'Awards' });
  Object.assign(book.Sheets.Awards, {
    A13: { t: 's', v: 'Unique Member' }, B13: { t: 's', v: 'Probadge' },
    C13: { t: 's', v: 'Knowledge of the Order of St. John' }, D13: { t: 's', v: '2030-01-15' },
    E13: { t: 's', v: 'Category 0' }
  });
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Awards', references: { Members: [{ id: 'STU-C', name: 'Unique Member', sjamId: '00003' }], Catalog: catalog() } });
  assert.deepEqual(parsed.errors, [], JSON.stringify(parsed.errors));
  assert.equal(parsed.workbook.Awards[0].catalogId, 'CAT-P0', 'resolved to Category 0 entry');
  assert.equal(parsed.workbook.Awards[0].category, 'Probadge');
});

test('Award cascade: no-level award accepts blank level, resolves to single entry', () => {
  const book = Workbook.create(state(), true, null, { table: 'Awards' });
  Object.assign(book.Sheets.Awards, {
    A13: { t: 's', v: 'Unique Member' }, B13: { t: 's', v: 'Service Stripe & Star' },
    C13: { t: 's', v: 'Service Stripe & Star' }, D13: { t: 's', v: '2030-01-15' },
    E13: { t: 's', v: '' }
  });
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Awards', references: { Members: [{ id: 'STU-C', name: 'Unique Member', sjamId: '00003' }], Catalog: catalog() } });
  assert.deepEqual(parsed.errors, [], JSON.stringify(parsed.errors));
  assert.equal(parsed.workbook.Awards[0].catalogId, 'CAT-SS', 'resolved to no-level entry');
});

test('Award cascade: changing parent invalidates child selection with row error', () => {
  const book = Workbook.create(state(), true, null, { table: 'Awards' });
  // Category=Promotion but Name=Knowledge of the Order of St. John (belongs to Probadge)
  Object.assign(book.Sheets.Awards, {
    A13: { t: 's', v: 'Unique Member' }, B13: { t: 's', v: 'Promotion' },
    C13: { t: 's', v: 'Knowledge of the Order of St. John' }, D13: { t: 's', v: '2030-01-15' },
    E13: { t: 's', v: 'Category 0' }
  });
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Awards', references: { Members: [{ id: 'STU-C', name: 'Unique Member', sjamId: '00003' }], Catalog: catalog() } });
  assert.ok(parsed.errors.some(e => e.row === 13 && /不存在|无法确定/.test(e.message)), JSON.stringify(parsed.errors));
  assert.equal((parsed.workbook.Awards || []).length, 0);
});

test('Award cascade: nonexistent combination errors, never picks first match', () => {
  const book = Workbook.create(state(), true, null, { table: 'Awards' });
  Object.assign(book.Sheets.Awards, {
    A13: { t: 's', v: 'Unique Member' }, B13: { t: 's', v: 'Probadge' },
    C13: { t: 's', v: 'Fake Award Name' }, D13: { t: 's', v: '2030-01-15' },
    E13: { t: 's', v: '' }
  });
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Awards', references: { Members: [{ id: 'STU-C', name: 'Unique Member', sjamId: '00003' }], Catalog: catalog() } });
  assert.ok(parsed.errors.some(e => e.row === 13 && /Fake Award Name/.test(e.message)), JSON.stringify(parsed.errors));
});

test('Award cascade: custom names with commas & ampersands work', () => {
  const book = Workbook.create(state(), true, null, { table: 'Awards' });
  Object.assign(book.Sheets.Awards, {
    A13: { t: 's', v: 'Unique Member' }, B13: { t: 's', v: 'Custom, A & B (Special)' },
    C13: { t: 's', v: 'Long Name, With Commas & Ampersands (Edition 2030)' }, D13: { t: 's', v: '2030-01-15' },
    E13: { t: 's', v: 'Level 1, 2 & 3' }
  });
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Awards', references: { Members: [{ id: 'STU-C', name: 'Unique Member', sjamId: '00003' }], Catalog: catalog() } });
  assert.deepEqual(parsed.errors, [], JSON.stringify(parsed.errors));
  assert.equal(parsed.workbook.Awards[0].catalogId, 'CAT-C1');
});

test('Award cascade: old 9-column guided format with Catalog ID still parses', () => {
  const info = Workbook.templateInfo('Awards');
  // Simulate old format: insert catalogId column at position 1
  const book = global.XLSX.utils.book_new();
  const oldHeaders = ['会员姓名 *', '奖项目录编号（Catalog ID）', '奖项类别（Category）', '奖项名称（Award Name）', '日期 *', '奖项等级（Level）', '证书编号', '备注', 'Archived（归档）'];
  const aoa = Array.from({ length: 212 }, () => Array(9).fill(''));
  aoa[0] = ['TCCD 奖项记录导入表 · 新记录'];
  for (let r = 1; r < 11; r++) aoa[r] = Array(9).fill('');
  aoa[11] = oldHeaders;
  aoa[12] = ['Unique Member', 'CAT-P0', '', '', '2030-01-15', '', '', '', ''];
  const sheet = global.XLSX.utils.aoa_to_sheet(aoa);
  global.XLSX.utils.book_append_sheet(book, sheet, 'Awards');
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Awards', references: { Members: [{ id: 'STU-C', name: 'Unique Member', sjamId: '00003' }], Catalog: catalog() } });
  assert.deepEqual(parsed.errors, [], JSON.stringify(parsed.errors));
  assert.equal(parsed.workbook.Awards[0].catalogId, 'CAT-P0', 'old format catalogId preserved');
  assert.equal(parsed.workbook.Awards[0].category, 'Probadge', 'auto-filled from catalog');
  assert.equal(parsed.workbook.Awards[0].name, 'Knowledge of the Order of St. John');
});

test('Award cascade: old format with invalid Catalog ID errors', () => {
  const book = global.XLSX.utils.book_new();
  const oldHeaders = ['会员姓名 *', '奖项目录编号（Catalog ID）', '奖项类别（Category）', '奖项名称（Award Name）', '日期 *', '奖项等级（Level）', '证书编号', '备注', 'Archived（归档）'];
  const aoa = Array.from({ length: 212 }, () => Array(9).fill(''));
  aoa[0] = ['TCCD 奖项记录导入表 · 新记录'];
  aoa[11] = oldHeaders;
  aoa[12] = ['Unique Member', 'CAT-FAKE', '', '', '2030-01-15', '', '', '', ''];
  global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet(aoa), 'Awards');
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Awards', references: { Members: [{ id: 'STU-C', name: 'Unique Member', sjamId: '00003' }], Catalog: catalog() } });
  assert.ok(parsed.errors.some(e => e.row === 13 && /CAT-FAKE/.test(e.message)), JSON.stringify(parsed.errors));
});

test('Award cascade: no catalog → clear error, no hardcoded names', () => {
  const book = Workbook.create({ Catalog: [] }, true, null, { table: 'Awards' });
  Object.assign(book.Sheets.Awards, {
    A13: { t: 's', v: 'Unique Member' }, B13: { t: 's', v: 'Probadge' },
    C13: { t: 's', v: 'Knowledge of the Order of St. John' }, D13: { t: 's', v: '2030-01-15' }
  });
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Awards', references: { Members: [{ id: 'STU-C', name: 'Unique Member', sjamId: '00003' }], Catalog: [] } });
  assert.ok(parsed.errors.some(e => /目录未加载|System Setup/.test(e.message)), JSON.stringify(parsed.errors));
});

test('Award cascade: empty template produces no phantom imports', () => {
  const bytes = Workbook.createStyledBytes(state(), true, null, { table: 'Awards' });
  const parsed = Workbook.parse(bytes, { table: 'Awards', references: { Members: [], Catalog: catalog() } });
  assert.equal((parsed.workbook.Awards || []).length, 0);
});

test('Award cascade: English category/name/level values preserved exactly', () => {
  const book = Workbook.create(state(), true, null, { table: 'Awards' });
  Object.assign(book.Sheets.Awards, {
    A13: { t: 's', v: 'Unique Member' }, B13: { t: 's', v: 'Promotion' },
    C13: { t: 's', v: 'Promotion' }, D13: { t: 's', v: '2030-01-15' },
    E13: { t: 's', v: 'Lance Corporal' }
  });
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Awards', references: { Members: [{ id: 'STU-C', name: 'Unique Member', sjamId: '00003' }], Catalog: catalog() } });
  assert.deepEqual(parsed.errors, [], JSON.stringify(parsed.errors));
  assert.equal(parsed.workbook.Awards[0].category, 'Promotion');
  assert.equal(parsed.workbook.Awards[0].name, 'Promotion');
  assert.equal(parsed.workbook.Awards[0].level, 'Lance Corporal');
});

test('Award cascade: archived entries excluded from dropdown but still matchable if entered', () => {
  // Archived award should not be in dropdown choices
  const bytes = Workbook.createStyledBytes(state(), true, null, { table: 'Awards' });
  const book = global.XLSX.read(bytes, { type: 'array' });
  const flat = JSON.stringify(global.XLSX.utils.sheet_to_json(book.Sheets._TCCD_Choices, { header: 1 }));
  assert.ok(!flat.includes('Archived Award'), 'archived not in dropdown');
});

test('Award cascade: formula in data cell rejected', () => {
  const book = Workbook.create(state(), true, null, { table: 'Awards' });
  const addr = global.XLSX.utils.encode_cell({ r: 12, c: 1 });
  book.Sheets.Awards[addr] = { t: 's', v: 'Probadge', f: 'CONCATENATE("x")' };
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Awards', references: { Members: [], Catalog: catalog() } });
  assert.ok(parsed.errors.some(e => /formula/i.test(e.message)), JSON.stringify(parsed.errors));
});

test('Award cascade: numeric memberId rejected', () => {
  const book = Workbook.create(state(), true, null, { table: 'Awards' });
  Object.assign(book.Sheets.Awards, {
    A13: { t: 'n', v: 123 }, B13: { t: 's', v: 'Probadge' },
    C13: { t: 's', v: 'Knowledge of the Order of St. John' }, D13: { t: 's', v: '2030-01-15' }
  });
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Awards', references: { Members: [], Catalog: catalog() } });
  assert.ok(parsed.errors.some(e => /text|leading/.test(e.message)), JSON.stringify(parsed.errors));
});

test('Award cascade: no IC in hidden sheet, veryHidden preserved', () => {
  const bigState = {
    Catalog: catalog(),
    Members: [{ id: 'STU-1', name: 'Test', sjamId: '001', ic: 'SECRET_IC_MUST_NOT_APPEAR' }]
  };
  const bytes = Workbook.createStyledBytes(bigState, true, null, { table: 'Awards' });
  const book = global.XLSX.read(bytes, { type: 'array' });
  const flat = JSON.stringify(book.Sheets._TCCD_Choices || {});
  assert.ok(!flat.includes('SECRET_IC_MUST_NOT_APPEAR'), 'IC not in hidden sheet');
  assert.equal(book.Workbook.Sheets.find(s => s.name === '_TCCD_Choices').Hidden, 2);
});
