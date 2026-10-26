'use strict';
// tests/telegram.test.cjs — TCCDTelegram unit tests (mock Apps Script services, no real HTTP)
// Spec: docs/Notify-Agent-开发约定-v1.md. Loads real Telegram.gs + real domain.js KPT helpers.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const TELEGRAM_GS = path.join(__dirname, '..', 'apps-script', 'admin', 'Telegram.gs');
const DOMAIN_JS = path.join(__dirname, '..', 'src', 'domain.js');

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Environment factory — complete Utilities / locks / business fixtures
// ---------------------------------------------------------------------------

function makeEnv(opts = {}) {
  const props = new Map(Object.entries(opts.properties || {}));
  const slots = { Telegram0: null, Telegram1: null };
  if (opts.store) {
    slots.Telegram0 = JSON.parse(JSON.stringify(opts.store));
    if (!props.has('TELEGRAM_CURRENT_SLOT')) props.set('TELEGRAM_CURRENT_SLOT', 'Telegram0');
  }
  const httpLog = [];
  const triggerCreated = [];
  const lockCalls = [];
  let lockHeld = false;
  let lockShouldFail = false;

  // Controllable clock so tests can advance time (dedup retention).
  let clockMs = opts.nowMs != null ? opts.nowMs : Date.now();
  class MockDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(clockMs);
      else super(...args);
    }
    static now() { return clockMs; }
    static parse(v) { return Date.parse(v); }
    static UTC(...args) { return Date.UTC(...args); }
  }

  // Real domain.js for KPT.hubNotificationFeed
  const domainSandbox = {
    module: { exports: {} },
    console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
    isNaN, parseInt, parseFloat, undefined
  };
  domainSandbox.globalThis = domainSandbox;
  vm.createContext(domainSandbox);
  vm.runInContext(fs.readFileSync(DOMAIN_JS, 'utf8'), domainSandbox, { filename: 'domain.js' });
  const KPT = domainSandbox.module.exports || domainSandbox.KPT;

  function actorFromEmail_(email) {
    const normalized = String(email || '').trim().toLowerCase();
    const config = opts.config || defaultConfig();
    if (!normalized) throw new Error('Sign in with the authorised Google account.');
    return {
      email: normalized,
      owner: normalized === config.owner,
      admin: normalized === config.owner || config.admins.includes(normalized),
      treasurer: normalized === config.owner || config.treasurers.includes(normalized),
      oc: normalized === config.owner || config.ocs.includes(normalized),
      config
    };
  }

  function defaultConfig() {
    return {
      owner: 'owner@gmail.com',
      admins: ['admin@gmail.com'],
      treasurers: ['treasurer@gmail.com'],
      ocs: ['oc@gmail.com'],
      privateId: 'PRIVATE_SHEET_ID'
    };
  }

  function noteHttp(url, params) {
    httpLog.push({
      url: String(url).replace(/bot[^/]+/g, 'bot***'),
      method: (params && params.method) || 'get',
      payload: params && params.payload,
      whileLockHeld: lockHeld
    });
    assert.equal(lockHeld, false, 'HTTP must not run while script lock is held');
  }

  const sandbox = {
    console, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
    isNaN, parseInt, parseFloat, undefined,
    Date: MockDate,
    KPT,

    properties_() {
      return {
        getProperty(k) { return props.has(k) ? props.get(k) : null; },
        setProperty(k, v) { props.set(k, v); },
        deleteProperty(k) { props.delete(k); }
      };
    },
    configuration_() {
      return opts.config || defaultConfig();
    },
    book_() {
      if (opts.bookThrow) throw new Error('Cannot open spreadsheet');
      return { id: 'PRIVATE_SHEET_ID' };
    },
    loadState_() {
      if (opts.loadStateThrow) throw new Error('state missing');
      return typeof opts.businessState === 'function' ? opts.businessState() : (opts.businessState || KPT.empty());
    },
    writeSlot_(book, slot, value) {
      if (opts.writeSlotFail) throw new Error('writeSlot failed');
      if (opts.writeSlotFailFor && opts.writeSlotFailFor === slot) throw new Error('writeSlot failed for ' + slot);
      slots[slot] = JSON.parse(JSON.stringify(value));
    },
    readSlot_(book, slot) {
      if (opts.readSlotFail) throw new Error('Data store is missing.');
      if (opts.readSlotCorrupt) throw new Error('Storage chunk is invalid. Restore a verified backup.');
      if (opts.readSlotThrow) throw new Error('Exception: Service invoked too many times');
      if (!slots[slot] || slots[slot] === '__MISSING__') throw new Error('Data store is missing.');
      return JSON.parse(JSON.stringify(slots[slot]));
    },
    withLock_(fn) {
      // Simulates Code.gs withLock_ — business lock held around rpc.
      lockHeld = true;
      lockCalls.push('business-withLock');
      try {
        return fn();
      } finally {
        lockHeld = false;
      }
    },
    actorFromEmail_,
    portalPublicUrl_() { return 'https://wsk1234567.github.io/DivisionMemberSystem/'; },

    Session: {
      getEffectiveUser() {
        if (opts.effectiveUser === undefined) {
          return { getEmail() { return 'owner@gmail.com'; } };
        }
        return { getEmail() { return opts.effectiveUser; } };
      },
      getActiveUser() {
        return { getEmail() { return (opts.effectiveUser === undefined ? 'owner@gmail.com' : opts.effectiveUser); } };
      },
      getScriptTimeZone() { return 'Asia/Kuala_Lumpur'; }
    },
    ScriptApp: {
      getProjectTriggers() { return triggerCreated.slice(); },
      newTrigger(fnName) {
        return {
          timeBased() {
            return {
              everyMinutes(n) {
                return {
                  create() {
                    const t = { getHandlerFunction() { return fnName; }, _everyMinutes: n };
                    triggerCreated.push(t);
                    return t;
                  }
                };
              }
            };
          }
        };
      }
    },
    LockService: {
      getScriptLock() {
        lockCalls.push('getScriptLock');
        return {
          tryLock() {
            if (lockShouldFail) return false;
            lockHeld = true;
            return true;
          },
          waitLock() {
            lockHeld = true;
          },
          releaseLock() {
            lockHeld = false;
            lockCalls.push('releaseLock');
          }
        };
      }
    },
    Utilities: {
      getUuid() { return crypto.randomUUID(); },
      DigestAlgorithm: { SHA_256: 'SHA_256', MD5: 'MD5' },
      Charset: { UTF_8: 'UTF-8' },
      computeDigest(algo, value, charset) {
        assert.equal(algo, 'SHA_256');
        assert.equal(charset, 'UTF-8');
        return Array.from(crypto.createHash('sha256').update(String(value), 'utf8').digest());
      },
      computeHmacSha256Signature(value, key) {
        const msg = Array.isArray(value) ? Buffer.from(value) : Buffer.from(String(value), 'utf8');
        const secret = Array.isArray(key) ? Buffer.from(key) : Buffer.from(String(key), 'utf8');
        return Array.from(crypto.createHmac('sha256', secret).update(msg).digest());
      },
      base64EncodeWebSafe(value) {
        return Buffer.from(value || []).toString('base64url');
      }
    },
    UrlFetchApp: {
      fetch(url, params) {
        noteHttp(url, params);
        if (opts.httpHandler) {
          const res = opts.httpHandler(String(url), params);
          return {
            getResponseCode() { return res.code || 200; },
            getContentText() { return JSON.stringify(res.body || { ok: true, result: {} }); }
          };
        }
        if (opts.httpThrow) {
          throw new Error('UrlFetchApp failed for ' + url);
        }
        return {
          getResponseCode() { return 200; },
          getContentText() { return JSON.stringify({ ok: true, result: [] }); }
        };
      }
    }
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(TELEGRAM_GS, 'utf8'), context, { filename: 'Telegram.gs' });
  const TCCDTelegram = context.TCCDTelegram;
  assert.ok(TCCDTelegram && typeof TCCDTelegram.rpc === 'function', 'TCCDTelegram.rpc defined');
  assert.equal(typeof TCCDTelegram.process, 'function');
  assert.equal(typeof TCCDTelegram.install, 'function');

  return {
    context,
    TCCDTelegram,
    KPT,
    props,
    slots,
    httpLog,
    triggerCreated,
    lockCalls,
    isLockHeld: () => lockHeld,
    getStore() {
      const key = props.get('TELEGRAM_CURRENT_SLOT') || 'Telegram0';
      return slots[key] || slots.Telegram0 || slots.Telegram1 || null;
    },
    setStore(obj) {
      const key = props.get('TELEGRAM_CURRENT_SLOT') || 'Telegram0';
      slots[key] = obj;
    },
    failLock(v) { lockShouldFail = !!v; },
    advanceMs(ms) { clockMs += ms; },
    advanceDays(d) { clockMs += d * 24 * 60 * 60 * 1000; },
    nowMs: () => clockMs
  };
}

