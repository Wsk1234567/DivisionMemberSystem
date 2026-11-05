const test = require('node:test');
const assert = require('node:assert/strict');
const KPT = require('../src/domain.js');

function makeState() {
  const s = KPT.empty();
  s.Members.push({ id: 'STU-1', version: 1, name: 'Test Member', ic: '123456-78-9012', sjamId: '001', race: 'Cina', form: 'Form 1', joined: '2020-01-01', status: 'Active' });
  s.Catalog.push({ id: 'CAT-SS1', version: 1, code: 'SERVICE_YEAR_1', sortOrder: 900, kind: 'Award', category: 'Service Stripe & Star', name: 'Service Stripe & Star', level: '1st Year - 1 Black-and-White Stripe', eligibilityMetric: 'efficientYears', eligibilityThreshold: 1, archived: false });
  s.Catalog.push({ id: 'CAT-SS4', version: 1, code: 'SERVICE_YEAR_4', sortOrder: 903, kind: 'Award', category: 'Service Stripe & Star', name: 'Service Stripe & Star', level: '4th Year - 1 Service Star + 1 Black-and-White Stripe', eligibilityMetric: 'efficientYears', eligibilityThreshold: 4, archived: false });
  return s;
}
const ctx = () => ({ actor: 'secretary@gmail.com', now: '2026-10-25T10:00:00Z', uuid: () => 'u' + Math.random().toString(36).slice(2, 8) });

test('serviceSubmit: creates PendingSecretary, dedupes clientRequestId, returns only reference', () => {
  const s = makeState();
  const r1 = KPT.serviceSubmit(s, { applicant: { name: 'John', ic: 'IC1' }, declaredYear: 3, clientRequestId: 'req-1' }, ctx());
  assert.equal(r1.deduplicated, false);
  assert.ok(r1.reference.startsWith('SVC-'));
  assert.equal(s.serviceApplications.length, 1);
  assert.equal(s.serviceApplications[0].status, 'PendingSecretary');
  const r2 = KPT.serviceSubmit(s, { applicant: { name: 'John', ic: 'IC1' }, declaredYear: 3, clientRequestId: 'req-1' }, ctx());
  assert.equal(r2.deduplicated, true);
  assert.equal(r2.reference, r1.reference);
  assert.equal(s.serviceApplications.length, 1, 'dedup prevents duplicate');
});

test('serviceSubmit: applicant name/ic required, declaredYear 1-5 or null', () => {
  const s = makeState();
  assert.throws(() => KPT.serviceSubmit(s, { applicant: { name: '', ic: 'X' }, clientRequestId: 'r1' }, ctx()), /name/i);
  assert.throws(() => KPT.serviceSubmit(s, { applicant: { name: 'A', ic: '' }, clientRequestId: 'r2' }, ctx()), /IC/i);
  assert.throws(() => KPT.serviceSubmit(s, { applicant: { name: 'A', ic: 'X' }, declaredYear: 6, clientRequestId: 'r3' }, ctx()), /1-5/);
  const r = KPT.serviceSubmit(s, { applicant: { name: 'A', ic: 'X' }, declaredYear: null, clientRequestId: 'r4' }, ctx());
  assert.ok(r.reference);
});

test('serviceSave: version required, applicant correction supported, memberId existence checked', () => {
  const s = makeState();
  KPT.serviceSubmit(s, { applicant: { name: 'John', ic: 'IC1' }, clientRequestId: 'r1' }, ctx());
  const app = s.serviceApplications[0];
  // Missing version fails
  assert.throws(() => KPT.serviceSave(s, { application: { id: app.id, memberId: 'STU-1' } }, ctx()), /version/i);
  // Wrong version fails
  assert.throws(() => KPT.serviceSave(s, { application: { id: app.id, version: 99, memberId: 'STU-1' } }, ctx()), /Conflict/);
  // Invalid memberId fails
  assert.throws(() => KPT.serviceSave(s, { application: { id: app.id, version: app.version, memberId: 'STU-FAKE' } }, ctx()), /does not exist/);
  // Applicant correction works
  KPT.serviceSave(s, { application: { id: app.id, version: app.version, applicant: { name: 'John Corrected', ic: 'IC1' } } }, ctx());
  assert.equal(s.serviceApplications[0].applicant.name, 'John Corrected');
});

