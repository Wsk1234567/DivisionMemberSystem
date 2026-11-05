// Service API security + idempotency tests — VM harness modelled on tests/backend.test.cjs.
// Standard paths only (../src/domain.js, ../apps-script/admin/…) so they run after
// supervisor integration. These exercise the real routing in Code.gs +
// ServiceApplications.gs, not mocks of the flow.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const KPT = require('../src/domain.js');
const { fixture } = require('../src/demo-data.js');

const ROOT = path.join(__dirname, '..');
const CODE_GS = path.join(ROOT, 'apps-script', 'admin', 'Code.gs');
const SERVICE_GS = path.join(ROOT, 'apps-script', 'admin', 'ServiceApplications.gs');

const PRIVILEGED = ['serviceList', 'serviceSummary', 'serviceSave', 'serviceSaveBatch', 'serviceTransition', 'serviceUpload', 'serviceDownload', 'serviceAward'];

function harness() {
  let serial = 0;
  const env = { actor: 'owner@gmail.com', effective: null };
  const values = new Map(Object.entries({
    OWNER_EMAIL: 'owner@gmail.com',
    ADMINS: '["secretary@gmail.com"]',
    ADMIN_EMAILS: '["secretary@gmail.com"]',
    TREASURER_EMAILS: '["treasurer@gmail.com"]',
    OC_EMAILS: '["oc@gmail.com"]',
    PRIVATE_SHEET_ID: 'private',
    PUBLIC_SHEET_ID: 'public',
    BACKUP_FOLDER_ID: 'backups',
    CURRENT_SLOT: '0',
    PUBLISHED_REVISION: '1',
    SERVICE_FOLDER_ID: 'service-files'
  }));
  const properties = {
    getProperty: key => (values.has(key) ? values.get(key) : null),
    setProperty: (key, value) => values.set(key, String(value)),
    deleteProperty: key => values.delete(key),
    setProperties: data => Object.entries(data).forEach(([k, v]) => values.set(k, String(v)))
  };
  const makeSheet = () => {
    let rows = [];
    return {
      getLastRow: () => rows.length,
      getMaxRows: () => 1000,
      insertRowsAfter: () => {},
      clearContents: () => { rows = []; },
      getRange(first, column, height, width) {
        const start = typeof first === 'string' ? 0 : first - 1;
        const count = height || 1;
        return {
          setNumberFormat() { return this; },
          setValues(data) { data.forEach((row, i) => { rows[start + i] = row.map(v => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v)); }); return this; },
          getDisplayValues: () => Array.from({ length: count }, (_, i) => (rows[start + i] || ['']).map(String)),
          getValue: () => (rows[start] || [''])[0]
        };
      }
    };
  };
  const makeBook = () => {
    const sheets = new Map();
    return { getSheetByName: name => sheets.get(name), insertSheet: name => { const s = makeSheet(); sheets.set(name, s); return s; } };
  };
  const privateBook = makeBook();
  const publicBook = makeBook();
  const lock = { tryLock: () => true, releaseLock: () => {} };
  const cacheMap = new Map();
  const folder = {
    createFile: (name, content, mime) => ({ getId: () => 'svcfile-' + ++serial, getName: () => name, getMimeType: () => mime, getBlob: () => ({ getDataAsString: () => content }), setTrashed: () => {} }),
    getFiles: () => ({ hasNext: () => false, next: () => null }),
    addEditor: () => {}, removeEditor: () => {}
  };
  const sandbox = {
    KPT, console,
    PropertiesService: { getScriptProperties: () => properties },
    Session: {
      getActiveUser: () => ({ getEmail: () => env.actor }),
      getEffectiveUser: () => ({ getEmail: () => env.effective || env.actor })
    },
    LockService: { getScriptLock: () => lock },
    CacheService: { getScriptCache: () => ({ get: k => (cacheMap.has(k) ? cacheMap.get(k) : null), put: (k, v) => { cacheMap.set(k, String(v)); } }) },
    SpreadsheetApp: { openById: id => (id === 'private' ? privateBook : publicBook), flush: () => {} },
    Utilities: {
      DigestAlgorithm: { MD5: 'MD5', SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (algo, value) => {
        const crypto = require('node:crypto');
        return Array.from(crypto.createHash(String(algo) === 'SHA_256' ? 'sha256' : 'md5').update(String(value == null ? '' : value), 'utf8').digest());
      },
      base64EncodeWebSafe: value => Buffer.from(value || []).toString('base64url'),
      getUuid: () => 'u-' + ++serial,
      base64Decode: value => Buffer.from(String(value || ''), 'base64'),
      base64Encode: value => Buffer.from(value).toString('base64'),
      newBlob: (bytes, mime, name) => ({ getBytes: () => bytes, getMimeType: () => mime, getName: () => name })
    },
    DriveApp: {
      Access: { PRIVATE: 'private' },
      Permission: { NONE: 'none' },
      getFolderById: () => folder,
      getFileById: () => ({ addEditor: () => {}, removeEditor: () => {}, setTrashed: () => {} }),
      createFolder: () => ({ getId: () => 'folder-' + ++serial, setSharing: () => {}, addEditor: () => {}, removeEditor: () => {}, createFile: () => folder.createFile('x', '', 'text/plain') })
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CODE_GS, 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(SERVICE_GS, 'utf8'), sandbox);
  // Seed a realistic snapshot so member lookups (serviceSave memberId) work.
  const initial = fixture(1, 2026, 2026);
  initial.serviceApplications = [];
  initial.serviceBatches = [];
  sandbox.writeSlot_(privateBook, '0', initial);
  return { env, sandbox };
}

function snapshotState(sandbox) {
  try { return JSON.stringify(sandbox.loadState_()); } catch (e) { return 'unavailable'; }
}

test('anonymous submitServiceApplication succeeds and returns only a reference', () => {
  const { sandbox } = harness();
  const response = sandbox.serviceAnonymousSubmit_({
    action: 'submitServiceApplication',
    applicant: { name: 'Real Cadet', ic: 'SECRET-IC-42', gender: 'F', rank: 'Sergeant', joined: '2022-01-15', phone: '012', email: 'qa@example.test', occupation: 'Student' },
    declaredYear: 3,
    clientRequestId: 'svc-api-anon-0001',
    website: ''
  });
  assert.equal(response.ok, true, 'anonymous submit succeeds: ' + JSON.stringify(response));
  assert.equal(response.data.received, true);
  assert.ok(response.data.reference, 'a reference is returned');
  const text = JSON.stringify(response.data);
  assert.equal(text.includes('SECRET-IC-42'), false, 'IC is not echoed');
  assert.equal(text.includes('Real Cadet'), false, 'name is not echoed');
  assert.equal(Array.isArray(response.data.applications), false, 'no list is leaked');
});

test('retrying the same clientRequestId returns the same reference and creates no second record', () => {
  const { sandbox } = harness();
  const payload = {
    action: 'submitServiceApplication',
    applicant: { name: 'Retry Cadet', ic: 'IC-RETRY-1' },
    declaredYear: 2,
    clientRequestId: 'svc-api-retry-0001',
    website: ''
  };
  const first = sandbox.serviceAnonymousSubmit_(payload);
  const stateAfterFirst = snapshotState(sandbox);
  const second = sandbox.serviceAnonymousSubmit_(payload);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.data.reference, first.data.reference, 'idempotent retry returns the same reference');
  assert.equal(snapshotState(sandbox), stateAfterFirst, 'the retry does not create a second application');
  const list = sandbox.loadState_().serviceApplications || [];
  assert.equal(list.filter(a => a.clientRequestId === 'svc-api-retry-0001').length, 1, 'exactly one application for the request id');
});

