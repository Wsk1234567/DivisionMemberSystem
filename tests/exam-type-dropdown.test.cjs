const test = require('node:test');
const assert = require('node:assert/strict');
global.KPT = require('../src/domain.js');
global.XLSX = require('../vendor/xlsx.full.min.js');
const Workbook = require('../src/workbook.js');

const catalog = () => ([
  { id: 'CAT-E1', kind: 'Exam', name: 'BFA (New)', category: '', level: '', archived: false },
  { id: 'CAT-E2', kind: 'Exam', name: 'EFA (New)', category: '', level: '', archived: false },
  { id: 'CAT-E3', kind: 'Exam', name: 'AFA, Home Care & First Aid (Advanced)', category: '', level: '', archived: false },
  { id: 'CAT-E4', kind: 'Exam', name: 'Archived Exam', category: '', level: '', archived: true },
  { id: 'CAT-A1', kind: 'Award', name: 'Knowledge of the Order of St. John', category: 'Probadge', level: 'Category 0', archived: false }
]);
const state = () => ({ Catalog: catalog() });

function getXml(cfb, path) {
  const i = cfb.FullPaths.indexOf(path);
  return i < 0 ? '' : new TextDecoder().decode(cfb.FileIndex[i].content);
}

test('ExamTypes dropdown: named range from active Catalog exams, archived excluded', () => {
  const bytes = Workbook.createStyledBytes(state(), true, null, { table: 'Exams' });
  const book = global.XLSX.read(bytes, { type: 'array' });
  const names = (book.Workbook.Names || []).map(n => n.Name);
  assert.ok(names.includes('TCCD_ExamTypes'), 'named range exists');
  const choicesSheet = book.Sheets._TCCD_Choices;
  assert.ok(choicesSheet, 'hidden sheet exists');
  const labels = global.XLSX.utils.sheet_to_json(choicesSheet, { header: 1 });
  const flat = JSON.stringify(labels);
  assert.ok(flat.includes('BFA (New)'), 'active exam present');
  assert.ok(flat.includes('EFA (New)'), 'active exam present');
  assert.ok(flat.includes('AFA, Home Care & First Aid (Advanced)'), 'long name with comma & ampersand');
  assert.ok(!flat.includes('Archived Exam'), 'archived exam excluded');
  // Verify dataValidation in XML uses named range, not inline values
  const cfb = global.XLSX.CFB.read(bytes, { type: 'array' });
  const xml = getXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml');
  const dvBlock = xml.match(/<dataValidations[\s\S]*?<\/dataValidations>/);
  assert.ok(dvBlock, 'has dataValidations');
  assert.ok(dvBlock[0].includes('TCCD_ExamTypes'), 'validation uses named range');
  assert.ok(!dvBlock[0].includes('BFA'), 'no inline exam names in validation formula');
});

test('ExamTypes dropdown: Activities.examType also gets named range', () => {
  const bytes = Workbook.createStyledBytes(state(), true, null, { table: 'Activities' });
  const cfb = global.XLSX.CFB.read(bytes, { type: 'array' });
  const xml = getXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml');
  assert.ok(xml.includes('TCCD_ExamTypes'), 'Activities uses ExamTypes named range');
  const book = global.XLSX.read(bytes, { type: 'array' });
  const names = (book.Workbook.Names || []).map(n => n.Name);
  assert.ok(names.includes('TCCD_ExamTypes'));
});

test('ExamTypes: no catalog exams → no validation, no hardcoded fallback', () => {
  const emptyState = { Catalog: [] };
  const bytes = Workbook.createStyledBytes(emptyState, true, null, { table: 'Exams' });
  const cfb = global.XLSX.CFB.read(bytes, { type: 'array' });
  const xml = getXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml');
  const dvBlock = xml.match(/<dataValidations[\s\S]*?<\/dataValidations>/);
  assert.ok(!dvBlock || !dvBlock[0].includes('TCCD_ExamTypes'), 'no named range when empty');
  assert.ok(!dvBlock || !dvBlock[0].includes('BFA'), 'no hardcoded exam names in validation');
  const book = global.XLSX.read(bytes, { type: 'array' });
  const names = (book.Workbook.Names || []).map(n => n.Name);
  assert.ok(!names.includes('TCCD_ExamTypes'), 'no named range created');
});

test('ExamTypes: 500 long names work as named range', () => {
  const bigCatalog = Array.from({ length: 500 }, (_, i) => ({
    id: 'CAT-' + i, kind: 'Exam', name: 'Fictional Exam Name Number ' + String(i).padStart(4, '0') + ' (Advanced & Special, Edition)', category: '', level: '', archived: false
  }));
  const bytes = Workbook.createStyledBytes({ Catalog: bigCatalog }, true, null, { table: 'Exams' });
  const book = global.XLSX.read(bytes, { type: 'array' });
  const nameDef = (book.Workbook.Names || []).find(n => n.Name === 'TCCD_ExamTypes');
  assert.ok(nameDef, 'named range for 500 items');
  assert.match(nameDef.Ref, /\$500$/, 'range covers 500 rows');
  const cfb = global.XLSX.CFB.read(bytes, { type: 'array' });
  const xml = getXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml');
  assert.ok(xml.includes('TCCD_ExamTypes'), 'validation references named range');
  assert.ok(!xml.includes('Fictional Exam Name Number 0499'), 'not inline truncated');
});