test('serviceSave: IC mismatch requires confirmIcMismatch', () => {
  const s = makeState();
  KPT.serviceSubmit(s, { applicant: { name: 'John', ic: 'DIFFERENT_IC' }, clientRequestId: 'r1' }, ctx());
  const app = s.serviceApplications[0];
  // IC mismatch without confirm
  assert.throws(() => KPT.serviceSave(s, { application: { id: app.id, version: app.version, memberId: 'STU-1' } }, ctx()), /IC does not match/);
  // With confirm flag
  KPT.serviceSave(s, { application: { id: app.id, version: s.serviceApplications[0].version, memberId: 'STU-1', confirmIcMismatch: true } }, ctx());
  assert.equal(s.serviceApplications[0].memberId, 'STU-1');
});

test('serviceSave: content change on Ready/Submitted invalidates Owner approval', () => {
  const s = makeState();
  KPT.serviceSubmit(s, { applicant: { name: 'John', ic: 'IC1' }, clientRequestId: 'r1' }, ctx());
  const app = s.serviceApplications[0];
  // Move to Ready with owner approval
  app.status = 'Ready'; app.ownerApproved = true; app.memberId = 'STU-1'; app.confirmedYear = 1;
  const v = app.version;
  KPT.serviceSave(s, { application: { id: app.id, version: v, remarks: 'changed' } }, ctx());
  const updated = s.serviceApplications[0];
  assert.equal(updated.status, 'Preparing', 'content change demotes Ready to Preparing');
  assert.equal(updated.ownerApproved, false, 'owner approval invalidated');
});

test('serviceTransition: state graph enforced, cannot jump to Recorded/Approved', () => {
  const s = makeState();
  KPT.serviceSubmit(s, { applicant: { name: 'J', ic: 'I' }, clientRequestId: 'r1' }, ctx());
  const app = s.serviceApplications[0];
  // PendingSecretary cannot go directly to Ready
  assert.throws(() => KPT.serviceTransition(s, { applicationId: app.id, version: app.version, status: 'Ready' }, { ...ctx(), isOwner: true }), /Cannot change status/);
  // Cannot jump to Recorded
  assert.throws(() => KPT.serviceTransition(s, { applicationId: app.id, version: s.serviceApplications[0].version, status: 'Recorded' }, ctx()), /Cannot change status/);
  // Valid: PendingSecretary -> Preparing
  KPT.serviceTransition(s, { applicationId: app.id, version: s.serviceApplications[0].version, status: 'Preparing' }, ctx());
  assert.equal(s.serviceApplications[0].status, 'Preparing');
});

test('serviceTransition: Secretary can mark Ready, 4th year requires both signed forms', () => {
  const s = makeState();
  KPT.serviceSubmit(s, { applicant: { name: 'J', ic: 'I' }, declaredYear: 4, clientRequestId: 'r1' }, ctx());
  const c = ctx();
  // Walk state graph: PendingSecretary -> Preparing -> AwaitingSignature -> AwaitingOwner
  KPT.serviceTransition(s, { applicationId: s.serviceApplications[0].id, version: s.serviceApplications[0].version, status: 'Preparing' }, c);
  s.serviceApplications[0].memberId = 'STU-1';
  s.serviceApplications[0].confirmedYear = 4;
  s.serviceApplications[0].attachments = [{ id: 'a1', kind: 'duty', active: true }];
  KPT.serviceTransition(s, { applicationId: s.serviceApplications[0].id, version: s.serviceApplications[0].version, status: 'AwaitingSignature' }, c);
  assert.throws(() => KPT.serviceTransition(s, { applicationId: s.serviceApplications[0].id, version: s.serviceApplications[0].version, status: 'Ready' }, c), /signedStripe|signedStar|Year 4/);
  s.serviceApplications[0].attachments.push({ id: 'a2', kind: 'signedStripe', active: true }, { id: 'a3', kind: 'signedStar', active: true });
  KPT.serviceTransition(s, { applicationId: s.serviceApplications[0].id, version: s.serviceApplications[0].version, status: 'Ready' }, c);
  assert.equal(KPT.serviceSummary(s).ownerReviewCount, 1);
  assert.equal(s.serviceApplications[0].status, 'Ready');
  assert.equal(s.serviceApplications[0].ownerApproved, true);
});

