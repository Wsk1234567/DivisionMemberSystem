const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('Awards help drops Catalog ID instruction and describes the category cascade', () => {
  const i18n = read('src/i18n.js');
  // New-template help must not tell the user to fetch/copy/use a Catalog ID.
  const awardsLines = i18n.split('\n').filter(line => line.includes('importHelp.Awards'));
  assert.equal(awardsLines.length, 2, 'one en and one zh importHelp.Awards');
  for (const line of awardsLines) {
    assert.doesNotMatch(line, /Use a Catalog ID|fill a Catalog ID|填 Catalog ID|复制 id（可先在 System Setup|从 Export all records 导出的 Catalog/);
    assert.match(line, /Category|类别/);
    assert.match(line, /Level|等级/);
  }
  assert.match(i18n, /类别 → 奖项名称 → 等级|Category → Award Name → Level/);
});

test('Exams help explains the Exam Type dropdown from unarchived system categories', () => {
  const i18n = read('src/i18n.js');
  const examLines = i18n.split('\n').filter(line => line.includes('importHelp.Exams'));
  assert.equal(examLines.length, 2, 'one en and one zh importHelp.Exams');
  for (const line of examLines) {
    assert.match(line, /Exam Type|考试类别/);
    assert.match(line, /dropdown|下拉/);
    assert.match(line, /not archived|未归档/);
    assert.match(line, /English|英文/);
  }
});

test('guide renders Exam Type, Awards cascade and Archived sections conditionally', () => {
  const admin = read('src/admin.js');
  assert.match(admin, /guideExamTypeTitle/);
  assert.match(admin, /guideExamTypeNote/);
  assert.match(admin, /guideAwardsTitle/);
  assert.match(admin, /guideAwardsIntro/);
  assert.match(admin, /guideAwardsStep1/);
  assert.match(admin, /guideAwardsStep2/);
  assert.match(admin, /guideAwardsStep3/);
  assert.match(admin, /guideArchivedTitle/);
  assert.match(admin, /hasExamType/);
  assert.match(admin, /isAwards = importType === 'Awards'/);
  assert.match(admin, /hasArchived/);
  // Archived note is selected per type.
  assert.match(admin, /guideArchivedExams/);
  assert.match(admin, /guideArchivedActivities/);
  assert.match(admin, /guideArchivedAwards/);
  assert.match(admin, /guideArchivedGeneral/);
});

test('Awards cascade teaching states order, reselect rule and blank level', () => {
  const i18n = read('src/i18n.js');
  assert.match(i18n, /Category first, then Award Name, then Level|先选类别（Category），再选奖项名称/);
  assert.match(i18n, /preview rejects a combination|预览会拒绝/);
  assert.match(i18n, /leave this blank|留空/);
  assert.match(i18n, /Do not type None or N\/A|不要填 None 或 N\/A/);
  assert.match(i18n, /do not make up a level|不要自己编等级/);
  // Category explanations.
  assert.match(i18n, /Category 0(–|-)5 are groups of project badges, not scores|Category 0–5 是项目的分类，不是分数/);
  assert.match(i18n, /rank ladder|军阶/);
  assert.match(i18n, /hour and colour tiers|小时数和颜色档次/);
  assert.match(i18n, /stripe\/star|条纹\/星/);
  // Eligibility disclaimer.
  assert.match(i18n, /does not by itself give anyone eligibility|不等于这个人自动获得/);
});

test('archived notes match actual domain behaviour per record type', () => {
  const i18n = read('src/i18n.js');
  const domain = read('src/domain.js');
  // Exams: archived is no longer participation evidence and can change the yearly result.
  assert.match(i18n, /no longer counts as yearly exam participation evidence|不再作为年度考试参与的证据/);
  assert.match(i18n, /yearly result can change|可能改变年度结果/);
  assert.match(domain, /!row\.archived && row\.memberId === memberId/);
  // Awards: archived hidden from public directory only.
  assert.match(i18n, /no longer appears in the public member directory|不再出现在公开的会员目录/);
  assert.match(domain, /filter\(award => award\.memberId === member\.id && !award\.archived\)/);
  // Awards eligibility still counts archived awards as issued — do not claim full exclusion.
  assert.match(i18n, /does not wipe out every award rule|不是把所有授奖资格都排除掉/);
  // Common wording: not delete / not completed / not graduated.
  assert.match(i18n, /not deleting, not marking as completed, and not graduation|不是删除，不是「已完成」，也不是毕业/);
  assert.match(i18n, /Unarchive/);
  assert.match(i18n, /FALSE or blank|FALSE 或留空/);
  // Do not claim every archived row vanishes from admin lists.
  assert.doesNotMatch(i18n, /all archived records disappear from (the )?list|所有归档记录(都)?从列表消失/);
});

test('official English values stay untranslated in the guide notes', () => {
  const i18n = read('src/i18n.js');
  assert.match(i18n, /Probadge/);
  assert.match(i18n, /Promotion/);
  assert.match(i18n, /Special Service Shield/);
  assert.match(i18n, /Service Stripe & Star/);
  assert.match(i18n, /Lance Corporal/);
  assert.match(i18n, /Active \/ Graduated \/ Withdrawn|Active \/ Graduated/);
  assert.match(i18n, /Pass \/ Fail \/ Pending \/ Absent/);
  assert.match(i18n, /keep the official English name|正式英文名称不翻译/);
});
