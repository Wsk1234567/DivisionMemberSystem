const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const KPT = require('../src/domain.js');

test('Apps Script receipt validation accepts signed and unsigned file signatures and rejects incomplete headers', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../apps-script/admin/Code.gs'), 'utf8'), sandbox);
  for (const [bytes, mime] of [
    [[255, 216, 255, 224, 0], 'image/jpeg'],
    [[137, 80, 78, 71, 13, 10, 26, 10], 'image/png'],
    [[37, 80, 68, 70, 45], 'application/pdf']
  ]) {
    assert.equal(sandbox.finAttachmentMimeFromHeader_(bytes), mime);
    assert.equal(sandbox.finAttachmentMimeFromHeader_(bytes.map(value => value > 127 ? value - 256 : value)), mime);
  }
  assert.equal(sandbox.finAttachmentMimeFromHeader_([137, 80, 78, 71]), '');
  assert.equal(sandbox.finAttachmentMimeFromHeader_([37, 80, 68, 70]), '');
});

function preview() {
  let serial = 0;
  const context = { actor: 'preview-owner@example.test', now: new Date().toISOString(), uuid: () => 'fixture-' + ++serial };
  let initial = KPT.empty();
  for (const [activityType, year, prefix] of [['AGM', 2026, 'preview'], ['OrientationDay', 2027, 'other']]) {
    initial = KPT.mutate(initial, {
      action: 'createDocPackage', activityType, year, revision: initial.revision,
      ocEmail: prefix + '-oc@example.test', osEmail: prefix + '-os@example.test', otEmail: prefix + '-ot@example.test'
    }, context);
  }
  const ownPackage = initial.DocPackages[0].id;
  const otherPackage = initial.DocPackages[1].id;
  const sandbox = {
    KPT, window: {}, setTimeout, atob,
    fetch: async () => ({ ok: true, json: async () => KPT.copy(initial) })
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../src/demo-transport.js'), 'utf8'), sandbox);
  const transport = sandbox.window.KPTTransport;
  return { transport, ownPackage, otherPackage, initial, call: request => transport.call(request) };
}

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64');
const financeDraft = (packageId, extra = {}) => Object.assign({ activityName: 'Activity accounts', packageId, incomes: [], expenses: [], reimbursements: [] }, extra);

test('Apps Script stores the first read marker without a business write and rejects unseen versions', () => {
  const { initial, ownPackage } = preview();
  let serial = 0;
  const ctx = { actor: 'preview-ot@example.test', now: new Date().toISOString(), uuid: () => 'reads-' + ++serial };
  const request = { action: 'saveFinanceBook', revision: initial.revision, book: financeDraft(ownPackage) };
  const state = KPT.mutate(initial, request, ctx);
  KPT.appendHubEvents(initial, state, request, { email: ctx.actor }, {}, ctx);
  const actor = { email: 'preview-oc@example.test', oc: true };
  const event = KPT.hubNotificationFeed(state, actor, {}).notifications[0];
  const revision = state.revision;
  const sheets = new Map();
  const book = {
    getSheetByName: name => sheets.get(name) || null,
    insertSheet(name) {
      const rows = [];
      const sheet = {
        getLastRow: () => rows.length,
        getMaxRows: () => 1000,
        insertRowsAfter() {},
        getRange(first, column, height = 1, width = 1) {
          return {
            getDisplayValues: () => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => String((rows[first - 1 + i] || [])[column - 1 + j] ?? ''))),
            setValues(values) {
              values.forEach((row, i) => {
                rows[first - 1 + i] ||= [];
                row.forEach((value, j) => { rows[first - 1 + i][column - 1 + j] = value; });
              });
              return this;
            },
            setNumberFormat() { return this; }
          };
        }
      };
      sheets.set(name, sheet);
      return sheet;
    }
  };
  const sandbox = { KPT };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../apps-script/admin/Code.gs'), 'utf8'), sandbox);
  assert.equal(Object.keys(sandbox.hubLoadReadMap_(book, actor.email)).length, 0);
  assert.equal(sheets.size, 0, 'Reading must not create a sheet.');
  sandbox.hubMarkRead_(book, actor.email, [{ id: event.id, entityVersion: 999999 }], state, actor);
  assert.equal(sheets.size, 0, 'An impossible future read cannot create or clear a marker.');
  sandbox.hubMarkRead_(book, actor.email, [{ id: event.id, entityVersion: event.entityVersion }], state, actor);
  const reads = sandbox.hubLoadReadMap_(book, actor.email);
  assert.equal(reads[event.id], event.entityVersion, 'The first user marker must survive the header row.');
  assert.equal(KPT.hubNotificationFeed(state, actor, reads).unreadCount, 0);
  assert.equal(KPT.hubNotificationFeed(state, { email: ctx.actor }, sandbox.hubLoadReadMap_(book, ctx.actor)).unreadCount, 1);
  assert.equal(state.revision, revision);
  assert.equal(KPT.hubNotificationFeed(state, actor, {}, new Date(Date.parse(ctx.now) + 91 * 86400000).toISOString()).unreadCount, 0, 'Old notifications expire even when business records have not changed.');
});

