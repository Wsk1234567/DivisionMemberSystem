const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const KPT = require('../src/domain.js');

function environment() {
  const fakeToken = '123456:test-only-not-a-real-bot-token';
  const props = new Map(Object.entries({ OWNER_EMAIL: 'owner@example.test', PRIVATE_SHEET_ID: 'private', TELEGRAM_BOT_TOKEN: fakeToken }));
  const slots = new Map();
  let held = false;
  let network = 0;
  let currentEmail = 'owner@example.test';
  const triggers = [];
  const state = KPT.upgradeState(KPT.empty());
  const book = { getSheetByName: name => slots.has(name.replace(/^Store/, '')) ? {} : null };
  const propertyApi = { getProperty: key => props.get(key) ?? null, setProperty: (key, value) => props.set(key, String(value)), deleteProperty: key => props.delete(key) };
  const sandbox = {
    KPT, console,
    PropertiesService: { getScriptProperties: () => propertyApi },
    Session: { getActiveUser: () => ({ getEmail: () => currentEmail }), getEffectiveUser: () => ({ getEmail: () => currentEmail }) },
    LockService: { getScriptLock: () => ({ tryLock() { if (held) throw new Error('Nested lock acquisition'); held = true; return true; }, releaseLock() { held = false; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF-8' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (_, value) => Array.from(new Int8Array(crypto.createHash('sha256').update(String(value)).digest())),
      computeHmacSha256Signature: (value, key) => Array.from(new Int8Array(crypto.createHmac('sha256', key).update(String(value)).digest()))
    },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      newTrigger: name => ({ timeBased() { return this; }, everyMinutes() { return this; }, create() { triggers.push({ getHandlerFunction: () => name }); } })
    },
    UrlFetchApp: { fetch() { network++; throw new Error('Unexpected HTTP call in RPC'); } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/admin/Code.gs'), 'utf8'), sandbox);
  sandbox.book_ = () => book;
  sandbox.loadState_ = () => KPT.copy(state);
  sandbox.writeSlot_ = (_, slot, value) => { slots.set(slot, KPT.copy(value)); };
  sandbox.readSlot_ = (_, slot) => { if (!slots.has(slot)) throw new Error('Data store is missing.'); return KPT.copy(slots.get(slot)); };
  sandbox.commit_ = () => { throw new Error('Telegram must not commit business state'); };
  sandbox.sync_ = () => { throw new Error('Telegram must not sync business state'); };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/admin/Telegram.gs'), 'utf8'), sandbox);
  return { sandbox, slots, props, fakeToken, state, held: () => held, network: () => network, actor: email => { currentEmail = email; } };
}

test('real Admin RPC routes Telegram actions under one lock without HTTP or business writes', () => {
  const env = environment();
  assert.equal(env.network(), 0);
  const status = env.sandbox.rpc({ action: 'getTelegramStatus', email: 'spoofed@example.test' });
  assert.equal(status.ok, true, status.error);
  assert.equal(status.data.configured, true);
  assert.equal(env.slots.size, 0, 'Status does not create store sheets.');
  const created = env.sandbox.rpc({ action: 'createTelegramBinding' });
  assert.equal(created.ok, true, created.error);
  assert.equal(created.data.botUsername, 'tccdnotifybot');
  const code = new URL(created.data.binding.url).searchParams.get('start');
  assert.match(code, /^[0-9a-f]{64}$/);
  const persisted = JSON.stringify([...env.slots.values()]);
  assert.equal(persisted.includes(code), false);
  assert.equal(persisted.includes(env.fakeToken), false);
  assert.equal(env.network(), 0);
  assert.equal(env.state.revision, 0);
  assert.equal(env.held(), false);
});

test('unknown signed-in identities cannot use Telegram binding endpoints', () => {
  const env = environment();
  env.actor('stranger@example.test');
  const response = env.sandbox.rpc({ action: 'createTelegramBinding', email: 'owner@example.test' });
  assert.equal(response.ok, false);
  assert.equal(env.slots.size, 0);
  assert.equal(env.network(), 0);
});

test('an idle Telegram worker does not create or rewrite private store slots', () => {
  const env = environment();
  env.sandbox.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, result: [] }) });
  const result = env.sandbox.TCCDTelegram.process();
  assert.equal(result.sent, 0);
  assert.equal(env.slots.size, 0);
  assert.equal(env.state.revision, 0);
  assert.equal(env.held(), false);
});