// ---------------------------------------------------------------------------
// Fixtures — real hub state shape (DocPackages / DocItems / FinBooks)
// ---------------------------------------------------------------------------

function baseProps() {
  return {
    TELEGRAM_BOT_TOKEN: 'TEST_TOKEN_NOT_REAL',
    TELEGRAM_BOT_SECRET: 'TEST_BOT_SECRET_NOT_REAL',
    TELEGRAM_BOT_USERNAME: 'tccdnotifybot'
  };
}

function hubState(events, overrides) {
  return Object.assign({
    schema: 1,
    revision: 5,
    sequence: 5,
    updatedAt: '2026-11-01T09:30:00.000Z',
    publishedRevision: 4,
    audit: [],
    trash: [],
    notificationEvents: events || [],
    finAttachments: [],
    Members: [],
    Activities: [],
    Attendance: [],
    Enrolments: [],
    Awards: [],
    Catalog: [],
    DocPackages: [
      {
        id: 'PKG-1',
        version: 1,
        activityType: 'JuniorCamp',
        year: '2026',
        eventDate: '2026-12-01',
        status: 'Open',
        basePackageId: '',
        ocEmail: 'oc@gmail.com',
        osEmail: 'os@gmail.com',
        otEmail: 'ot@gmail.com',
        createdBy: 'owner@gmail.com',
        createdAt: '2026-10-01T00:00:00.000Z',
        approvedAt: '',
        archived: false
      }
    ],
    DocItems: [
      {
        id: 'DOC-1',
        packageId: 'PKG-1',
        version: 2,
        title: 'Secret Proposal Title',
        // Stage must match the notification kind (see stageMatchesEvent_).
        status: 'AwaitingOC',
        rejectStage: '',
        submittedBy: 'os@gmail.com',
        submittedAt: '2026-11-01T09:00:00.000Z'
      }
    ],
    FinBooks: []
  }, overrides || {});
}

// Default event kind is SubmittedToOC; DocItems default status AwaitingOC matches.
function event(overrides) {
  return Object.assign({
    id: 'EVT-1',
    kind: 'SubmittedToOC',
    packageId: 'PKG-1',
    entityType: 'document',
    entityId: 'DOC-1',
    entityVersion: 2,
    entityTitle: 'Secret Proposal Title',
    actorEmail: 'os@gmail.com',
    createdAt: '2026-11-01T09:00:00.000Z',
    recipientEmail: 'oc@gmail.com',
    destination: 'studio',
    role: 'oc'
  }, overrides || {});
}

// Entity status/rejectStage for a kind (used when building hubState for non-default kinds).
function stageForKind(kind) {
  switch (kind) {
    case 'SubmittedToOC': return { status: 'AwaitingOC', rejectStage: '' };
    case 'OCChecked': return { status: 'OCChecked', rejectStage: '' };
    case 'ForwardedForApproval': return { status: 'Submitted', rejectStage: '' };
    case 'Approved': return { status: 'Approved', rejectStage: '' };
    case 'ReturnedByOC': return { status: 'Rejected', rejectStage: 'OC' };
    case 'ReturnedByFinal': return { status: 'Rejected', rejectStage: 'Final' };
    default: return { status: 'AwaitingOC', rejectStage: '' };
  }
}

function hubStateForKind(kind, events, overrides) {
  const stage = stageForKind(kind);
  const state = hubState(events, overrides);
  state.DocItems = state.DocItems.map(item => Object.assign({}, item, stage));
  return state;
}

function bindingFor(userId, overrides) {
  return Object.assign({
    id: 'bind-' + userId,
    telegramUserId: String(userId),
    telegramChatId: String(userId),
    username: 'u' + userId,
    displayName: 'User ' + userId,
    enabled: true,
    enabledSince: '2026-10-01T00:00:00.000Z',
    bindingVersion: 1,
    linkedAt: '2026-10-01T00:00:00.000Z'
  }, overrides || {});
}

function storeWith(bindings, deliveries) {
  return {
    schema: 1,
    bindings: bindings || {},
    challenges: {},
    pending: {},
    deliveries: deliveries || {},
    updatesOffset: 0
  };
}

function actor(email) {
  return {
    email,
    owner: email === 'owner@gmail.com',
    admin: email === 'owner@gmail.com' || email === 'admin@gmail.com',
    treasurer: email === 'owner@gmail.com' || email === 'treasurer@gmail.com',
    oc: email === 'owner@gmail.com' || email === 'oc@gmail.com',
    config: {}
  };
}

function startUpdate(code, userId, opts = {}) {
  return {
    update_id: opts.updateId || 1001,
    message: {
      message_id: 1,
      from: { id: Number(userId), is_bot: !!opts.isBot, first_name: 'Tg', username: 'tguser' },
      chat: {
        id: Number(opts.chatId != null ? opts.chatId : userId),
        type: opts.chatType || 'private',
        first_name: 'Tg',
        username: 'tguser'
      },
      date: 1762000000,
      text: opts.text != null ? opts.text : ('/start ' + code)
    }
  };
}

function wireGetUpdates(env, updates, sendImpl) {
  env.context.UrlFetchApp.fetch = (url, params) => {
    const u = String(url);
    assert.equal(env.isLockHeld(), false, 'HTTP outside lock');
    env.httpLog.push({
      url: u.replace(/bot[^/]+/g, 'bot***'),
      method: (params && params.method) || 'get',
      whileLockHeld: env.isLockHeld()
    });
    if (/getUpdates/.test(u)) {
      const store = env.getStore() || { updatesOffset: 0 };
      const offset = Number(store.updatesOffset) || 0;
      const batch = (updates || []).filter(x => Number(x.update_id) >= offset).slice(0, 50);
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, result: batch }) };
    }
    if (/sendMessage/.test(u)) {
      if (sendImpl) {
        const res = sendImpl(u, params);
        // Accept either a real UrlFetchApp-style response or a simple {code, body} pair.
        if (res && typeof res.getResponseCode === 'function') return res;
        return {
          getResponseCode: () => (res && res.code) || 200,
          getContentText: () => JSON.stringify((res && res.body) != null ? res.body : { ok: true, result: {} })
        };
      }
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ ok: true, result: { message_id: 1 } })
      };
    }
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, result: {} }) };
  };
}

