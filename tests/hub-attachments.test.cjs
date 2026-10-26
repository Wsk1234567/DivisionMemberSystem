const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const KPT = require('../src/domain.js');
const { fixture } = require('../src/demo-data.js');

function environment() {
  let serial = 0;
  const env = { actor: 'owner@gmail.com', effective: null, failWrites: false, driveFiles: [] };
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
    const bytes = typeof content === 'string' ? Array.from(Buffer.from(content, 'utf8')) : Array.from(content || []);
    const file = {
      id, trashed: false,
      getId: () => id, getName: () => name, getMimeType: () => mime,
      getDateCreated: () => new Date(2026, 0, serial),
      getBlob: () => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8'), getBytes: () => bytes }),
      getParents: () => iterator([{ getId: () => folderId }]),
      setTrashed(value) { this.trashed = value; },
      addEditor: () => {}, removeEditor: () => {}
    };
    files.set(id, file);
    env.driveFiles.push({ id, name, mime, bytes });
    return file;
  };
  const folder = {
    createFile(nameOrBlob, content, mime) {
      const name = typeof nameOrBlob === 'string' ? nameOrBlob : (nameOrBlob.getName && nameOrBlob.getName()) || 'file';
      const body = typeof nameOrBlob === 'string' ? content : (nameOrBlob.getBytes && nameOrBlob.getBytes());
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
    SpreadsheetApp: { openById(id) { return id === 'private' ? privateBook : publicBook; }, flush: () => {} },
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

function setupBook(sandbox, privateBook, properties) {
  let state = KPT.copy(sandbox.loadState_());
  let serial = 0;
  const context = { actor: 'owner@gmail.com', now: '2026-10-25T10:00:00Z', uuid: () => 'att-' + ++serial };
  const mutate = request => {
    state = KPT.mutate(state, Object.assign({ revision: state.revision }, request), context);
  };
  mutate({ action: 'createDocPackage', activityType: 'AGM', year: 2026, ocEmail: 'oc@gmail.com', osEmail: 'os@gmail.com', otEmail: 'ot@gmail.com' });
  const pkg = state.DocPackages.at(-1);
  mutate({ action: 'saveFinanceBook', book: { activityName: 'Fair', packageId: pkg.id, incomes: [{ date: '2026-10-25', description: 'Sales', amount: 10 }], expenses: [], reimbursements: [] } });
  const book = state.FinBooks.at(-1);
  state.notificationEvents = [];
  state.finAttachments = [];
  sandbox.writeSlot_(privateBook, '0', state);
  properties.setProperty('OC_EMAILS', JSON.stringify(['oc@gmail.com', 'os@gmail.com', 'ot@gmail.com']));
  return { state, pkg, book };
}

const JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
const SIGNED_JPEG = [0xFF - 256, 0xD8 - 256, 0xFF - 256, 0xE0 - 256, 0x00, 0x10];

test('header detection handles signed bytes and validates full PNG / PDF signatures', () => {
  const { sandbox } = environment();
  assert.equal(sandbox.finAttachmentMimeFromHeader_(Array.from(JPEG)), 'image/jpeg');
  assert.equal(sandbox.finAttachmentMimeFromHeader_(SIGNED_JPEG), 'image/jpeg', 'signed -1 bytes must still match JPEG');
  assert.equal(sandbox.finAttachmentMimeFromHeader_(Array.from(PNG)), 'image/png');
  assert.equal(sandbox.finAttachmentMimeFromHeader_(Array.from(PDF)), 'application/pdf');
  assert.equal(sandbox.finAttachmentMimeFromHeader_([0x89, 0x50, 0x4E, 0x47, 0x00, 0x00, 0x00, 0x00]), '', 'PNG requires full 8-byte signature');
  assert.equal(sandbox.finAttachmentMimeFromHeader_([0x25, 0x50, 0x44, 0x46, 0x00]), '', 'PDF requires %PDF-');
});

test('uploadFinanceAttachment validates business rules before writing Drive', () => {
  const { env, sandbox, privateBook, properties } = environment();
  const { state, book } = setupBook(sandbox, privateBook, properties);
  env.actor = 'ot@gmail.com';
  properties.setProperty('OC_EMAILS', JSON.stringify(['oc@gmail.com', 'ot@gmail.com']));
  const revision = state.revision;
  const beforeDrive = env.driveFiles.length;
  const bad = sandbox.rpc({
    action: 'uploadFinanceAttachment',
    bookId: book.id,
    revision: revision + 99,
    fileName: 'a.jpg',
    mime: 'image/jpeg',
    contentBase64: JPEG.toString('base64')
  }, 'ot@gmail.com');
  assert.equal(bad.ok, false, 'stale revision rejected');
  assert.equal(env.driveFiles.length, beforeDrive, 'no Drive write on stale revision');
  const locked = sandbox.rpc({
    action: 'uploadFinanceAttachment',
    bookId: book.id,
    revision,
    fileName: 'a.txt',
    mime: 'text/plain',
    contentBase64: JPEG.toString('base64')
  }, 'ot@gmail.com');
  assert.equal(locked.ok, false);
  assert.equal(env.driveFiles.length, beforeDrive, 'no Drive write on bad extension');
});

test('uploadFinanceAttachment accepts JPG/PNG/PDF and rejects bad headers and empty content', () => {
  const { env, sandbox, privateBook, properties } = environment();
  const { state, book } = setupBook(sandbox, privateBook, properties);
  env.actor = 'ot@gmail.com';
  properties.setProperty('OC_EMAILS', JSON.stringify(['oc@gmail.com', 'ot@gmail.com']));
  const revision = () => sandbox.loadState_().revision;
  const ok = sandbox.rpc({
    action: 'uploadFinanceAttachment',
    bookId: book.id,
    revision: revision(),
    fileName: 'r.jpg',
    mime: 'image/jpeg',
    contentBase64: JPEG.toString('base64')
  }, 'ot@gmail.com');
  assert.equal(ok.ok, true, ok.error);
  assert.ok(ok.data.attachment && ok.data.attachment.id && ok.data.attachment.fileId);
  assert.equal(ok.data.attachment.mime, 'image/jpeg');
  assert.equal(ok.data.attachment.active, true);
  assert.ok(ok.data.state.finAttachments.some(a => a.id === ok.data.attachment.id));
  const empty = sandbox.rpc({
    action: 'uploadFinanceAttachment',
    bookId: book.id,
    revision: revision(),
    fileName: 'e.jpg',
    mime: 'image/jpeg',
    contentBase64: ''
  }, 'ot@gmail.com');
  assert.equal(empty.ok, false, 'empty content rejected');
  const spoof = sandbox.rpc({
    action: 'uploadFinanceAttachment',
    bookId: book.id,
    revision: revision(),
    fileName: 's.jpg',
    mime: 'image/jpeg',
    contentBase64: JPEG.toString('base64'),
    fileId: 'spoof',
    bytes: 1
  }, 'ot@gmail.com');
  assert.equal(spoof.ok, false, 'client-supplied fileId/bytes rejected');
  const mismatch = sandbox.rpc({
    action: 'uploadFinanceAttachment',
    bookId: book.id,
    revision: revision(),
    fileName: 'm.png',
    mime: 'image/jpeg',
    contentBase64: PNG.toString('base64')
  }, 'ot@gmail.com');
  assert.equal(mismatch.ok, false, 'declared mime must match extension');
  const badHeader = sandbox.rpc({
    action: 'uploadFinanceAttachment',
    bookId: book.id,
    revision: revision(),
    fileName: 'b.jpg',
    mime: 'image/jpeg',
    contentBase64: Buffer.from('not-a-jpeg').toString('base64')
  }, 'ot@gmail.com');
  assert.equal(badHeader.ok, false, 'header must match declared type');
});

test('uploadFinanceAttachment rejects locked books and respects count / size limits', () => {
  const { env, sandbox, privateBook, properties } = environment();
  const { state, book, pkg } = setupBook(sandbox, privateBook, properties);
  env.actor = 'ot@gmail.com';
  properties.setProperty('OC_EMAILS', JSON.stringify(['oc@gmail.com', 'ot@gmail.com']));
  const locked = KPT.copy(sandbox.loadState_());
  locked.FinBooks.find(r => r.id === book.id).status = 'AwaitingOC';
  sandbox.writeSlot_(privateBook, '0', locked);
  const res = sandbox.rpc({
    action: 'uploadFinanceAttachment',
    bookId: book.id,
    revision: locked.revision,
    fileName: 'a.jpg',
    mime: 'image/jpeg',
    contentBase64: JPEG.toString('base64')
  }, 'ot@gmail.com');
  assert.equal(res.ok, false, 'submitted book locked');
  assert.match(res.error, /draft or returned/i);
});

test('removeFinanceAttachment derives book from attachment, rejects conflicting bookId, unlocks only Draft/Rejected', () => {
  const { env, sandbox, privateBook, properties } = environment();
  const { state, book } = setupBook(sandbox, privateBook, properties);
  env.actor = 'ot@gmail.com';
  properties.setProperty('OC_EMAILS', JSON.stringify(['oc@gmail.com', 'ot@gmail.com']));
  const up = sandbox.rpc({
    action: 'uploadFinanceAttachment',
    bookId: book.id,
    revision: sandbox.loadState_().revision,
    fileName: 'r.jpg',
    mime: 'image/jpeg',
    contentBase64: JPEG.toString('base64')
  }, 'ot@gmail.com');
  assert.equal(up.ok, true, up.error);
  const attachmentId = up.data.attachment.id;
  const conflict = sandbox.rpc({
    action: 'removeFinanceAttachment',
    attachmentId,
    bookId: 'FIN-OTHER',
    revision: sandbox.loadState_().revision
  }, 'ot@gmail.com');
  assert.equal(conflict.ok, false, 'conflicting bookId rejected');
  const removed = sandbox.rpc({
    action: 'removeFinanceAttachment',
    attachmentId,
    revision: sandbox.loadState_().revision
  }, 'ot@gmail.com');
  assert.equal(removed.ok, true, removed.error);
  env.actor = 'owner@gmail.com';
  const asOwner = sandbox.rpc({ action: 'bootstrap' }, 'owner@gmail.com');
  assert.ok(asOwner.data.state.finAttachments.some(a => a.id === attachmentId && a.active === false), 'owner sees deactivated attachment');
  env.actor = 'ot@gmail.com';
  const lockedState = KPT.copy(sandbox.loadState_());
  lockedState.FinBooks.find(r => r.id === book.id).status = 'OCChecked';
  if (lockedState.finAttachments.find(a => a.id === attachmentId)) lockedState.finAttachments.find(a => a.id === attachmentId).active = true;
  sandbox.writeSlot_(privateBook, '0', lockedState);
  const locked = sandbox.rpc({
    action: 'removeFinanceAttachment',
    attachmentId,
    revision: lockedState.revision
  }, 'ot@gmail.com');
  assert.equal(locked.ok, false, 'locked book rejects remove');
});

test('downloadFinanceAttachment allows Owner/Treasurer/OC/OT and blocks OS-only', () => {
  const { env, sandbox, privateBook, properties } = environment();
  const { state, book } = setupBook(sandbox, privateBook, properties);
  env.actor = 'ot@gmail.com';
  properties.setProperty('OC_EMAILS', JSON.stringify(['oc@gmail.com', 'ot@gmail.com']));
  const up = sandbox.rpc({
    action: 'uploadFinanceAttachment',
    bookId: book.id,
    revision: sandbox.loadState_().revision,
    fileName: 'r.jpg',
    mime: 'image/jpeg',
    contentBase64: JPEG.toString('base64')
  }, 'ot@gmail.com');
  assert.equal(up.ok, true, up.error);
  const attachmentId = up.data.attachment.id;
  for (const email of ['owner@gmail.com', 'treasurer@gmail.com', 'oc@gmail.com', 'ot@gmail.com']) {
    env.actor = email;
    const res = sandbox.rpc({ action: 'downloadFinanceAttachment', attachmentId }, email);
    assert.equal(res.ok, true, email + ' should download: ' + res.error);
    assert.equal(res.data.fileName, 'r.jpg');
    assert.equal(res.data.mime, 'image/jpeg');
    assert.ok(res.data.contentBase64);
  }
  env.actor = 'os@gmail.com';
  const denied = sandbox.rpc({ action: 'downloadFinanceAttachment', attachmentId }, 'os@gmail.com');
  assert.equal(denied.ok, false, 'OS-only must not download');
});

test('upload with signed JPEG byte array stores and projects attachment metadata only to readable books', () => {
  const { env, sandbox, privateBook, properties } = environment();
  const { state, book } = setupBook(sandbox, privateBook, properties);
  env.actor = 'ot@gmail.com';
  properties.setProperty('OC_EMAILS', JSON.stringify(['oc@gmail.com', 'ot@gmail.com']));
  const signedB64 = Buffer.from(SIGNED_JPEG).toString('base64');
  const res = sandbox.rpc({
    action: 'uploadFinanceAttachment',
    bookId: book.id,
    revision: sandbox.loadState_().revision,
    fileName: 'signed.jpg',
    mime: 'image/jpeg',
    contentBase64: signedB64
  }, 'ot@gmail.com');
  assert.equal(res.ok, true, res.error);
  properties.setProperty('OC_EMAILS', JSON.stringify(['oc@gmail.com', 'os@gmail.com', 'ot@gmail.com']));
  env.actor = 'os@gmail.com';
  const bootstrap = sandbox.rpc({ action: 'bootstrap' }, 'os@gmail.com');
  assert.equal(bootstrap.ok, true, bootstrap.error);
  assert.equal(bootstrap.data.state.finAttachments.filter(a => a.bookId === book.id).length, 0, 'OS-only sees no finance attachments');
  assert.equal(bootstrap.data.state.notificationEvents, undefined, 'raw events never leave the projection');
});
