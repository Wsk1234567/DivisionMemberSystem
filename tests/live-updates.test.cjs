const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('live probe uses irreversible changeKey and never leaks raw config or global counters', () => {
  const gs = read('apps-script/admin/Code.gs');
  assert.match(gs, /function liveHash_/);
  assert.match(gs, /SHA_256|sha256\./);
  assert.doesNotMatch(gs, /return parts\.join/);
  assert.match(gs, /function liveChangeKey_/);
  assert.match(gs, /action === 'liveProbe'/);
  assert.doesNotMatch(gs, /action === 'liveProbe'[\s\S]{0,400}revision: Number\(mark\.revision/);
});

test('applied changeKey advances only after successful apply; baseline comes from bootstrap', () => {
  const admin = read('src/admin.js');
  assert.match(admin, /Advance applied key only after a successful apply/);
  assert.match(admin, /hubLiveChangeKey = \(response && response\.changeKey\)/);
  assert.match(admin, /never accept first probe blindly|Baseline must come from bootstrap/);
  assert.match(admin, /hubLiveGeneration/);
  assert.match(admin, /incomingRevision < hubLiveAppliedRevision/);
});

test('liveSnapshot projects state for actor in demo and production path', () => {
  const demo = read('src/demo-transport.js');
  assert.match(demo, /action === 'liveSnapshot'[\s\S]{0,800}projectForActor/);
  assert.doesNotMatch(demo, /action === 'liveSnapshot'[\s\S]{0,400}state: copy\(state\)/);
  const gs = read('apps-script/admin/Code.gs');
  assert.match(gs, /action === 'liveSnapshot'[\s\S]{0,1200}projectForActor/);
});

test('stop polling invalidates generation so old finally cannot clobber new flight', () => {
  const admin = read('src/admin.js');
  assert.match(admin, /function hubInvalidateLive/);
  assert.match(admin, /hubInvalidateLive\(\);/);
  assert.match(admin, /generation === hubLiveGeneration && requestId === hubLiveRequestId/);
  assert.match(admin, /snapshot\.user/);
  assert.match(admin, /Rebuild roles from the server flags/);
});
