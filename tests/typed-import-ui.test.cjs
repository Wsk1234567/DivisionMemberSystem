const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('import picker offers all typed tables and ALL as advanced non-default', () => {
  const admin = read('src/admin.js');
  const i18n = read('src/i18n.js');
  assert.match(admin, /importType = 'Members'/);
  assert.match(admin, /IMPORT_TYPES = \['Members', 'Attendance', 'Exams', 'Duty', 'Awards', 'Activities', 'Enrolments', 'ALL'\]/);
  assert.match(i18n, /importType\.ALL': 'Advanced: full file'/);
  assert.match(i18n, /importType\.ALL': '高级：完整文件'/);
  assert.match(i18n, /importPickerLabel/);
  assert.match(i18n, /这次要导入什么/);
  assert.match(i18n, /What are you importing/);
});

test('typed import uses workbook options and surfaces ignoredSheets', () => {
  const admin = read('src/admin.js');
  assert.match(admin, /KPTWorkbook\.parse\(await file\.arrayBuffer\(\), \{ \.\.\.opts, references: state \}\)/);
  assert.match(admin, /KPTWorkbook\.download\(state, true, null, opts\)/);
  assert.match(admin, /KPTWorkbook\.download\(state, false, null, opts\)/);
  assert.match(admin, /ignoredSheets/);
  assert.match(admin, /importIgnoredSheets/);
});

test('type and file changes bump generation and clear stale preview', () => {
  const admin = read('src/admin.js');
  assert.match(admin, /importGeneration \+= 1/);
  assert.match(admin, /generation !== importGeneration/);
  assert.match(admin, /importPreview\.generation !== importGeneration/);
  assert.match(admin, /importStalePreview/);
});

test('Members help keeps name-only creation and requires unambiguous existing references', () => {
  const i18n = read('src/i18n.js');
  assert.match(i18n, /New students need only Name/);
  assert.match(i18n, /ambiguous|重名/);
  assert.match(i18n, /keep id and version|保留 id 和 version/);
  assert.doesNotMatch(i18n, /automatically match names|自动按姓名匹配/);
});

test('missing selected sheet fails without guessing another type', () => {
  const admin = read('src/admin.js');
  assert.match(admin, /importMissingSheet/);
  assert.match(admin, /do not guess another type|Missing selected sheet/);
});