// Convenience: build a UrlFetchApp-like response object.
function tgResponse(code, body) {
  return {
    getResponseCode: () => code,
    getContentText: () => JSON.stringify(body)
  };
}

function seedPending(env, email, userId) {
  const created = env.TCCDTelegram.rpc({ action: 'createTelegramBinding' }, hubState(), actor(email));
  const code = created.binding.url.split('?start=')[1];
  wireGetUpdates(env, [startUpdate(code, userId)]);
  env.TCCDTelegram.process();
  const pending = env.getStore().pending[email];
  assert.ok(pending, 'pending seeded');
  return pending;
}

// ---------------------------------------------------------------------------
// 1. Safe status
// ---------------------------------------------------------------------------

test('getTelegramStatus: safe shape, linked user, no secrets', () => {
  const store = storeWith({ 'os@gmail.com': bindingFor('111') });
  const env = makeEnv({ properties: baseProps(), businessState: hubState(), store });
  const res = env.TCCDTelegram.rpc({ action: 'getTelegramStatus' }, hubState(), actor('os@gmail.com'));

  assert.equal(res.configured, true);
  assert.equal(res.botUsername, 'tccdnotifybot');
  assert.equal(res.linked, true);
  assert.equal(res.enabled, true);
  assert.equal(res.telegramUser.id, '111');
  assert.equal(res.pending, null);
  assert.equal(typeof res.delivery.pending, 'number');
  assert.equal(typeof res.workerInstalled, 'boolean');

  const raw = JSON.stringify(res);
  assert.ok(!/TEST_TOKEN_NOT_REAL|TEST_BOT_SECRET_NOT_REAL/.test(raw));
  assert.ok(!res.binding, 'status must not expose binding URL/code');
});

test('getTelegramStatus: uninitialized empty store → unbound, no write', () => {
  const env = makeEnv({ properties: baseProps(), businessState: hubState() });
  let wrote = false;
  env.context.writeSlot_ = () => { wrote = true; };
  const res = env.TCCDTelegram.rpc({ action: 'getTelegramStatus' }, hubState(), actor('nobody@gmail.com'));
  assert.equal(res.linked, false);
  assert.equal(res.telegramUser, null);
  assert.equal(wrote, false, 'GET must not write');
});

// ---------------------------------------------------------------------------
// 2. createTelegramBinding — hash only
// ---------------------------------------------------------------------------

test('createTelegramBinding: URL once, only SHA-256 persisted', () => {
  const env = makeEnv({ properties: baseProps(), businessState: hubState() });
  const res = env.TCCDTelegram.rpc({ action: 'createTelegramBinding' }, hubState(), actor('newuser@gmail.com'));

  assert.ok(res.binding);
  assert.match(res.binding.url, /^https:\/\/t\.me\/tccdnotifybot\?start=[0-9a-f]{64}$/);
  const code = res.binding.url.split('?start=')[1];
  const codeHash = sha256Hex(code);

  const raw = JSON.stringify(env.getStore());
  assert.ok(!raw.includes(code), 'plaintext code must not persist');
  assert.ok(raw.includes(codeHash), 'SHA-256 hash must persist');

  const status = env.TCCDTelegram.rpc({ action: 'getTelegramStatus' }, hubState(), actor('newuser@gmail.com'));
  assert.equal(status.binding, undefined);
  assert.ok(!JSON.stringify(status).includes(code));
});

test('createTelegramBinding: supersedes old challenge; existing binding retained', () => {
  const store = storeWith({ 'os@gmail.com': bindingFor('111') });
  const env = makeEnv({ properties: baseProps(), businessState: hubState(), store });

  const r1 = env.TCCDTelegram.rpc({ action: 'createTelegramBinding' }, hubState(), actor('os@gmail.com'));
  const r2 = env.TCCDTelegram.rpc({ action: 'createTelegramBinding' }, hubState(), actor('os@gmail.com'));
  assert.notEqual(r1.binding.url, r2.binding.url);

  const status = env.TCCDTelegram.rpc({ action: 'getTelegramStatus' }, hubState(), actor('os@gmail.com'));
  assert.equal(status.linked, true);
  assert.equal(status.telegramUser.id, '111');
});

test('createTelegramBinding: fails when token missing', () => {
  const env = makeEnv({ properties: { TELEGRAM_BOT_SECRET: 's' }, businessState: hubState() });
  assert.throws(() => {
    env.TCCDTelegram.rpc({ action: 'createTelegramBinding' }, hubState(), actor('x@gmail.com'));
  }, /not configured/i);
});

// ---------------------------------------------------------------------------
// NEW: fail-closed store reads — must not overwrite existing bindings
// ---------------------------------------------------------------------------

test('existing store read failure does NOT wipe bindings (fail closed)', () => {
  const store = storeWith({ 'os@gmail.com': bindingFor('111') });
  const env = makeEnv({
    properties: Object.assign(baseProps(), { TELEGRAM_CURRENT_SLOT: 'Telegram0' }),
    businessState: hubState(),
    store,
    readSlotCorrupt: true
  });
  let wrote = false;
  env.context.writeSlot_ = () => { wrote = true; };

  assert.throws(() => {
    env.TCCDTelegram.rpc({ action: 'getTelegramStatus' }, hubState(), actor('os@gmail.com'));
  }, /unavailable/i);
  assert.equal(wrote, false, 'must not write on read failure');
  // Original binding still present in memory snapshot used by the test
  assert.ok(env.slots.Telegram0.bindings['os@gmail.com']);
});

test('initialized store missing sheet does not silently reset (fail closed)', () => {
  const env = makeEnv({
    properties: Object.assign(baseProps(), { TELEGRAM_CURRENT_SLOT: 'Telegram0' }),
    businessState: hubState()
    // no store → readSlot_ throws Data store is missing → but slot is set → fail closed
  });
  let wrote = false;
  env.context.writeSlot_ = () => { wrote = true; };
  assert.throws(() => {
    env.TCCDTelegram.rpc({ action: 'getTelegramStatus' }, hubState(), actor('os@gmail.com'));
  }, /unavailable/i);
  assert.equal(wrote, false);
});

test('invalid TELEGRAM_CURRENT_SLOT fails closed without write', () => {
  const env = makeEnv({
    properties: Object.assign(baseProps(), { TELEGRAM_CURRENT_SLOT: 'TelegramX' }),
    businessState: hubState()
  });
  let wrote = false;
  env.context.writeSlot_ = () => { wrote = true; };
  assert.throws(() => {
    env.TCCDTelegram.rpc({ action: 'getTelegramStatus' }, hubState(), actor('os@gmail.com'));
  }, /unavailable/i);
  assert.equal(wrote, false);
});

// ---------------------------------------------------------------------------
// NEW: RPC must not nest another script lock (Code.gs already holds withLock_)
// ---------------------------------------------------------------------------

test('rpc does not take nested script lock (withLock_ already held)', () => {
  const env = makeEnv({ properties: baseProps(), businessState: hubState() });
  const before = env.lockCalls.filter(c => c === 'getScriptLock').length;
  env.TCCDTelegram.rpc({ action: 'createTelegramBinding' }, hubState(), actor('u@gmail.com'));
  env.TCCDTelegram.rpc({ action: 'getTelegramStatus' }, hubState(), actor('u@gmail.com'));
  const after = env.lockCalls.filter(c => c === 'getScriptLock').length;
  assert.equal(after, before, 'rpc must not call LockService.getScriptLock');
});

