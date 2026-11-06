const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KPT = require('../src/domain.js');

// Load pdf-lib UMD the same way tests/service-pdf.test.cjs does.
global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
const pdfLibSrc = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'pdf-lib.min.js'), 'utf8');
const pdfLibModule = { exports: {} };
new Function('exports', 'module', 'self', 'window', 'global', pdfLibSrc)(
  pdfLibModule.exports, pdfLibModule, global, global, global
);
global.PDFLib = pdfLibModule.exports;
global.XLSX = require('../vendor/xlsx.full.min.js');
const { generateDutyRecord } = require('../src/duty-pdf.js');
const KPTServicePDF = require('../src/service-pdf.js');

let serial = 0;
const ctx = () => ({ actor: 'duty-qa@example.test', now: '2026-10-25T10:00:00.000Z', uuid: () => 'qaduty-' + ++serial });

// All fixtures are fictional (QA names / fake SJAM IDs / fake ICs) — never real member data.
function seedState() {
  const state = KPT.empty();
  state.Members.push(
    { id: 'STU-900001', version: 1, name: 'QA Cadet One', ic: '000001-01-0001', sjamId: 'QA-0001', race: 'Cina', form: 'Form 1', joined: '2025-01-01', status: 'Active' },
    { id: 'STU-900002', version: 1, name: 'QA Cadet Two', ic: '000002-01-0002', sjamId: 'QA-0002', race: 'Cina', form: 'Form 1', joined: '2025-01-01', status: 'Active' }
  );
  state.Activities.push(
    { id: 'A-1', version: 1, name: 'QA Activity One', date: '2026-02-01', tags: ['DIM'], examType: '', archived: false },
    { id: 'A-2', version: 1, name: 'QA Activity Two', date: '2026-03-01', tags: ['Other'], examType: '', archived: false }
  );
  state.sequence = 900002;
  return state;
}

