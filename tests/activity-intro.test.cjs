const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('activity intro keeps bilingual summaries and full guide content', () => {
  const intro = require('../src/activity-intro.js');
  for (const lang of ['en', 'zh']) {
    const copy = intro.introFor('AGM', lang);
    assert.ok(copy.what && copy.why && copy.do && copy.note, lang + ' summary fields');
    assert.ok(Array.isArray(copy.guide) && copy.guide.length >= 1, lang + ' guide sections');
    for (const section of copy.guide) {
      assert.ok(section.title && section.body, lang + ' guide section title/body');
    }
  }
  assert.equal(intro.has('AGM'), true);
  assert.equal(intro.has('CadetEnrolment'), true);
  assert.equal(intro.has('MissingType'), false);
});

test('activity intro uses inline See more / See less with aria-expanded, not a modal', () => {
  const source = read('src/admin.js');
  assert.match(source, /data-action="toggleActivityIntro"/);
  assert.match(source, /aria-expanded=/);
  assert.match(source, /aria-controls=/);
  assert.match(source, /See more/);
  assert.match(source, /See less/);
  assert.doesNotMatch(source, /openActivityGuideDialog/);
  assert.doesNotMatch(source, /data-action="openActivityGuide"/);
  assert.doesNotMatch(source, /function openActivityGuideDialog/);
});

test('activity intro expand region is keyboard and mobile friendly', () => {
  const source = read('src/admin.js');
  assert.match(source, /activity-intro-more/);
  assert.match(source, /toggleActivityIntro/);
  assert.match(source, /activityIntroExpanded/);
  const css = read('src/styles.css');
  assert.match(css, /\.activity-intro-more/);
  assert.match(css, /\.activity-intro-more\[hidden\]/);
  assert.match(css, /@media\(max-width:760px\)/);
});

test('workflow statuses use user labels and hide implementation details', () => {
  const source = read('src/admin.js');
  assert.match(source, /Waiting for OC to look at it/);
  assert.match(source, /OC looked at it/);
  assert.doesNotMatch(source, /linked by packageId/);
  assert.match(source, /此活动尚未关联财务账本/);
  assert.match(source, /activePackageRoles/);
  assert.match(source, /OC check queue|待检查队列/);
  assert.doesNotMatch(source, /转交审批|终审/);
});