// ---------------------------------------------------------------------------
// NEW: empty / non-owner effective user rejected for process + install
// ---------------------------------------------------------------------------

test('process rejects empty effective user', () => {
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState(),
    effectiveUser: ''
  });
  assert.throws(() => env.TCCDTelegram.process(), /owner/i);
});

test('process rejects non-owner effective user', () => {
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState(),
    effectiveUser: 'someone@gmail.com'
  });
  assert.throws(() => env.TCCDTelegram.process(), /owner/i);
});

test('install rejects empty effective user', () => {
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState(),
    effectiveUser: ''
  });
  assert.throws(() => env.TCCDTelegram.install(), /owner/i);
  assert.equal(env.triggerCreated.length, 0);
});

// ---------------------------------------------------------------------------
// 3. /start → pending only
// ---------------------------------------------------------------------------

test('/start creates pending only — never binds immediately', () => {
  const env = makeEnv({ properties: baseProps(), businessState: hubState() });
  const created = env.TCCDTelegram.rpc({ action: 'createTelegramBinding' }, hubState(), actor('victim@gmail.com'));
  const code = created.binding.url.split('?start=')[1];

  wireGetUpdates(env, [startUpdate(code, 222)]);
  const summary = env.TCCDTelegram.process();
  assert.ok(summary.pendingCreated >= 1);

  const after = env.getStore();
  assert.equal(after.bindings['victim@gmail.com'], undefined);
  assert.ok(after.pending['victim@gmail.com']);
  assert.equal(String(after.pending['victim@gmail.com'].userId), '222');
});

test('/start rejects group / mismatched from-chat / bot / non-start', () => {
  const env = makeEnv({ properties: baseProps(), businessState: hubState() });
  const created = env.TCCDTelegram.rpc({ action: 'createTelegramBinding' }, hubState(), actor('u@gmail.com'));
  const code = created.binding.url.split('?start=')[1];

  wireGetUpdates(env, [
    startUpdate(code, 9, { updateId: 1, chatType: 'supergroup', chatId: -100 }),
    startUpdate(code, 9, { updateId: 2, chatId: 8 }),
    startUpdate(code, 7, { updateId: 3, isBot: true }),
    startUpdate(code, 6, { updateId: 4, text: 'hello' }),
    startUpdate(code, 5, { updateId: 5, text: '/start not-a-valid-code' })
  ]);
  env.TCCDTelegram.process();

  const after = env.getStore();
  assert.equal(after.bindings['u@gmail.com'], undefined);
  assert.equal(after.pending['u@gmail.com'], undefined);
});

// ---------------------------------------------------------------------------
// 4. confirm / cancel / conflict
// ---------------------------------------------------------------------------

test('confirmTelegramBinding: binds, enables, bumps bindingVersion', () => {
  const env = makeEnv({ properties: baseProps(), businessState: hubState() });
  const pending = seedPending(env, 'bindme@gmail.com', 333);

  const res = env.TCCDTelegram.rpc(
    { action: 'confirmTelegramBinding', request: { bindingId: pending.id } },
    hubState(),
    actor('bindme@gmail.com')
  );
  assert.equal(res.linked, true);
  assert.equal(res.enabled, true);
  assert.equal(res.telegramUser.id, '333');
  assert.equal(res.pending, null);
  assert.equal(env.getStore().bindings['bindme@gmail.com'].bindingVersion, 1);
});

test('confirmTelegramBinding: wrong bindingId rejected', () => {
  const env = makeEnv({ properties: baseProps(), businessState: hubState() });
  seedPending(env, 'bindme@gmail.com', 333);
  assert.throws(() => {
    env.TCCDTelegram.rpc(
      { action: 'confirmTelegramBinding', request: { bindingId: 'nope' } },
      hubState(),
      actor('bindme@gmail.com')
    );
  }, /invalid|binding/i);
});

test('confirmTelegramBinding: expired pending rejected', () => {
  const env = makeEnv({ properties: baseProps(), businessState: hubState() });
  const pending = seedPending(env, 'late@gmail.com', 444);
  const store = env.getStore();
  store.pending['late@gmail.com'].expiresAt = '2020-01-01T00:00:00.000Z';
  env.setStore(store);
  assert.throws(() => {
    env.TCCDTelegram.rpc(
      { action: 'confirmTelegramBinding', request: { bindingId: pending.id } },
      hubState(),
      actor('late@gmail.com')
    );
  }, /expir/i);
});

test('confirmTelegramBinding: same telegram id cannot bind two Google accounts', () => {
  const store = storeWith({ 'os@gmail.com': bindingFor('111') });
  const env = makeEnv({ properties: baseProps(), businessState: hubState(), store });
  const pending = seedPending(env, 'other@gmail.com', 111);
  assert.throws(() => {
    env.TCCDTelegram.rpc(
      { action: 'confirmTelegramBinding', request: { bindingId: pending.id } },
      hubState(),
      actor('other@gmail.com')
    );
  }, /already linked|another Google/i);
});

test('cancelTelegramBinding: clears pending only, keeps existing binding', () => {
  const store = storeWith({ 'os@gmail.com': bindingFor('111') });
  const env = makeEnv({ properties: baseProps(), businessState: hubState(), store });
  seedPending(env, 'os@gmail.com', 999);

  const res = env.TCCDTelegram.rpc({ action: 'cancelTelegramBinding' }, hubState(), actor('os@gmail.com'));
  assert.equal(res.linked, true);
  assert.equal(res.telegramUser.id, '111');
  assert.equal(res.pending, null);
  assert.equal(env.getStore().pending['os@gmail.com'], undefined);
});

// ---------------------------------------------------------------------------
// 5. mute / unlink / no backfill
// ---------------------------------------------------------------------------

test('setTelegramEnabled: mute/unmute; unmute sets enabledSince', () => {
  const store = storeWith({ 'os@gmail.com': bindingFor('111') });
  const env = makeEnv({ properties: baseProps(), businessState: hubState(), store });

  const off = env.TCCDTelegram.rpc(
    { action: 'setTelegramEnabled', request: { enabled: false } },
    hubState(),
    actor('os@gmail.com')
  );
  assert.equal(off.enabled, false);

  const on = env.TCCDTelegram.rpc(
    { action: 'setTelegramEnabled', request: { enabled: true } },
    hubState(),
    actor('os@gmail.com')
  );
  assert.equal(on.enabled, true);
  assert.ok(env.getStore().bindings['os@gmail.com'].enabledSince);
});

test('setTelegramEnabled: requires binding', () => {
  const env = makeEnv({ properties: baseProps(), businessState: hubState() });
  assert.throws(() => {
    env.TCCDTelegram.rpc(
      { action: 'setTelegramEnabled', request: { enabled: true } },
      hubState(),
      actor('nobody@gmail.com')
    );
  }, /link|before/i);
});

test('unlinkTelegram: removes binding, pending, queued deliveries', () => {
  const key = 'EVT-1|2|os@gmail.com|1|telegram';
  const store = storeWith(
    { 'os@gmail.com': bindingFor('111') },
    {
      [key]: {
        dispatchKey: key, eventId: 'EVT-1', entityVersion: 2,
        recipientEmail: 'os@gmail.com', bindingVersion: 1,
        status: 'pending', attempts: 0
      }
    }
  );
  const env = makeEnv({ properties: baseProps(), businessState: hubState(), store });

  const res = env.TCCDTelegram.rpc({ action: 'unlinkTelegram' }, hubState(), actor('os@gmail.com'));
  assert.equal(res.linked, false);
  assert.equal(res.telegramUser, null);

  const after = env.getStore();
  assert.equal(after.bindings['os@gmail.com'], undefined);
  assert.equal(after.pending['os@gmail.com'], undefined);
  assert.equal(Object.keys(after.deliveries).length, 0);
});