test('serviceTransition: Ready requires memberId, confirmedYear, duty attachment', () => {
  const s = makeState();
  KPT.serviceSubmit(s, { applicant: { name: 'J', ic: 'I' }, clientRequestId: 'r1' }, ctx());
  const app = s.serviceApplications[0];
  app.status = 'AwaitingOwner';
  // No memberId
  assert.throws(() => KPT.serviceTransition(s, { applicationId: app.id, version: app.version, status: 'Ready' }, { ...ctx(), isOwner: true }), /member/);
  app.memberId = 'STU-1';
  // No confirmedYear
  assert.throws(() => KPT.serviceTransition(s, { applicationId: app.id, version: s.serviceApplications[0].version, status: 'Ready' }, { ...ctx(), isOwner: true }), /year/);
  app.confirmedYear = 1;
  // No duty
  assert.throws(() => KPT.serviceTransition(s, { applicationId: app.id, version: s.serviceApplications[0].version, status: 'Ready' }, { ...ctx(), isOwner: true }), /Duty/);
});

test('serviceAward: creates real Awards record with SERVICE_YEAR mapping, requires Approved and preparation confirmation', () => {
  const s = makeState();
  KPT.serviceSubmit(s, { applicant: { name: 'J', ic: '123456-78-9012' }, clientRequestId: 'r1' }, ctx());
  const app = s.serviceApplications[0];
  app.memberId = 'STU-1'; app.confirmedYear = 1; app.status = 'Approved'; app.ownerApproved = true;
  const before = s.Awards.length;
  const r = KPT.serviceAward(s, { applicationId: app.id, version: app.version, date: '2026-11-01', certificate: 'CERT-001' }, ctx());
  assert.equal(s.Awards.length, before + 1, 'real Award record created');
  assert.equal(s.Awards[s.Awards.length - 1].catalogId, 'CAT-SS1');
  assert.equal(s.serviceApplications[0].status, 'Recorded');
  // Duplicate award fails (app already Recorded)
  assert.throws(() => KPT.serviceAward(s, { applicationId: app.id, version: s.serviceApplications[0].version, date: '2026-12-01' }, ctx()), /already|Approved/);
});

test('serviceAward: not Approved fails, no ownerApproved fails, no catalog entry fails', () => {
  const s = makeState();
  KPT.serviceSubmit(s, { applicant: { name: 'J', ic: '123456-78-9012' }, clientRequestId: 'r1' }, ctx());
  const app = s.serviceApplications[0];
  app.memberId = 'STU-1'; app.confirmedYear = 2;
  // Not Approved
  assert.throws(() => KPT.serviceAward(s, { applicationId: app.id, version: app.version, date: '2026-11-01' }, ctx()), /Approved/);
  // Approved but no ownerApproved
  app.status = 'Approved';
  assert.throws(() => KPT.serviceAward(s, { applicationId: app.id, version: app.version, date: '2026-11-01' }, ctx()), /Preparation confirmation/);
  // Year 2 has no catalog entry in our fixture
  app.ownerApproved = true;
  assert.throws(() => KPT.serviceAward(s, { applicationId: app.id, version: app.version, date: '2026-11-01' }, ctx()), /SERVICE_YEAR_2/);
});

