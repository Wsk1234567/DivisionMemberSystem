const test = require('node:test');
const assert = require('node:assert/strict');
const KPT = require('../src/domain.js');
const { fixture } = require('../src/demo-data.js');
let serial = 0;
const context = () => ({ actor: 'owner@example.test', now: '2026-10-08T03:00:00.000Z', uuid: () => 'test-' + ++serial });
const save = (state, table, row, year = 2026) => KPT.mutate(state, { action: 'save', table, row, year, revision: state.revision }, context());
test('new student without SJAM ID retains history after receiving it', () => {
  let state = save(KPT.empty(), 'Members', { name: 'Same Name', ic: '000001-01-0001', sjamId: '', status: 'Active', joined: '2026-01-02', form: 'Form 1' });
  const member = state.Members[0];
  assert.equal(member.id, 'STU-000001');
  state = save(state, 'Duty', { memberId: member.id, year: 2026, hours: 60 });
  state = save(state, 'Members', { ...state.Members[0], sjamId: '00123', form: 'Form 2' }, 2027);
  assert.equal(state.Duty[0].memberId, member.id);
  assert.equal(state.Members[0].sjamId, '00123');
  assert.equal(state.Enrolments.find(row => row.year === 2026).form, 'Form 1');
  assert.equal(state.Enrolments.find(row => row.year === 2027).form, 'Form 2');
});
test('same names remain distinct; normalized IC and SJAM ID duplicates are rejected', () => {
  let state = save(KPT.empty(), 'Members', { name: 'Same Name', ic: '000001-01-0001', sjamId: '00123', status: 'Active' });
  state = save(state, 'Members', { name: 'Same Name', ic: '000001-01-0002', status: 'Active' });
  assert.equal(KPT.publicSearch(KPT.projectPublic(state), 'same', 'name').length, 2);
  assert.throws(() => save(state, 'Members', { name: 'Different Name', ic: '000001010001', status: 'Active' }), /already exists/);
  assert.throws(() => save(state, 'Members', { name: 'Different Name', sjamId: '00123', status: 'Active' }), /already exists/);
});
test('60 duty hours, 12 DIMs, inspection and Fail attendance satisfy efficiency', () => {
  const state = fixture(1, 2026, 2026);
  state.Duty[0].hours = 60;
  const summary = KPT.summary(state, state.Members[0].id, 2026);
  assert.deepEqual([summary.hours, summary.dim, summary.inspection, summary.exam, summary.efficient], [60, 12, true, true, 'Efficient']);
  state.Duty[0].hours = 59.5;
  assert.equal(KPT.summary(state, state.Members[0].id, 2026).efficient, 'Not efficient');
  state.Duty[0].hours = null;
  assert.equal(KPT.summary(state, state.Members[0].id, 2026).efficient, 'Pending');
});
test('11 DIMs and inspection absence do not satisfy; cross-year records excluded', () => {
  const state = fixture(1, 2025, 2026);
  const id = state.Members[0].id;
  state.Attendance.find(row => row.activityId === 'ACT-2026-1').present = false;
  assert.equal(KPT.summary(state, id, 2026).dim, 11);
  assert.equal(KPT.summary(state, id, 2026).efficient, 'Not efficient');
  state.Attendance.find(row => row.activityId === 'ACT-2026-12').present = false;
  assert.equal(KPT.summary(state, id, 2026).inspection, false);
  assert.equal(KPT.summary(state, id, 2025).efficient, 'Efficient');
});
test('Pending counts only when attended, Absent does not count', () => {
  const state = fixture(1, 2026, 2026);
  const exam = state.Exams[0];
  exam.result = 'Pending'; exam.attended = false;
  assert.equal(KPT.summary(state, exam.memberId, 2026).exam, false);
  exam.attended = true;
  assert.equal(KPT.summary(state, exam.memberId, 2026).exam, true);
  exam.result = 'Absent'; exam.attended = false;
  assert.equal(KPT.summary(state, exam.memberId, 2026).exam, false);
});
test('unrecorded attendance and inspection leave efficiency pending', () => {
  const state = fixture(1, 2026, 2026);
  state.Attendance = state.Attendance.filter(row => row.activityId !== 'ACT-2026-12');
  assert.equal(KPT.summary(state, state.Members[0].id, 2026).efficient, 'Pending');
  const fresh = save(KPT.empty(), 'Members', { name: 'New Student', status: 'Active' });
  const entered = save(fresh, 'Duty', { memberId: fresh.Members[0].id, year: 2026, hours: 60 });
  assert.equal(KPT.summary(entered, entered.Members[0].id, 2026).efficient, 'Pending');
});
test('multi-category activity counts once and attendance updates linked exams', () => {
  let state = save(KPT.empty(), 'Members', { name: 'Student', status: 'Active' });
  state = save(state, 'Activities', { name: 'Combined day', date: '2026-02-01', tags: ['DIM', 'Inspection', 'Exam', 'DIM'], examType: 'BFA', archived: false });
  const memberId = state.Members[0].id;
  const activityId = state.Activities[0].id;
  state = KPT.mutate(state, { action: 'attendance', activityId, rosterIds: [memberId], presentIds: [memberId], revision: state.revision }, context());
  assert.equal(KPT.summary(state, memberId, 2026).dim, 1);
  assert.equal(KPT.summary(state, memberId, 2026).inspection, true);
  assert.equal(state.Exams[0].result, 'Pending');
  state = KPT.mutate(state, { action: 'attendance', activityId, rosterIds: [memberId], presentIds: [], revision: state.revision }, context());
  assert.equal(state.Exams.length, 1);
  assert.equal(state.Exams[0].result, 'Absent');
  assert.equal(state.Attendance.length, 1);
  assert.throws(() => save(state, 'Exams', { ...state.Exams[0], result: 'Pass', attended: true }), /match the activity/);
});
test('stale revisions or row versions are rejected without mutating original', () => {
  const state = fixture(1, 2026, 2026);
  const prior = JSON.stringify(state);
  assert.throws(() => KPT.mutate(state, { action: 'save', table: 'Members', row: state.Members[0], revision: 0, year: 2026 }, context()), /Conflict/);
  assert.throws(() => save(state, 'Members', { ...state.Members[0], version: 0 }), /Conflict/);
  assert.equal(JSON.stringify(state), prior);
});
test('public projection never includes private values; alumni included', () => {
  const state = fixture(10, 2026, 2026);
  state.Members[0].ic = 'SECRET_IC';
  state.Exams[0].certificate = 'SECRET_EXAM_CERT';
  state.Awards[0].certificate = 'SECRET_AWARD_CERT';
  state.Awards[0].notes = 'SECRET_NOTES';
  const projection = KPT.projectPublic(state);
  const json = JSON.stringify(projection);
  assert.equal(json.includes('SECRET_'), false);
  assert.deepEqual(Object.keys(projection.members[0]), ['name', 'sjamId', 'status', 'awards']);
  assert.equal(KPT.publicSearch(projection, state.Members[9].sjamId, 'sjamId')[0].status, 'Graduated');
  assert.throws(() => KPT.publicSearch(projection, 'SECRET_IC', 'ic'), /Only name/);
});
test('partial import updates rows without deleting absent rows, and repeat is no-op', () => {
  const state = fixture(3, 2026, 2026);
  const workbook = { Members: [{ ...state.Members[0], name: 'Corrected name', __excelRow: 9 }] };
  const preview = KPT.importRows(state, workbook, context());
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.changes[0].row, 9);
  assert.equal(preview.state.Members.length, 3);
  const repeated = KPT.importRows(preview.state, { Members: [preview.state.Members[0]] }, context());
  assert.equal(repeated.errors.length, 0);
  assert.equal(repeated.changes.length, 0);
  const stale = KPT.importRows(preview.state, workbook, context());
  assert.match(stale.errors[0].message, /Conflict/);
});
test('Phase 1 import accepts 120 minimal members and defaults blank status to Active', () => {
  const workbook = { Members: Array.from({ length: 120 }, (_, index) => ({ name: 'Phase Student ' + String(index + 1).padStart(3, '0'), sjamId: index % 10 ? String(index + 1).padStart(6, '0') : '', status: '', __excelRow: index + 2 })) };
  const preview = KPT.importRows(KPT.empty(), workbook, context());
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.state.Members.length, 120);
  assert.deepEqual([preview.state.Members[0].id, preview.state.Members[0].sjamId, preview.state.Members[0].status, preview.state.Members[119].id], ['STU-000001', '', 'Active', 'STU-000120']);
  assert.ok(preview.state.Members.every(row => row.version === 1 && row.status === 'Active'));
  assert.equal(preview.state.Activities.length, 0);
});
test('Phase 1 import keeps duplicate protection without merging equal names', () => {
  const sameNames = KPT.importRows(KPT.empty(), { Members: [{ name: 'Same Name' }, { name: 'Same Name' }] }, context());
  assert.equal(sameNames.errors.length, 0);
  assert.equal(sameNames.state.Members.length, 2);
  const duplicateSjam = KPT.importRows(KPT.empty(), { Members: [{ name: 'First', sjamId: '001' }, { name: 'Second', sjamId: '001' }] }, context());
  assert.equal(duplicateSjam.state, null);
  assert.match(duplicateSjam.errors[0].message, /already exists/);
});
test('old Phase 1 templates ignore unchanged default catalogue rows', () => {
  const state = KPT.empty();
  state.Catalog[0].version = 2;
  state.Catalog[0].name = 'EFA Updated';
  const oldTemplateCatalog = KPT.empty().Catalog;
  const preview = KPT.importRows(state, { Catalog: oldTemplateCatalog, Members: [{ name: 'New Student', sjamId: '001' }] }, context());
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.changes.length, 1);
  assert.equal(preview.state.Members[0].name, 'New Student');
  assert.equal(preview.state.Catalog[0].name, 'EFA Updated');
});
test('recommended setup installs confirmed exams and complete award catalogue idempotently', () => {
  const original = KPT.empty();
  const preview = KPT.setupPreview(original);
  assert.equal(preview.ready, false);
  assert.deepEqual(preview.legacyExams.map(row => row.name), ['EFA', 'BFA']);
  const configured = KPT.applyRecommendedSetup(original, { ...context(), revision: original.revision });
  assert.equal(KPT.setupPreview(configured).ready, true);
  assert.deepEqual(configured.Catalog.filter(row => row.kind === 'Exam' && !row.archived).sort((first, second) => first.sortOrder - second.sortOrder).map(row => row.name), ['EFA (New)', 'EFA (Recert)', 'BFA (New)', 'BFA (Recert)', 'BFA (Renew)', 'Home Nursing', 'AFA']);
  assert.equal(configured.Catalog.filter(row => row.category === 'Probadge').length, 26);
  assert.deepEqual(configured.Catalog.filter(row => row.category === 'Promotion').map(row => row.level), ['Lance Corporal', 'Corporal', 'Sergeant', 'Cadet Leader']);
  assert.equal(configured.Catalog.find(row => row.code === 'SSS_1000').level, 'SSS 1000 - Emas');
  const repeated = KPT.applyRecommendedSetup(configured, { ...context(), revision: configured.revision });
  assert.equal(repeated.Catalog.length, configured.Catalog.length);
});
test('award eligibility lists every unissued SSS milestone and requires confirmation', () => {
  let state = KPT.applyRecommendedSetup(KPT.empty(), { ...context(), revision: 0 });
  state = save(state, 'Members', { name: 'Duty Member', status: 'Active', form: 'Form 1', race: 'Cina' });
  const memberId = state.Members[0].id;
  state = save(state, 'Duty', { memberId, year: 2025, hours: 200 });
  state = save(state, 'Duty', { memberId, year: 2026, hours: 320 });
  let eligibility = KPT.awardEligibility(state).eligible.filter(row => row.metric === 'lifetimeDutyHours');
  assert.deepEqual(eligibility.map(row => row.threshold), [100, 200, 500]);
  const first = eligibility[0];
  state = save(state, 'Awards', { memberId, catalogId: first.catalogId, date: '2026-10-10', certificate: '', notes: '', archived: false });
  eligibility = KPT.awardEligibility(state).eligible.filter(row => row.metric === 'lifetimeDutyHours');
  assert.deepEqual(eligibility.map(row => row.threshold), [200, 500]);
  assert.throws(() => save(state, 'Awards', { memberId, catalogId: first.catalogId, date: '2026-10-11', archived: false }), /Duplicate member award/);
});
test('standard member options accept configured values and preserve unchanged legacy values', () => {
  let state = save(KPT.empty(), 'Members', { name: 'Configured', status: 'Active', form: 'Peralihan', race: 'Melayu' });
  assert.throws(() => save(state, 'Members', { ...state.Members[0], form: 'Lower 1' }), /standard Tingkatan/);
  const legacy = KPT.upgradeState(state);
  legacy.Members[0].form = 'Legacy Form';
  legacy.Members[0].version++;
  const saved = save(legacy, 'Members', { ...legacy.Members[0], sjamId: 'LEGACY-1' });
  assert.equal(saved.Members[0].form, 'Legacy Form');
});
test('Recycle Bin deletes and restores a member with all linked records', () => {
  const state = fixture(2, 2026, 2026);
  const member = state.Members[0];
  const preview = KPT.recycleBundle(state, 'Members', member.id);
  assert.equal(preview.counts.Members, 1);
  assert.ok(preview.counts.Attendance > 0);
  assert.ok(preview.counts.Exams > 0);
  const deleted = KPT.recycleDelete(state, 'Members', member.id, { ...context(), revision: state.revision });
  assert.equal(deleted.Members.some(row => row.id === member.id), false);
  assert.equal(deleted.Attendance.some(row => row.memberId === member.id), false);
  assert.equal(deleted.trash.length, 1);
  assert.equal(KPT.projectPublic(deleted).members.some(row => row.name === member.name), false);
  const restored = KPT.restoreTrash(deleted, deleted.trash[0].id, { ...context(), revision: deleted.revision });
  assert.equal(restored.Members.some(row => row.id === member.id), true);
  assert.equal(restored.Attendance.filter(row => row.memberId === member.id).length, preview.counts.Attendance);
  assert.equal(restored.trash.length, 0);
  KPT.validateState(restored);
});
test('Recycle Bin cascades activity and catalogue dependencies and supports permanent deletion', () => {
  const state = fixture(2, 2026, 2026);
  const activity = state.Activities[0];
  const activityPreview = KPT.recycleBundle(state, 'Activities', activity.id);
  assert.equal(activityPreview.counts.Activities, 1);
  assert.equal(activityPreview.counts.Attendance, 2);
  const examCatalog = state.Catalog.find(row => row.kind === 'Exam' && row.name === state.Exams[0].type);
  const catalogPreview = KPT.recycleBundle(state, 'Catalog', examCatalog.id);
  assert.equal(catalogPreview.counts.Catalog, 1);
  assert.ok(catalogPreview.counts.Exams > 0);
  const deleted = KPT.recycleDelete(state, 'Activities', activity.id, { ...context(), revision: state.revision });
  const purged = KPT.purgeTrash(deleted, deleted.trash[0].id, { ...context(), revision: deleted.revision });
  assert.equal(purged.trash.length, 0);
  assert.throws(() => KPT.restoreTrash(purged, deleted.trash[0].id, { ...context(), revision: purged.revision }), /not found/);
});
test('Delete all students creates one restorable bundle and keeps activities and catalogue', () => {
  const state = fixture(3, 2026, 2026);
  const activityCount = state.Activities.length;
  const catalogCount = state.Catalog.length;
  const preview = KPT.allMembersBundle(state);
  assert.equal(preview.counts.Members, 3);
  assert.ok(preview.counts.Attendance > 0);
  const deleted = KPT.recycleDeleteAllMembers(state, { ...context(), revision: state.revision });
  assert.equal(deleted.Members.length, 0);
  assert.equal(deleted.Attendance.length, 0);
  assert.equal(deleted.Activities.length, activityCount);
  assert.equal(deleted.Catalog.length, catalogCount);
  assert.equal(deleted.trash.length, 1);
  const restored = KPT.restoreTrash(deleted, deleted.trash[0].id, { ...context(), revision: deleted.revision });
  assert.equal(restored.Members.length, 3);
  assert.equal(restored.Attendance.length, preview.counts.Attendance);
  KPT.validateState(restored);
});
test('invalid imports preserve state and pinpoint worksheet row', () => {
  const state = fixture(1, 2026, 2026);
  const prior = JSON.stringify(state);
  const bad = KPT.importRows(state, { Duty: [{ ...state.Duty[0], hours: -2, __excelRow: 17 }] }, context());
  assert.equal(bad.state, null);
  assert.deepEqual([bad.errors[0].sheet, bad.errors[0].row], ['Duty', 17]);
  assert.equal(JSON.stringify(state), prior);
  assert.equal(KPT.importRows(state, { Members: [{ name: 'Duplicate', ic: state.Members[0].ic, status: 'Active' }] }, context()).state, null);
});
test('500 members with five years of attendance validate and aggregate', () => {
  const state = fixture(500, 2022, 2026);
  KPT.validateState(state);
  assert.equal(state.Members.length, 500);
  assert.equal(state.Attendance.length, 32500);
  assert.equal(KPT.projectPublic(state).members.length, 500);
  assert.equal(KPT.summary(state, state.Members[0].id, 2026).dim, 12);
});