test('Secretary (admin) can read the service list; it includes the new applications', () => {
  const { env, sandbox } = harness();
  sandbox.serviceAnonymousSubmit_({
    action: 'submitServiceApplication',
    applicant: { name: 'Visible Cadet', ic: 'IC-VIS-1' },
    declaredYear: 1,
    clientRequestId: 'svc-api-read-0001',
    website: ''
  });
  env.actor = 'secretary@gmail.com';
  const response = sandbox.rpc({ action: 'serviceList' });
  assert.equal(response.ok, true, 'Secretary can read: ' + JSON.stringify(response));
  assert.ok(response.data, 'data is returned');
  assert.ok(Array.isArray(response.data.applications), 'applications list is present');
  assert.ok(response.data.applications.length >= 1, 'the new application is visible to the Secretary');
  assert.ok(Array.isArray(response.data.batches), 'batches list is present');
  assert.equal(typeof response.data.unreadCount, 'number', 'unreadCount is a number');
});

test('Owner can read the service summary; OC, OT and Treasurer cannot read service data', () => {
  const { env, sandbox } = harness();
  env.actor = 'owner@gmail.com';
  const ownerSummary = sandbox.rpc({ action: 'serviceSummary' });
  assert.equal(ownerSummary.ok, true, 'Owner can read the summary: ' + JSON.stringify(ownerSummary));
  assert.ok(ownerSummary.data, 'summary data present');
  assert.equal(typeof ownerSummary.data.changeKey !== 'undefined' || typeof ownerSummary.data.unreadCount !== 'undefined', true, 'summary carries counts or a change key');
  for (const actor of ['oc@gmail.com', 'os@gmail.com', 'ot@gmail.com', 'treasurer@gmail.com']) {
    env.actor = actor;
    for (const action of ['serviceList', 'serviceSummary']) {
      const response = sandbox.rpc({ action });
      assert.equal(response.ok, false, action + ' must not be readable by ' + actor);
      assert.equal(response.data, undefined, action + ' must not leak data to ' + actor);
    }
  }
});

