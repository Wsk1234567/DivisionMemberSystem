const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const KPT = require('../src/domain.js');
const { fixture } = require('../src/demo-data.js');
function environment() {
  let serial = 0;
  const env = { actor: 'owner@gmail.com', effective: null, publicFailure: false, privateFailure: false, backupFailure: false, failWrites: false, actorCalls: 0 };
  const values = new Map(Object.entries({ OWNER_EMAIL: 'owner@gmail.com', ADMINS: '["secretary@gmail.com"]', PRIVATE_SHEET_ID: 'private', PUBLIC_SHEET_ID: 'public', BACKUP_FOLDER_ID: 'backups', CURRENT_SLOT: '0', PUBLISHED_REVISION: '1' }));
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
    Utilities: { getUuid: () => 'uuid-' + ++serial },
    DriveApp: { getFolderById: () => folder, getFileById: id => { if (files.has(id)) return files.get(id); return { addEditor: () => {}, removeEditor: () => {} }; } }
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
    for (const action of ['bootstrap', 'save', 'attendance', 'previewImport', 'commitImport', 'retrySync', 'backup', 'listBackups', 'restore', 'setAdmins']) {
      const response = sandbox.rpc({ action });
      assert.equal(response.ok, false, action);
    }
    assert.equal(env.actorCalls, 0);
  }
});
test('secretary can read and save but cannot authorise administrators or restore', () => {
  const { env, sandbox, initial } = environment(); env.actor = 'secretary@gmail.com';
  assert.equal(sandbox.rpc({ action: 'bootstrap' }).ok, true);
  const saved = sandbox.rpc({ action: 'save', table: 'Members', row: { ...initial.Members[0], name: 'Secretary edit' }, year: 2026, revision: 1 });
  assert.equal(saved.ok, true);
  assert.equal(saved.data.state.Members[0].name, 'Secretary edit');
  for (const action of ['restore', 'setAdmins', 'installBackup']) assert.match(sandbox.rpc({ action }).error, /Only the owner/);
});
test('wrong deployment identity fails closed', () => {
  const { env, sandbox } = environment(); env.actor = 'secretary@gmail.com'; env.effective = 'owner@gmail.com';
  assert.equal(sandbox.rpc({ action: 'bootstrap' }).ok, false);
});

test('admin serves bundled HTML literally after identity checks', () => {
  const { env, sandbox } = environment();
  let fileReads = 0;
  const output = { setTitle() { return this; }, addMetaTag() { return this; } };
  sandbox.HtmlService = {
    createHtmlOutputFromFile(name) { assert.equal(name, 'Admin'); fileReads++; return output; },
    createHtmlOutput: text => ({ text }),
    createTemplateFromFile() { throw new Error('Bundled XML literals must not become scriptlets'); }
  };
  assert.equal(sandbox.doGet(), output);
  env.actor = 'stranger@gmail.com';
  assert.match(sandbox.doGet().text, /Access unavailable/);
  assert.equal(fileReads, 1);
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