test('serviceAward: duplicate member+catalog blocked even across applications', () => {
  const s = makeState();
  const c = ctx();
  KPT.serviceSubmit(s, { applicant: { name: 'J', ic: '123456-78-9012' }, clientRequestId: 'r1' }, c);
  const app1 = s.serviceApplications[0];
  app1.memberId = 'STU-1'; app1.confirmedYear = 1; app1.status = 'Approved'; app1.ownerApproved = true;
  KPT.serviceAward(s, { applicationId: app1.id, version: app1.version, date: '2026-11-01' }, c);
  KPT.serviceSubmit(s, { applicant: { name: 'J', ic: '123456-78-9012' }, clientRequestId: 'r2' }, c);
  const app2 = s.serviceApplications[1];
  app2.memberId = 'STU-1'; app2.confirmedYear = 1; app2.status = 'Approved'; app2.ownerApproved = true;
  assert.throws(() => KPT.serviceAward(s, { applicationId: app2.id, version: app2.version, date: '2026-12-01' }, c), /already has/);
});

test('serviceUploadMeta: attachment invalidates Owner approval on Ready/Submitted', () => {
  const s = makeState();
  KPT.serviceSubmit(s, { applicant: { name: 'J', ic: 'I' }, clientRequestId: 'r1' }, ctx());
  const app = s.serviceApplications[0];
  app.status = 'Ready'; app.ownerApproved = true;
  KPT.serviceUploadMeta(s, { applicationId: app.id, kind: 'duty', fileName: 'd.pdf', mime: 'application/pdf', bytes: 100 }, ctx());
  assert.equal(s.serviceApplications[0].status, 'Preparing', 'new attachment demotes');
  assert.equal(s.serviceApplications[0].ownerApproved, false);
});

test('public projection does not include service data', () => {
  const s = makeState();
  KPT.serviceSubmit(s, { applicant: { name: 'SECRET_NAME', ic: 'SECRET_IC' }, clientRequestId: 'r1' }, ctx());
  const pub = KPT.projectPublic(s);
  assert.ok(!JSON.stringify(pub).includes('SECRET_NAME'));
  assert.ok(!JSON.stringify(pub).includes('SECRET_IC'));
  assert.ok(!JSON.stringify(pub).includes('serviceApplications'));
});

test('ATOMICITY: change applicant + invalid memberId → reject, original data unchanged', () => {
  const s = makeState();
  KPT.serviceSubmit(s, { applicant: { name: 'Original Name', ic: 'IC-ORIG' }, clientRequestId: 'r1' }, ctx());
  const app = s.serviceApplications[0];
  const snapshot = JSON.stringify(app);
  // Attempt to change applicant AND set invalid memberId in one call
  assert.throws(() => KPT.serviceSave(s, {
    application: {
      id: app.id,
      version: app.version,
      applicant: { name: 'CHANGED NAME', ic: 'IC-CHANGED' },
      memberId: 'STU-FAKE'
    }
  }, ctx()), /does not exist/);
  // Verify NOTHING changed — original applicant intact
  const after = s.serviceApplications[0];
  assert.equal(after.applicant.name, 'Original Name', 'applicant.name must be unchanged after failed save');
  assert.equal(after.applicant.ic, 'IC-ORIG', 'applicant.ic must be unchanged after failed save');
  assert.equal(after.memberId, '', 'memberId must be unchanged after failed save');
  assert.equal(after.version, 1, 'version must not increment on failure');
  assert.equal(JSON.stringify(after), snapshot, 'entire application must be identical to pre-save snapshot');
});