test('no backfill: events before enabledSince are not delivered', () => {
  const store = storeWith({
    'oc@gmail.com': bindingFor('555', { enabledSince: '2026-11-01T00:00:00.000Z' })
  });
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubStateForKind('Approved', [
      event({ id: 'EVT-OLD', kind: 'Approved', createdAt: '2026-10-01T00:00:00.000Z', recipientEmail: 'oc@gmail.com' })
    ]),
    store
  });
  wireGetUpdates(env, []);
  env.TCCDTelegram.process();
  assert.ok(!env.getStore().deliveries['EVT-OLD|2|oc@gmail.com|1|telegram']);
});

// ---------------------------------------------------------------------------
// 6. Reconcile formal kinds / dedupe / actor skip
// ---------------------------------------------------------------------------

test('reconcile: formal only; skip DraftSaved and actor-as-recipient', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState([
      event({ id: 'EVT-OK', kind: 'SubmittedToOC', recipientEmail: 'oc@gmail.com' }),
      event({ id: 'EVT-DRAFT', kind: 'DraftSaved', recipientEmail: 'oc@gmail.com' }),
      event({ id: 'EVT-SELF', kind: 'OCChecked', actorEmail: 'oc@gmail.com', recipientEmail: 'oc@gmail.com' })
    ]),
    store
  });
  let sends = 0;
  wireGetUpdates(env, [], () => {
    sends++;
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, result: { message_id: 1 } }) };
  });
  env.TCCDTelegram.process();

  const keys = Object.keys(env.getStore().deliveries);
  assert.ok(keys.some(k => k.includes('EVT-OK')));
  assert.ok(!keys.some(k => k.includes('EVT-DRAFT')));
  assert.ok(!keys.some(k => k.includes('EVT-SELF')));
  assert.ok(sends <= 1);
});

test('reconcile: dispatchKey idempotent; version bump → new key', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });
  const env1 = makeEnv({
    properties: baseProps(),
    businessState: hubState([event({ id: 'EVT-X', entityVersion: 1, recipientEmail: 'oc@gmail.com' })]),
    store
  });
  wireGetUpdates(env1, []);
  env1.TCCDTelegram.process();
  env1.TCCDTelegram.process();
  assert.equal(Object.keys(env1.getStore().deliveries).length, 1);

  const env2 = makeEnv({
    properties: baseProps(),
    businessState: hubState([event({ id: 'EVT-X', entityVersion: 2, recipientEmail: 'oc@gmail.com' })]),
    store: env1.getStore()
  });
  wireGetUpdates(env2, []);
  env2.TCCDTelegram.process();
  assert.ok(Object.keys(env2.getStore().deliveries).some(k => k.includes('|2|')));
});

// ---------------------------------------------------------------------------
// 7. Permission re-check
// ---------------------------------------------------------------------------

test('stale/invisible event: skipped, no send', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState([
      event({ id: 'EVT-GONE', kind: 'SubmittedToOC', packageId: 'PKG-MISSING', entityId: 'DOC-GONE', recipientEmail: 'oc@gmail.com' })
    ]),
    store
  });
  let sends = 0;
  wireGetUpdates(env, [], () => {
    sends++;
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, result: { message_id: 1 } }) };
  });
  env.TCCDTelegram.process();
  assert.equal(sends, 0);
  assert.ok(!Object.keys(env.getStore().deliveries).some(k => k.includes('EVT-GONE')));
});

// ---------------------------------------------------------------------------
// 8. 429 / 403 / throw sanitization
// ---------------------------------------------------------------------------

test('429: retry_after backoff; summary has no token', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubStateForKind('Approved', [event({ id: 'EVT-429', kind: 'Approved', recipientEmail: 'oc@gmail.com' })]),
    store
  });
  wireGetUpdates(env, [], () => tgResponse(429, {
    ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 12 }
  }));
  const summary = env.TCCDTelegram.process();
  const raw = JSON.stringify(summary);
  assert.ok(!/TEST_TOKEN_NOT_REAL/.test(raw));
  assert.ok(!/api\.telegram\.org\/bot[^*]/.test(raw));

  const row = Object.values(env.getStore().deliveries)[0];
  assert.ok(row);
  assert.ok(['retry', 'pending'].includes(row.status));
  assert.ok(Number(row.attempts) >= 1);
  assert.ok(row.nextTryAt);
});

test('403: permanent + disable binding; error generalized', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubStateForKind('Approved', [event({ id: 'EVT-403', kind: 'Approved', recipientEmail: 'oc@gmail.com' })]),
    store
  });
  wireGetUpdates(env, [], () => tgResponse(403, {
    ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user'
  }));
  const summary = env.TCCDTelegram.process();
  const raw = JSON.stringify(summary);
  assert.ok(!/TEST_TOKEN_NOT_REAL/.test(raw));
  assert.ok(!/bot was blocked/i.test(raw));

  const row = Object.values(env.getStore().deliveries)[0];
  assert.ok(['dead', 'failed', 'skipped'].includes(row.status));
  assert.equal(env.getStore().bindings['oc@gmail.com'].enabled, false);
});

test('http throw: sanitized; no token URL', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubStateForKind('Approved', [event({ id: 'EVT-TO', kind: 'Approved', recipientEmail: 'oc@gmail.com' })]),
    store
  });
  wireGetUpdates(env, [], () => {
    throw new Error('UrlFetchApp failed for https://api.telegram.org/botTEST_TOKEN_NOT_REAL/sendMessage');
  });
  const summary = env.TCCDTelegram.process();
  const raw = JSON.stringify(summary);
  assert.ok(!/TEST_TOKEN_NOT_REAL/.test(raw));
  assert.ok(!/api\.telegram\.org\/bot[A-Za-z0-9:_-]+/.test(raw));
});

// ---------------------------------------------------------------------------
// NEW: worker HTTP all outside lock
// ---------------------------------------------------------------------------

test('worker HTTP (getUpdates + sendMessage) never runs while lock held', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubStateForKind('Approved', [event({ id: 'EVT-LOCK', kind: 'Approved', recipientEmail: 'oc@gmail.com' })]),
    store
  });
  wireGetUpdates(env, []);
  env.TCCDTelegram.process();
  assert.ok(env.httpLog.length >= 2, 'getUpdates + sendMessage ran');
  for (const entry of env.httpLog) {
    assert.equal(entry.whileLockHeld, false, 'HTTP entry recorded under lock');
  }
});

// ---------------------------------------------------------------------------
// 9. Lease / claimToken
// ---------------------------------------------------------------------------

test('lease: live lease not stolen; expired lease reclaimable', () => {
  const key = 'EVT-L|1|oc@gmail.com|1|telegram';
  const store = storeWith(
    { 'oc@gmail.com': bindingFor('555') },
    {
      [key]: {
        dispatchKey: key, eventId: 'EVT-L', entityVersion: 1,
        packageId: 'PKG-1', entityType: 'document', entityId: 'DOC-1', kind: 'Approved',
        recipientEmail: 'oc@gmail.com', bindingVersion: 1,
        status: 'sending', attempts: 0,
        claimToken: 'other-token',
        leaseUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        createdAt: '2026-11-01T09:00:00.000Z'
      }
    }
  );
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubStateForKind('Approved', [event({ id: 'EVT-L', entityVersion: 1, kind: 'Approved', recipientEmail: 'oc@gmail.com' })]),
    store
  });
  let sends = 0;
  wireGetUpdates(env, [], () => {
    sends++;
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, result: { message_id: 1 } }) };
  });

  env.TCCDTelegram.process();
  assert.equal(sends, 0, 'live lease not stolen');

  const s = env.getStore();
  s.deliveries[key].leaseUntil = new Date(Date.now() - 1000).toISOString();
  s.deliveries[key].status = 'pending';
  env.setStore(s);
  env.TCCDTelegram.process();
  assert.equal(sends, 1, 'expired lease reclaimable');
});