test('preview keeps an in-flight request scoped to its original identity during a role switch', async () => {
  const { transport, call } = preview();
  await transport.setDemoRole('os');
  const pending = call({ action: 'bootstrap' });
  await transport.setDemoRole('owner');
  const response = await pending;
  assert.equal(response.user.email, 'preview-os@example.test');
  assert.equal(response.state.DocPackages.length, 1);
  assert.equal(response.state.notificationEvents, undefined);
  assert.equal(response.admins.length, 0);
});

test('preview notifications preserve newer unread versions, isolate users and keep reads outside business revisions', async () => {
  const { transport, ownPackage, call } = preview();
  await transport.setDemoRole('ot');
  const boot = await call({ action: 'bootstrap' });
  const saved = await call({ action: 'saveFinanceBook', revision: boot.state.revision, book: financeDraft(ownPackage) });
  const book = saved.state.FinBooks[0];
  const authorFeed = await call({ action: 'getHubNotifications' });
  assert.equal(authorFeed.unreadCount, 1, 'First save must notify the author hall.');
  assert.equal(authorFeed.notifications[0].destination, 'hall');
  await transport.setDemoRole('oc');
  const ocFeed = await call({ action: 'getHubNotifications' });
  assert.equal(ocFeed.unreadCount, 1);
  const observed = ocFeed.notifications[0];
  assert.equal(observed.destination, 'studio');
  const beforeRead = await call({ action: 'bootstrap' });
  const read = await call({ action: 'markHubNotificationsRead', notifications: [{ id: observed.id, entityVersion: observed.entityVersion }] });
  assert.equal(read.unreadCount, 0);
  assert.equal((await call({ action: 'bootstrap' })).state.revision, beforeRead.state.revision);
  await transport.setDemoRole('ot');
  assert.equal((await call({ action: 'getHubNotifications' })).unreadCount, 1, 'Another user reading cannot clear my dot.');
  const changed = await call({ action: 'saveFinanceBook', revision: saved.state.revision, book: financeDraft(ownPackage, { id: book.id, version: book.version, activityName: 'Updated activity accounts' }) });
  const same = await call({ action: 'saveFinanceBook', revision: changed.state.revision, book: financeDraft(ownPackage, changed.state.FinBooks[0]) });
  const latestAuthor = await call({ action: 'getHubNotifications' });
  assert.equal(latestAuthor.notifications[0].entityVersion, changed.state.FinBooks[0].version, 'No-op save cannot refresh a notification.');
  await transport.setDemoRole('oc');
  const staleRead = await call({ action: 'markHubNotificationsRead', notifications: [{ id: observed.id, entityVersion: observed.entityVersion }] });
  assert.equal(staleRead.unreadCount, 1, 'An old read cannot clear a newer saved version.');
  const futureRead = await call({ action: 'markHubNotificationsRead', notifications: [{ id: observed.id, entityVersion: 999999 }] });
  assert.equal(futureRead.unreadCount, 1);
  const scoped = await call({ action: 'bootstrap' });
  assert.equal(scoped.state.revision, same.state.revision);
  assert.equal(scoped.state.notificationEvents, undefined);
  await transport.setDemoRole('os');
  assert.equal((await call({ action: 'getHubNotifications' })).unreadCount, 0, 'OS cannot see finance activity updates.');
});

test('preview receipts persist through role switches, reject invalid uploads and lock after submission', async () => {
  const { transport, ownPackage, otherPackage, call } = preview();
  await transport.setDemoRole('ot');
  const boot = await call({ action: 'bootstrap' });
  const saved = await call({ action: 'saveFinanceBook', revision: boot.state.revision, book: financeDraft(ownPackage) });
  const bookId = saved.state.FinBooks[0].id;
  await assert.rejects(call({ action: 'uploadFinanceAttachment', bookId, revision: saved.state.revision, fileName: 'fake.png', mime: 'image/png', contentBase64: Buffer.from('not an image').toString('base64') }), /contents/);
  const uploaded = await call({ action: 'uploadFinanceAttachment', bookId, revision: saved.state.revision, fileName: 'receipt.png', mime: 'image/png', contentBase64: png });
  const attachmentId = uploaded.attachment.id;
  assert.equal(uploaded.state.finAttachments.length, 1);
  assert.equal((await call({ action: 'downloadFinanceAttachment', attachmentId })).contentBase64, png);
  await assert.rejects(call({ action: 'downloadFinanceAttachment', attachmentId, fileId: uploaded.attachment.fileId }), /server/);
  await transport.setDemoRole('os');
  assert.equal((await call({ action: 'bootstrap' })).state.finAttachments.length, 0);
  await assert.rejects(call({ action: 'downloadFinanceAttachment', attachmentId }), /reading scope/);
  await transport.setDemoRole('oc');
  assert.equal((await call({ action: 'downloadFinanceAttachment', attachmentId })).fileName, 'receipt.png');
  await assert.rejects(call({ action: 'removeFinanceAttachment', attachmentId, revision: uploaded.state.revision }), /assigned OT/);
  await transport.setDemoRole('ot');
  const submitted = await call({ action: 'submitFinBook', bookId, revision: uploaded.state.revision });
  await assert.rejects(call({ action: 'removeFinanceAttachment', attachmentId, revision: submitted.state.revision }), /draft or returned/);
  await assert.rejects(call({ action: 'uploadFinanceAttachment', bookId, revision: submitted.state.revision, fileName: 'later.png', mime: 'image/png', contentBase64: png }), /draft or returned/);
  await assert.rejects(call({ action: 'saveFinanceBook', revision: submitted.state.revision, book: financeDraft(otherPackage) }), /assigned OT/);
  await transport.setDemoRole('treasurer');
  assert.equal((await call({ action: 'downloadFinanceAttachment', attachmentId })).mime, 'image/png');
  await transport.setDemoRole('owner');
  const full = (await call({ action: 'bootstrap' })).state;
  assert.equal(full.DocPackages.length, 2, 'Scoped responses must never replace the private state.');
  assert.equal(full.finAttachments.length, 1);
});

