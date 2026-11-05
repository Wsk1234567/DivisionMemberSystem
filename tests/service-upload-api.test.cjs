const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const KPT = require('../src/domain.js');
const { fixture } = require('../src/demo-data.js');

function environment() {
  let serial = 0;
  const env = { actor: 'owner@gmail.com', effective: null, failWrites: false };
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
    PUBLISHED_REVISION: '1'
  }));
  const properties = {
    getProperty: key => values.has(key) ? values.get(key) : null,
    setProperty: (key, value) => values.set(key, String(value)),
    deleteProperty: key => values.delete(key),
    setProperties: data => Object.entries(data).forEach(([key, value]) => values.set(key, String(value)))
  };
  const sheet = () => {
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
          setValues(data) { if (env.failWrites) throw new Error('Interrupted write'); data.forEach((row, index) => { rows[start + index] = row.map(value => value); }); return this; },
          setValue(value) { rows[start] = [value]; return this; },
          getDisplayValues: () => Array.from({ length: count }, (_, index) => (rows[start + index] || ['']).map(String)),
          getValue: () => (rows[start] || [''])[0]
        };
      }
    };
  };
  const book = () => {
    const sheets = new Map();
    return {
      getSheetByName: name => sheets.get(name),
      insertSheet: name => { const value = sheet(); sheets.set(name, value); return value; }
    };
  };
  const privateBook = book();
  const publicBook = book();
  const files = new Map();
  function iterator(rows) { let index = 0; return { hasNext: () => index < rows.length, next: () => rows[index++] }; }
  const makeFile = (name, content, mime, folderId = 'backups') => {
    const id = 'file-' + ++serial;
    const file = {
      id, trashed: false,
      getId: () => id, getName: () => name, getMimeType: () => mime,
      getDateCreated: () => new Date(2026, 0, serial),
      getBlob: () => ({ getDataAsString: () => content, getBytes: () => Buffer.from(content || '', 'utf8') }),
      getParents: () => iterator([{ getId: () => folderId }]),
      setTrashed(value) { this.trashed = value; },
      addEditor: () => {}, removeEditor: () => {}
    };
    files.set(id, file);
    return file;
  };
  const folder = {
    createFile(nameOrBlob, content, mime) {
      env.createCalls = (env.createCalls || 0) + 1;
      if (env.failCreateAt === env.createCalls) throw new Error('Interrupted Drive upload');
      if (typeof nameOrBlob !== 'string') { content = nameOrBlob.getBytes(); mime = nameOrBlob.getMimeType(); }
      const name = typeof nameOrBlob === 'string' ? nameOrBlob : (nameOrBlob.getName && nameOrBlob.getName()) || 'file';
      return makeFile(name, content || '', mime);
    },
    getFiles: () => iterator([...files.values()].filter(file => !file.trashed)),
    addEditor: () => {}, removeEditor: () => {}
  };
  const lock = { tryLock: () => true, releaseLock: () => {} };
  const sandbox = {
    KPT, console,
    PropertiesService: { getScriptProperties: () => properties },
    Session: { getActiveUser: () => ({ getEmail: () => env.actor }), getEffectiveUser: () => ({ getEmail: () => env.effective || env.actor }) },
    LockService: { getScriptLock: () => lock },
    SpreadsheetApp: { openById(id) { return id === 'private' ? privateBook : publicBook; }, flush: () => {} },
    Utilities: {
      getUuid: () => 'uuid-' + ++serial,
      base64Decode: value => Buffer.from(String(value || ''), 'base64'),
      base64Encode: value => Buffer.from(value).toString('base64'),
      newBlob: (bytes, mime, name) => ({ getBytes: () => bytes, getMimeType: () => mime, getName: () => name }),
      computeDigest: (algo, value) => Array.from(Buffer.from(String(value))).slice(0, 8)
    },
    DriveApp: {
      Access: { PRIVATE: 'private' },
      Permission: { NONE: 'none' },
      getFolderById: () => folder,
      getFileById: id => files.get(id) || { addEditor: () => {}, removeEditor: () => {} },
      createFolder: () => {
        const id = 'folder-' + ++serial;
        return {
          getId: () => id, setSharing: () => {}, addEditor: () => {}, removeEditor: () => {},
          createFile: (nameOrBlob, content, mime) => folder.createFile(nameOrBlob, content, mime)
        };
      }
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../apps-script/admin/Code.gs'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../apps-script/admin/ServiceApplications.gs'), 'utf8'), sandbox);
  const initial = fixture(1, 2026, 2026);
  sandbox.writeSlot_(privateBook, '0', initial);
  sandbox.sync_(initial);
  return { env, sandbox, properties, privateBook, files, makeFile };
}

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]).toString('base64'); // %PDF-1