test('ATOMICITY: batch save with one invalid app ID → reject, no batch created or modified', () => {
  const s = makeState();
  const c = ctx();
  KPT.serviceSubmit(s, { applicant: { name: 'A', ic: 'I1' }, clientRequestId: 'r1' }, c);
  KPT.serviceSubmit(s, { applicant: { name: 'B', ic: 'I2' }, clientRequestId: 'r2' }, c);
  const before = s.serviceBatches.length;
  // Attempt to create batch with one valid + one fake app ID
  assert.throws(() => KPT.serviceSaveBatch(s, {
    batch: { year: 2026, title: 'Test Batch', applicationIds: [s.serviceApplications[0].id, 'SVC-FAKE'] }
  }, c), /not found/);
  assert.equal(s.serviceBatches.length, before, 'no batch created on failure');
});

test('ATOMICITY: batch transition Ready with one incomplete app → reject, batch unchanged', () => {
  const s = makeState();
  const c = ctx();
  KPT.serviceSubmit(s, { applicant: { name: 'A', ic: 'I1' }, clientRequestId: 'r1' }, c);
  KPT.serviceSubmit(s, { applicant: { name: 'B', ic: 'I2' }, clientRequestId: 'r2' }, c);
  // First app is complete, second is incomplete (no memberId/confirmedYear)
  const app1 = s.serviceApplications[0];
  app1.memberId = 'STU-1'; app1.confirmedYear = 1; app1.status = 'Preparing';
  app1.attachments = [{ id: 'a1', kind: 'duty', active: true }, { id: 'a2', kind: 'signedStripe', active: true }];
  const app2 = s.serviceApplications[1];
  app2.status = 'Preparing';
  KPT.serviceSaveBatch(s, { batch: { year: 2026, title: 'Mixed', applicationIds: [app1.id, app2.id] } }, c);
  const batch = s.serviceBatches[0];
  batch.status = 'AwaitingOwner';
  const snapshot = JSON.stringify(batch);
  // Try to set Ready — should fail because app2 is incomplete
  assert.throws(() => KPT.serviceTransition(s, { batchId: batch.id, version: batch.version, status: 'Ready' }, { ...c, isOwner: true }), /no member|no confirmed/);
  assert.equal(JSON.stringify(s.serviceBatches[0]), snapshot, 'batch must be unchanged after failed transition');
});

