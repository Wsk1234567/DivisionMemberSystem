const test = require('node:test');
const assert = require('node:assert/strict');
const KPT = require('../src/domain.js');
const { fixture } = require('../src/demo-data.js');
let serial = 0;
const context = () => ({ actor: 'owner@example.test', now: '2026-10-08T03:00:00.000Z', uuid: () => 'test-' + ++serial });
const save = (state, table, row, year = 2026) => KPT.mutate(state, { action: 'save', table, row, year, revision: state.revision }, context());
test('new student without SJAM ID retains history after receiving it', () => {
  let state = save(KPT.empty(), 'Members', { name: 'Same Name', ic: '000001-01-0001', sjamId: '', status: 'Active', joined: '2026-01-02', form: '1' });
  const member = state.Members[0];
  assert.equal(member.id, 'STU-000001');
  state = save(state, 'Duty', { memberId: member.id, year: 2026, hours: 60 });
  state = save(state, 'Members', { ...state.Members[0], sjamId: '00123', form: '2' }, 2027);
  assert.equal(state.Duty[0].memberId, member.id);
  assert.equal(state.Members[0].sjamId, '00123');
  assert.equal(state.Enrolments.find(row => row.year === 2026).form, '1');
  assert.equal(state.Enrolments.find(row => row.year === 2027).form, '2');
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
