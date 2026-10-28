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

test('V2 guide uses the seven Chinese headers and row 13 start', () => {
  const admin = read('src/admin.js');
  const i18n = read('src/i18n.js');
  for (const key of ['mgHName', 'mgHSjam', 'mgHIc', 'mgHRace', 'mgHForm', 'mgHJoined', 'mgHStatus']) {
    assert.ok(i18n.includes(key), 'i18n has ' + key);
    assert.ok(admin.includes("t('" + key + "')"), 'guide uses ' + key);
  }
  assert.match(i18n, /姓名 \*/);
  assert.match(i18n, /SJAM 会员编号/);
  assert.match(i18n, /身份证号码/);
  assert.match(i18n, /种族/);
  assert.match(i18n, /年级/);
  assert.match(i18n, /加入日期/);
  assert.match(i18n, /会员状态/);
  assert.match(i18n, /row 13|第 13 行/);
  assert.match(i18n, /mgRuleRow13/);
});

test('V2 guide explains no id/version and keeps update path separate', () => {
  const admin = read('src/admin.js');
  const i18n = read('src/i18n.js');
  assert.match(admin, /mgNoIdTitle/);
  assert.match(admin, /mgNoIdNote/);
  assert.match(admin, /mgUpdateTitle/);
  assert.match(admin, /mgUpdate1/);
  assert.match(i18n, /no id\/version columns|没有 id\/version 列/);
  assert.match(i18n, /automatically|自动生成/);
  assert.match(i18n, /cannot update people|不能用来更新/);
  assert.match(i18n, /records download|下载这类已有记录/);
  // Guide must not present id/version as new-template fill-in fields.
  assert.doesNotMatch(admin, /\['id', t\('mgIdReq'\)\]/);
  assert.doesNotMatch(admin, /\['version', t\('mgVerReq'\)\]/);
});

test('guide example is the V2 sample row and is never imported', () => {
  const admin = read('src/admin.js');
  const i18n = read('src/i18n.js');
  assert.match(admin, /示例学员甲/);
  assert.match(admin, /00001234/);
  assert.match(i18n, /placeholder only|仅占位示例/);
  assert.match(i18n, /never imported|永远不会被导入/);
  assert.match(i18n, /No official format is prescribed|没有固定长度或格式/);
  assert.match(i18n, /mgRuleExample/);
});

test('status uses Chinese dropdown mapping with readable meanings', () => {
  const i18n = read('src/i18n.js');
  assert.match(i18n, /在籍/);
  assert.match(i18n, /已毕业/);
  assert.match(i18n, /已退出/);
  assert.match(i18n, /mgStatusActive/);
  assert.match(i18n, /mgStatusGraduated/);
  assert.match(i18n, /mgStatusWithdrawn/);
  assert.match(i18n, /Active = still participating|在籍 = Active/);
});

test('colour legend matches the redesigned template sections', () => {
  const admin = read('src/admin.js');
  const i18n = read('src/i18n.js');
  const css = read('src/styles.css');
  assert.match(admin, /legend-title/);
  assert.match(admin, /legend-guide/);
  assert.match(admin, /legend-example/);
  assert.match(admin, /legend-entry/);
  assert.match(i18n, /mgLegendTitleColor/);
  assert.match(i18n, /mgLegendGuide/);
  assert.match(i18n, /mgLegendExample/);
  assert.match(i18n, /mgLegendEntry/);
  assert.match(i18n, /Burgundy|酒红/);
  assert.match(i18n, /Blue how-to|蓝色填写说明/);
  assert.match(i18n, /Yellow sample|黄色示范/);
  assert.match(i18n, /banded rows|隔行底纹/);
  assert.match(i18n, /no popup notes|不会弹出说明框/);
  assert.doesNotMatch(i18n, /column header has a short note|每个列标题在模板里都有一句简短说明/);
  assert.match(css, /\.legend-title\{background:#852b3d\}/);
  assert.match(css, /\.legend-guide\{background:#dce8f8\}/);
  assert.match(css, /\.legend-example\{background:#fff3b0\}/);
  assert.match(css, /\.import-guide-table\{max-width:100%;overflow-x:auto/);
});

test('rules cover example skip, row 13, headers, formulas, duplicates and dates', () => {
  const i18n = read('src/i18n.js');
  assert.match(i18n, /mgRuleExample/);
  assert.match(i18n, /mgRuleRow13/);
  assert.match(i18n, /mgRuleHeaders/);
  assert.match(i18n, /mgRuleNoFormula/);
  assert.match(i18n, /mgRuleDup/);
  assert.match(i18n, /mgRuleSameName/);
  assert.match(i18n, /mgRuleDate/);
  assert.match(i18n, /Never rename|不要改表名/);
  assert.match(i18n, /YYYY-MM-DD/);
  assert.match(i18n, /duplicate IC or SJAM|重复的 IC 或 SJAM/);
});