test('API: serviceUpload accepts combinedDuty/combinedSignedStripe/combinedSignedStar with PDF', () => {
  const { sandbox, env, privateBook } = environment();
  // Create application via serviceSubmit (anonymous path uses withLock_ directly)
  const state = sandbox.loadState_();
  state.serviceApplications = [];
  state.serviceBatches = [];
  const ctx = { actor: 'secretary@gmail.com', now: '2026-10-25T10:00:00Z', uuid: () => 'u' + Math.random().toString(36).slice(2, 8) };
  KPT.serviceSubmit(state, { applicant: { name: 'Test User', ic: 'IC-001' }, declaredYear: 1, clientRequestId: 'api-r1' }, ctx);
  KPT.serviceSave(state, { application: { id: state.serviceApplications[0].id, version: state.serviceApplications[0].version, memberId: 'STU-000001', confirmedYear: 1, confirmIcMismatch: true } }, ctx);
  KPT.serviceSaveBatch(state, { batch: { year: 2026, title: 'API Batch', applicationIds: [state.serviceApplications[0].id] } }, ctx);
  sandbox.writeSlot_(privateBook, '0', state);

  env.actor = 'secretary@gmail.com';
  const batchId = state.serviceBatches[0].id;
  // Upload combinedDuty
  const r1 = sandbox.rpcInternal_({
    action: 'serviceUpload',
    batchId,
    kind: 'combinedDuty',
    fileName: 'all_duty.pdf',
    mime: 'application/pdf',
    base64: PDF_MAGIC
  }, 'secretary@gmail.com');
  assert.equal(r1.ok, true, 'combinedDuty upload should succeed: ' + JSON.stringify(r1));
  // Upload combinedSignedStripe
  const r2 = sandbox.rpcInternal_({
    action: 'serviceUpload',
    batchId,
    kind: 'combinedSignedStripe',
    fileName: 'all_signed.pdf',
    mime: 'application/pdf',
    base64: PDF_MAGIC
  }, 'secretary@gmail.com');
  assert.equal(r2.ok, true, 'combinedSignedStripe upload should succeed: ' + JSON.stringify(r2));
  // Upload combinedSignedStar
  const r3 = sandbox.rpcInternal_({
    action: 'serviceUpload',
    batchId,
    kind: 'combinedSignedStar',
    fileName: 'all_star.pdf',
    mime: 'application/pdf',
    base64: PDF_MAGIC
  }, 'secretary@gmail.com');
  assert.equal(r3.ok, true, 'combinedSignedStar upload should succeed: ' + JSON.stringify(r3));
});

test('API: serviceUpload rejects combinedDuty without PDF extension', () => {
  const { sandbox, env, privateBook } = environment();
  const state = sandbox.loadState_();
  state.serviceApplications = [];
  state.serviceBatches = [];
  const ctx = { actor: 'secretary@gmail.com', now: '2026-10-25T10:00:00Z', uuid: () => 'u' + Math.random().toString(36).slice(2, 8) };
  KPT.serviceSubmit(state, { applicant: { name: 'T', ic: 'I' }, declaredYear: 1, clientRequestId: 'api-r2' }, ctx);
  KPT.serviceSaveBatch(state, { batch: { year: 2026, title: 'B', applicationIds: [state.serviceApplications[0].id] } }, ctx);
  sandbox.writeSlot_(privateBook, '0', state);
  env.actor = 'secretary@gmail.com';
  const r = sandbox.rpcInternal_({
    action: 'serviceUpload',
    batchId: state.serviceBatches[0].id,
    kind: 'combinedDuty',
    fileName: 'all_duty.txt',
    mime: 'text/plain',
    base64: PDF_MAGIC
  }, 'secretary@gmail.com');
  assert.equal(r.ok, false, 'non-PDF extension should be rejected');
  assert.match(r.error, /PDF/);
});

