const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const KPT = require('../src/domain.js');

function environment() {
  const values = new Map(Object.entries({
    OWNER_EMAIL: 'owner@example.test', PRIVATE_SHEET_ID: 'private',
    ADMINS: '[]', TREASURER_EMAILS: '[]',
    OC_EMAILS: JSON.stringify(['oc@example.test', 'os@example.test', 'ot@example.test'])
  }));
  const counts = { loads: 0, writes: 0, locks: 0, saves: 0 };
  let email = 'oc@example.test';
  let state = KPT.empty();
  let serial = 0;
  const context = { actor: 'owner@example.test', now: '2026-10-26T00:00:00Z', uuid: () => 'live-' + ++serial };
  state = KPT.mutate(state, { action: 'createDocPackage', activityType: 'AGM', year: 2026, ocEmail: email, osEmail: 'os@example.test', otEmail: 'ot@example.test', revision: state.revision }, context);
  state = KPT.mutate(state, { action: 'createDocPackage', activityType: 'AGM', year: 2027, ocEmail: 'foreign@example.test', osEmail: 'foreign-os@example.test', otEmail: 'foreign-ot@example.test', revision: state.revision }, context);
  const propertyApi = {
    getProperty: key => values.get(key) ?? null,
    setProperty(key, value) { counts.writes++; values.set(key, String(value)); },
    deleteProperty(key) { counts.writes++; values.delete(key); }
  };
  const sandbox = {
    KPT, console,
    PropertiesService: { getScriptProperties: () => propertyApi },
    Session: { getActiveUser: () => ({ getEmail: () => email }), getEffectiveUser: () => ({ getEmail: () => email }) },
    LockService: { getScriptLock: () => ({ tryLock() { counts.locks++; return true; }, releaseLock() {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF-8' },
      computeDigest: (_, text) => [...crypto.createHash('sha256').update(String(text)).digest()],
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url')
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../apps-script/admin/Code.gs'), 'utf8'), sandbox);
  sandbox.book_ = () => ({});
  sandbox.loadState_ = () => { counts.loads++; return KPT.copy(state); };
  sandbox.hubLoadReadMap_ = () => ({});
  sandbox.writeSlot_ = (_, slot, next) => { counts.saves++; state = KPT.copy(next); };
  return { sandbox, values, counts, actor: value => { email = value; }, state: () => KPT.copy(state), reset: () => Object.keys(counts).forEach(key => counts[key] = 0) };
}

test('live probes after bootstrap are stable, read-only and never load business sheets or acquire a lock', () => {
  const env = environment();
  const initial = env.sandbox.rpc({ action: 'bootstrap' });
  assert.equal(initial.ok, true, initial.error);
  assert.ok(initial.data.changeKey);
  env.reset();
  for (let i = 0; i < 3; i++) {
    const response = env.sandbox.rpc({ action: 'liveProbe' });
    assert.equal(response.ok, true, response.error);
    assert.equal(response.data.changeKey, initial.data.changeKey);
    assert.equal('revision' in response.data, false);
    assert.equal('seq' in response.data, false);
    const payload = JSON.stringify(response.data);
    assert.equal(payload.includes('@'), false);
    assert.equal(payload.includes('DocItems'), false);
  }
  assert.deepEqual(env.counts, { loads: 0, writes: 0, locks: 0, saves: 0 });
});

test('live probe rejects unknown identities and ignores a client-supplied owner email', () => {
  const env = environment();
  env.actor('stranger@example.test');
  const response = env.sandbox.rpc({ action: 'liveProbe', email: 'owner@example.test' });
  assert.equal(response.ok, false);
  assert.match(response.error, /Access denied/);
  assert.equal(env.counts.saves, 0);
});

test('a successful business commit changes the live key, including a same-revision replacement', () => {
  const env = environment();
  const initial = env.sandbox.rpc({ action: 'bootstrap' }).data.changeKey;
  const next = env.state();
  next.revision++;
  env.sandbox.commit_(next);
  const after = env.sandbox.rpc({ action: 'liveProbe' }).data.changeKey;
  assert.notEqual(after, initial);
  env.sandbox.commit_(next);
  const replaced = env.sandbox.rpc({ action: 'liveProbe' }).data.changeKey;
  assert.notEqual(replaced, after);
});

test('permissions changing without business revision invalidate the key and update snapshot permissions', () => {
  const env = environment();
  const initial = env.sandbox.rpc({ action: 'bootstrap' });
  assert.equal(initial.data.user.admin, false);
  env.values.set('ADMINS', JSON.stringify(['oc@example.test']));
  const probe = env.sandbox.rpc({ action: 'liveProbe' });
  assert.notEqual(probe.data.changeKey, initial.data.changeKey);
  const snapshot = env.sandbox.rpc({ action: 'liveSnapshot' });
  assert.equal(snapshot.ok, true, snapshot.error);
  assert.equal(snapshot.data.user.admin, true);
  assert.equal(snapshot.data.state.revision, initial.data.state.revision);
});

test('live snapshots contain only the authenticated activity scope and do not write business data', () => {
  const env = environment();
  env.sandbox.rpc({ action: 'bootstrap' });
  env.reset();
  const response = env.sandbox.rpc({ action: 'liveSnapshot' });
  assert.equal(response.ok, true, response.error);
  assert.equal(response.data.state.DocPackages.length, 1);
  assert.equal(response.data.state.DocPackages[0].year, 2026);
  assert.equal(response.data.state.DocItems.every(row => row.packageId === response.data.state.DocPackages[0].id), true);
  assert.equal(JSON.stringify(response.data).includes('foreign@example.test'), false);
  assert.equal(env.counts.saves, 0);
  assert.equal(env.counts.writes, 0);
});