function makeTransport(initial) {
  const sandbox = {
    KPT,
    window: {},
    setTimeout,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    fetch: async () => ({ ok: true, json: async () => KPT.copy(initial) })
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../src/demo-transport.js'), 'utf8'), sandbox);
  return sandbox.window.KPTTransport;
}

test('duty permissions: demo-transport allows duty/admin/owner and denies os/treasurer', async () => {
  const transport = makeTransport(seedState());

  await transport.setDemoRole('duty');
  const boot = await transport.call({ action: 'dutyBootstrap' });
  assert.equal(boot.members.length, 2);
  const savedPrevious = await transport.call({ action: 'dutyPreviousSave', memberId: 'STU-900001', year: 2026, hours: 5, note: 'opening entry' });
  assert.equal(savedPrevious.previous.length, 1);
  assert.equal(savedPrevious.previous[0].hours, 5);

  for (const role of ['os', 'treasurer']) {
    await transport.setDemoRole(role);
    await assert.rejects(() => transport.call({ action: 'dutyBootstrap' }), /Access denied/);
    await assert.rejects(() => transport.call({ action: 'dutyImportCommit', mode: 'records', rows: [] }), /Access denied/);
    await assert.rejects(() => transport.call({ action: 'dutyReportBundle', memberId: 'STU-900001', year: 2026 }), /Access denied/);
  }

  await transport.setDemoRole('admin');
  const adminBoot = await transport.call({ action: 'dutyBootstrap' });
  assert.equal(adminBoot.members.length, 2);

  await transport.setDemoRole('owner');
  const bundle = await transport.call({ action: 'dutyReportBundle', memberId: 'STU-900001', year: 2026 });
  assert.equal(bundle.report.previousTotal, 5);
  assert.equal(bundle.report.confirmed, true);
});

test('dutyBootstrap projection is minimal: members expose only id, name, sjamId (no ic)', async () => {
  const transport = makeTransport(seedState());
  await transport.setDemoRole('duty');
  const boot = await transport.call({ action: 'dutyBootstrap' });
  assert.ok(boot.members.every(member => Object.keys(member).sort().join(',') === 'id,name,sjamId'));
  const first = boot.members.find(member => member.id === 'STU-900001');
  assert.equal(first.name, 'QA Cadet One');
  assert.equal(first.sjamId, 'QA-0001');
  assert.equal('ic' in first, false);
  assert.equal(JSON.stringify(boot.members).includes('000001-01-0001'), false, 'IC values must never leave the projection');
});

test('dutyImportRows records retry: same rows report 重复 errors and never double-count', () => {
  const rows = [
    { memberId: 'STU-900001', activityId: 'A-1', date: '2026-02-01', hours: 4, note: 'morning' },
    { memberId: 'STU-900001', activityId: 'A-2', date: '2026-03-01', hours: 6, note: 'afternoon' }
  ];
  const first = KPT.dutyImportRows(seedState(), { mode: 'records', rows }, ctx());
  assert.equal(first.errors.length, 0);
  assert.equal(first.changes.length, 2);
  assert.equal(first.state.DutyRecords.length, 2);

  const replay = KPT.dutyImportRows(first.state, { mode: 'records', rows }, ctx());
  assert.equal(replay.state, null, 'retry is atomic: state is null on any error');
  assert.ok(replay.errors.length >= 2);
  replay.errors.forEach(error => assert.match(error.message, /重复/));
  assert.equal(first.state.DutyRecords.length, 2, 'retry must not double-count');
});

test('dutyImportRows previous retry: repeated 60 hours stays a single entry with 重复', () => {
  const rows = [{ memberId: 'STU-900001', year: 2026, hours: 60, note: 'carried from 2025' }];
  const first = KPT.dutyImportRows(seedState(), { mode: 'previous', rows }, ctx());
  assert.equal(first.errors.length, 0);
  assert.equal(first.state.DutyPrevious.length, 1);
  assert.equal(first.state.DutyPrevious[0].hours, 60);

  const replay = KPT.dutyImportRows(first.state, { mode: 'previous', rows }, ctx());
  assert.equal(replay.state, null);
  assert.ok(replay.errors.length >= 1);
  replay.errors.forEach(error => assert.match(error.message, /重复/));
  assert.equal(first.state.DutyPrevious.length, 1, 'retry must keep a single previous entry');
});

test('dutyImportRows in-file duplicate row: 重复 error and atomic null state', () => {
  const rows = [
    { memberId: 'STU-900001', activityId: 'A-1', date: '2026-02-01', hours: 3, note: '' },
    { memberId: 'STU-900001', activityId: 'A-1', date: '2026-02-01', hours: 3, note: '' }
  ];
  const result = KPT.dutyImportRows(seedState(), { mode: 'records', rows }, ctx());
  assert.equal(result.state, null);
  assert.ok(result.errors.some(error => /重复/.test(error.message)));
});

test('cross-year records: 2025 and 2026 lines stay separate with no automatic Previous carry-over', () => {
  const state = seedState();
  const after2025 = KPT.dutyRecordSave(state, { memberId: 'STU-900001', activityId: 'A-1', date: '2025-12-31', hours: 5, note: 'NYE duty' }, ctx()).state;
  const both = KPT.dutyRecordSave(after2025, { memberId: 'STU-900001', activityId: 'A-1', date: '2026-01-02', hours: 3, note: 'New year duty' }, ctx()).state;
  assert.equal(both.DutyRecords.find(row => row.date === '2025-12-31').year, 2025, 'year is derived from date');
  assert.equal(both.DutyRecords.find(row => row.date === '2026-01-02').year, 2026);

  const report2026 = KPT.dutyReportBundle(both, { memberId: 'STU-900001', year: 2026 });
  assert.equal(report2026.lines.length, 1);
  assert.equal(report2026.lines[0].date, '2026-01-02');
  assert.equal(report2026.subtotal, 3);
  assert.equal(report2026.previousTotal, 0, 'no automatic carry-over from 2025 records');
  assert.equal(report2026.confirmed, false, 'existing 2025 records do not confirm the 2026 Previous balance');

  const report2025 = KPT.dutyReportBundle(both, { memberId: 'STU-900001', year: 2025 });
  assert.equal(report2025.lines.length, 1);
  assert.equal(report2025.lines[0].date, '2025-12-31');
  assert.equal(report2025.subtotal, 5);
});

test('previous 60+10=70: additive entries, cumulative math and date-sorted lines', () => {
  const state = seedState();
  const one = KPT.dutyPreviousSave(state, { memberId: 'STU-900001', year: 2026, hours: 60, note: '2025 close' }, ctx()).state;
  const two = KPT.dutyPreviousSave(one, { memberId: 'STU-900001', year: 2026, hours: 10, note: '2025 adjustment' }, ctx()).state;
  const previousOnly = KPT.dutyReportBundle(two, { memberId: 'STU-900001', year: 2026 });
  assert.equal(previousOnly.previousEntries.length, 2);
  assert.equal(previousOnly.previousTotal, 70, 'Previous entries sum: 60 + 10 = 70');
  assert.equal(previousOnly.confirmed, true);
  assert.equal(previousOnly.subtotal, 0);

  // Add 2026 records totalling 10 hours, deliberately out of date order.
  const late = KPT.dutyRecordSave(two, { memberId: 'STU-900001', activityId: 'A-2', date: '2026-03-01', hours: 6, note: '' }, ctx()).state;
  const done = KPT.dutyRecordSave(late, { memberId: 'STU-900001', activityId: 'A-1', date: '2026-02-01', hours: 4, note: '' }, ctx()).state;
  const report = KPT.dutyReportBundle(done, { memberId: 'STU-900001', year: 2026 });
  assert.equal(report.previousTotal, 70);
  assert.equal(report.subtotal, 10);
  assert.equal(report.cumulative, 80);
  assert.equal(report.cumulative, report.previousTotal + report.subtotal);
  assert.deepEqual(report.lines.map(line => line.date), ['2026-02-01', '2026-03-01'], 'lines sorted by date asc');
  assert.equal(report.confirmed, true);
});

test('unconfirmed Previous blocks generateDutyRecord; a confirmed 0 is distinct', async () => {
  const state = seedState();
  const bare = KPT.dutyReportBundle(state, { memberId: 'STU-900002', year: 2026 });
  assert.equal(bare.confirmed, false, 'no Previous entries means unconfirmed');
  assert.equal(bare.previousTotal, 0);
  await assert.rejects(() => generateDutyRecord(bare), /Previous balance is not confirmed/);

  const zeroState = KPT.dutyPreviousSave(state, { memberId: 'STU-900002', year: 2026, hours: 0, note: 'confirmed zero balance' }, ctx()).state;
  const zeroReport = KPT.dutyReportBundle(zeroState, { memberId: 'STU-900002', year: 2026 });
  assert.equal(zeroReport.confirmed, true, 'an explicit 0 entry confirms the balance');
  assert.equal(zeroReport.previousTotal, 0);
  const bytes = await generateDutyRecord(zeroReport);
  assert.ok(bytes.length > 0, 'confirmed zero balance can generate the PDF');
});

test('duty proofs: bundle returns both, gather dedupes across applications, ZIP packs PDF + proofs', async () => {
  const transport = makeTransport(seedState());
  await transport.setDemoRole('duty');
  await transport.call({ action: 'dutyPreviousSave', memberId: 'STU-900001', year: 2026, hours: 60, note: '2025 close' });
  await transport.call({ action: 'dutyPreviousSave', memberId: 'STU-900001', year: 2026, hours: 10, note: '2025 adjustment' });
  await transport.call({ action: 'dutyRecordSave', memberId: 'STU-900001', activityId: 'A-1', date: '2026-02-01', hours: 6, note: '' });
  await transport.call({ action: 'dutyRecordSave', memberId: 'STU-900001', activityId: 'A-2', date: '2026-03-01', hours: 4, note: '' });

  const b64One = Buffer.from('%PDF-1.4 mock duty proof one').toString('base64');
  const b64Two = Buffer.from('%PDF-1.4 mock duty proof two').toString('base64');
  await transport.call({ action: 'dutyProofUpload', activityId: 'A-1', fileName: 'proof1.pdf', mime: 'application/pdf', bytes: 28, base64: b64One });
  await transport.call({ action: 'dutyProofUpload', activityId: 'A-2', fileName: 'proof2.pdf', mime: 'application/pdf', bytes: 28, base64: b64Two });

  const bundle = await transport.call({ action: 'dutyReportBundle', memberId: 'STU-900001', year: 2026 });
  assert.equal(bundle.proofs.length, 2, 'dutyReportBundle.proofs returns both proofs');
  assert.deepEqual(bundle.proofs.map(proof => proof.activityId).sort(), ['A-1', 'A-2']);
  bundle.proofs.forEach(proof => assert.ok(proof.base64, 'proof carries its bytes'));

  assert.equal(bundle.report.previousTotal, 70);
  assert.equal(bundle.report.subtotal, 10);
  assert.equal(bundle.report.cumulative, 80);

  // Two applications sharing the same member+year: copy gatherDutyProofs semantics
  // (activityId Set) so the same proof is never collected twice.
  const applications = [{ memberId: 'STU-900001', year: 2026 }, { memberId: 'STU-900001', year: 2026 }];
  const seen = new Set();
  const gathered = [];
  for (const app of applications) {
    const one = await transport.call({ action: 'dutyReportBundle', memberId: app.memberId, year: app.year });
    (one.proofs || []).filter(proof => proof && proof.base64 && proof.activityId && !seen.has(proof.activityId)).forEach(proof => {
      seen.add(proof.activityId);
      gathered.push(proof);
    });
  }
  assert.equal(gathered.length, 2, 'the same proof appears once across two bundles');

  const pdfBytes = await generateDutyRecord(bundle.report);
  assert.ok(pdfBytes.length > 0);
  const proof1 = Buffer.from(b64One, 'base64');
  const proof2 = Buffer.from(b64Two, 'base64');
  const zip = KPTServicePDF.zipFiles({
    'Duty-Record-2026-QA.pdf': pdfBytes,
    'proofs/A-1.pdf': proof1,
    'proofs/A-2.pdf': proof2
  });
  assert.ok(zip.length > 0, 'ZIP bytes are non-empty');
  const latin = Buffer.from(zip).toString('latin1');
  assert.ok(latin.includes('Duty-Record-2026'), 'ZIP contains the Duty Record PDF name');
  assert.ok(latin.includes('proofs/'), 'ZIP contains the proofs folder');
});

test('duty save functions leave manual serviceApplications attachments untouched', () => {
  const state = seedState();
  state.serviceApplications = [{
    id: 'SVC-QA-1',
    version: 1,
    status: 'Preparing',
    applicant: { name: 'QA Cadet One', ic: '000001-01-0001' },
    attachments: [{ id: 'ATT-MANUAL-1', kind: 'duty', fileName: 'old-manual-duty.pdf', active: true }]
  }];
  const saved = KPT.dutyRecordSave(state, { memberId: 'STU-900001', activityId: 'A-1', date: '2026-02-01', hours: 2, note: '' }, ctx());
  const proved = KPT.dutyProofSave(saved.state, { activityId: 'A-1', fileName: 'proof.pdf', mime: 'application/pdf', bytes: 25 }, ctx());
  const attachments = proved.state.serviceApplications[0].attachments;
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].fileName, 'old-manual-duty.pdf');
  assert.equal(attachments[0].active, true);
});
