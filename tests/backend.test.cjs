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
    Utilities: { getUuid: () => 'uuid-' + ++serial, base64Decode: value => Buffer.from(String(value || ''), 'base64'), base64Encode: value => Buffer.from(value).toString('base64'), newBlob: (bytes, mime, name) => ({ getBytes: () => bytes, getMimeType: () => mime, getName: () => name }) },
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
  const approved = sandbox.rpc({ action: 'docItemReview', itemId, approve: true, revision: submitted.data.state.revision });
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