test('E2E BATCH FLOW: 4th year single app → batch Ready cascades children → Submitted → Approved → serviceAward', () => {
  const s = makeState();
  const c = ctx();
  // 1. Anonymous submit 4th year application
  KPT.serviceSubmit(s, { applicant: { name: 'JOHN DOE', ic: '123456-78-9012' }, declaredYear: 4, clientRequestId: 'r1' }, c);
  const app = s.serviceApplications[0];
  assert.equal(app.status, 'PendingSecretary');
  assert.equal(app.declaredYear, 4);

  // 2. Secretary: bind member, confirm year, upload duty + two signed forms
  KPT.serviceSave(s, { application: { id: app.id, version: app.version, memberId: 'STU-1', confirmedYear: 4 } }, c);
  let v = s.serviceApplications[0].version;
  KPT.serviceUploadMeta(s, { applicationId: app.id, kind: 'duty', fileName: 'd.pdf', mime: 'application/pdf', bytes: 100 }, c);
  v = s.serviceApplications[0].version;
  KPT.serviceUploadMeta(s, { applicationId: app.id, kind: 'signedStripe', fileName: 'ss.pdf', mime: 'application/pdf', bytes: 100 }, c);
  v = s.serviceApplications[0].version;
  KPT.serviceUploadMeta(s, { applicationId: app.id, kind: 'signedStar', fileName: 'st.pdf', mime: 'application/pdf', bytes: 100 }, c);
  assert.equal(s.serviceApplications[0].attachments.length, 3);

  // 3. Create batch with this app
  KPT.serviceSaveBatch(s, { batch: { year: 2026, title: 'SSS 2026 Batch 1', applicationIds: [app.id] } }, c);
  const batch = s.serviceBatches[0];
  assert.equal(batch.status, 'Preparing');

  // 4. Owner: batch Ready → should cascade children to Ready + ownerApproved
  KPT.serviceTransition(s, { batchId: batch.id, version: batch.version, status: 'Ready' }, { ...c, isOwner: true });
  const batchAfterReady = s.serviceBatches[0];
  const appAfterReady = s.serviceApplications[0];
  assert.equal(batchAfterReady.status, 'Ready');
  assert.equal(batchAfterReady.ownerApproved, true);
  assert.equal(appAfterReady.status, 'Ready', 'child app cascaded to Ready');
  assert.equal(appAfterReady.ownerApproved, true, 'child app ownerApproved set');

  // 5. Batch Submitted → cascades children to Submitted
  KPT.serviceTransition(s, { batchId: batchAfterReady.id, version: batchAfterReady.version, status: 'Submitted', submittedAt: '2026-11-01' }, { ...c, isOwner: true });
  const batchAfterSub = s.serviceBatches[0];
  const appAfterSub = s.serviceApplications[0];
  assert.equal(batchAfterSub.status, 'Submitted');
  assert.equal(appAfterSub.status, 'Submitted', 'child app cascaded to Submitted');

  // 6. Batch Approved → cascades children to Approved
  KPT.serviceTransition(s, { batchId: batchAfterSub.id, version: batchAfterSub.version, status: 'Approved' }, { ...c, isOwner: true });
  const batchAfterApp = s.serviceBatches[0];
  const appAfterApp = s.serviceApplications[0];
  assert.equal(batchAfterApp.status, 'Approved');
  assert.equal(appAfterApp.status, 'Approved', 'child app cascaded to Approved');

  // 7. serviceAward: should succeed without extra per-person re-approval
  const awardResult = KPT.serviceAward(s, {
    applicationId: appAfterApp.id,
    version: appAfterApp.version,
    date: '2026-12-01',
    certificate: 'CERT-2026-001'
  }, c);
  assert.ok(awardResult.awardId, 'award recorded');
  assert.equal(s.serviceApplications[0].status, 'Recorded');

  // 8. Only ONE SERVICE_YEAR_4 award recorded
  const sssAwards = (s.Awards || []).filter(a => a.catalogId === 'CAT-SS4');
  assert.equal(sssAwards.length, 1, 'exactly one SERVICE_YEAR_4 award');
});

test('E2E BATCH FLOW: batch combined attachments satisfy duty+signed requirements', () => {
  const s = makeState();
  const c = ctx();
  KPT.serviceSubmit(s, { applicant: { name: 'J', ic: 'I1' }, declaredYear: 1, clientRequestId: 'r1' }, c);
  KPT.serviceSubmit(s, { applicant: { name: 'K', ic: 'I2' }, declaredYear: 1, clientRequestId: 'r2' }, c);
  const app1 = s.serviceApplications[0];
  const app2 = s.serviceApplications[1];
  KPT.serviceSave(s, { application: { id: app1.id, version: app1.version, memberId: 'STU-1', confirmedYear: 1, confirmIcMismatch: true } }, c);
  KPT.serviceSave(s, { application: { id: app2.id, version: app2.version, memberId: 'STU-1', confirmedYear: 1, confirmIcMismatch: true } }, c);
  // Batch with combined attachments (no per-app duty/signed)
  KPT.serviceSaveBatch(s, { batch: { year: 2026, title: 'Combined Batch', applicationIds: [app1.id, app2.id] } }, c);
  const batch = s.serviceBatches[0];
  // Upload combinedDuty and combinedSignedStripe to batch
  KPT.serviceUploadMeta(s, { batchId: batch.id, kind: 'combinedDuty', fileName: 'all_duty.pdf', mime: 'application/pdf', bytes: 100 }, c);
  KPT.serviceUploadMeta(s, { batchId: batch.id, kind: 'combinedSignedStripe', fileName: 'all_signed.pdf', mime: 'application/pdf', bytes: 100 }, c);
  // Batch Ready should succeed using combined attachments
  KPT.serviceTransition(s, { batchId: batch.id, version: s.serviceBatches[0].version, status: 'Ready' }, { ...c, isOwner: true });
  assert.equal(s.serviceBatches[0].status, 'Ready');
  assert.equal(s.serviceApplications[0].status, 'Ready', 'child 1 cascaded');
  assert.equal(s.serviceApplications[1].status, 'Ready', 'child 2 cascaded');
});