test('stranger and forged api email are never authorised for service actions', () => {
  const { env, sandbox } = harness();
  env.actor = 'stranger@gmail.com';
  for (const action of PRIVILEGED) {
    const viaRpc = sandbox.rpc({ action, application: {}, batch: {} });
    assert.equal(viaRpc.ok, false, action + ' must reject a stranger via rpc');
    assert.equal(viaRpc.data, undefined, action + ' must not leak data via rpc');
    const viaApi = sandbox.rpcForEmail_({ action, application: {} }, 'stranger@gmail.com');
    assert.equal(viaApi.ok, false, action + ' must reject a forged email via rpcForEmail_');
    assert.equal(viaApi.data, undefined, action + ' must not leak data via rpcForEmail_');
  }
});

test('unauthorised service attempts leave the saved state untouched', () => {
  const { env, sandbox } = harness();
  sandbox.serviceAnonymousSubmit_({
    action: 'submitServiceApplication',
    applicant: { name: 'Keep Me', ic: 'IC-KEEP-1' },
    declaredYear: 4,
    clientRequestId: 'svc-api-keep-0001',
    website: ''
  });
  const before = snapshotState(sandbox);
  env.actor = 'oc@gmail.com';
  sandbox.rpc({ action: 'serviceSave', application: { id: 'svc-forged', version: 1, applicant: { name: 'X', ic: '1' }, remarks: 'forged' } });
  sandbox.rpc({ action: 'serviceTransition', applicationId: 'svc-forged', version: 1, status: 'Approved' });
  sandbox.rpc({ action: 'serviceAward', applicationId: 'svc-forged', version: 1, date: '2026-01-01', certificate: 'C1' });
  env.actor = 'stranger@gmail.com';
  sandbox.rpcForEmail_({ action: 'serviceSave', application: { id: 'svc-forged', version: 2, remarks: 'stranger' } }, 'stranger@gmail.com');
  assert.equal(snapshotState(sandbox), before, 'unauthorised calls must not mutate the stored snapshot');
});