test('ExamTypes: custom names with commas & ampersands survive in named range', () => {
  const customCatalog = [
    { id: 'C1', kind: 'Exam', name: 'BFA, EFA & AFA (Combined), Level 1', category: '', level: '', archived: false },
    { id: 'C2', kind: 'Exam', name: "St. John's First Aid, Advanced & Basic", category: '', level: '', archived: false }
  ];
  const bytes = Workbook.createStyledBytes({ Catalog: customCatalog }, true, null, { table: 'Exams' });
  const book = global.XLSX.read(bytes, { type: 'array' });
  const labels = global.XLSX.utils.sheet_to_json(book.Sheets._TCCD_Choices, { header: 1 });
  const flat = JSON.stringify(labels);
  assert.ok(flat.includes('BFA, EFA & AFA (Combined), Level 1'), 'comma+ampersand name');
  assert.ok(flat.includes("St. John's First Aid, Advanced & Basic"), 'apostrophe+comma name');
});

test('ExamTypes parse: valid names pass through as-is (no ID resolution)', () => {
  const book = Workbook.create(state(), true, null, { table: 'Exams' });
  Object.assign(book.Sheets.Exams, {
    A13: { t: 's', v: 'Unique Member' }, B13: { t: 's', v: '' },
    C13: { t: 's', v: 'BFA (New)' }, D13: { t: 's', v: '2030-01-15' },
    E13: { t: 's', v: 'Pass' }, F13: { t: 's', v: 'TRUE' }
  });
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Exams', references: { Members: [{ id: 'STU-C', name: 'Unique Member', sjamId: '00003' }], Activities: [], Catalog: catalog() } });
  assert.deepEqual(parsed.errors, [], JSON.stringify(parsed.errors));
  assert.equal(parsed.workbook.Exams[0].type, 'BFA (New)', 'type passes through as formal name');
});

test('ExamTypes parse: invalid exam name rejected with row number', () => {
  const book = Workbook.create(state(), true, null, { table: 'Exams' });
  Object.assign(book.Sheets.Exams, {
    A13: { t: 's', v: 'Unique Member' }, B13: { t: 's', v: '' },
    C13: { t: 's', v: 'Fake Exam' }, D13: { t: 's', v: '2030-01-15' },
    E13: { t: 's', v: 'Pass' }, F13: { t: 's', v: 'TRUE' }
  });
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Exams', references: { Members: [{ id: 'STU-C', name: 'Unique Member', sjamId: '00003' }], Activities: [], Catalog: catalog() } });
  assert.ok(parsed.errors.some(e => e.row === 13 && /Fake Exam/.test(e.message)), JSON.stringify(parsed.errors));
});

test('ExamTypes: English results and TRUE/FALSE not translated', () => {
  const book = Workbook.create(state(), true, null, { table: 'Exams' });
  Object.assign(book.Sheets.Exams, {
    A13: { t: 's', v: 'Unique Member' }, B13: { t: 's', v: '' },
    C13: { t: 's', v: 'BFA (New)' }, D13: { t: 's', v: '2030-01-15' },
    E13: { t: 's', v: 'Pass' }, F13: { t: 's', v: 'TRUE' }
  });
  const bytes = global.XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const parsed = Workbook.parse(bytes, { table: 'Exams', references: { Members: [{ id: 'STU-C', name: 'Unique Member', sjamId: '00003' }], Activities: [], Catalog: catalog() } });
  assert.equal(parsed.workbook.Exams[0].result, 'Pass');
  assert.equal(parsed.workbook.Exams[0].attended, 'TRUE');
});

test('ExamTypes: empty rows and examples not imported', () => {
  const bytes = Workbook.createStyledBytes(state(), true, null, { table: 'Exams' });
  const parsed = Workbook.parse(bytes, { table: 'Exams', references: { Members: [], Activities: [], Catalog: catalog() } });
  assert.equal((parsed.workbook.Exams || []).length, 0, 'no phantom imports from template');
});

test('ExamTypes: XML order and styles preserved (no regression)', () => {
  const bytes = Workbook.createStyledBytes(state(), true, null, { table: 'Exams' });
  const cfb = global.XLSX.CFB.read(bytes, { type: 'array' });
  const xml = getXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml');
  const order = [...xml.matchAll(/<(\/?)(\w+)/g)].map(m => m[1] ? '/' + m[2] : m[2]).filter((v, i, a) => a.indexOf(v) === i);
  const af = order.indexOf('autoFilter');
  const mc = order.indexOf('mergeCells');
  const dv = order.indexOf('dataValidations');
  assert.ok(af >= 0 && mc > af, 'autoFilter before mergeCells');
  assert.ok(dv > mc, 'dataValidations after mergeCells');
  const styles = getXml(cfb, 'Root Entry/xl/styles.xml');
  assert.ok(styles.includes('FF8B1A3A'), 'burgundy title preserved');
});
