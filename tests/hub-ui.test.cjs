const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('hub UI exposes studio, hall and notifications without implementation jargon', () => {
  const admin = read('src/admin.js');
  const i18n = read('src/i18n.js');
  assert.match(i18n, /hub\.studio/);
  assert.match(i18n, /hub\.hall/);
  assert.match(i18n, /hub\.notifications/);
  assert.match(admin, /data-action="hubTab"/);
  assert.match(admin, /data-action="hubPick"/);
  assert.doesNotMatch(admin, /packageId, not by name/);
  // Public tech words must not be user-facing copy in hub strings.
  assert.doesNotMatch(i18n, /packageId|outbox/);
});

test('hub role capability is a union, not a single collapsed role', () => {
  const admin = read('src/admin.js');
  assert.match(admin, /const hubHas = role => hubRoles\(\)\.indexOf\(role\) >= 0/);
  assert.match(admin, /Concurrent roles are a union/);
  assert.match(admin, /canOs = hubHas\('os'\)/);
  assert.match(admin, /canOt = hubHas\('ot'\)/);
  assert.match(admin, /canOc = hubHas\('oc'\)/);
  // Admin must not automatically get finance edit.
  assert.match(admin, /canFinEdit = hubHas\('ot'\) \|\| hubHas\('owner'\) \|\| hubHas\('treasurer'\)/);
});

test('check/return stay in studio; formal submit/forward stay in hall', () => {
  const admin = read('src/admin.js');
  assert.match(admin, /Check \/ return live in Studio; formal submit\/forward stay in Hall/);
  assert.match(admin, /hubStudioBody/);
  assert.match(admin, /hubHallBody/);
  assert.match(admin, /data-action="docSubmit"/);
  assert.match(admin, /data-action="docForward"/);
  assert.match(admin, /data-action="finSubmit"/);
  assert.match(admin, /data-action="finForward"/);
});

test('receipts edit only for Owner, Treasurer or package OT', () => {
  const admin = read('src/admin.js');
  assert.match(admin, /user\.owner \|\| user\.treasurer \|\| roles\.indexOf\('ot'\) >= 0/);
  assert.match(admin, /OC may view drafts read-only/);
  assert.match(admin, /uploadFinanceAttachment/);
  assert.match(admin, /removeFinanceAttachment/);
  assert.match(admin, /downloadFinanceAttachment/);
});

test('multi-activity requires explicit pick; silent poll only refreshes badges', () => {
  const admin = read('src/admin.js');
  assert.match(admin, /Auto-open only when there is exactly one activity/);
  assert.match(admin, /hubRefreshBadges/);
  assert.match(admin, /never re-render the page/);
  assert.match(admin, /markHubNotificationsRead/);
  assert.match(admin, /entityVersion/);
});