test('API: serviceUpload rejects combinedDuty with bad PDF magic', () => {
  const { sandbox, env, privateBook } = environment();
  const state = sandbox.loadState_();
  state.serviceApplications = [];
  state.serviceBatches = [];
  const ctx = { actor: 'secretary@gmail.com', now: '2026-10-25T10:00:00Z', uuid: () => 'u' + Math.random().toString(36).slice(2, 8) };
  KPT.serviceSubmit(state, { applicant: { name: 'T', ic: 'I' }, declaredYear: 1, clientRequestId: 'api-r3' }, ctx);
  KPT.serviceSaveBatch(state, { batch: { year: 2026, title: 'B', applicationIds: [state.serviceApplications[0].id] } }, ctx);
  sandbox.writeSlot_(privateBook, '0', state);
  env.actor = 'secretary@gmail.com';
  const r = sandbox.rpcInternal_({
    action: 'serviceUpload',
    batchId: state.serviceBatches[0].id,
    kind: 'combinedDuty',
    fileName: 'fake.pdf',
    mime: 'application/pdf',
    base64: Buffer.from('NOT_A_PDF').toString('base64')
  }, 'secretary@gmail.com');
  assert.equal(r.ok, false, 'bad PDF magic should be rejected');
  assert.match(r.error, /valid PDF/);
});

test('API: serviceUpload rejects unknown kind', () => {
  const { sandbox, env, privateBook } = environment();
  const state = sandbox.loadState_();
  state.serviceApplications = [];
  state.serviceBatches = [];
  const ctx = { actor: 'secretary@gmail.com', now: '2026-10-25T10:00:00Z', uuid: () => 'u' + Math.random().toString(36).slice(2, 8) };
  KPT.serviceSubmit(state, { applicant: { name: 'T', ic: 'I' }, declaredYear: 1, clientRequestId: 'api-r4' }, ctx);
  KPT.serviceSaveBatch(state, { batch: { year: 2026, title: 'B', applicationIds: [state.serviceApplications[0].id] } }, ctx);
  sandbox.writeSlot_(privateBook, '0', state);
  env.actor = 'secretary@gmail.com';
  const r = sandbox.rpcInternal_({
    action: 'serviceUpload',
    batchId: state.serviceBatches[0].id,
    kind: 'unknownKind',
    fileName: 'x.pdf',
    mime: 'application/pdf',
    base64: PDF_MAGIC
  }, 'secretary@gmail.com');
  assert.equal(r.ok, false);
  assert.match(r.error, /Invalid attachment kind/);
});

test('API: combined upload to individual app rejected by domain', () => {
  const { sandbox, env, privateBook } = environment();
  const state = sandbox.loadState_();
  state.serviceApplications = [];
  const ctx = { actor: 'secretary@gmail.com', now: '2026-10-25T10:00:00Z', uuid: () => 'u' + Math.random().toString(36).slice(2, 8) };
  KPT.serviceSubmit(state, { applicant: { name: 'T', ic: 'I' }, declaredYear: 1, clientRequestId: 'api-r5' }, ctx);
  sandbox.writeSlot_(privateBook, '0', state);
  env.actor = 'secretary@gmail.com';
  const r = sandbox.rpcInternal_({
    action: 'serviceUpload',
    applicationId: state.serviceApplications[0].id,
    kind: 'combinedDuty',
    fileName: 'x.pdf',
    mime: 'application/pdf',
    base64: PDF_MAGIC
  }, 'secretary@gmail.com');
  assert.equal(r.ok, false);
  assert.match(r.error, /only be uploaded to a batch/);
});