test('AGM package creates default checklist and runs upload to approve flow', () => {
  let state = KPT.mutate(KPT.empty(), { action: 'createDocPackage', activityType: 'AGM', year: 2026, eventDate: '2026-12-06', revision: 0 }, context());
  const pkg = state.DocPackages[0];
  assert.equal(pkg.status, 'Open');
  assert.equal(state.DocItems.length, 12);
  assert.ok(state.DocItems.filter(row => row.required).length >= 7);
  const item = state.DocItems[0];
  assert.equal(item.status, 'Pending');
  assert.equal(item.dueOffsetDays, -28);
  state = KPT.mutate(state, { action: 'docItemUpload', itemId: item.id, fileName: 'AGM Application.docx', fileId: 'drive-1', revision: state.revision }, context());
  assert.equal(state.DocItems[0].status, 'Draft');
  state = KPT.mutate(state, { action: 'docItemSubmit', itemId: item.id, revision: state.revision }, context());
  assert.equal(state.DocItems[0].status, 'AwaitingOC');
  assert.throws(() => KPT.mutate(state, { action: 'docItemSubmit', itemId: item.id, revision: state.revision }, context()), /Upload a file|waiting/);
  assert.throws(() => KPT.mutate(state, { action: 'docItemReview', itemId: item.id, approve: true, revision: state.revision }, context()), /forwarded/);
  state = KPT.mutate(state, { action: 'docItemCheck', itemId: item.id, approve: true, revision: state.revision }, context());
  assert.equal(state.DocItems[0].status, 'OCChecked');
  state = KPT.mutate(state, { action: 'docItemForward', itemId: item.id, revision: state.revision }, context());
  assert.equal(state.DocItems[0].status, 'Submitted');
  state = KPT.mutate(state, { action: 'docItemReview', itemId: item.id, approve: true, revision: state.revision }, context());
  assert.equal(state.DocItems[0].status, 'Approved');
  assert.equal(state.DocPackages[0].status, 'Open');
});
test('package completes when every required item is approved; reject keeps package open', () => {
  let state = KPT.mutate(KPT.empty(), { action: 'createDocPackage', activityType: 'AGM', year: 2026, revision: 0 }, context());
  const required = state.DocItems.filter(row => row.required);
  required.forEach((item, index) => {
    state = KPT.mutate(state, { action: 'docItemUpload', itemId: item.id, fileName: 'file' + index + '.pdf', fileId: 'f' + index, revision: state.revision }, context());
    state = KPT.mutate(state, { action: 'docItemSubmit', itemId: item.id, revision: state.revision }, context());
    if (index === 0) {
      assert.throws(() => KPT.mutate(state, { action: 'docItemCheck', itemId: item.id, approve: false, revision: state.revision }, context()), /reason is required/);
      state = KPT.mutate(state, { action: 'docItemCheck', itemId: item.id, approve: false, remarks: 'Fix date', revision: state.revision }, context());
      assert.equal(state.DocItems.find(row => row.id === item.id).status, 'Rejected');
      assert.equal(state.DocItems.find(row => row.id === item.id).rejectStage, 'OC');
      state = KPT.mutate(state, { action: 'docItemUpload', itemId: item.id, fileName: 'file0b.pdf', fileId: 'f0b', revision: state.revision }, context());
      state = KPT.mutate(state, { action: 'docItemSubmit', itemId: item.id, revision: state.revision }, context());
    }
    state = KPT.mutate(state, { action: 'docItemCheck', itemId: item.id, approve: true, revision: state.revision }, context());
    state = KPT.mutate(state, { action: 'docItemForward', itemId: item.id, revision: state.revision }, context());
    state = KPT.mutate(state, { action: 'docItemReview', itemId: item.id, approve: true, revision: state.revision }, context());
  });
  assert.equal(state.DocPackages[0].status, 'Completed');
  assert.throws(() => KPT.mutate(state, { action: 'docItemUpload', itemId: required[0].id, fileName: 'x.pdf', fileId: 'z', revision: state.revision }, context()), /archived|Reopen/);
  state = KPT.mutate(state, { action: 'docItemReopen', itemId: required[0].id, revision: state.revision }, context());
  assert.equal(state.DocPackages[0].status, 'Open');
});
test('cloning a package copies structure with fresh ids and Pending status', () => {
  let state = KPT.mutate(KPT.empty(), { action: 'createDocPackage', activityType: 'AGM', year: 2026, revision: 0 }, context());
  const base = state.DocPackages[0];
  const firstItemId = state.DocItems[0].id;
  state = KPT.mutate(state, { action: 'docItemUpload', itemId: firstItemId, fileName: 'a.docx', fileId: 'fa', revision: state.revision }, context());
  state = KPT.mutate(state, { action: 'createDocPackage', activityType: 'AGM', year: 2027, basePackageId: base.id, revision: state.revision }, context());
  const clone = state.DocPackages.find(row => row.year === 2027);
  const cloneItems = state.DocItems.filter(row => row.packageId === clone.id);
  assert.equal(cloneItems.length, 12);
  assert.equal(clone.basePackageId, base.id);
  assert.ok(cloneItems.every(row => row.status === 'Pending' && row.fileId === '' && row.id !== firstItemId));
  assert.equal(cloneItems[0].title, state.DocItems.find(row => row.id === firstItemId).title);
  assert.throws(() => KPT.mutate(state, { action: 'createDocPackage', activityType: 'AGM', year: 2026, revision: state.revision }, context()), /already exists/);
});
test('OC-style meta edits change due dates; blocked templates and extensions are rejected', () => {
  let state = KPT.mutate(KPT.empty(), { action: 'createDocPackage', activityType: 'AGM', year: 2026, revision: 0 }, context());
  const item = state.DocItems[0];
  state = KPT.mutate(state, { action: 'saveDocItemsMeta', packageId: item.packageId, items: [{ id: item.id, dueOffsetDays: -30, required: false }], revision: state.revision }, context());
  const updated = state.DocItems.find(row => row.id === item.id);
  assert.equal(updated.dueOffsetDays, -30);
  assert.equal(updated.required, false);
  assert.throws(() => KPT.mutate(state, { action: 'docItemUpload', itemId: item.id, fileName: 'evil.exe', fileId: 'x', revision: state.revision }, context()), /Allowed files/);
  assert.throws(() => KPT.mutate(state, { action: 'saveDocItemsMeta', packageId: item.packageId, items: [{ id: item.id, dueOffsetDays: -999 }], revision: state.revision }, context()), /365/);
  assert.throws(() => KPT.mutate(state, { action: 'save', table: 'DocPackages', row: { id: 'x', version: 1 }, revision: state.revision }, context()), /document package actions/);
});