test('serviceSave without a version fails and cannot silently overwrite a record', () => {
  const { env, sandbox } = harness();
  sandbox.serviceAnonymousSubmit_({
    action: 'submitServiceApplication',
    applicant: { name: 'Versioned', ic: 'IC-VER-1' },
    declaredYear: 2,
    clientRequestId: 'svc-api-ver-0001',
    website: ''
  });
  const before = snapshotState(sandbox);
  env.actor = 'secretary@gmail.com';
  const missing = sandbox.rpc({ action: 'serviceSave', application: { id: 'svc-nope', applicant: { name: 'A', ic: '1' } } });
  assert.equal(missing.ok, false, 'a save without a matching id/version must fail');
  const apps = sandbox.loadState_().serviceApplications || [];
  const target = apps[apps.length - 1];
  const wrongVersion = sandbox.rpc({ action: 'serviceSave', application: Object.assign({}, target, { version: 999, remarks: 'stale overwrite' }) });
  assert.equal(wrongVersion.ok, false, 'a stale version must be rejected');
  assert.equal(snapshotState(sandbox), before, 'a rejected save must not change the snapshot');
});

test('Secretary edits applicant and reference through serviceSave and the change persists', () => {
  const { env, sandbox } = harness();
  sandbox.serviceAnonymousSubmit_({
    action: 'submitServiceApplication',
    applicant: { name: 'Edit Me', ic: 'IC-EDIT-1' },
    declaredYear: 1,
    clientRequestId: 'svc-api-edit-0001',
    website: ''
  });
  env.actor = 'secretary@gmail.com';
  const list = sandbox.rpc({ action: 'serviceList' });
  assert.equal(list.ok, true);
  const app = list.data.applications[list.data.applications.length - 1];
  // Use a real member id from the seeded snapshot — serviceSave validates the binding.
  const realMember = sandbox.loadState_().Members[0];
  assert.ok(realMember && realMember.id, 'fixture provides at least one member');
  const saved = sandbox.rpc({
    action: 'serviceSave',
    application: Object.assign({}, app, {
      reference: 'SVC-OFFICIAL-REF-1',
      applicant: Object.assign({}, app.applicant, { name: 'Edited Name', ic: realMember.ic || app.applicant.ic }),
      confirmedYear: 3,
      memberId: realMember.id
    })
  });
  assert.equal(saved.ok, true, 'Secretary can save: ' + JSON.stringify(saved));
  const after = sandbox.loadState_().serviceApplications.find(a => a.id === app.id);
  assert.equal(after.reference, 'SVC-OFFICIAL-REF-1', 'reference is editable');
  assert.equal(after.applicant.name, 'Edited Name', 'applicant name is editable');
  assert.equal(after.confirmedYear, 3, 'confirmedYear is editable');
  assert.equal(after.memberId, realMember.id, 'memberId binding is editable');
});

test('serviceSave with a mismatched IC is rejected until confirmIcMismatch is set', () => {
  const { env, sandbox } = harness();
  sandbox.serviceAnonymousSubmit_({
    action: 'submitServiceApplication',
    applicant: { name: 'Mismatch', ic: 'IC-TOTALLY-OTHER' },
    declaredYear: 1,
    clientRequestId: 'svc-api-icmm-0001',
    website: ''
  });
  env.actor = 'secretary@gmail.com';
  const list = sandbox.rpc({ action: 'serviceList' });
  const app = list.data.applications[list.data.applications.length - 1];
  const realMember = sandbox.loadState_().Members[0];
  const rejected = sandbox.rpc({
    action: 'serviceSave',
    application: Object.assign({}, app, { memberId: realMember.id, applicant: Object.assign({}, app.applicant, { ic: 'IC-TOTALLY-OTHER' }) })
  });
  assert.equal(rejected.ok, false, 'mismatched IC must be rejected without the flag');
  assert.match(rejected.error || '', /confirmIcMismatch/i);
  const confirmed = sandbox.rpc({
    action: 'serviceSave',
    application: Object.assign({}, app, { memberId: realMember.id, confirmIcMismatch: true, applicant: Object.assign({}, app.applicant, { ic: 'IC-TOTALLY-OTHER' }) })
  });
  assert.equal(confirmed.ok, true, 'explicit confirmIcMismatch allows the manual override: ' + JSON.stringify(confirmed));
});
