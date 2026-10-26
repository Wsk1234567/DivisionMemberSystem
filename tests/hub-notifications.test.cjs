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
          setValues(data) {
            if (env.failWrites) throw new Error('Interrupted write');
            data.forEach((row, index) => { rows[start + index] = row.map(value => value); });
            return this;
          },
          setValue(value) {
            if (env.failWrites) throw new Error('Interrupted write');
            const row = rows[start] || [];
            row[0] = value;
            rows[start] = row;
            return this;
          },
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
      const name = typeof nameOrBlob === 'string' ? nameOrBlob : (nameOrBlob.getName && nameOrBlob.getName()) || 'file';
      const body = typeof nameOrBlob === 'string' ? (content || '') : String.fromCharCode.apply(null, (nameOrBlob.getBytes && nameOrBlob.getBytes()) || []);
      return makeFile(name, body, mime);
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
    SpreadsheetApp: {
      openById(id) {
        if (id === 'private') return privateBook;
        return publicBook;
      },
      flush: () => {}
    },
    Utilities: {
      DigestAlgorithm: { MD5: 'MD5', SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF-8' },
      computeDigest: (algo, value) => {
        const nodeCrypto = require('node:crypto');
        const name = String(algo) === 'SHA_256' ? 'sha256' : 'md5';
        return Array.from(nodeCrypto.createHash(name).update(String(value == null ? '' : value), 'utf8').digest());
      },
      base64EncodeWebSafe: value => Buffer.from(value || []).toString('base64url'),
      getUuid: () => 'uuid-' + ++serial,
      base64Decode: value => Buffer.from(String(value || ''), 'base64'),
      base64Encode: value => Buffer.from(value).toString('base64'),
      newBlob: (bytes, mime, name) => ({ getBytes: () => bytes, getMimeType: () => mime, getName: () => name })
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
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../apps-script/admin/Code.gs'), 'utf8'), sandbox);
  const initial = fixture(1, 2026, 2026);
  sandbox.writeSlot_(privateBook, '0', initial);
  sandbox.sync_(initial);
  return { env, sandbox, properties, privateBook, files, folder };
}

function hubState(sandbox, privateBook, properties) {
  let state = KPT.copy(sandbox.loadState_());
  let serial = 0;
  const context = { actor: 'owner@gmail.com', now: '2026-10-25T10:00:00Z', uuid: () => 'hub-' + ++serial };
  const mutate = request => {
    state = KPT.mutate(state, Object.assign({ revision: state.revision }, request), context);
  };
  mutate({ action: 'createDocPackage', activityType: 'AGM', year: 2026, ocEmail: 'oc@gmail.com', osEmail: 'os@gmail.com', otEmail: 'ot@gmail.com' });
  const pkg = state.DocPackages.at(-1);
  mutate({ action: 'saveFinanceBook', book: { activityName: 'Fair', packageId: pkg.id, incomes: [{ date: '2026-10-25', description: 'Sales', amount: 10 }], expenses: [], reimbursements: [] } });
  const book = state.FinBooks.at(-1);
  const item = state.DocItems.find(row => row.packageId === pkg.id && row.role === 'os') || state.DocItems.find(row => row.packageId === pkg.id);
  state.notificationEvents = [];
  state.finAttachments = [];
  sandbox.writeSlot_(privateBook, '0', state);
  properties.setProperty('OC_EMAILS', JSON.stringify(['oc@gmail.com', 'os@gmail.com', 'ot@gmail.com']));
  return { state, pkg, book, item, context };
}

test('getHubNotifications returns frozen feed shape and does not create HubNotificationReads on read', () => {
  const { env, sandbox, privateBook, properties } = environment();
  const { state, pkg, item } = hubState(sandbox, privateBook, properties);
  const before = KPT.copy(state);
  const after = KPT.copy(state);
  after.DocItems.find(row => row.id === item.id).version = 2;
  KPT.appendHubEvents(before, after, { action: 'docItemUpload', itemId: item.id }, 'os@gmail.com', { owner: 'owner@gmail.com', admins: [], treasurers: [] }, { now: '2026-10-25T10:00:00Z', uuid: () => 'e1' });
  sandbox.writeSlot_(privateBook, '0', after);
  env.actor = 'os@gmail.com';
  const response = sandbox.rpc({ action: 'getHubNotifications' }, 'os@gmail.com');
  assert.equal(response.ok, true, response.error);
  const data = response.data;
  assert.ok(Array.isArray(data.notifications));
  assert.equal(typeof data.unreadCount, 'number');
  assert.equal(typeof data.activityUnread, 'object');
  assert.equal(typeof data.studioUnread, 'object');
  assert.ok(Object.isFrozen(data));
  const sheet = privateBook.getSheetByName('HubNotificationReads');
  assert.equal(sheet, undefined, 'GET must not create the reads sheet');
  const entry = data.notifications.find(n => n.recipientEmail === undefined && n.entityId === item.id) || data.notifications[0];
  assert.ok(entry.id && entry.kind && entry.entityId && entry.destination && entry.role);
  assert.equal(entry.kind, 'DraftSaved');
  assert.equal(entry.destination, 'hall');
});

test('saveFinanceBook new book fires DraftSaved to OT hall and OC studio; identical re-save does not refresh', () => {
  const { sandbox, privateBook, properties } = environment();
  const { state, pkg } = hubState(sandbox, privateBook, properties);
  const before = KPT.copy(state);
  const after = KPT.copy(state);
  const newBook = { id: 'FIN-NEW', version: 1, activityName: 'New', packageId: pkg.id, status: 'Draft', remarks: '', rejectStage: '', submittedBy: '', submittedAt: '', checkedBy: '', checkedAt: '', forwardedBy: '', forwardedAt: '', reviewedBy: '', reviewedAt: '' };
  after.FinBooks.push(newBook);
  after.FinIncomes.push({ id: 'INC-N', version: 1, bookId: 'FIN-NEW', date: '2026-10-25', description: 'S', amount: 5 });
  KPT.appendHubEvents(before, after, { action: 'saveFinanceBook', book: { activityName: 'New', packageId: pkg.id, incomes: [{ date: '2026-10-25', description: 'S', amount: 5 }], expenses: [], reimbursements: [] } }, 'ot@gmail.com', { owner: 'owner@gmail.com', admins: [], treasurers: [] }, { now: '2026-10-25T10:00:00Z', uuid: () => 'e2' });
  const drafts = after.notificationEvents.filter(e => e.kind === 'DraftSaved' && e.entityId === 'FIN-NEW');
  assert.ok(drafts.some(e => e.recipientEmail === 'ot@gmail.com' && e.destination === 'hall'));
  assert.ok(drafts.some(e => e.recipientEmail === 'oc@gmail.com' && e.destination === 'studio'));
  const sameBefore = KPT.copy(after);
  const sameAfter = KPT.copy(after);
  sameAfter.FinBooks.find(r => r.id === 'FIN-NEW').version = 2;
  const countBefore = sameAfter.notificationEvents.length;
  KPT.appendHubEvents(sameBefore, sameAfter, { action: 'saveFinanceBook', book: { id: 'FIN-NEW', activityName: 'New', packageId: pkg.id, incomes: [{ date: '2026-10-25', description: 'S', amount: 5 }], expenses: [], reimbursements: [] } }, 'ot@gmail.com', { owner: 'owner@gmail.com', admins: [], treasurers: [] }, { now: '2026-10-25T11:00:00Z', uuid: () => 'e3' });
  assert.equal(sameAfter.notificationEvents.filter(e => e.entityId === 'FIN-NEW').length, countBefore - 0, 'no-change must not add events');
  const finEvents = sameAfter.notificationEvents.filter(e => e.entityId === 'FIN-NEW');
  assert.ok(finEvents.every(e => e.createdAt !== '2026-10-25T11:00:00Z' || e.entityVersion === 2), 'no-change must not bump createdAt');
});

test('markHubNotificationsRead whitelists, caps versions, ignores future marks, merges duplicates monotonically, limits 100', () => {
  const { env, sandbox, privateBook, properties } = environment();
  const { state, pkg, item } = hubState(sandbox, privateBook, properties);
  const after = KPT.copy(state);
  after.DocItems.find(row => row.id === item.id).version = 3;
  for (let i = 0; i < 110; i++) {
    after.notificationEvents.push({
      id: 'EVT-' + i,
      kind: 'DraftSaved',
      packageId: pkg.id,
      entityType: 'document',
      entityId: item.id,
      entityVersion: 3,
      entityTitle: 'T',
      actorEmail: 'os@gmail.com',
      createdAt: '2026-10-25T09:00:00Z',
      recipientEmail: 'os@gmail.com',
      destination: 'hall',
      role: 'os'
    });
  }
  sandbox.writeSlot_(privateBook, '0', after);
  env.actor = 'os@gmail.com';
  const entries = [];
  for (let i = 0; i < 110; i++) entries.push({ id: 'EVT-' + i, entityVersion: 3 });
  entries.push({ id: 'EVT-0', entityVersion: 1 });
  entries.push({ id: 'EVT-1', entityVersion: 999 });
  entries.push({ id: 'NOPE', entityVersion: 3 });
  const response = sandbox.rpc({ action: 'markHubNotificationsRead', notifications: entries }, 'os@gmail.com');
  assert.equal(response.ok, true, response.error);
  const feed = response.data;
  assert.equal(feed.unreadCount, 0, 'all valid marks clear unread');
  const sheet = privateBook.getSheetByName('HubNotificationReads');
  assert.ok(sheet, 'mark creates the reads sheet');
  const rows = sheet.getRange(1, 1, sheet.getLastRow(), 3).getDisplayValues();
  assert.deepEqual(Array.from(rows[0]), ['userEmail', 'eventId', 'seenVersion'], 'fixed header');
  const dataRows = rows.slice(1).filter(r => r[0] && r[1]);
  assert.equal(dataRows.length, 100, 'limits 100 rows per mark batch');
  assert.ok(!dataRows.some(r => r[1] === 'NOPE'), 'unknown id not stored');
  assert.ok(!dataRows.some(r => r[1] === 'EVT-1'), 'future version mark ignored');
  assert.ok(dataRows.every(r => Number(r[2]) === 3), 'stored version is integer and capped');
});

test('markHubNotificationsRead is monotonic and never lowers an existing seen version', () => {
  const { env, sandbox, privateBook, properties } = environment();
  const { state, pkg, item } = hubState(sandbox, privateBook, properties);
  const after = KPT.copy(state);
  after.notificationEvents.push({ id: 'EVT-M', kind: 'DraftSaved', packageId: pkg.id, entityType: 'document', entityId: item.id, entityVersion: 5, entityTitle: 'T', actorEmail: 'os@gmail.com', createdAt: '2026-10-25T09:00:00Z', recipientEmail: 'os@gmail.com', destination: 'hall', role: 'os' });
  sandbox.writeSlot_(privateBook, '0', after);
  env.actor = 'os@gmail.com';
  sandbox.rpc({ action: 'markHubNotificationsRead', notifications: [{ id: 'EVT-M', entityVersion: 5 }] }, 'os@gmail.com');
  const second = sandbox.rpc({ action: 'markHubNotificationsRead', notifications: [{ id: 'EVT-M', entityVersion: 2 }] }, 'os@gmail.com');
  assert.equal(second.ok, true, second.error);
  const sheet = privateBook.getSheetByName('HubNotificationReads');
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
  const row = rows.find(r => r[1] === 'EVT-M');
  assert.equal(Number(row[2]), 5, 'monotonic keeps the higher version');
});

test('markHubNotificationsRead only accepts currently visible events; permission loss drops the notice', () => {
  const { env, sandbox, privateBook, properties } = environment();
  const { state, pkg, item } = hubState(sandbox, privateBook, properties);
  const after = KPT.copy(state);
  after.notificationEvents.push({ id: 'EVT-OC', kind: 'SubmittedToOC', packageId: pkg.id, entityType: 'document', entityId: item.id, entityVersion: 1, entityTitle: 'T', actorEmail: 'os@gmail.com', createdAt: '2026-10-25T09:00:00Z', recipientEmail: 'exoc@gmail.com', destination: 'studio', role: 'oc' });
  sandbox.writeSlot_(privateBook, '0', after);
  env.actor = 'exoc@gmail.com';
  const denied = sandbox.rpc({ action: 'markHubNotificationsRead', notifications: [{ id: 'EVT-OC', entityVersion: 1 }] }, 'exoc@gmail.com');
  assert.equal(denied.ok, false, 'unassigned user cannot mark');
  properties.setProperty('OC_EMAILS', JSON.stringify(['exoc@gmail.com']));
  const asOc = sandbox.rpc({ action: 'getHubNotifications' }, 'exoc@gmail.com');
  assert.ok(!asOc.data.notifications.some(n => n.id === 'EVT-OC'), 'current role filter drops former OC event');
});

test('readMap future versions are not trusted in the feed', () => {
  const { sandbox, privateBook, properties } = environment();
  const { state, pkg, item } = hubState(sandbox, privateBook, properties);
  const after = KPT.copy(state);
  after.notificationEvents.push({ id: 'EVT-V', kind: 'DraftSaved', packageId: pkg.id, entityType: 'document', entityId: item.id, entityVersion: 3, entityTitle: 'T', actorEmail: 'os@gmail.com', createdAt: '2026-10-25T09:00:00Z', recipientEmail: 'os@gmail.com', destination: 'hall', role: 'os' });
  after.updatedAt = '2026-10-25T10:00:00Z';
  const feed = KPT.hubNotificationFeed(after, { email: 'os@gmail.com', owner: false, admin: false, treasurer: false }, { 'EVT-V': 999 });
  assert.equal(feed.notifications[0].unread, true, 'future seenVersion must not mark read');
  const feed2 = KPT.hubNotificationFeed(after, { email: 'os@gmail.com', owner: false, admin: false, treasurer: false }, { 'EVT-V': 3 });
  assert.equal(feed2.notifications[0].unread, false);
});

test('counts only cover the returned 100-item window so hidden events cannot leave unfixable red dots', () => {
  const { sandbox, privateBook, properties } = environment();
  const { state, pkg, item } = hubState(sandbox, privateBook, properties);
  const after = KPT.copy(state);
  after.updatedAt = '2026-10-25T10:00:00Z';
  for (let i = 0; i < 120; i++) {
    after.notificationEvents.push({ id: 'EVT-N' + i, kind: 'DraftSaved', packageId: pkg.id, entityType: 'document', entityId: item.id, entityVersion: 1, entityTitle: 'T', actorEmail: 'os@gmail.com', createdAt: '2026-10-25T09:00:00Z', recipientEmail: 'os@gmail.com', destination: 'hall', role: 'os' });
  }
  const feed = KPT.hubNotificationFeed(after, { email: 'os@gmail.com' }, {});
  assert.equal(feed.notifications.length, 100);
  assert.equal(feed.unreadCount, 100);
});

test('approval chain routes kinds and destinations through the real mutate path', () => {
  const { env, sandbox, privateBook, properties } = environment();
  const { state, pkg, item } = hubState(sandbox, privateBook, properties);
  const context = { actor: 'os@gmail.com', now: '2026-10-25T10:00:00Z', uuid: () => 'flow-' + Date.now() };
  let work = KPT.copy(state);
  work.DocItems.find(row => row.id === item.id).status = 'Draft';
  work.DocItems.find(row => row.id === item.id).fileId = 'f1';
  const uploadBefore = KPT.copy(work);
  work = KPT.mutate(work, { revision: work.revision, action: 'docItemUpload', itemId: item.id, fileName: 'a.docx', fileId: 'f2' }, context);
  KPT.appendHubEvents(uploadBefore, work, { action: 'docItemUpload', itemId: item.id }, 'os@gmail.com', { owner: 'owner@gmail.com', admins: ['secretary@gmail.com'], treasurers: [] }, context);
  assert.ok(work.notificationEvents.some(e => e.kind === 'DraftSaved' && e.destination === 'studio' && e.recipientEmail === 'oc@gmail.com'));
  const submitBefore = KPT.copy(work);
  work = KPT.mutate(work, { revision: work.revision, action: 'docItemSubmit', itemId: item.id }, Object.assign({}, context, { actor: 'os@gmail.com' }));
  KPT.appendHubEvents(submitBefore, work, { action: 'docItemSubmit', itemId: item.id }, 'os@gmail.com', { owner: 'owner@gmail.com', admins: [], treasurers: [] }, context);
  assert.ok(work.notificationEvents.some(e => e.kind === 'SubmittedToOC' && e.recipientEmail === 'oc@gmail.com' && e.destination === 'studio'));
  const checkBefore = KPT.copy(work);
  work = KPT.mutate(work, { revision: work.revision, action: 'docItemCheck', itemId: item.id, approve: true }, Object.assign({}, context, { actor: 'oc@gmail.com' }));
  KPT.appendHubEvents(checkBefore, work, { action: 'docItemCheck', itemId: item.id, approve: true }, 'oc@gmail.com', { owner: 'owner@gmail.com', admins: [], treasurers: [] }, context);
  assert.ok(work.notificationEvents.some(e => e.kind === 'OCChecked' && e.destination === 'hall'));
  const forwardBefore = KPT.copy(work);
  work = KPT.mutate(work, { revision: work.revision, action: 'docItemForward', itemId: item.id }, Object.assign({}, context, { actor: 'oc@gmail.com' }));
  KPT.appendHubEvents(forwardBefore, work, { action: 'docItemForward', itemId: item.id }, 'oc@gmail.com', { owner: 'owner@gmail.com', admins: ['secretary@gmail.com'], treasurers: [] }, context);
  assert.ok(work.notificationEvents.some(e => e.kind === 'ForwardedForApproval' && e.recipientEmail === 'owner@gmail.com' && e.role === 'owner'));
  assert.ok(work.notificationEvents.some(e => e.kind === 'ForwardedForApproval' && e.recipientEmail === 'secretary@gmail.com' && e.role === 'admin'));
});