test('preview document handoff sends OC checks and final reviews to the correct roles', async () => {
  const { transport, ownPackage, call } = preview();
  await transport.setDemoRole('os');
  const boot = await call({ action: 'bootstrap' });
  const itemId = boot.state.DocItems.find(row => row.packageId === ownPackage).id;
  const uploaded = await call({ action: 'docItemUpload', itemId, revision: boot.state.revision, fileName: 'proposal.pdf', fileBase64: Buffer.from('%PDF-1.4\nProposal').toString('base64') });
  await assert.rejects(call({ action: 'docItemCheck', itemId, approve: true, revision: uploaded.state.revision }), /assigned OC|package role/);
  await transport.setDemoRole('oc');
  assert.equal((await call({ action: 'getHubNotifications' })).studioUnread.oc, 1);
  await assert.rejects(call({ action: 'docItemCheck', itemId, approve: true, revision: uploaded.state.revision }), /waiting for OC/);
  await transport.setDemoRole('os');
  const submitted = await call({ action: 'docItemSubmit', itemId, revision: uploaded.state.revision });
  await transport.setDemoRole('oc');
  const checked = await call({ action: 'docItemCheck', itemId, approve: true, revision: submitted.state.revision });
  assert.equal(checked.state.DocItems.find(row => row.id === itemId).status, 'OCChecked');
  const forwarded = await call({ action: 'docItemForward', itemId, revision: checked.state.revision });
  assert.equal(forwarded.state.DocItems.find(row => row.id === itemId).status, 'Submitted');
  await transport.setDemoRole('treasurer');
  assert.equal((await call({ action: 'getHubNotifications' })).unreadCount, 0);
  await assert.rejects(call({ action: 'docItemReview', itemId, approve: true, revision: forwarded.state.revision }), /Access denied/);
  await transport.setDemoRole('admin');
  assert.ok((await call({ action: 'getHubNotifications' })).notifications.some(row => row.kind === 'ForwardedForApproval' && row.entityId === itemId));
  const approved = await call({ action: 'docItemReview', itemId, approve: true, revision: forwarded.state.revision });
  assert.equal(approved.state.DocItems.find(row => row.id === itemId).status, 'Approved');
  await transport.setDemoRole('os');
  assert.ok((await call({ action: 'getHubNotifications' })).notifications.some(row => row.kind === 'Approved' && row.entityId === itemId));
});

test('changing an activity assignment revokes its old role notifications immediately', async () => {
  const { transport, ownPackage, call } = preview();
  await transport.setDemoRole('ot');
  const boot = await call({ action: 'bootstrap' });
  const saved = await call({ action: 'saveFinanceBook', revision: boot.state.revision, book: financeDraft(ownPackage) });
  await transport.setDemoRole('oc');
  const oldEvent = (await call({ action: 'getHubNotifications' })).notifications[0];
  assert.equal(oldEvent.role, 'oc');
  await transport.setDemoRole('owner');
  await call({ action: 'saveDocPackageMeta', packageId: ownPackage, revision: saved.state.revision, ocEmail: 'replacement-oc@example.test', otEmail: 'preview-oc@example.test' });
  await transport.setDemoRole('oc');
  assert.equal((await call({ action: 'bootstrap' })).state.FinBooks.length, 1, 'The new OT role still has finance reading scope.');
  const feed = await call({ action: 'getHubNotifications' });
  assert.equal(feed.notifications.length, 0, 'Old OC notifications must not survive as new OT permissions.');
  const marked = await call({ action: 'markHubNotificationsRead', notifications: [{ id: oldEvent.id, entityVersion: oldEvent.entityVersion }] });
  assert.equal(marked.notifications.length, 0);
});