test('saveFinanceBook rejects stealing income/expense/reimbursement rows from another book', () => {
  let serial = 0;
  const context = () => ({ actor: 'ot@example.test', now: '2026-10-25T00:00:00.000Z', uuid: () => 'fin-' + ++serial });
  const blank = { id: '', version: 0, packageId: '', incomes: [], expenses: [], reimbursements: [] };
  let state = KPT.empty();
  state = KPT.mutate(state, {
    action: 'saveFinanceBook', revision: state.revision,
    book: Object.assign({}, blank, {
      activityName: 'Book A',
      incomes: [{ date: '2026-01-01', description: 'A income', amount: 10 }],
      expenses: [{ date: '2026-01-02', item: 'A item', description: 'A exp', quantity: '1', unitCost: '5', amount: 5 }],
      reimbursements: [{
        formSeq: 1, treasurerName: 'A', formDate: '2026-01-03', purpose: 'A form', chequeNo: '', amount: 5,
        lines: [{ lineNo: 1, date: '2026-01-03', invoiceNo: 'A1', particular: 'A line', total: 5 }]
      }]
    })
  }, context());
  const bookA = state.FinBooks[0];
  const incomeA = Object.assign({}, state.FinIncomes[0]);
  const expenseA = Object.assign({}, state.FinExpenses[0]);
  const formA = Object.assign({}, state.FinReimbursements[0]);
  const lineA = Object.assign({}, state.FinReimburseLines[0]);
  state = KPT.mutate(state, { action: 'saveFinanceBook', revision: state.revision, book: Object.assign({}, blank, { activityName: 'Book B' }) }, context());
  const bookB = state.FinBooks[1];
  assert.equal(state.FinIncomes.length, 1);
  const stealB = extra => ({
    action: 'saveFinanceBook', revision: state.revision,
    book: Object.assign({}, blank, { id: bookB.id, version: bookB.version, activityName: 'Book B' }, extra)
  });
  assert.throws(() => KPT.mutate(state, stealB({ incomes: [incomeA] }), context()), /belongs to another/);
  assert.throws(() => KPT.mutate(state, stealB({ expenses: [expenseA] }), context()), /belongs to another/);
  assert.throws(() => KPT.mutate(state, stealB({ reimbursements: [Object.assign({}, formA, { lines: [] })] }), context()), /belongs to another/);
  assert.throws(() => KPT.mutate(state, stealB({
    reimbursements: [Object.assign({}, formA, { lines: [lineA] })]
  }), context()), /belongs to another/);
  const bookACurrent = state.FinBooks.find(row => row.id === bookA.id);
  const sameBookMove = {
    action: 'saveFinanceBook', revision: state.revision,
    book: Object.assign({}, blank, { id: bookA.id, version: bookACurrent.version, activityName: 'Book A' }, {
      incomes: [incomeA], expenses: [expenseA],
      reimbursements: [
        Object.assign({}, formA, { lines: [] }),
        { formSeq: 2, treasurerName: 'A', formDate: '2026-01-04', purpose: 'A form 2', lines: [lineA] }
      ]
    })
  };
  assert.throws(() => KPT.mutate(state, sameBookMove, context()), /belongs to another form/);
  const okEdit = {
    action: 'saveFinanceBook', revision: state.revision,
    book: Object.assign({}, blank, { id: bookA.id, version: bookACurrent.version, activityName: 'Book A renamed' }, {
      incomes: [incomeA], expenses: [expenseA],
      reimbursements: [Object.assign({}, formA, { lines: [lineA] })]
    })
  };
  const after = KPT.mutate(state, okEdit, context());
  assert.equal(after.FinBooks.find(row => row.id === bookA.id).activityName, 'Book A renamed');
  assert.equal(after.FinIncomes.length, 1);
  assert.equal(after.FinIncomes[0].bookId, bookA.id);
  assert.equal(after.FinReimburseLines[0].reimbursementId, formA.id);
  assert.equal(bookA.id === bookB.id, false);
});