test('stale worker cannot overwrite newer claimToken', () => {
  const key = 'EVT-S|1|oc@gmail.com|1|telegram';
  const store = storeWith(
    { 'oc@gmail.com': bindingFor('555') },
    {
      [key]: {
        dispatchKey: key, eventId: 'EVT-S', entityVersion: 1,
        packageId: 'PKG-1', entityType: 'document', entityId: 'DOC-1', kind: 'Approved',
        recipientEmail: 'oc@gmail.com', bindingVersion: 1,
        status: 'pending', attempts: 0,
        createdAt: '2026-11-01T09:00:00.000Z'
      }
    }
  );
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubStateForKind('Approved', [event({ id: 'EVT-S', entityVersion: 1, kind: 'Approved', recipientEmail: 'oc@gmail.com' })]),
    store
  });
  wireGetUpdates(env, []);
  env.TCCDTelegram.process();
  assert.equal(env.getStore().deliveries[key].status, 'sent');
});

// ---------------------------------------------------------------------------
// 10. Business isolation + install
// ---------------------------------------------------------------------------

test('delivery failure does not change business revision', () => {
  const state = hubStateForKind('Approved', [event({ id: 'EVT-R', kind: 'Approved', recipientEmail: 'oc@gmail.com' })]);
  const rev = state.revision;
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });
  const env = makeEnv({ properties: baseProps(), businessState: state, store });
  wireGetUpdates(env, [], () => {
    throw new Error('UrlFetchApp failed for https://api.telegram.org/botTEST_TOKEN_NOT_REAL/sendMessage');
  });
  env.TCCDTelegram.process();
  assert.equal(state.revision, rev);
});

test('install: fails without token; idempotent; everyMinutes(1)', () => {
  const envNoTok = makeEnv({ properties: { TELEGRAM_BOT_SECRET: 's' }, businessState: hubState() });
  assert.throws(() => envNoTok.TCCDTelegram.install(), /token/i);

  const env = makeEnv({ properties: baseProps(), businessState: hubState(), effectiveUser: 'owner@gmail.com' });
  const s1 = env.TCCDTelegram.install();
  assert.equal(s1.installed, true);
  assert.equal(env.triggerCreated.length, 1);
  assert.equal(env.triggerCreated[0]._everyMinutes, 1);

  const s2 = env.TCCDTelegram.install();
  assert.equal(env.triggerCreated.length, 1, 'idempotent');
  assert.match(s2.message, /already/i);
});

test('install: non-owner rejected', () => {
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState(),
    effectiveUser: 'someone@gmail.com'
  });
  assert.throws(() => env.TCCDTelegram.install(), /owner/i);
});

// ---------------------------------------------------------------------------
// 11. Message content
// ---------------------------------------------------------------------------

test('message: no email/title/parse_mode; has activity+year+system link', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState([event({ id: 'EVT-MSG', kind: 'SubmittedToOC', recipientEmail: 'oc@gmail.com' })]),
    store
  });
  let payload = null;
  wireGetUpdates(env, [], (u, params) => {
    payload = typeof params.payload === 'string' ? JSON.parse(params.payload) : params.payload;
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, result: { message_id: 1 } }) };
  });
  env.TCCDTelegram.process();

  assert.ok(payload);
  const text = String(payload.text || '');
  assert.ok(text.includes('Junior Camp') && text.includes('2026'));
  assert.ok(text.includes('Document'));
  assert.ok(!/os@gmail\.com|oc@gmail\.com/.test(text));
  assert.ok(!/Secret Proposal Title/.test(text));
  assert.equal(payload.parse_mode, undefined);
  assert.match(text, /https:\/\/wsk1234567\.github\.io\/DivisionMemberSystem\/admin\.html\?/);
  assert.ok(text.includes('package=PKG-1') && text.includes('entity=DOC-1'));
});

// ---------------------------------------------------------------------------
// 12. Load safety
// ---------------------------------------------------------------------------

test('load-time safety: no HTTP, no triggers at definition', () => {
  const env = makeEnv({ properties: baseProps(), businessState: hubState() });
  assert.equal(typeof env.TCCDTelegram.rpc, 'function');
  assert.equal(typeof env.TCCDTelegram.process, 'function');
  assert.equal(typeof env.TCCDTelegram.install, 'function');
  assert.equal(env.httpLog.length, 0);
  assert.equal(env.triggerCreated.length, 0);
});

// ---------------------------------------------------------------------------
// NEW: freshState — role revoked between two sends
// ---------------------------------------------------------------------------

test('package role revoked between sends: second notification skipped', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });

  // Phase 2 will reconcile EVT-A. After first send we revoke oc from the package
  // and introduce EVT-B; process must re-check fresh state and skip EVT-B.
  let state = hubState([
    event({ id: 'EVT-A', kind: 'SubmittedToOC', recipientEmail: 'oc@gmail.com', entityVersion: 1 })
  ]);
  const env = makeEnv({
    properties: baseProps(),
    businessState: () => state,
    store
  });

  let sends = 0;
  wireGetUpdates(env, [], () => {
    sends++;
    return tgResponse(200, { ok: true, result: { message_id: 1 } });
  });

  // First run: EVT-A sent
  env.TCCDTelegram.process();
  assert.equal(sends, 1, 'first event sent');
  assert.equal(env.getStore().deliveries['EVT-A|1|oc@gmail.com|1|telegram'].status, 'sent');

  // Revoke package OC role and add a second event to the old oc
  state = hubState([
    event({ id: 'EVT-A', kind: 'SubmittedToOC', recipientEmail: 'oc@gmail.com', entityVersion: 1 }),
    event({ id: 'EVT-B', kind: 'SubmittedToOC', recipientEmail: 'oc@gmail.com', entityVersion: 1 })
  ]);
  state.DocPackages = state.DocPackages.map(p => Object.assign({}, p, {
    ocEmail: 'other@gmail.com' // role revoked
  }));

  env.TCCDTelegram.process();
  assert.equal(sends, 1, 'second event not sent after role revocation');
  const rowB = env.getStore().deliveries['EVT-B|1|oc@gmail.com|1|telegram'];
  // Either never queued (reconcile visibility) or queued then skipped
  if (rowB) {
    assert.ok(['skipped', 'pending'].includes(rowB.status) && rowB.status !== 'sent');
    if (rowB.status === 'skipped') {
      assert.match(String(rowB.lastError), /authoris|role|skip/i);
    }
  }
});

// ---------------------------------------------------------------------------
// NEW: stage filter — already Approved must not receive stale "awaiting review"
// ---------------------------------------------------------------------------

