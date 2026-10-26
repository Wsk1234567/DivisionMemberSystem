const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const KPT = require('../src/domain.js');
const { fixture } = require('../src/demo-data.js');
function environment() {
  let serial = 0;
  const env = { actor: 'owner@gmail.com', effective: null, publicFailure: false, privateFailure: false, backupFailure: false, failWrites: false, actorCalls: 0 };
  const values = new Map(Object.entries({ OWNER_EMAIL: 'owner@gmail.com', ADMINS: '["secretary@gmail.com"]', ADMIN_EMAILS: '["secretary@gmail.com"]', TREASURER_EMAILS: '["treasurer@gmail.com"]', OC_EMAILS: '["oc@gmail.com"]', PRIVATE_SHEET_ID: 'private', PUBLIC_SHEET_ID: 'public', BACKUP_FOLDER_ID: 'backups', CURRENT_SLOT: '0', PUBLISHED_REVISION: '1' }));
  const properties = { getProperty: key => values.has(key) ? values.get(key) : null, setProperty: (key, value) => values.set(key, String(value)), deleteProperty: key => values.delete(key), setProperties: data => Object.entries(data).forEach(([key, value]) => values.set(key, String(value))) };
  const sheet = () => {
    let rows = [];
    return { getLastRow: () => rows.length, getMaxRows: () => 1000, insertRowsAfter: () => {}, clearContents: () => { rows = []; }, getRange(first, column, height, width) {
      let start = typeof first === 'string' ? 0 : first - 1;
      const count = height || 1;
      return { setNumberFormat() { return this; }, setValues(data) { if (env.failWrites) throw new Error('Interrupted write'); data.forEach((row, index) => { rows[start + index] = row.map(value => typeof value === 'string' && value.startsWith("'") ? value.slice(1) : value); }); return this; }, getDisplayValues: () => Array.from({ length: count }, (_, index) => (rows[start + index] || ['']).map(String)), getValue: () => (rows[start] || [''])[0] };
    } };
  };
  const book = () => { const sheets = new Map(); return { getSheetByName: name => sheets.get(name), insertSheet: name => { const value = sheet(); sheets.set(name, value); return value; } }; };
  const privateBook = book();
  const publicBook = book();
  const files = new Map();
  const makeFile = (name, content, mime, folderId = 'backups') => {
    const id = 'file-' + ++serial;
    const parents = [{ getId: () => folderId }];
    const file = { id, trashed: false, getId: () => id, getName: () => name, getMimeType: () => mime, getDateCreated: () => new Date(2026, 0, serial), getBlob: () => ({ getDataAsString: () => content }), getParents: () => iterator(parents), setTrashed(value) { this.trashed = value; }, addEditor: () => {}, removeEditor: () => {} };
    files.set(id, file); return file;
  };
  function iterator(rows) { let index = 0; return { hasNext: () => index < rows.length, next: () => rows[index++] }; }
  const folder = { createFile(name, content, mime) { if (env.backupFailure) throw new Error('Backup failure'); return makeFile(name, content, mime); }, getFiles: () => iterator([...files.values()].filter(file => !file.trashed)), addEditor: () => {}, removeEditor: () => {} };
  const lock = { tryLock: () => true, releaseLock: () => {} };
  const sandbox = {
    KPT, console,
    PropertiesService: { getScriptProperties: () => properties },
    Session: { getActiveUser: () => ({ getEmail: () => env.actor }), getEffectiveUser: () => ({ getEmail: () => env.effective || env.actor }) },
    LockService: { getScriptLock: () => lock },
    SpreadsheetApp: { openById(id) { env.actorCalls++; if (id === 'public' && env.publicFailure) throw new Error('Public permissions unavailable'); if (id === 'private' && env.privateFailure) throw new Error('Storage unavailable'); return id === 'private' ? privateBook : publicBook; }, flush: () => {} },
    Utilities: {
      DigestAlgorithm: { MD5: 'MD5', SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF-8' },
      computeDigest: (algo, value) => {
        const nodeCrypto = require('node:crypto');
        const name = String(algo) === 'SHA_256' ? 'sha256' : 'md5';
        return Array.from(nodeCrypto.createHash(name).update(String(value == null ? '' : value), 'utf8').digest());
      },
      base64EncodeWebSafe: value => Buffer.from(value || []).toString('base64url'), getUuid: () => 'uuid-' + ++serial, base64Decode: value => Buffer.from(String(value || ''), 'base64'), base64Encode: value => Buffer.from(value).toString('base64'), newBlob: (bytes, mime, name) => ({ getBytes: () => bytes, getMimeType: () => mime, getName: () => name }) },
    DriveApp: {
      Access: { PRIVATE: 'private' },
      Permission: { NONE: 'none' },
      getFolderById: () => folder,
      getFileById: id => { if (files.has(id)) return files.get(id); return { addEditor: () => {}, removeEditor: () => {} }; },
      createFolder: () => {
        const id = 'folder-' + ++serial;
        return { getId: () => id, setSharing: () => {}, addEditor: () => {}, removeEditor: () => {}, createFile: (nameOrBlob, content, mime) => makeFile(typeof nameOrBlob === 'string' ? nameOrBlob : (nameOrBlob.getName && nameOrBlob.getName()) || 'file', content || '', mime) };
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../apps-script/admin/Code.gs'), 'utf8'), sandbox);
  const initial = fixture(1, 2026, 2026);
  sandbox.writeSlot_(privateBook, '0', initial);
  sandbox.sync_(initial);
  env.actorCalls = 0;
  return { env, sandbox, properties, privateBook, publicBook, files, initial, makeFile };
}

function scopeEnvironment() {
  const setup = environment();
  let state = KPT.copy(setup.initial);
  state.Members[0].name = 'PRIVATE_MEMBER_SENTINEL';
  let serial = 0;
  const context = { actor: 'owner@gmail.com', now: '2026-10-25T00:00:00Z', uuid: () => 'scope-' + ++serial };
  const mutate = request => { state = KPT.mutate(state, Object.assign({ revision: state.revision }, request), context); };
  mutate({ action: 'createDocPackage', activityType: 'AGM', year: 2026, ocEmail: 'oc@gmail.com', osEmail: 'os@gmail.com', otEmail: 'ot@gmail.com' });
  const ownPackage = state.DocPackages.at(-1);
  mutate({ action: 'createDocPackage', activityType: 'OrientationDay', year: 2027, ocEmail: 'otheroc@gmail.com', osEmail: 'otheros@gmail.com', otEmail: 'otherot@gmail.com' });
  const otherPackage = state.DocPackages.at(-1);
  for (const [pkg, label] of [[ownPackage, 'OWN_ACTIVITY_FINANCE'], [otherPackage, 'OTHER_ACTIVITY_FINANCE']]) {
    mutate({ action: 'saveFinanceBook', book: { activityName: label, packageId: pkg.id, incomes: [{ date: '2026-10-25', description: label, amount: 10 }], expenses: [], reimbursements: [{ formSeq: 1, treasurerName: label, formDate: '2026-10-25', purpose: label, amount: 10, lines: [{ lineNo: 1, date: '2026-10-25', invoiceNo: label, particular: label, total: 10 }] }] } });
  }
  state.audit.push({ action: 'PRIVATE_MEMBER_SENTINEL' });
  state.trash = [{ records: { Members: state.Members } }];
  state.futurePrivateField = 'FUTURE_PRIVATE_SENTINEL';
  setup.sandbox.writeSlot_(setup.privateBook, '0', state);
  setup.properties.setProperty('CURRENT_SLOT', '0');
  setup.properties.setProperty('OC_EMAILS', JSON.stringify(['oc@gmail.com', 'os@gmail.com', 'ot@gmail.com']));
  setup.properties.setProperty('DOC_TEMPLATES_FOLDER_ID', 'private-template-folder');
  setup.properties.setProperty('DOC_SUBMISSIONS_FOLDER_ID', 'private-submission-folder');
  return Object.assign(setup, { fullState: state, ownPackage, otherPackage });
}

test('bootstrap returns role-scoped records including nested finance rows, never hidden state', () => {
  const { env, sandbox, ownPackage, otherPackage, fullState } = scopeEnvironment();
  for (const [email, docs, finance] of [['os@gmail.com', true, false], ['ot@gmail.com', false, true], ['oc@gmail.com', true, true]]) {
    env.actor = email;
    const response = sandbox.rpc({ action: 'bootstrap' }, email);
    assert.equal(response.ok, true, response.error);
    const data = response.data;
    assert.equal(data.state.revision, fullState.revision);
    assert.equal(data.state.Members.length, 0);
    assert.equal(data.state.Catalog.length, 0);
    assert.equal(data.state.audit.length, 0);
    assert.equal(data.state.trash.length, 0);
    assert.equal(data.state.DocPackages.some(row => row.id === otherPackage.id), false);
    assert.ok(data.state.DocPackages.some(row => row.id === ownPackage.id));
    assert.equal(data.state.DocItems.length > 0, docs);
    assert.equal(data.state.FinBooks.length, finance ? 1 : 0);
    assert.equal(data.state.FinIncomes.length, finance ? 1 : 0);
    assert.equal(data.state.FinReimbursements.length, finance ? 1 : 0);
    assert.equal(data.state.FinReimburseLines.length, finance ? 1 : 0);
    assert.doesNotMatch(JSON.stringify(data), /PRIVATE_MEMBER_SENTINEL|OTHER_ACTIVITY_FINANCE|FUTURE_PRIVATE_SENTINEL|private-template-folder|private-submission-folder/);
    assert.equal(data.admins.length + data.treasurers.length + data.ocs.length, 0);
  }
  env.actor = 'treasurer@gmail.com';
  const treasury = sandbox.rpc({ action: 'bootstrap' }).data.state;
  assert.equal(treasury.FinBooks.length, fullState.FinBooks.length);
  assert.equal(treasury.Members.length + treasury.DocItems.length, 0);
  assert.ok(treasury.DocPackages.every(pkg => !pkg.osEmail && !pkg.otEmail));
  env.actor = 'secretary@gmail.com';
  const admin = sandbox.rpc({ action: 'bootstrap' }).data.state;
  assert.equal(admin.Members[0].name, 'PRIVATE_MEMBER_SENTINEL');
  assert.equal(admin.DocItems.length, fullState.DocItems.length);
  assert.equal(admin.FinBooks.length, 0);
  assert.equal(admin.trash.length, 0);
  env.actor = 'owner@gmail.com';
  assert.equal(sandbox.rpc({ action: 'bootstrap' }).data.state.futurePrivateField, 'FUTURE_PRIVATE_SENTINEL');
});

test('save responses remain scoped without deleting hidden persisted records; retrySync cannot bypass scope', () => {
  const { env, sandbox, ownPackage, fullState } = scopeEnvironment();
  env.actor = 'os@gmail.com';
  const boot = sandbox.rpc({ action: 'bootstrap' }, env.actor);
  const itemId = boot.data.state.DocItems[0].id;
  const uploaded = sandbox.rpc({ action: 'docItemUpload', itemId, fileName: 'safe.pdf', fileBase64: 'QUJD', revision: boot.data.state.revision }, env.actor);
  assert.equal(uploaded.ok, true, uploaded.error);
  assert.doesNotMatch(JSON.stringify(uploaded), /PRIVATE_MEMBER_SENTINEL|OTHER_ACTIVITY_FINANCE|FUTURE_PRIVATE_SENTINEL/);
  assert.ok(uploaded.data.state.DocItems.every(row => row.packageId === ownPackage.id));
  const submitted = sandbox.rpc({ action: 'docItemSubmit', itemId, revision: uploaded.data.state.revision }, env.actor);
  assert.equal(submitted.ok, true, submitted.error);
  assert.equal(submitted.data.state.DocItems.find(row => row.id === itemId).status, 'AwaitingOC');
  for (const action of ['retrySync', 'backup', 'listBackups']) assert.equal(sandbox.rpc({ action }, env.actor).ok, false, action);
  env.actor = 'owner@gmail.com';
  const complete = sandbox.rpc({ action: 'bootstrap' }).data.state;
  assert.equal(complete.Members.length, fullState.Members.length);
  assert.equal(complete.FinBooks.length, fullState.FinBooks.length);
  assert.equal(complete.DocItems.length, fullState.DocItems.length);
  assert.equal(complete.Members[0].name, 'PRIVATE_MEMBER_SENTINEL');
  env.actor = 'unknown@gmail.com';
  const denied = sandbox.rpc({ action: 'bootstrap' }, 'owner@gmail.com');
  assert.equal(denied.ok, false);
  assert.equal(denied.data, undefined);
});

test('public RPC ignores a spoofed email; verified API path uses the same scoped response', () => {
  const { env, sandbox } = scopeEnvironment();
  env.actor = 'os@gmail.com';
  const spoofed = sandbox.rpc({ action: 'bootstrap' }, 'owner@gmail.com');
  assert.equal(spoofed.ok, true);
  assert.equal(spoofed.data.user.owner, false);
  assert.equal(spoofed.data.state.Members.length, 0);
  const api = sandbox.rpcForEmail_({ action: 'bootstrap' }, 'os@gmail.com');
  assert.equal(api.ok, true);
  assert.equal(api.data.state.Members.length + api.data.state.FinBooks.length, 0);
  assert.ok(api.data.state.DocItems.length);
});

test('document downloads respect reading scope and cannot override file identity', () => {
  const { env, sandbox, fullState, files } = scopeEnvironment();
  const itemId = fullState.DocItems[0].id;
  env.actor = 'os@gmail.com';
  const claimed = sandbox.rpc({ action: 'docItemUpload', itemId, fileName: 'secret.pdf', fileId: 'secret-unrelated-file', revision: fullState.revision }, env.actor);
  assert.equal(claimed.ok, false);
  assert.match(claimed.error, /caller-supplied file ID/);
  const uploaded = sandbox.rpc({ action: 'docItemUpload', itemId, fileName: 'safe.pdf', fileBase64: 'QUJD', revision: fullState.revision }, env.actor);
  assert.equal(uploaded.ok, true, uploaded.error);
  const fileId = uploaded.data.state.DocItems.find(row => row.id === itemId).fileId;
  files.get(fileId).getBlob = () => ({ getBytes: () => Buffer.from('ABC') });
  files.get(fileId).getName = () => 'safe.pdf';
  const download = sandbox.rpc({ action: 'docDownload', itemId }, env.actor);
  assert.equal(download.ok, true, download.error);
  assert.equal(download.data.contentBase64, 'QUJD');
  const forged = sandbox.rpc({ action: 'docDownload', itemId, fileId: 'secret-unrelated-file' }, env.actor);
  assert.equal(forged.ok, false);
  assert.match(forged.error, /File does not match/);
  env.actor = 'ot@gmail.com';
  const denied = sandbox.rpc({ action: 'docDownload', itemId }, env.actor);
  assert.equal(denied.ok, false);
  assert.match(denied.error, /reading scope/);
});

test('role projections union concurrent assignments and do not mutate stored state', () => {
  const { fullState, ownPackage } = scopeEnvironment();
  const state = KPT.copy(fullState);
  state.DocPackages.find(row => row.id === ownPackage.id).otEmail = 'os@gmail.com';
  const before = JSON.stringify(state);
  const projected = KPT.projectForActor(state, { email: ' OS@GMAIL.COM ' });
  assert.ok(projected.DocItems.length);
  assert.equal(projected.FinBooks.length, 1);
  projected.FinBooks[0].activityName = 'changed only in response';
  assert.equal(JSON.stringify(state), before);
  const unknown = KPT.projectForActor(state, { email: 'stranger@gmail.com' });
  assert.ok(KPT.tables.every(table => unknown[table].length === 0));
  assert.doesNotMatch(JSON.stringify(unknown), /PRIVATE_MEMBER_SENTINEL|OTHER_ACTIVITY_FINANCE|FUTURE_PRIVATE_SENTINEL/);
});

test('removing a package assignment immediately revokes record reads for a registered officer', () => {
  const { env, sandbox, ownPackage, fullState } = scopeEnvironment();
  env.actor = 'owner@gmail.com';
  const changed = sandbox.rpc({ action: 'saveDocPackageMeta', packageId: ownPackage.id, osEmail: '', ocEmail: ownPackage.ocEmail, otEmail: ownPackage.otEmail, eventDate: '', revision: fullState.revision });
  assert.equal(changed.ok, true, changed.error);
  env.actor = 'os@gmail.com';
  const result = sandbox.rpc({ action: 'bootstrap' });
  assert.equal(result.ok, true);
  assert.ok(KPT.tables.every(table => result.data.state[table].length === 0));
});
test('unknown and blank Google identities cannot read or mutate data', () => {
  for (const actor of ['stranger@gmail.com', '']) {
    const { env, sandbox } = environment(); env.actor = actor;
    for (const action of ['bootstrap', 'save', 'attendance', 'previewImport', 'commitImport', 'previewSetupDefaults', 'applySetupDefaults', 'retrySync', 'backup', 'listBackups', 'restore', 'setAdmins', 'setCurrentPhase', 'previewDelete', 'deleteRecord', 'previewDeleteAllMembers', 'deleteAllMembers', 'restoreTrash', 'purgeTrash']) {
      const response = sandbox.rpc({ action });
      assert.equal(response.ok, false, action);
    }
    assert.equal(env.actorCalls, 0);
  }
});
test('secretary can read and save but cannot authorise administrators, restore or change phase', () => {
  const { env, sandbox, initial } = environment(); env.actor = 'secretary@gmail.com';
  assert.equal(sandbox.rpc({ action: 'bootstrap' }).ok, true);
  const saved = sandbox.rpc({ action: 'save', table: 'Members', row: { ...initial.Members[0], name: 'Secretary edit' }, year: 2026, revision: 1 });
  assert.equal(saved.ok, true);
  assert.equal(saved.data.state.Members[0].name, 'Secretary edit');
  for (const action of ['restore', 'setAdmins', 'setAccess', 'installBackup', 'setCurrentPhase', 'previewDelete', 'deleteRecord', 'previewDeleteAllMembers', 'deleteAllMembers', 'restoreTrash', 'purgeTrash']) assert.match(sandbox.rpc({ action }).error, /Only the owner/);
});
test('treasurer can bootstrap and save finance but cannot edit members or list backups', () => {
  const { env, sandbox, initial } = environment(); env.actor = 'treasurer@gmail.com';
  const boot = sandbox.rpc({ action: 'bootstrap' });
  assert.equal(boot.ok, true);
  assert.equal(boot.data.user.treasurer, true);
  assert.equal(boot.data.user.admin, false);
  const finance = sandbox.rpc({
    action: 'saveFinanceBook',
    revision: boot.data.state.revision,
    book: { id: '', version: 0, activityName: 'Chess 2026', incomes: [], expenses: [], reimbursements: [] }
  });
  assert.equal(finance.ok, true);
  assert.ok(finance.data.state.FinBooks.some(row => row.activityName === 'Chess 2026'));
  const memberSave = sandbox.rpc({ action: 'save', table: 'Members', row: { ...initial.Members[0], name: 'Nope' }, year: 2026, revision: finance.data.state.revision });
  assert.equal(memberSave.ok, false);
  assert.match(memberSave.error, /Administrator access/);
  assert.equal(sandbox.rpc({ action: 'listBackups' }).ok, false);
});
test('secretary cannot open finance workspace actions', () => {
  const { env, sandbox } = environment(); env.actor = 'secretary@gmail.com';
  const boot = sandbox.rpc({ action: 'bootstrap' });
  const finance = sandbox.rpc({ action: 'saveFinanceBook', revision: boot.data.state.revision, book: { id: '', version: 0, activityName: 'Nope', incomes: [], expenses: [], reimbursements: [] } });
  assert.equal(finance.ok, false);
  assert.match(finance.error, /Treasurer access/);
});
test('stranger still cannot access the workspace', () => {
  const { env, sandbox } = environment(); env.actor = 'stranger@gmail.com';
  const response = sandbox.rpc({ action: 'bootstrap' });
  assert.equal(response.ok, false);
  assert.match(response.error, /not an administrator, officer or treasurer/i);
});
test('secretary can preview and apply recommended system setup with a safety backup', () => {
  const { env, sandbox, privateBook, files } = environment(); env.actor = 'secretary@gmail.com';
  sandbox.writeSlot_(privateBook, '0', KPT.empty());
  const preview = sandbox.rpc({ action: 'previewSetupDefaults' });
  assert.equal(preview.ok, true);
  assert.equal(preview.data.ready, false);
  const applied = sandbox.rpc({ action: 'applySetupDefaults', revision: 0 });
  assert.equal(applied.ok, true);
  assert.equal(KPT.setupPreview(applied.data.state).ready, true);
  assert.ok([...files.values()].some(file => JSON.parse(file.getBlob().getDataAsString()).reason === 'Before applying recommended system setup'));
});
test('owner can set phase 1 to 6 without changing or restoring member data', () => {
  const { sandbox, properties, initial } = environment();
  assert.equal(sandbox.rpc({ action: 'bootstrap' }).data.currentPhase, 1);
  assert.equal(sandbox.rpc({ action: 'setCurrentPhase', phase: 4 }).data.currentPhase, 4);
  assert.equal(properties.getProperty('CURRENT_PHASE'), '4');
  assert.equal(sandbox.loadState_().revision, initial.revision);
  assert.equal(sandbox.rpc({ action: 'setCurrentPhase', phase: 7 }).ok, false);
  const backup = sandbox.rpc({ action: 'backup' }).data;
  sandbox.rpc({ action: 'setCurrentPhase', phase: 5 });
  sandbox.rpc({ action: 'restore', backupId: backup.id, revision: initial.revision });
  assert.equal(sandbox.rpc({ action: 'bootstrap' }).data.currentPhase, 5);
});
test('wrong deployment identity fails closed', () => {
  const { env, sandbox } = environment(); env.actor = 'secretary@gmail.com'; env.effective = 'owner@gmail.com';
  assert.equal(sandbox.rpc({ action: 'bootstrap' }).ok, false);
});
test('OC can edit document checklist but cannot approve; treasurer cannot use documents', () => {
  const { env, sandbox } = environment();
  env.actor = 'owner@gmail.com';
  assert.equal(sandbox.rpc({ action: 'initDocFolders' }).ok, true);
  let created = sandbox.rpc({ action: 'createDocPackage', activityType: 'AGM', year: 2026, eventDate: '2026-12-06', ocEmail: 'oc@gmail.com', revision: sandbox.rpc({ action: 'bootstrap' }).data.state.revision });
  assert.equal(created.ok, true, created.error);
  const packageId = created.data.state.DocPackages[0].id;
  const itemId = created.data.state.DocItems[0].id;
  env.actor = 'oc@gmail.com';
  const boot = sandbox.rpc({ action: 'bootstrap' });
  assert.equal(boot.ok, true);
  assert.equal(boot.data.user.oc, true);
  assert.equal(boot.data.user.admin, false);
  const uploaded = sandbox.rpc({ action: 'docItemUpload', itemId, fileName: 'letter.docx', fileBase64: 'AAAA', revision: created.data.state.revision });
  assert.equal(uploaded.ok, true, uploaded.error);
  const submitted = sandbox.rpc({ action: 'docItemSubmit', itemId, revision: uploaded.data.state.revision });
  assert.equal(submitted.ok, true, submitted.error);
  const rejectedApprove = sandbox.rpc({ action: 'docItemReview', itemId, approve: true, revision: submitted.data.state.revision });
  assert.equal(rejectedApprove.ok, false);
  assert.match(rejectedApprove.error, /Only Owner or Secretary/);
  const meta = sandbox.rpc({ action: 'saveDocItemsMeta', packageId, items: [{ id: itemId, dueOffsetDays: -20 }], revision: submitted.data.state.revision });
  assert.equal(meta.ok, true, meta.error);
  assert.equal(meta.data.state.DocItems.find(row => row.id === itemId).dueOffsetDays, -20);
  env.actor = 'owner@gmail.com';
  const other = sandbox.rpc({ action: 'createDocPackage', activityType: 'AGM', year: 2027, ocEmail: 'other@gmail.com', revision: meta.data.state.revision });
  assert.equal(other.ok, true, other.error);
  const otherPackage = other.data.state.DocPackages.find(row => row.year === 2027);
  const otherItemId = other.data.state.DocItems.find(row => row.packageId === otherPackage.id).id;
  env.actor = 'oc@gmail.com';
  const denied = sandbox.rpc({ action: 'docItemUpload', itemId: otherItemId, fileName: 'nope.pdf', fileBase64: 'QUJD', revision: other.data.state.revision });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /Organizing Chairman|Documents access|not found|not assigned/);
  env.actor = 'treasurer@gmail.com';
  const treasurerDocs = sandbox.rpc({ action: 'createDocPackage', activityType: 'AGM', year: 2027, revision: other.data.state.revision });
  assert.equal(treasurerDocs.ok, false);
});
test('secretary approves submitted documents; owner inits folders and setAccess keeps OC list', () => {
  const { env, sandbox, properties } = environment();
  env.actor = 'owner@gmail.com';
  assert.equal(sandbox.rpc({ action: 'initDocFolders' }).ok, true);
  const created = sandbox.rpc({ action: 'createDocPackage', activityType: 'AGM', year: 2026, revision: sandbox.rpc({ action: 'bootstrap' }).data.state.revision });
  assert.equal(created.ok, true, created.error);
  const itemId = created.data.state.DocItems[0].id;
  const uploaded = sandbox.rpc({ action: 'docItemUpload', itemId, fileName: 'x.pdf', fileBase64: 'QUJD', revision: created.data.state.revision });
  assert.equal(uploaded.ok, true, uploaded.error);
  const submitted = sandbox.rpc({ action: 'docItemSubmit', itemId, revision: uploaded.data.state.revision });
  assert.equal(submitted.ok, true, submitted.error);
  env.actor = 'oc@gmail.com';
  const createdOc = created.data.state.DocPackages[0];
  // Owner created package without assigning OC — owner still manages OC gate.
  env.actor = 'owner@gmail.com';
  const checked = sandbox.rpc({ action: 'docItemCheck', itemId, approve: true, revision: submitted.data.state.revision });
  assert.equal(checked.ok, true, checked.error);
  const forwarded = sandbox.rpc({ action: 'docItemForward', itemId, revision: checked.data.state.revision });
  assert.equal(forwarded.ok, true, forwarded.error);
  const approved = sandbox.rpc({ action: 'docItemReview', itemId, approve: true, revision: forwarded.data.state.revision });
  assert.equal(approved.ok, true, approved.error);
  assert.equal(approved.data.state.DocItems.find(row => row.id === itemId).status, 'Approved');
  env.actor = 'owner@gmail.com';
  const access = sandbox.rpc({ action: 'setAccess', admins: ['secretary@gmail.com'], treasurers: ['treasurer@gmail.com'], ocs: ['oc@gmail.com'] });
  assert.equal(access.ok, true, access.error);
  assert.equal(JSON.stringify(access.data.ocs), JSON.stringify(['oc@gmail.com']));
  assert.equal(properties.getProperty('OC_EMAILS'), '["oc@gmail.com"]');
  assert.ok(properties.getProperty('DOC_TEMPLATES_FOLDER_ID'));
});

test('admin doGet points to GitHub admin UI and does not require Admin.html', () => {
  const { env, sandbox } = environment();
  let fileReads = 0;
  sandbox.HtmlService = {
    createHtmlOutputFromFile(name) { fileReads++; return { setTitle() { return this; }, addMetaTag() { return this; }, name }; },
    createHtmlOutput: text => ({ text }),
    createTemplateFromFile() { throw new Error('Bundled XML literals must not become scriptlets'); }
  };
  const page = sandbox.doGet({ parameter: {} });
  assert.match(String(page.text || ''), /admin\.html/);
  assert.equal(fileReads, 0);
  env.actor = 'stranger@gmail.com';
  assert.match(String(sandbox.doGet({ parameter: {} }).text || ''), /Sign in with Google|Sign in with your Google account|Access unavailable|TCCD/);
  assert.equal(fileReads, 0);
});
test('sync failure leaves private save intact and can be retried', () => {
  const { env, sandbox, initial, properties } = environment(); env.publicFailure = true;
  const response = sandbox.rpc({ action: 'save', table: 'Members', row: { ...initial.Members[0], name: 'Saved privately' }, year: 2026, revision: 1 });
  assert.equal(response.ok, true);
  assert.equal(response.data.sync.ok, false);
  assert.equal(sandbox.loadState_().Members[0].name, 'Saved privately');
  assert.equal(properties.getProperty('SYNC_PENDING'), '2');
  env.publicFailure = false;
  assert.equal(sandbox.rpc({ action: 'retrySync' }).data.sync.ok, true);
  assert.equal(properties.getProperty('SYNC_PENDING'), null);
});
test('an interrupted inactive-slot write does not switch away from saved data', () => {
  const { env, sandbox, initial, properties } = environment();
  env.failWrites = true;
  assert.equal(sandbox.rpc({ action: 'save', table: 'Members', row: { ...initial.Members[0], name: 'Interrupted edit' }, year: 2026, revision: 1 }).ok, false);
  assert.equal(properties.getProperty('CURRENT_SLOT'), '0');
  assert.equal(sandbox.loadState_().Members[0].name, initial.Members[0].name);
});
test('Unicode and formula-looking chunk content round trip as encoded text', () => {
  const { sandbox, privateBook } = environment();
  const value = { text: '汉字🙂'.repeat(9000) + '=IMPORTXML("https://example.com")' };
  sandbox.writeSlot_(privateBook, '1', value);
  assert.equal(sandbox.readSlot_(privateBook, '1').text, value.text);
});
test('daily backup runs as owner trigger without active-user email and retains 30', () => {
  const { env, sandbox, initial, files } = environment();
  for (let index = 0; index < 35; index++) sandbox.backup_(initial, 'Daily');
  env.actor = ''; env.effective = 'owner@gmail.com';
  sandbox.dailyBackup_();
  assert.equal([...files.values()].filter(file => !file.trashed).length, 30);
});
test('import backup failure prevents changes; successful import creates safety backup', () => {
  const { env, sandbox, initial, files } = environment();
  const workbook = { Members: [{ ...initial.Members[0], name: 'Imported edit' }] };
  env.backupFailure = true;
  assert.equal(sandbox.rpc({ action: 'commitImport', workbook, revision: 1 }).ok, false);
  assert.equal(sandbox.loadState_().revision, 1);
  env.backupFailure = false;
  assert.equal(sandbox.rpc({ action: 'commitImport', workbook, revision: 1 }).ok, true);
  assert.equal(files.size, 1);
  assert.equal(JSON.parse([...files.values()][0].getBlob().getDataAsString()).state.revision, 1);
});
test('owner deletion creates backup, syncs public data and can restore from Recycle Bin', () => {
  const { sandbox, initial, files } = environment();
  const member = initial.Members[0];
  const preview = sandbox.rpc({ action: 'previewDelete', table: 'Members', id: member.id });
  assert.equal(preview.ok, true);
  assert.ok(preview.data.counts.Attendance > 0);
  const deleted = sandbox.rpc({ action: 'deleteRecord', table: 'Members', id: member.id, revision: initial.revision });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.data.state.Members.length, 0);
  assert.equal(files.size, 1);
  const trashId = deleted.data.state.trash[0].id;
  const restored = sandbox.rpc({ action: 'restoreTrash', trashId, revision: deleted.data.state.revision });
  assert.equal(restored.ok, true);
  assert.equal(restored.data.state.Members[0].id, member.id);
  assert.equal(files.size, 2);
});
test('owner can move every student to one Recycle Bin item and restore them', () => {
  const { sandbox, initial, files } = environment();
  const preview = sandbox.rpc({ action: 'previewDeleteAllMembers' });
  assert.equal(preview.ok, true);
  assert.equal(preview.data.counts.Members, initial.Members.length);
  const deleted = sandbox.rpc({ action: 'deleteAllMembers', revision: initial.revision });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.data.state.Members.length, 0);
  assert.equal(deleted.data.state.trash.length, 1);
  assert.equal(files.size, 1);
  const restored = sandbox.rpc({ action: 'restoreTrash', trashId: deleted.data.state.trash[0].id, revision: deleted.data.state.revision });
  assert.equal(restored.ok, true);
  assert.equal(restored.data.state.Members.length, initial.Members.length);
});
test('restore creates a safety backup, increases revision and rejects stale import', () => {
  const { sandbox, initial, files } = environment();
  const backup = sandbox.rpc({ action: 'backup' }).data;
  sandbox.rpc({ action: 'save', table: 'Members', row: { ...initial.Members[0], name: 'Later version' }, year: 2026, revision: 1 });
  const response = sandbox.rpc({ action: 'restore', backupId: backup.id, revision: 2 });
  assert.equal(response.ok, true);
  assert.equal(response.data.state.revision, 3);
  assert.equal(response.data.state.Members[0].name, initial.Members[0].name);
  assert.ok(response.data.state.Members[0].version > 2);
  assert.equal(files.size, 2);
  assert.equal(sandbox.rpc({ action: 'commitImport', workbook: { Members: [initial.Members[0]] }, revision: 3 }).ok, false);
});
test('public service applies a second allowlist and rejects executable callback names', () => {
  const { publicBook } = environment();
  const slot = publicBook.getSheetByName('Manifest').getRange('A1').getValue();
  publicBook.getSheetByName('Store' + slot).getRange(1, 1, 1, 1).setValues([['KPT:' + JSON.stringify({ schema: 1, revision: 1, updatedAt: '', members: [{ name: 'Student', sjamId: '001', status: 'Active', ic: 'DO_NOT_LEAK', awards: [{ name: 'Award', date: '2026-01-01', category: 'Probadge', level: 'Cadet', notes: 'DO_NOT_LEAK' }] }] })]]);
  const sandbox = { PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'public' }) }, Sheets: { Spreadsheets: { Values: { get(id, range) { assert.equal(id, 'public'); const [name, cells] = range.split('!'); const sheet = publicBook.getSheetByName(name); return { values: cells === 'A1:B1' ? sheet.getRange('A1:B1').getDisplayValues() : sheet.getRange(1, 1, sheet.getLastRow(), 1).getDisplayValues() }; } } } }, ContentService: { MimeType: { JSON: 'json', JAVASCRIPT: 'js' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../apps-script/public/Code.gs'), 'utf8'), sandbox);
  assert.equal(JSON.parse(sandbox.doGet({ parameter: {} }).text).ok, true);
  assert.equal(sandbox.doGet({ parameter: { callback: 'kpt_test' } }).text.includes('DO_NOT_LEAK'), false);
  assert.match(sandbox.doGet({ parameter: { callback: 'alert(1)//' } }).text, /Invalid callback/);
});

test('docItemUpload rejects packageId that does not match the item package', () => {
  const { env, sandbox } = environment();
  env.actor = 'owner@gmail.com';
  assert.equal(sandbox.rpc({ action: 'initDocFolders' }).ok, true);
  let revision = sandbox.rpc({ action: 'bootstrap' }).data.state.revision;
  const created26 = sandbox.rpc({ action: 'createDocPackage', activityType: 'AGM', year: 2026, eventDate: '2026-12-06', ocEmail: 'oc@gmail.com', osEmail: 'os@gmail.com', otEmail: 'ot@gmail.com', revision });
  assert.equal(created26.ok, true, created26.error);
  revision = created26.data.state.revision;
  const created27 = sandbox.rpc({ action: 'createDocPackage', activityType: 'AGM', year: 2027, eventDate: '2027-12-05', ocEmail: 'oc2@gmail.com', osEmail: 'os2@gmail.com', otEmail: 'ot2@gmail.com', revision });
  assert.equal(created27.ok, true, created27.error);
  revision = created27.data.state.revision;
  const pkg26 = created27.data.state.DocPackages.find(row => row.year === 2026);
  const pkg27 = created27.data.state.DocPackages.find(row => row.year === 2027);
  const item26 = created27.data.state.DocItems.find(row => row.packageId === pkg26.id);
  const item27 = created27.data.state.DocItems.find(row => row.packageId === pkg27.id);
  env.actor = 'os@gmail.com';
  const forged = sandbox.rpc({ action: 'docItemUpload', itemId: item27.id, packageId: pkg26.id, fileName: 'x.pdf', fileBase64: 'QUJD', revision });
  assert.equal(forged.ok, false, 'must reject packageId/itemId mismatch');
  assert.match(forged.error, /Package does not match|not assigned|cannot perform/);
  const okUpload = sandbox.rpc({ action: 'docItemUpload', itemId: item26.id, packageId: pkg26.id, fileName: 'letter.pdf', fileBase64: 'QUJD', revision });
  assert.equal(okUpload.ok, true, okUpload.error);
});
test('OS and OT cannot cross into the other package role or the other workflow', () => {
  const { env, sandbox } = environment();
  env.actor = 'owner@gmail.com';
  assert.equal(sandbox.rpc({ action: 'initDocFolders' }).ok, true);
  let revision = sandbox.rpc({ action: 'bootstrap' }).data.state.revision;
  const created = sandbox.rpc({ action: 'createDocPackage', activityType: 'AGM', year: 2026, ocEmail: 'oc@gmail.com', osEmail: 'os@gmail.com', otEmail: 'ot@gmail.com', revision });
  assert.equal(created.ok, true, created.error);
  revision = created.data.state.revision;
  const state = created.data.state;
  const pkg = state.DocPackages[0];
  const item = state.DocItems[0];
  env.actor = 'ot@gmail.com';
  const otUpload = sandbox.rpc({ action: 'docItemUpload', itemId: item.id, fileName: 'nope.pdf', fileBase64: 'QUJD', revision });
  assert.equal(otUpload.ok, false);
  assert.match(otUpload.error, /cannot perform|not assigned|OT/);
  env.actor = 'os@gmail.com';
  const book = sandbox.rpc({ action: 'saveFinanceBook', revision, book: { id: '', version: 0, activityName: 'AGM 2026', packageId: pkg.id, incomes: [], expenses: [], reimbursements: [] } });
  assert.equal(book.ok, false);
  assert.match(book.error, /Treasurer|OT/);
});
test('package OT cannot self-review or self-forward finance; OC checks then OT package book goes to Treasurer', () => {
  const { env, sandbox } = environment();
  env.actor = 'owner@gmail.com';
  assert.equal(sandbox.rpc({ action: 'initDocFolders' }).ok, true);
  let revision = sandbox.rpc({ action: 'bootstrap' }).data.state.revision;
  const created = sandbox.rpc({ action: 'createDocPackage', activityType: 'AGM', year: 2026, ocEmail: 'oc@gmail.com', osEmail: 'os@gmail.com', otEmail: 'ot@gmail.com', revision });
  revision = created.data.state.revision;
  const pkg = created.data.state.DocPackages[0];
  env.actor = 'ot@gmail.com';
  const saved = sandbox.rpc({ action: 'saveFinanceBook', revision, book: { id: '', version: 0, activityName: 'AGM 2026 finance', packageId: pkg.id, incomes: [], expenses: [], reimbursements: [] } });
  assert.equal(saved.ok, true, saved.error);
  revision = saved.data.state.revision;
  const savedBook = saved.data.state.FinBooks.find(row => row.activityName === 'AGM 2026 finance');
  assert.ok(savedBook, 'created finance book');
  assert.equal(savedBook.packageId, pkg.id);
  const bookId = savedBook.id;
  const submitted = sandbox.rpc({ action: 'submitFinBook', bookId, revision });
  assert.equal(submitted.ok, true, submitted.error);
  revision = submitted.data.state.revision;
  const selfCheck = sandbox.rpc({ action: 'checkFinBook', bookId, approve: true, revision });
  assert.equal(selfCheck.ok, false);
  assert.match(selfCheck.error, /OC/);
  const selfForward = sandbox.rpc({ action: 'forwardFinBook', bookId, revision });
  assert.equal(selfForward.ok, false);
  const selfReview = sandbox.rpc({ action: 'reviewFinBook', bookId, approve: true, revision });
  assert.equal(selfReview.ok, false);
  assert.match(selfReview.error, /Treasurer/);
  env.actor = 'oc@gmail.com';
  const checked = sandbox.rpc({ action: 'checkFinBook', bookId, approve: true, revision });
  assert.equal(checked.ok, true, checked.error);
  revision = checked.data.state.revision;
  assert.equal(checked.data.state.FinBooks.find(row => row.id === bookId).status, 'OCChecked');
  env.actor = 'ot@gmail.com';
  const otForward = sandbox.rpc({ action: 'forwardFinBook', bookId, revision });
  assert.equal(otForward.ok, false);
  env.actor = 'oc@gmail.com';
  const forwarded = sandbox.rpc({ action: 'forwardFinBook', bookId, revision });
  assert.equal(forwarded.ok, true, forwarded.error);
  revision = forwarded.data.state.revision;
  assert.equal(forwarded.data.state.FinBooks.find(row => row.id === bookId).status, 'Submitted');
  env.actor = 'treasurer@gmail.com';
  const approved = sandbox.rpc({ action: 'reviewFinBook', bookId, approve: true, revision });
  assert.equal(approved.ok, true, approved.error);
  assert.equal(approved.data.state.FinBooks.find(row => row.id === bookId).status, 'Approved');
});
test('forged packageId cannot retarget an existing finance book', () => {
  const { env, sandbox } = environment();
  env.actor = 'owner@gmail.com';
  assert.equal(sandbox.rpc({ action: 'initDocFolders' }).ok, true);
  let revision = sandbox.rpc({ action: 'bootstrap' }).data.state.revision;
  const created = sandbox.rpc({ action: 'createDocPackage', activityType: 'AGM', year: 2026, ocEmail: 'oc@gmail.com', osEmail: 'os@gmail.com', otEmail: 'ot@gmail.com', revision });
  revision = created.data.state.revision;
  const created2 = sandbox.rpc({ action: 'createDocPackage', activityType: 'OrientationDay', year: 2026, ocEmail: 'oc2@gmail.com', osEmail: 'os2@gmail.com', otEmail: 'ot2@gmail.com', revision });
  revision = created2.data.state.revision;
  const pkgA = created2.data.state.DocPackages.find(row => row.activityType === 'AGM');
  const pkgB = created2.data.state.DocPackages.find(row => row.activityType === 'OrientationDay');
  env.actor = 'ot@gmail.com';
  const saved = sandbox.rpc({ action: 'saveFinanceBook', revision, book: { id: '', version: 0, activityName: 'AGM finance', packageId: pkgA.id, incomes: [], expenses: [], reimbursements: [] } });
  assert.equal(saved.ok, true, saved.error);
  revision = saved.data.state.revision;
  const bookId = (saved.data.state.FinBooks.find(row => row.activityName === (row.activityName || '')) || saved.data.state.FinBooks[saved.data.state.FinBooks.length - 1]).id;
  env.actor = 'ot2@gmail.com';
  const hijack = sandbox.rpc({ action: 'submitFinBook', bookId, packageId: pkgB.id, revision });
  assert.equal(hijack.ok, false);
  assert.match(hijack.error, /another activity package|not assigned|OT/);
  env.actor = 'ot@gmail.com';
  const reopenClaim = sandbox.rpc({ action: 'saveFinanceBook', revision, book: { id: bookId, version: 1, activityName: 'AGM finance', packageId: pkgB.id, incomes: [], expenses: [], reimbursements: [] } });
  assert.equal(reopenClaim.ok, false);
  assert.match(reopenClaim.error, /another activity package/);
});
test('unlinked legacy finance books cannot be claimed by package OT', () => {
  const { env, sandbox, initial } = environment();
  env.actor = 'owner@gmail.com';
  assert.equal(sandbox.rpc({ action: 'initDocFolders' }).ok, true);
  let revision = sandbox.rpc({ action: 'bootstrap' }).data.state.revision;
  const created = sandbox.rpc({ action: 'createDocPackage', activityType: 'AGM', year: 2026, ocEmail: 'oc@gmail.com', osEmail: 'os@gmail.com', otEmail: 'ot@gmail.com', revision });
  revision = created.data.state.revision;
  const saved = sandbox.rpc({ action: 'saveFinanceBook', revision, book: { id: '', version: 0, activityName: 'Legacy book', incomes: [], expenses: [], reimbursements: [] } });
  assert.equal(saved.ok, true, saved.error);
  revision = saved.data.state.revision;
  const bookId = (saved.data.state.FinBooks.find(row => row.activityName === (row.activityName || '')) || saved.data.state.FinBooks[saved.data.state.FinBooks.length - 1]).id;
  env.actor = 'ot@gmail.com';
  const claim = sandbox.rpc({ action: 'submitFinBook', bookId, revision });
  assert.equal(claim.ok, false);
  assert.match(claim.error, /Treasurer/);
  const retarget = sandbox.rpc({ action: 'saveFinanceBook', revision, book: { id: bookId, version: 1, activityName: 'Legacy book', packageId: created.data.state.DocPackages[0].id, incomes: [], expenses: [], reimbursements: [] } });
  assert.equal(retarget.ok, false);
});
test('two-tier document flow: OS submit, OC check+forward, Owner final approve', () => {
  const { env, sandbox } = environment();
  env.actor = 'owner@gmail.com';
  assert.equal(sandbox.rpc({ action: 'initDocFolders' }).ok, true);
  let revision = sandbox.rpc({ action: 'bootstrap' }).data.state.revision;
  const created = sandbox.rpc({ action: 'createDocPackage', activityType: 'AGM', year: 2026, ocEmail: 'oc@gmail.com', osEmail: 'os@gmail.com', otEmail: 'ot@gmail.com', revision });
  revision = created.data.state.revision;
  const itemId = created.data.state.DocItems[0].id;
  env.actor = 'os@gmail.com';
  const uploaded = sandbox.rpc({ action: 'docItemUpload', itemId, fileName: 'x.pdf', fileBase64: 'QUJD', revision });
  assert.equal(uploaded.ok, true, uploaded.error);
  revision = uploaded.data.state.revision;
  const submitted = sandbox.rpc({ action: 'docItemSubmit', itemId, revision });
  assert.equal(submitted.ok, true, submitted.error);
  revision = submitted.data.state.revision;
  assert.equal(submitted.data.state.DocItems[0].status, 'AwaitingOC');
  const early = sandbox.rpc({ action: 'docItemReview', itemId, approve: true, revision });
  assert.equal(early.ok, false);
  assert.match(early.error, /Only Owner or Secretary|forwarded/);
  env.actor = 'oc@gmail.com';
  const badCheck = sandbox.rpc({ action: 'docItemCheck', itemId, approve: false, revision });
  assert.equal(badCheck.ok, false);
  assert.match(badCheck.error, /reason/);
  const returned = sandbox.rpc({ action: 'docItemCheck', itemId, approve: false, remarks: 'Fix date', revision });
  assert.equal(returned.ok, true, returned.error);
  revision = returned.data.state.revision;
  assert.equal(returned.data.state.DocItems[0].status, 'Rejected');
  assert.equal(returned.data.state.DocItems[0].rejectStage, 'OC');
  env.actor = 'os@gmail.com';
  const resubmit = sandbox.rpc({ action: 'docItemSubmit', itemId, revision });
  assert.equal(resubmit.ok, true, resubmit.error);
  revision = resubmit.data.state.revision;
  env.actor = 'oc@gmail.com';
  const checked = sandbox.rpc({ action: 'docItemCheck', itemId, approve: true, revision });
  assert.equal(checked.ok, true, checked.error);
  revision = checked.data.state.revision;
  assert.equal(checked.data.state.DocItems[0].status, 'OCChecked');
  const cannotDirect = sandbox.rpc({ action: 'docItemReview', itemId, approve: true, revision });
  assert.equal(cannotDirect.ok, false);
  const forwarded = sandbox.rpc({ action: 'docItemForward', itemId, revision });
  assert.equal(forwarded.ok, true, forwarded.error);
  revision = forwarded.data.state.revision;
  assert.equal(forwarded.data.state.DocItems[0].status, 'Submitted');
  env.actor = 'owner@gmail.com';
  const approved = sandbox.rpc({ action: 'docItemReview', itemId, approve: true, revision });
  assert.equal(approved.ok, true, approved.error);
  assert.equal(approved.data.state.DocItems[0].status, 'Approved');
});
