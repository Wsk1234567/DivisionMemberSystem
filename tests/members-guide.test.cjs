const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('Members guide is bilingual, expandable and Members-only', () => {
  const admin = read('src/admin.js');
  assert.match(admin, /function importMembersGuide/);
  assert.match(admin, /if \(importType !== 'Members'\) return ''/);
  assert.match(admin, /data-action="toggleImportGuide"/);
  assert.match(admin, /aria-expanded=/);
  assert.match(admin, /aria-controls="import-guide-body"/);
});

test('guide documents all nine fields with required/how/example', () => {
  const admin = read('src/admin.js');
  const i18n = read('src/i18n.js');
  for (const key of ['mgIdHow', 'mgVerHow', 'mgNameHow', 'mgSjamHow', 'mgIcHow', 'mgRaceHow', 'mgFormHow', 'mgJoinedHow', 'mgStatusHow']) {
    assert.ok(i18n.includes(key), 'i18n has ' + key);
    assert.ok(admin.includes(key), 'guide uses ' + key);
  }
  for (const key of ['mgColHeader', 'mgColRequired', 'mgColHow', 'mgColExample']) {
    assert.ok(admin.includes(key), 'table header ' + key);
  }
  assert.match(admin, /\['id', t\('mgIdReq'\)/);
  assert.match(admin, /\['status', t\('mgStatusReq'\)/);
});

test('guide example row uses placeholder name and SJAM only', () => {
  const admin = read('src/admin.js');
  const i18n = read('src/i18n.js');
  assert.match(admin, /示例学员甲/);
  assert.match(admin, /00001234/);
  assert.match(i18n, /placeholder only|仅占位示例/);
  assert.match(i18n, /Never copy example values|不要把示例值抄进/);
  assert.doesNotMatch(i18n, /prescribed SJAM format|规定固定格式是/);
  assert.match(i18n, /No official format is prescribed|系统不规定固定格式/);
});

test('guide covers blanks, duplicates, headers, row 2 and no formulas', () => {
  const i18n = read('src/i18n.js');
  assert.match(i18n, /mgRuleBlank/);
  assert.match(i18n, /blank optional cell can clear|可选栏位留空可能会清掉/);
  assert.match(i18n, /mgRuleDup/);
  assert.match(i18n, /duplicate IC or SJAM|重复的 IC 或 SJAM/);
  assert.match(i18n, /mgRuleSameName/);
  assert.match(i18n, /do not re-import to update|不要为了更新而重新导入/);
  assert.match(i18n, /mgRuleHeaders/);
  assert.match(i18n, /Never rename the sheet|不要改表名/);
  assert.match(i18n, /mgRuleRow2/);
  assert.match(i18n, /row 2|第 2 行/);
  assert.match(i18n, /mgRuleNoFormula/);
  assert.match(i18n, /No formulas|不要用公式/);
});

test('status rules distinguish new vs update rows and explain meanings', () => {
  const i18n = read('src/i18n.js');
  assert.match(i18n, /keep the current value unless you mean to change it|除非有意修改，否则保留现值/);
  assert.match(i18n, /default to Active|默认 Active/);
  assert.match(i18n, /mgStatusActive/);
  assert.match(i18n, /mgStatusGraduated/);
  assert.match(i18n, /mgStatusWithdrawn/);
  assert.match(i18n, /在籍/);
  assert.match(i18n, /已毕业/);
  assert.match(i18n, /已退出/);
  assert.match(i18n, /still participating/);
});

test('colour legend and mobile table scroll are present', () => {
  const admin = read('src/admin.js');
  const i18n = read('src/i18n.js');
  const css = read('src/styles.css');
  assert.match(admin, /import-guide-table/);
  assert.match(admin, /legend-swatch/);
  assert.match(i18n, /mgLegendSystem/);
  assert.match(i18n, /mgLegendRequired/);
  assert.match(i18n, /mgLegendOptional/);
  assert.match(i18n, /mgLegendNote/);
  assert.match(css, /\.import-guide-table\{max-width:100%;overflow-x:auto/);
  assert.match(css, /\.legend-system\{background:#d9d9d9\}/);
  assert.match(css, /\.legend-required\{background:#fff2cc\}/);
  assert.match(css, /\.legend-optional\{background:#d6e4f0\}/);
});
