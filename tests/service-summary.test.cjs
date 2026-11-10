const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('summary poll uses the light serviceSummary action only', () => {
  const ui = read('src/service-ui.js');
  assert.match(ui, /action: 'serviceSummary'/);
  assert.match(ui, /unreadCount/);
  assert.match(ui, /ownerReviewCount/);
  assert.match(ui, /changeKey/);
  // Never bootstraps the whole state on the 5s tick.
  assert.doesNotMatch(ui, /summaryTick[\s\S]{0,600}action: 'bootstrap'/);
  assert.doesNotMatch(ui, /summaryTick[\s\S]{0,600}action: 'serviceList'/);
});

test('summary poll is 5s, hidden-paused and single-flight', () => {
  const ui = read('src/service-ui.js');
  assert.match(ui, /setInterval\(summaryTick, 5000\)/);
  assert.match(ui, /document\.hidden/);
  assert.match(ui, /if \(summaryInFlight\) return/);
  assert.match(ui, /summaryInFlight = true/);
  assert.match(ui, /summaryInFlight = false/);
});

test('summary poll refreshes the open list only and never clobbers dirty edits', () => {
  const ui = read('src/service-ui.js');
  assert.match(ui, /isListViewOpen/);
  assert.match(ui, /isDirty/);
  assert.match(ui, /onStale/);
  assert.match(ui, /refreshList/);
  // Dirty path must not call refreshList.
  assert.match(ui, /deps\.isDirty\(\)\)\s*\{[\s\S]{0,200}onStale/);
  assert.match(ui, /Never clobber unsaved edits|never over an\s+unsaved edit/i);
});

test('admin sidebar badge updates in place without re-render', () => {
  const admin = read('src/admin.js');
  assert.match(admin, /function serviceRefreshBadge/);
  assert.match(admin, /service-group-badge/);
  assert.match(admin, /hub-badge/);
  assert.match(admin, /serviceStartPolling/);
  assert.match(admin, /serviceStopPolling/);
  // Polling starts for admin/owner and stops on logout.
  assert.match(admin, /user\.admin \|\| user\.owner/);
  assert.match(admin, /serviceStopPolling\(\);/);
  assert.match(admin, /nav\.Service|'Service', 'Service Awards'|'Service', 'Service'/);
});

test('summary failures keep the editor and counts', () => {
  const ui = read('src/service-ui.js');
  assert.match(ui, /onPollError/);
  assert.match(ui, /Keep the editor|keep the current counts/i);
});