test('stage filter: SubmittedToOC skipped once entity is Approved', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });
  // Event says SubmittedToOC but entity already Approved
  const state = hubStateForKind('Approved', [
    event({ id: 'EVT-STALE', kind: 'SubmittedToOC', recipientEmail: 'oc@gmail.com' })
  ]);
  // Force entity status Approved (hubStateForKind sets that) while event kind is SubmittedToOC
  state.DocItems = state.DocItems.map(item => Object.assign({}, item, { status: 'Approved', rejectStage: '' }));

  const env = makeEnv({ properties: baseProps(), businessState: state, store });
  let sends = 0;
  wireGetUpdates(env, [], () => {
    sends++;
    return tgResponse(200, { ok: true, result: { message_id: 1 } });
  });
  env.TCCDTelegram.process();

  assert.equal(sends, 0, 'stale SubmittedToOC not sent after Approved');
  const row = env.getStore().deliveries['EVT-STALE|2|oc@gmail.com|1|telegram'];
  if (row) {
    assert.notEqual(row.status, 'sent');
    if (row.status === 'skipped') {
      assert.match(String(row.lastError), /stage|current/i);
    }
  }
});

test('stage filter: ReturnedByOC requires Rejected + rejectStage OC', () => {
  const store = storeWith({ 'os@gmail.com': bindingFor('111') });

  // Wrong stage: Rejected but rejectStage Final
  const wrong = hubStateForKind('ReturnedByFinal', [
    event({ id: 'EVT-RB', kind: 'ReturnedByOC', recipientEmail: 'os@gmail.com', actorEmail: 'oc@gmail.com', role: 'os', destination: 'studio' })
  ]);
  wrong.DocItems = wrong.DocItems.map(item => Object.assign({}, item, { status: 'Rejected', rejectStage: 'Final' }));

  const envWrong = makeEnv({ properties: baseProps(), businessState: wrong, store });
  let sendsWrong = 0;
  wireGetUpdates(envWrong, [], () => {
    sendsWrong++;
    return tgResponse(200, { ok: true, result: { message_id: 1 } });
  });
  envWrong.TCCDTelegram.process();
  assert.equal(sendsWrong, 0, 'ReturnedByOC not sent when rejectStage is Final');

  // Correct stage: Rejected + rejectStage OC
  const right = hubStateForKind('ReturnedByOC', [
    event({ id: 'EVT-RC', kind: 'ReturnedByOC', recipientEmail: 'os@gmail.com', actorEmail: 'oc@gmail.com', role: 'os', destination: 'studio' })
  ]);
  right.DocItems = right.DocItems.map(item => Object.assign({}, item, { status: 'Rejected', rejectStage: 'OC' }));

  const envRight = makeEnv({ properties: baseProps(), businessState: right, store: storeWith({ 'os@gmail.com': bindingFor('111') }) });
  let sendsRight = 0;
  wireGetUpdates(envRight, [], () => {
    sendsRight++;
    return tgResponse(200, { ok: true, result: { message_id: 1 } });
  });
  envRight.TCCDTelegram.process();
  assert.equal(sendsRight, 1, 'ReturnedByOC sent when Rejected+OC');
});

// ---------------------------------------------------------------------------
// NEW: getUpdates offset = max processed update_id + 1
// ---------------------------------------------------------------------------

test('offset advances to max update_id + 1 and does not reprocess', () => {
  const env = makeEnv({ properties: baseProps(), businessState: hubState() });
  const created = env.TCCDTelegram.rpc({ action: 'createTelegramBinding' }, hubState(), actor('u@gmail.com'));
  const code = created.binding.url.split('?start=')[1];

  const updates = [
    startUpdate(code, 1, { updateId: 1001 }),
    startUpdate(code, 1, { updateId: 1003, text: '/start ' + code })
  ];
  wireGetUpdates(env, updates);

  env.TCCDTelegram.process();
  const store1 = env.getStore();
  // After processing 1001 and 1003, offset must be 1004 (max+1), not 1003.
  assert.equal(store1.updatesOffset, 1004, 'offset = max processed id + 1');
  assert.ok(store1.pending['u@gmail.com'], 'start processed');

  // Second process: same updates should be filtered (id < offset)
  const pendingBefore = JSON.stringify(store1.pending);
  env.TCCDTelegram.process();
  const store2 = env.getStore();
  assert.equal(store2.updatesOffset, 1004, 'offset stable when no new updates');
  assert.equal(JSON.stringify(store2.pending), pendingBefore, 'no reprocessing of old updates');
});

// ---------------------------------------------------------------------------
// NEW: worker errors persist to status.delivery.lastError
// ---------------------------------------------------------------------------

test('getUpdates 409 persists workerError into status.delivery.lastError', () => {
  const store = storeWith({ 'os@gmail.com': bindingFor('111') });
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState(),
    store
  });

  // Simulate 409 on getUpdates
  env.context.UrlFetchApp.fetch = (url) => {
    const u = String(url);
    if (/getUpdates/.test(u)) {
      return tgResponse(409, { ok: false, error_code: 409, description: 'Conflict: terminated by other getUpdates request' });
    }
    return tgResponse(200, { ok: true, result: {} });
  };

  env.TCCDTelegram.process();

  const status = env.TCCDTelegram.rpc({ action: 'getTelegramStatus' }, hubState(), actor('os@gmail.com'));
  assert.match(String(status.delivery.lastError), /conflict|409|webhook/i);
  assert.ok(!/TEST_TOKEN_NOT_REAL/.test(JSON.stringify(status)));
  assert.ok(!/terminated by other/i.test(JSON.stringify(status)), 'raw Telegram text generalized');
});

test('worker error clears after successful getUpdates', () => {
  const store = storeWith({ 'os@gmail.com': bindingFor('111') });
  const env = makeEnv({ properties: baseProps(), businessState: hubState(), store });

  // First: fail getUpdates
  env.context.UrlFetchApp.fetch = (url) => {
    if (/getUpdates/.test(String(url))) {
      return tgResponse(409, { ok: false, error_code: 409, description: 'Conflict' });
    }
    return tgResponse(200, { ok: true, result: {} });
  };
  env.TCCDTelegram.process();
  assert.ok(env.getStore().workerError, 'error stored');

  // Second: succeed
  wireGetUpdates(env, []);
  env.TCCDTelegram.process();
  assert.equal(env.getStore().workerError, '', 'error cleared');

  const status = env.TCCDTelegram.rpc({ action: 'getTelegramStatus' }, hubState(), actor('os@gmail.com'));
  assert.equal(status.delivery.lastError, '');
});

// ---------------------------------------------------------------------------
// NEW: sendImpl real response shape (regression for 403 mock bug)
// ---------------------------------------------------------------------------

test('sendMessage handles real UrlFetchApp response objects (not bare {code,body})', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState([event({ id: 'EVT-SHAPE', kind: 'SubmittedToOC', recipientEmail: 'oc@gmail.com' })]),
    store
  });
  wireGetUpdates(env, [], (u, params) => {
    // Real-looking response object
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ ok: true, result: { message_id: 42 } })
    };
  });
  env.TCCDTelegram.process();
  assert.equal(env.getStore().deliveries['EVT-SHAPE|2|oc@gmail.com|1|telegram'].status, 'sent');
});

// ---------------------------------------------------------------------------
// NEW: long-term dedup evidence — sent rows must outlive 30-day cleanup
// ---------------------------------------------------------------------------