test('API: per-app duty upload to batch rejected by domain', () => {
  const { sandbox, env, privateBook } = environment();
  const state = sandbox.loadState_();
  state.serviceApplications = [];
  state.serviceBatches = [];
  const ctx = { actor: 'secretary@gmail.com', now: '2026-10-25T10:00:00Z', uuid: () => 'u' + Math.random().toString(36).slice(2, 8) };
  KPT.serviceSubmit(state, { applicant: { name: 'T', ic: 'I' }, declaredYear: 1, clientRequestId: 'api-r6' }, ctx);
  KPT.serviceSaveBatch(state, { batch: { year: 2026, title: 'B', applicationIds: [state.serviceApplications[0].id] } }, ctx);
  sandbox.writeSlot_(privateBook, '0', state);
  env.actor = 'secretary@gmail.com';
  const r = sandbox.rpcInternal_({
    action: 'serviceUpload',
    batchId: state.serviceBatches[0].id,
    kind: 'duty',
    fileName: 'x.pdf',
    mime: 'application/pdf',
    base64: PDF_MAGIC
  }, 'secretary@gmail.com');
  assert.equal(r.ok, false);
  assert.match(r.error, /individual/);
});

test('API: serviceSummary returns counts without PII', () => {
  const { sandbox, env, privateBook } = environment();
  env.actor = 'owner@gmail.com';
  const r = sandbox.rpcInternal_({ action: 'serviceSummary' }, 'owner@gmail.com');
  assert.equal(r.ok, true);
  assert.ok(typeof r.data.unreadCount === 'number');
  assert.ok(typeof r.data.ownerReviewCount === 'number');
  assert.ok(typeof r.data.changeKey === 'string');
  assert.ok(!JSON.stringify(r.data).includes('SECRET'), 'no PII in summary');
});


test('generated 4th-year attachments roll back on second Drive failure and retry safely', () => {
  const { sandbox, env, privateBook, files } = environment();
  const state = sandbox.loadState_();
  state.serviceApplications = [{
    id: 'qa-app', version: 1, status: 'Preparing', confirmedYear: 4,
    reference: '2026-G001', attachments: []
  }];
  sandbox.writeSlot_(privateBook, '0', state);
  const req = {
    action: 'serviceAttachGenerated', applicationId: 'qa-app', version: 1, signingDate: '2026-11-06',
    files: ['signedStripe', 'signedStar'].map(kind => ({ kind, fileName: kind + '.pdf', mime: 'application/pdf', base64: PDF_MAGIC }))
  };
  const rpc = request => sandbox.rpcInternal_(request, 'secretary@gmail.com');
  env.failCreateAt = 2;
  const failed = rpc(req);
  assert.match(failed.error, /Interrupted Drive upload/);
  assert.equal(sandbox.loadState_().serviceApplications[0].attachments.length, 0);
  assert.equal([...files.values()].filter(file => !file.trashed).length, 0);

  env.failCreateAt = null;
  const saved = rpc(req);
  assert.equal(saved.ok, true, saved.error);
  const attachments = saved.data.applications[0].attachments;
  assert.equal(attachments.length, 2);
  for (const attachment of attachments) {
    const downloaded = rpc({ action: 'serviceDownload', attachmentId: attachment.id });
    assert.equal(downloaded.data.base64, PDF_MAGIC);
  }
  const creates = env.createCalls;
  assert.equal(rpc(req).ok, true);
  assert.equal(env.createCalls, creates, 'same request does not create extra Drive files');
});

test('private templates expose only needed bytes to authorized staff', () => {
  const { sandbox, properties, privateBook, makeFile } = environment();
  const state = sandbox.loadState_();
  state.serviceApplications = [{ id: 'qa-app', version: 1, status: 'Preparing', confirmedYear: 1 }];
  sandbox.writeSlot_(privateBook, '0', state);
  const file = makeFile('fictional.pdf', Buffer.from(PDF_MAGIC, 'base64'), 'application/pdf');
  properties.setProperty('SERVICE_STRIPE_TEMPLATE_ID', file.id);
  const req = { action: 'serviceGetTemplates', applicationId: 'qa-app', version: 1 };
  assert.equal(sandbox.rpcInternal_(req, 'treasurer@gmail.com').ok, false);
  assert.equal(sandbox.rpcInternal_(req, 'secretary@gmail.com').data.templates.Stripe, PDF_MAGIC);
  assert.deepEqual(Object.keys(sandbox.rpcInternal_(req, 'secretary@gmail.com').data.templates), ['Stripe']);
});