test('E2E BATCH FLOW: same app cannot join multiple unfinished batches', () => {
  const s = makeState();
  const c = ctx();
  KPT.serviceSubmit(s, { applicant: { name: 'J', ic: 'I1' }, clientRequestId: 'r1' }, c);
  const app = s.serviceApplications[0];
  // Create first batch
  KPT.serviceSaveBatch(s, { batch: { year: 2026, title: 'Batch A', applicationIds: [app.id] } }, c);
  // Try to create second batch with same app → must fail
  assert.throws(() => KPT.serviceSaveBatch(s, { batch: { year: 2026, title: 'Batch B', applicationIds: [app.id] } }, c), /already in unfinished batch/);
});

test('E2E BATCH FLOW: batch NeedsInfo rolls back children', () => {
  const s = makeState();
  const c = ctx();
  KPT.serviceSubmit(s, { applicant: { name: 'J', ic: '123456-78-9012' }, declaredYear: 1, clientRequestId: 'r1' }, c);
  const app = s.serviceApplications[0];
  KPT.serviceSave(s, { application: { id: app.id, version: app.version, memberId: 'STU-1', confirmedYear: 1 } }, c);
  KPT.serviceSaveBatch(s, { batch: { year: 2026, title: 'Test', applicationIds: [app.id] } }, c);
  const batch = s.serviceBatches[0];
  KPT.serviceUploadMeta(s, { batchId: batch.id, kind: 'combinedDuty', fileName: 'd.pdf', mime: 'application/pdf', bytes: 100 }, c);
  KPT.serviceUploadMeta(s, { batchId: batch.id, kind: 'combinedSignedStripe', fileName: 's.pdf', mime: 'application/pdf', bytes: 100 }, c);
  KPT.serviceTransition(s, { batchId: batch.id, version: s.serviceBatches[0].version, status: 'Ready' }, { ...c, isOwner: true });
  // Rollback with NeedsInfo
  KPT.serviceTransition(s, { batchId: s.serviceBatches[0].id, version: s.serviceBatches[0].version, status: 'NeedsInfo' }, { ...c, isOwner: true });
  assert.equal(s.serviceBatches[0].status, 'NeedsInfo');
  assert.equal(s.serviceApplications[0].status, 'NeedsInfo', 'child rolled back');
  assert.equal(s.serviceApplications[0].ownerApproved, false, 'child ownerApproved cleared');
});

test('E2E BATCH FLOW: batch combined attachments restricted to batch only', () => {
  const s = makeState();
  const c = ctx();
  KPT.serviceSubmit(s, { applicant: { name: 'J', ic: 'I1' }, clientRequestId: 'r1' }, c);
  const app = s.serviceApplications[0];
  // Cannot upload combinedDuty to individual app
  assert.throws(() => KPT.serviceUploadMeta(s, { applicationId: app.id, kind: 'combinedDuty', fileName: 'x.pdf', mime: 'application/pdf', bytes: 100 }, c), /only be uploaded to a batch/);
  // Cannot upload per-app duty to batch
  KPT.serviceSaveBatch(s, { batch: { year: 2026, title: 'T', applicationIds: [app.id] } }, c);
  assert.throws(() => KPT.serviceUploadMeta(s, { batchId: s.serviceBatches[0].id, kind: 'duty', fileName: 'x.pdf', mime: 'application/pdf', bytes: 100 }, c), /must be uploaded to individual/);
});