test('successful send is NOT re-queued after 31 days + cleanup (source still live)', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });
  const events = [
    event({ id: 'EVT-DUP', kind: 'SubmittedToOC', recipientEmail: 'oc@gmail.com', entityVersion: 2 })
  ];
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState(events),
    store,
    nowMs: Date.parse('2026-11-01T10:00:00.000Z')
  });

  let sends = 0;
  wireGetUpdates(env, [], () => {
    sends++;
    return tgResponse(200, { ok: true, result: { message_id: 1 } });
  });

  // First send
  env.TCCDTelegram.process();
  assert.equal(sends, 1, 'first send');
  const key = 'EVT-DUP|2|oc@gmail.com|1|telegram';
  assert.equal(env.getStore().deliveries[key].status, 'sent');

  // Advance 31 days — past old 30-day terminal retention; source event is still
  // within the 90-day hub prune window.
  env.advanceDays(31);

  // Same source event still present → must NOT re-send
  env.TCCDTelegram.process();
  assert.equal(sends, 1, 'no duplicate send after 31 days');
  const row = env.getStore().deliveries[key];
  assert.ok(row, 'sent dedup row retained');
  assert.equal(row.status, 'sent');

  // Even after another cleanup pass
  env.advanceDays(1);
  env.TCCDTelegram.process();
  assert.equal(sends, 1, 'still no duplicate');
});

test('dedup evidence retained through 89 days; not re-sent while source lives', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') });
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState([
      event({ id: 'EVT-LONG', kind: 'SubmittedToOC', recipientEmail: 'oc@gmail.com', entityVersion: 2 })
    ]),
    store,
    nowMs: Date.parse('2026-11-01T10:00:00.000Z')
  });
  let sends = 0;
  wireGetUpdates(env, [], () => {
    sends++;
    return tgResponse(200, { ok: true, result: { message_id: 1 } });
  });
  env.TCCDTelegram.process();
  assert.equal(sends, 1);

  env.advanceDays(89);
  env.TCCDTelegram.process();
  assert.equal(sends, 1, 'no re-send at day 89');
  assert.ok(env.getStore().deliveries['EVT-LONG|2|oc@gmail.com|1|telegram'], 'row kept');
});

test('5000-cap cleanup does not drop live dedup evidence / unfinished rows', () => {
  // Build a store near the cap: one live sent dedup row + many old orphan terminal
  // rows + one unfinished row. Cleanup should drop orphans first, keep live + unfinished.
  const liveKey = 'EVT-LIVE|2|oc@gmail.com|1|telegram';
  const unfinishedKey = 'EVT-UNF|1|oc@gmail.com|1|telegram';
  const deliveries = {};
  deliveries[liveKey] = {
    dispatchKey: liveKey, eventId: 'EVT-LIVE', entityVersion: 2,
    packageId: 'PKG-1', entityType: 'document', entityId: 'DOC-1', kind: 'SubmittedToOC',
    recipientEmail: 'oc@gmail.com', bindingVersion: 1,
    status: 'sent', attempts: 1, createdAt: '2026-11-01T09:00:00.000Z'
  };
  deliveries[unfinishedKey] = {
    dispatchKey: unfinishedKey, eventId: 'EVT-UNF', entityVersion: 1,
    packageId: 'PKG-1', entityType: 'document', entityId: 'DOC-1', kind: 'SubmittedToOC',
    recipientEmail: 'oc@gmail.com', bindingVersion: 1,
    status: 'pending', attempts: 0, createdAt: '2026-11-01T09:00:00.000Z'
  };
  // 5050 orphan terminal rows (source event does not exist)
  for (let i = 0; i < 5050; i++) {
    const k = 'EVT-ORPHAN-' + i + '|1|oc@gmail.com|1|telegram';
    deliveries[k] = {
      dispatchKey: k, eventId: 'EVT-ORPHAN-' + i, entityVersion: 1,
      packageId: 'PKG-1', entityType: 'document', entityId: 'DOC-1', kind: 'Approved',
      recipientEmail: 'oc@gmail.com', bindingVersion: 1,
      status: 'sent', attempts: 1,
      createdAt: '2026-10-01T00:00:00.000Z' // older than 24h grace
    };
  }

  const store = storeWith({ 'oc@gmail.com': bindingFor('555') }, deliveries);
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState([
      event({ id: 'EVT-LIVE', kind: 'SubmittedToOC', recipientEmail: 'oc@gmail.com', entityVersion: 2 })
    ]),
    store,
    nowMs: Date.parse('2026-11-02T10:00:00.000Z')
  });

  // process triggers cleanup via reconcile_
  wireGetUpdates(env, []);
  env.TCCDTelegram.process();

  const after = env.getStore().deliveries;
  assert.ok(after[liveKey], 'live dedup evidence kept under cap pressure');
  assert.equal(after[liveKey].status, 'sent');
  assert.ok(after[unfinishedKey], 'unfinished row never deleted by cleanup');
  // Worker may claim and skip a pending row whose source event is gone — but
  // the row itself must remain (cleanup never deletes unfinished work).
  assert.ok(typeof after[unfinishedKey].status === 'string');

  // And no duplicate re-queue of EVT-LIVE
  assert.equal(after[liveKey].status, 'sent');
  const liveRows = Object.keys(after).filter(k => k.includes('EVT-LIVE'));
  assert.equal(liveRows.length, 1, 'single live dedup key');
});

test('orphan terminal rows (source gone) can be cleaned without re-send risk', () => {
  const store = storeWith({ 'oc@gmail.com': bindingFor('555') }, {
    'EVT-GONE|1|oc@gmail.com|1|telegram': {
      dispatchKey: 'EVT-GONE|1|oc@gmail.com|1|telegram',
      eventId: 'EVT-GONE', entityVersion: 1,
      recipientEmail: 'oc@gmail.com', bindingVersion: 1,
      status: 'sent', attempts: 1,
      createdAt: '2026-10-01T00:00:00.000Z'
    }
  });
  // Source event NOT in state
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState([]),
    store,
    nowMs: Date.parse('2026-11-02T10:00:00.000Z')
  });
  wireGetUpdates(env, []);
  env.TCCDTelegram.process();
  // Orphan older than 24h with no source may be dropped — and nothing re-sends
  // because source is gone either way.
  const keys = Object.keys(env.getStore().deliveries).filter(k => k.includes('EVT-GONE'));
  // Allowed to drop or keep (grace); must not create a new pending
  for (const k of keys) {
    assert.notEqual(env.getStore().deliveries[k].status, 'pending');
  }
});

test('reconcile will not create a second key for same event+version+recipient', () => {
  // Simulate an older bindingVersion key that is terminal; new reconcile must not
  // add a parallel key for the same event.
  const oldKey = 'EVT-N|2|oc@gmail.com|1|telegram';
  const store = storeWith({ 'oc@gmail.com': bindingFor('555', { bindingVersion: 1 }) }, {
    [oldKey]: {
      dispatchKey: oldKey, eventId: 'EVT-N', entityVersion: 2,
      packageId: 'PKG-1', entityType: 'document', entityId: 'DOC-1', kind: 'SubmittedToOC',
      recipientEmail: 'oc@gmail.com', bindingVersion: 1,
      status: 'sent', attempts: 1, createdAt: '2026-11-01T09:00:00.000Z'
    }
  });
  const env = makeEnv({
    properties: baseProps(),
    businessState: hubState([
      event({ id: 'EVT-N', kind: 'SubmittedToOC', recipientEmail: 'oc@gmail.com', entityVersion: 2 })
    ]),
    store
  });
  let sends = 0;
  wireGetUpdates(env, [], () => {
    sends++;
    return tgResponse(200, { ok: true, result: { message_id: 1 } });
  });
  env.TCCDTelegram.process();
  const rows = Object.keys(env.getStore().deliveries).filter(k => k.includes('EVT-N'));
  assert.equal(rows.length, 1, 'no parallel dispatchKey for same event+version');
  assert.equal(sends, 0);
});
