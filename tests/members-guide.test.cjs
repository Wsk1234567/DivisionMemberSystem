const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
global.KPT = require('../src/domain.js');
global.XLSX = require('../vendor/xlsx.full.min.js');
const Workbook = require('../src/workbook.js');
const source = fs.readFileSync(path.join(__dirname, '../src/admin.js'), 'utf8');
const helper = source.slice(source.indexOf('  function importMembersGuide()'), source.indexOf('  function importView()'));
const render = new Function('importType', 'importGuideOpen', 'KPTWorkbook', 't', 'escape', 'table', helper + '\nreturn importMembersGuide();');
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const table = (headers, rows) => '<table>' + rows.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('') + '</table>';
const translate = key => ({ guidedTitle: '{type}: guide', guidedUpdate: 'keep id/version for updates', guidedIntro: 'data starts at row 13', guidedExamples: 'row 9 examples are not imported' }[key] || key);
const html = (type, open = true, workbook = Workbook) => render(type, open, workbook, translate, escape, table);

test('all seven filling guides render their own actual template columns and examples', () => {
  for (const type of Workbook.TYPED_TABLES) {
    const info = Workbook.templateInfo(type);
    const result = html(type);
    assert.match(result, /aria-expanded="true"/);
    assert.match(result, /aria-controls="import-guide-body"/);
    for (const column of info.columns) { assert.ok(result.includes(escape(column.label))); assert.ok(result.includes(escape(column.help))); }
    assert.ok(result.includes('row 13'));
    assert.ok(result.includes('row 9'));
    assert.ok(result.includes('id/version'));
  }
  assert.ok(!html('Duty').includes('身份证号码'), 'switching type does not retain member-only columns');
});

test('guide can collapse and does not misdescribe advanced or missing metadata', () => {
  assert.match(html('Attendance', false), /id="import-guide-body" hidden/);
  assert.match(html('Attendance', false), /aria-expanded="false"/);
  assert.equal(html('ALL'), '');
  assert.equal(html('Members', true, {}), '');
});

test('filling guide escapes every descriptive value before inserting HTML', () => {
  const hostile = '<img src=x onerror=alert(1)>';
  const result = html('Members', true, { templateInfo: () => ({ columns: [{ label: hostile, help: hostile, example: hostile, required: true }], instructions: [hostile] }) });
  assert.ok(!result.includes('<img'));
  assert.ok(result.includes('&lt;img'));
});

test('English proper names are retained in both interface languages', () => {
  const context = { document: { documentElement: {} }, localStorage: { getItem: () => null }, navigator: { language: 'en' } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/i18n.js'), 'utf8'), context);
  for (const lang of ['en', 'zh']) {
    const text = context.KPTI18n.dict[lang].guidedEnglishNote;
    for (const value of ['Active', 'Graduated', 'Withdrawn', 'Pass', 'Fail', 'Pending', 'Absent', 'TRUE', 'FALSE', 'Probadge', 'Service Stripe & Star', 'Special Service Shield']) assert.ok(text.includes(value));
  }
});
