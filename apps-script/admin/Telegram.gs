// Telegram.gs — TCCD private Telegram notifications (Notify Agent deliverable).
// Loaded with Code.gs / Domain.gs. Defining TCCDTelegram must not call Google services.
// Contract: docs/Notify-Agent-开发约定-v1.md
//
// TCCDTelegram.rpc(request, state, actor)  — Code.gs calls inside withLock_; no nested lock, no network
// TCCDTelegram.process()                  — worker trigger; own short locks; all HTTP outside locks
// TCCDTelegram.install()                  — owner-only (strict), idempotent everyMinutes(1) trigger

var TCCDTelegram = (function () {
  'use strict';

  var BOT_USERNAME_FALLBACK = 'tccdnotifybot';
  var FORMAL_KINDS = {
    SubmittedToOC: 1,
    OCChecked: 1,
    ReturnedByOC: 1,
    ForwardedForApproval: 1,
    Approved: 1,
    ReturnedByFinal: 1
  };
  var CHALLENGE_TTL_MS = 10 * 60 * 1000;
  var PENDING_TTL_MS = 10 * 60 * 1000;
  var LEASE_MS = 2 * 60 * 1000;
  var MAX_ATTEMPTS = 5;
  var MAX_BATCH_CLAIM = 10;
  var MAX_DELIVERIES = 5000;
  // Match source notificationEvents retention (hubPruneEvents_ keeps 90 days).
  // Shorter delivery retention would drop sent rows while the source event still
  // exists, and reconciliation would re-queue a duplicate reminder.
  var RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
  var KIND_TEXT = {
    SubmittedToOC: 'Submitted to OC for review',
    OCChecked: 'Checked by OC',
    ReturnedByOC: 'Returned by OC',
    ForwardedForApproval: 'Forwarded for approval',
    Approved: 'Approved',
    ReturnedByFinal: 'Returned by approver'
  };
  var ACTIVITY_LABEL = {
    AGM: 'AGM',
    CadetEnrolment: 'Cadet Enrolment',
    OrientationDay: 'Orientation Day',
    Exam: 'Exam',
    MidTermReview: 'Mid-Term Review',
    JuniorCamp: 'Junior Camp',
    InspectionDay: 'Inspection Day'
  };

  // ---------- basic helpers (no side effects at load) ----------

  function nowIso_() {
    return new Date().toISOString();
  }

  function nowMs_() {
    return Date.now();
  }

  function normEmail_(value) {
    return String(value || '').trim().toLowerCase();
  }

  function str_(value) {
    return value == null ? '' : String(value);
  }

  function emptyStore_() {
    return {
      schema: 1,
      bindings: {},
      challenges: {},
      pending: {},
      deliveries: {},
      updatesOffset: 0,
      workerError: '',
      workerErrorAt: ''
    };
  }

  function isPlainObject_(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  // Validate shape; throw on corruption so callers fail closed instead of wiping data.
  function sanitizeStoreOrThrow_(raw) {
    if (raw == null) return emptyStore_();
    if (!isPlainObject_(raw)) throw new Error('Telegram storage is unavailable.');
    var store = emptyStore_();
    store.updatesOffset = Number(raw.updatesOffset) || 0;
    store.workerError = raw.workerError ? String(raw.workerError) : '';
    store.workerErrorAt = raw.workerErrorAt ? String(raw.workerErrorAt) : '';
    ['bindings', 'challenges', 'pending', 'deliveries'].forEach(function (key) {
      if (raw[key] == null) return;
      if (!isPlainObject_(raw[key])) throw new Error('Telegram storage is unavailable.');
      store[key] = raw[key];
    });
    return store;
  }

  function isMissingStoreError_(error) {
    var msg = error && error.message ? String(error.message) : String(error || '');
    return /Data store is missing/i.test(msg);
  }

  function unavailable_() {
    return new Error('Telegram storage is unavailable.');
  }

  function botUsername_() {
    try {
      var configured = properties_().getProperty('TELEGRAM_BOT_USERNAME');
      if (configured) return String(configured).trim();
    } catch (error) {}
    return BOT_USERNAME_FALLBACK;
  }

  function token_() {
    // Never log or return this value.
    try {
      return String(properties_().getProperty('TELEGRAM_BOT_TOKEN') || '').trim();
    } catch (error) {
      return '';
    }
  }

  function botSecret_() {
    try {
      var secret = String(properties_().getProperty('TELEGRAM_BOT_SECRET') || '').trim();
      if (secret) return secret;
    } catch (error) {}
    return token_();
  }

  function configured_() {
    return !!token_();
  }

  function bytesToHex_(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i] & 0xff;
      var h = b.toString(16);
      out += h.length === 1 ? '0' + h : h;
    }
    return out;
  }

  function sha256Hex_(text) {
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
    return bytesToHex_(digest);
  }

  function hmacCode_(email, nonce, timestamp) {
    var secret = botSecret_();
    if (!secret) throw new Error('Telegram bot is not configured.');
    var payload = nonce + '|' + normEmail_(email) + '|' + timestamp;
    var sig = Utilities.computeHmacSha256Signature(payload, secret);
    return bytesToHex_(sig);
  }

  function generalizeError_(error) {
    var text = error && error.message ? String(error.message) : String(error || 'Unknown error');
    text = text.replace(/bot[0-9]+:[A-Za-z0-9_-]+/g, 'bot***');
    text = text.replace(/https?:\/\/\S+/g, 'url');
    if (/429|too many|rate/i.test(text)) return 'Rate limited by Telegram.';
    if (/403|forbidden|blocked|kicked/i.test(text)) return 'Telegram delivery blocked.';
    if (/400|bad request/i.test(text)) return 'Telegram rejected the request.';
    if (/timed? ?out|timeout|dns|network|exception/i.test(text)) return 'Network error talking to Telegram.';
    return 'Telegram delivery error.';
  }

  function apiBase_() {
    return 'https://api.telegram.org/bot' + token_();
  }

  function parseJsonSafe_(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  // Strict owner check — empty effective user is a hard failure (never allowed through).
  function requireOwner_() {
    var config = configuration_();
    var effective = '';
    try {
      var user = Session.getEffectiveUser();
      effective = normEmail_(user && user.getEmail());
    } catch (error) {
      effective = '';
    }
    if (!effective) throw new Error('Owner session is required.');
    if (effective !== normEmail_(config.owner)) {
      throw new Error('Only the owner can perform this action.');
    }
    return effective;
  }

  // ---------- private dual-slot store (NOT business Store0/Store1) ----------
  // Read policy:
  //   - not initialized (no TELEGRAM_CURRENT_SLOT) AND store sheet missing → empty, do not create
  //   - TELEGRAM_CURRENT_SLOT set but read/corrupt/invalid slot → fail closed (throw), never write
  // RPC path assumes Code.gs already holds the business script lock (no nested lock).
  // Worker path takes its own short script lock.

  function currentSlot_() {
    var slot = properties_().getProperty('TELEGRAM_CURRENT_SLOT');
    if (slot == null || slot === '') return null;
    if (slot !== 'Telegram0' && slot !== 'Telegram1') {
      throw unavailable_();
    }
    return slot;
  }

  function loadStore_() {
    var slot;
    try {
      slot = currentSlot_();
    } catch (error) {
      throw unavailable_();
    }

    var book;
    try {
      book = book_(configuration_().privateId);
    } catch (error) {
      // Cannot open storage at all. Only "never initialized" may fall back to empty on pure GET
      // callers; mutations must not proceed. Throwing keeps fail-closed for both.
      if (slot == null) return emptyStore_();
      throw unavailable_();
    }

    if (slot == null) {
      // Not initialized. Read missing store as empty object without creating a sheet.
      try {
        return sanitizeStoreOrThrow_(readSlot_(book, 'Telegram0'));
      } catch (error) {
        if (isMissingStoreError_(error)) return emptyStore_();
        throw unavailable_();
      }
    }

    try {
      return sanitizeStoreOrThrow_(readSlot_(book, slot));
    } catch (error) {
      // Initialized store must be readable and valid — never silently reset.
      throw unavailable_();
    }
  }

  function saveStore_(store) {
    var props = properties_();
    var current = currentSlot_();
    if (current == null) current = 'Telegram0';
    var next = current === 'Telegram0' ? 'Telegram1' : 'Telegram0';
    var book = book_(configuration_().privateId);
    // Failure throws before slot switch; never leave TELEGRAM_CURRENT_SLOT pointing at a bad write.
    writeSlot_(book, next, store);
    props.setProperty('TELEGRAM_CURRENT_SLOT', next);
    return next;
  }

  // RPC mutation helper — business script lock already held by Code.gs withLock_.
  function mutateStoreLocked_(work) {
    var store = loadStore_();
    var result = work(store);
    saveStore_(store);
    return result;
  }

  // Worker-only short lock helper. Does NOT wrap HTTP.
  function withWorkerLock_(work) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw new Error('Telegram worker is busy.');
    try {
      return work();
    } finally {
      lock.releaseLock();
    }
  }

  // ---------- store hygiene ----------
  //
  // Dedup evidence rule: while a source notificationEvent (id+entityVersion) is
  // still present and the recipient is still bound, a terminal delivery row is
  // REQUIRED so reconciliation cannot re-queue the same notice. Cleanup must
  // never delete that evidence just to hit a size cap or a short TTL.
  // Unfinished rows (pending/retry/sending) are never deleted.

  function isTerminalStatus_(status) {
    return status === 'sent' || status === 'dead' || status === 'skipped';
  }

  function isUnfinishedStatus_(status) {
    return status === 'pending' || status === 'retry' || status === 'sending' || status === 'claimed';
  }

  function findSourceEvent_(state, row) {
    if (!state || !row) return null;
    var events = Array.isArray(state.notificationEvents) ? state.notificationEvents : [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev && ev.id === row.eventId && Number(ev.entityVersion) === Number(row.entityVersion)) {
        return ev;
      }
    }
    return null;
  }

  // True when this row is still required as dedup evidence for a live source event.
  function isLiveDedupEvidence_(store, row, state) {
    if (!row || !state) return false;
    if (!findSourceEvent_(state, row)) return false;
    return !!store.bindings[row.recipientEmail];
  }

  function cleanupStore_(store, nowMs, state) {
    var cutoff = nowMs - RETENTION_MS;
    var key;

    for (key in store.challenges) {
      var challenge = store.challenges[key];
      var exp = Date.parse(challenge.expiresAt || '') || 0;
      var created = Date.parse(challenge.createdAt || '') || 0;
      if (challenge.usedAt || exp < nowMs || created < cutoff) {
        delete store.challenges[key];
      }
    }

    for (var email in store.pending) {
      var pending = store.pending[email];
      var pendingExp = Date.parse(pending.expiresAt || '') || 0;
      if (pending.status && pending.status !== 'pending') {
        delete store.pending[email];
      } else if (pendingExp && pendingExp < nowMs) {
        delete store.pending[email];
      }
    }

    // Terminal retention. Live dedup evidence is kept while the source event
    // exists (source itself is pruned at ~90 days). When business state is
    // unknown we cannot prove a row is orphaned — do not delete terminal rows
    // (they may be the only barrier against a duplicate re-queue).
    for (key in store.deliveries) {
      var delivery = store.deliveries[key];
      if (!delivery) continue;
      if (isUnfinishedStatus_(delivery.status)) continue; // never drop unfinished work
      if (!isTerminalStatus_(delivery.status)) continue;

      if (!state) continue; // cannot judge liveness — keep terminal rows

      var createdMs = Date.parse(delivery.createdAt || '') || 0;
      var live = isLiveDedupEvidence_(store, delivery, state);

      // Keep while source+binding still require this row as dedup evidence.
      if (live) continue;

      // Hard retention window, or orphaned (source gone) after a short grace.
      if (createdMs && createdMs < cutoff) {
        delete store.deliveries[key];
        continue;
      }
      var age = nowMs - createdMs;
      if (createdMs && age > 24 * 60 * 60 * 1000 && !findSourceEvent_(state, delivery)) {
        delete store.deliveries[key];
      }
    }

    // Size cap: never drop unfinished work. When business state is known, drop
    // only terminal rows that are proven NOT live dedup evidence (source gone).
    // When state is unknown (applyUpdates_ / some RPC paths), do NOT prune
    // terminal rows for size — they may be the only dedup evidence for a live
    // source event, and deleting them would cause a duplicate send on the next
    // reconcile. Prefer staying slightly over the soft cap over double-notify.
    if (state) {
      var deliveryKeys = Object.keys(store.deliveries);
      if (deliveryKeys.length > MAX_DELIVERIES) {
        var droppable = [];
        for (var i = 0; i < deliveryKeys.length; i++) {
          var row = store.deliveries[deliveryKeys[i]];
          if (!row) continue;
          if (isUnfinishedStatus_(row.status)) continue;
          if (!isTerminalStatus_(row.status)) continue;
          if (isLiveDedupEvidence_(store, row, state)) continue; // keep dedup evidence
          droppable.push(deliveryKeys[i]);
        }
        droppable.sort(function (a, b) {
          return String(store.deliveries[a].createdAt || '').localeCompare(String(store.deliveries[b].createdAt || ''));
        });
        var need = deliveryKeys.length - MAX_DELIVERIES;
        for (var d = 0; d < need && d < droppable.length; d++) {
          delete store.deliveries[droppable[d]];
        }
      }
    }
  }

  // ---------- status / RPC (no network, no nested lock) ----------

  function statusFor_(store, email) {
    var binding = store.bindings[email] || null;
    var pending = store.pending[email] || null;
    var pendingCount = 0;
    var failedCount = 0;
    var lastError = '';
    for (var key in store.deliveries) {
      var row = store.deliveries[key];
      if (!row || row.recipientEmail !== email) continue;
      if (row.status === 'pending' || row.status === 'retry' || row.status === 'sending') pendingCount++;
      if (row.status === 'dead' || row.status === 'failed') {
        failedCount++;
        if (row.lastError) lastError = String(row.lastError);
      }
    }

    var workerInstalled = false;
    try {
      var triggers = ScriptApp.getProjectTriggers();
      for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === 'processTelegramNotifications') {
          workerInstalled = true;
          break;
        }
      }
    } catch (error) {
      workerInstalled = false;
    }

    return {
      configured: configured_(),
      botUsername: botUsername_(),
      linked: !!binding,
      enabled: !!(binding && binding.enabled),
      telegramUser: binding
        ? {
            id: String(binding.telegramUserId || ''),
            username: String(binding.username || ''),
            displayName: String(binding.displayName || '')
          }
        : null,
      pending: pending && pending.status === 'pending'
        ? {
            id: String(pending.id || ''),
            userId: String(pending.userId || ''),
            username: String(pending.username || ''),
            displayName: String(pending.displayName || ''),
            expiresAt: String(pending.expiresAt || '')
          }
        : null,
      delivery: {
        pending: pendingCount,
        failed: failedCount,
        lastError: store.workerError ? String(store.workerError) : lastError
      },
      workerInstalled: workerInstalled
    };
  }

  function rpc(request, state, actor) {
    // Called from Code.gs inside withLock_ after identity_ — never take another script lock.
    request = request || {};
    actor = actor || {};
    var email = normEmail_(actor.email);
    if (!email) throw new Error('Sign in with the authorised Google account.');
    var action = String(request.action || '');

    if (action === 'getTelegramStatus') {
      // GET: read-only. Missing uninitialized store → empty object. No write.
      return statusFor_(loadStore_(), email);
    }

    if (action === 'createTelegramBinding') {
      if (!configured_()) throw new Error('Telegram bot is not configured.');
      return mutateStoreLocked_(function (store) {
        var nowMs = nowMs_();
        var now = new Date(nowMs).toISOString();
        var nonce = Utilities.getUuid();
        var code = hmacCode_(email, nonce, now);
        var codeHash = sha256Hex_(code);
        var challengeId = 'chg-' + nonce;

        // Supersede previous challenge/pending for this user; keep existing binding until confirm.
        var previousPending = store.pending[email];
        if (previousPending && previousPending.codeHash) {
          for (var key in store.challenges) {
            if (store.challenges[key].codeHash === previousPending.codeHash) {
              store.challenges[key].usedAt = now;
            }
          }
        }
        delete store.pending[email];
        for (var oldKey in store.challenges) {
          if (store.challenges[oldKey].email === email && !store.challenges[oldKey].usedAt) {
            store.challenges[oldKey].usedAt = now;
          }
        }

        store.challenges[challengeId] = {
          id: challengeId,
          codeHash: codeHash,
          email: email,
          createdAt: now,
          expiresAt: new Date(nowMs + CHALLENGE_TTL_MS).toISOString()
        };
        cleanupStore_(store, nowMs, state);

        var status = statusFor_(store, email);
        status.binding = {
          url: 'https://t.me/' + botUsername_() + '?start=' + code,
          expiresAt: new Date(nowMs + CHALLENGE_TTL_MS).toISOString()
        };
        return status;
      });
    }

    if (action === 'confirmTelegramBinding') {
      if (!configured_()) throw new Error('Telegram bot is not configured.');
      var bindingId = String((request.request && request.request.bindingId) || request.bindingId || '');
      return mutateStoreLocked_(function (store) {
        var nowMs = nowMs_();
        var now = new Date(nowMs).toISOString();
        var pending = store.pending[email];
        if (!pending || pending.status !== 'pending') throw new Error('No pending Telegram binding request.');
        if (String(pending.id) !== bindingId) throw new Error('Invalid binding confirmation.');
        var expiresAt = Date.parse(pending.expiresAt || '') || 0;
        if (expiresAt && expiresAt < nowMs) {
          delete store.pending[email];
          throw new Error('Telegram binding request has expired.');
        }

        var tgUserId = String(pending.userId || '');
        var tgChatId = String(pending.userId || '');
        for (var other in store.bindings) {
          if (other === email) continue;
          var otherBinding = store.bindings[other];
          if (otherBinding && String(otherBinding.telegramUserId) === tgUserId) {
            throw new Error('This Telegram account is already linked to another Google account.');
          }
        }

        var existing = store.bindings[email];
        var version = existing && Number(existing.bindingVersion) ? Number(existing.bindingVersion) : 0;
        version += 1;
        store.bindings[email] = {
          id: existing && existing.id ? existing.id : 'bind-' + tgUserId + '-' + version,
          telegramUserId: tgUserId,
          telegramChatId: tgChatId,
          username: String(pending.username || ''),
          displayName: String(pending.displayName || ''),
          enabled: true,
          enabledSince: now,
          bindingVersion: version,
          linkedAt: existing && existing.linkedAt ? existing.linkedAt : now
        };
        delete store.pending[email];

        for (var dKey in store.deliveries) {
          var dRow = store.deliveries[dKey];
          if (dRow && dRow.recipientEmail === email &&
              Number(dRow.bindingVersion) !== version &&
              dRow.status !== 'sent') {
            store.deliveries[dKey].status = 'skipped';
            store.deliveries[dKey].lastError = 'Binding version changed.';
          }
        }
        cleanupStore_(store, nowMs, state);
        return statusFor_(store, email);
      });
    }

    if (action === 'cancelTelegramBinding') {
      return mutateStoreLocked_(function (store) {
        var nowMs = nowMs_();
        var now = new Date(nowMs).toISOString();
        var currentPending = store.pending[email];
        if (currentPending && currentPending.codeHash) {
          for (var cKey in store.challenges) {
            if (store.challenges[cKey].codeHash === currentPending.codeHash) {
              store.challenges[cKey].usedAt = now;
            }
          }
        }
        delete store.pending[email];
        cleanupStore_(store, nowMs, state);
        return statusFor_(store, email);
      });
    }

    if (action === 'setTelegramEnabled') {
      var enabled = !!(request.request && typeof request.request.enabled === 'boolean'
        ? request.request.enabled
        : request.enabled);
      return mutateStoreLocked_(function (store) {
        var nowMs = nowMs_();
        var binding = store.bindings[email];
        if (!binding) throw new Error('Link Telegram before changing notification settings.');
        if (enabled) {
          binding.enabled = true;
          binding.enabledSince = new Date(nowMs).toISOString();
        } else {
          binding.enabled = false;
        }
        return statusFor_(store, email);
      });
    }

    if (action === 'unlinkTelegram') {
      return mutateStoreLocked_(function (store) {
        var nowMs = nowMs_();
        delete store.bindings[email];
        delete store.pending[email];
        for (var ch in store.challenges) {
          if (store.challenges[ch].email === email) store.challenges[ch].usedAt = new Date(nowMs).toISOString();
        }
        for (var key in store.deliveries) {
          if (store.deliveries[key] && store.deliveries[key].recipientEmail === email) {
            delete store.deliveries[key];
          }
        }
        cleanupStore_(store, nowMs, state);
        return statusFor_(store, email);
      });
    }

    throw new Error('Unknown Telegram action.');
  }

  // ---------- inbound /start (worker) ----------

  function applyUpdates_(store, updates, summary) {
    var nowMs = nowMs_();
    var now = new Date(nowMs).toISOString();
    // Official getUpdates offset semantics: next fetch offset = last processed update_id + 1.
    var offset = Number(store.updatesOffset) || 0;
    var maxProcessed = offset > 0 ? offset - 1 : 0;

    (updates || []).forEach(function (update) {
      if (!update || typeof update !== 'object') return;
      var updateId = Number(update.update_id) || 0;
      // Already processed — ignore (do not re-consume the last item forever).
      if (updateId && updateId < offset) return;

      var message = update.message;
      if (message && typeof message === 'object') {
        var chat = message.chat || {};
        var from = message.from || {};
        var chatType = String(chat.type || '');
        var fromId = str_(from.id);
        var chatId = str_(chat.id);
        if (chatType === 'private' && fromId && fromId === chatId && !from.is_bot) {
          var text = str_(message.text);
          var match = text.match(/^\/start(?:@\w+)?\s+([0-9a-f]{64})\s*$/i);
          if (match) {
            var code = match[1].toLowerCase();
            var codeHash = sha256Hex_(code);
            var foundId = '';
            for (var key in store.challenges) {
              var challenge = store.challenges[key];
              if (challenge && challenge.codeHash === codeHash && !challenge.usedAt) {
                foundId = key;
                break;
              }
            }
            if (foundId) {
              var found = store.challenges[foundId];
              var expiresAt = Date.parse(found.expiresAt || '') || 0;
              if (expiresAt && expiresAt < nowMs) {
                found.usedAt = now;
                summary.rejectedUpdates = (summary.rejectedUpdates || 0) + 1;
              } else {
                found.usedAt = now;
                store.pending[found.email] = {
                  id: 'pend-' + fromId + '-' + nowMs,
                  userId: fromId,
                  username: str_(from.username),
                  displayName: str_(from.first_name || from.username || 'Telegram user'),
                  codeHash: codeHash,
                  createdAt: now,
                  expiresAt: new Date(nowMs + PENDING_TTL_MS).toISOString(),
                  status: 'pending'
                };
                summary.pendingCreated = (summary.pendingCreated || 0) + 1;
              }
            } else {
              summary.rejectedUpdates = (summary.rejectedUpdates || 0) + 1;
            }
          }
        }
      }

      if (updateId > maxProcessed) maxProcessed = updateId;
    });

    // Persist offset as max processed update_id + 1 (official getUpdates confirmation).
    store.updatesOffset = maxProcessed > 0 ? maxProcessed + 1 : offset;
    // No business state here — age-based terminal cleanup only; live dedup
    // evidence is protected in reconcile_ / rpc which receive state.
    cleanupStore_(store, nowMs, null);
  }

  function fetchUpdates_(offset, summary) {
    if (!configured_()) {
      var configError = 'Telegram bot is not configured.';
      summary.errors.push(configError);
      summary.workerError = configError;
      return [];
    }
    var url = apiBase_() + '/getUpdates?timeout=0&limit=50&offset=' + encodeURIComponent(String(offset || 0)) +
      '&allowed_updates=' + encodeURIComponent(JSON.stringify(['message']));
    try {
      var response = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true
      });
      var code = Number(response.getResponseCode());
      var body = parseJsonSafe_(response.getContentText()) || {};
      if (code === 409) {
        var conflictError = 'Telegram getUpdates conflict (409). Owner must resolve webhook/getUpdates mode.';
        summary.errors.push(conflictError);
        summary.workerError = conflictError;
        return [];
      }
      if (code >= 500) {
        var unavailableError = 'Telegram getUpdates unavailable.';
        summary.errors.push(unavailableError);
        summary.workerError = unavailableError;
        return [];
      }
      if (!body.ok) {
        var apiError = generalizeError_(new Error(str_(body.description) || 'Telegram error'));
        summary.errors.push(apiError);
        summary.workerError = apiError;
        return [];
      }
      return Array.isArray(body.result) ? body.result : [];
    } catch (error) {
      var netError = generalizeError_(error);
      summary.errors.push(netError);
      summary.workerError = netError;
      return [];
    }
  }

  // ---------- reconciliation / delivery ----------

  function eventStillVisible_(state, event, email) {
    if (!state || !event || !email) return false;
    var actor;
    try {
      actor = actorFromEmail_(email);
    } catch (error) {
      return false;
    }
    if (!actor || !actor.email) return false;
    var clone = {};
    for (var key in state) {
      if (Object.prototype.hasOwnProperty.call(state, key)) clone[key] = state[key];
    }
    clone.notificationEvents = [event];
    try {
      var feed = KPT.hubNotificationFeed(clone, actor, {}, nowIso_());
      if (!feed || !Array.isArray(feed.notifications)) return false;
      for (var i = 0; i < feed.notifications.length; i++) {
        if (feed.notifications[i].id === event.id) return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  function dispatchKey_(event, binding) {
    return String(event.id) + '|' + Number(event.entityVersion || 0) + '|' +
      normEmail_(event.recipientEmail) + '|' + Number(binding.bindingVersion || 0) + '|telegram';
  }

  function entityForEvent_(state, event) {
    if (!state || !event) return null;
    if (event.entityType === 'document') {
      return (state.DocItems || []).find(function (row) { return row.id === event.entityId; }) || null;
    }
    if (event.entityType === 'finance') {
      return (state.FinBooks || []).find(function (row) { return row.id === event.entityId; }) || null;
    }
    return null;
  }

  // Only notify when the entity is still in the stage this kind describes.
  // Prevents users who already got Approved from receiving a stale "awaiting review".
  function stageMatchesEvent_(state, event) {
    var entity = entityForEvent_(state, event);
    if (!entity) return false;
    var status = String(entity.status || '');
    var rejectStage = String(entity.rejectStage || '');
    switch (event.kind) {
      case 'SubmittedToOC': return status === 'AwaitingOC';
      case 'OCChecked': return status === 'OCChecked';
      case 'ForwardedForApproval': return status === 'Submitted';
      case 'Approved': return status === 'Approved';
      case 'ReturnedByOC': return status === 'Rejected' && rejectStage === 'OC';
      case 'ReturnedByFinal': return status === 'Rejected' && rejectStage === 'Final';
      default: return false;
    }
  }

  function reconcile_(store, state, summary) {
    var events = (state && Array.isArray(state.notificationEvents)) ? state.notificationEvents : [];
    var nowMs = nowMs_();
    var now = new Date(nowMs).toISOString();

    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      if (!event) continue;
      if (!FORMAL_KINDS[event.kind]) continue;
      var recipient = normEmail_(event.recipientEmail);
      if (!recipient) continue;
      if (normEmail_(event.actorEmail) === recipient) continue;

      var binding = store.bindings[recipient];
      if (!binding || !binding.enabled) continue;

      var createdMs = Date.parse(event.createdAt || '') || 0;
      var enabledSinceMs = Date.parse(binding.enabledSince || '') || 0;
      if (enabledSinceMs && createdMs && createdMs < enabledSinceMs) continue;

      // Entity must still be in the stage this kind describes.
      if (!stageMatchesEvent_(state, event)) continue;

      if (!eventStillVisible_(state, event, recipient)) continue;

      var key = dispatchKey_(event, binding);
      if (store.deliveries[key]) continue;

      // Stronger dedup: any prior delivery row for this event version + recipient
      // (including older bindingVersion keys that cleanup might otherwise drop)
      // means this notice was already queued/sent — never re-queue.
      var alreadyQueued = false;
      for (var existingKey in store.deliveries) {
        var existing = store.deliveries[existingKey];
        if (existing &&
            existing.eventId === String(event.id) &&
            Number(existing.entityVersion) === Number(event.entityVersion) &&
            normEmail_(existing.recipientEmail) === recipient) {
          alreadyQueued = true;
          break;
        }
      }
      if (alreadyQueued) continue;

      store.deliveries[key] = {
        dispatchKey: key,
        eventId: String(event.id),
        entityVersion: Number(event.entityVersion || 0),
        packageId: String(event.packageId || ''),
        entityType: String(event.entityType || ''),
        entityId: String(event.entityId || ''),
        kind: String(event.kind || ''),
        recipientEmail: recipient,
        bindingVersion: Number(binding.bindingVersion || 0),
        status: 'pending',
        attempts: 0,
        createdAt: now
      };
      summary.reconciled = (summary.reconciled || 0) + 1;
    }
    cleanupStore_(store, nowMs, state);
  }

  function claimBatch_(store, summary) {
    var nowMs = nowMs_();
    var now = new Date(nowMs).toISOString();
    var leaseUntil = new Date(nowMs + LEASE_MS).toISOString();
    var claimed = [];
    var keys = Object.keys(store.deliveries);
    keys.sort(function (a, b) {
      return String(store.deliveries[a].createdAt || '').localeCompare(String(store.deliveries[b].createdAt || ''));
    });

    for (var i = 0; i < keys.length && claimed.length < MAX_BATCH_CLAIM; i++) {
      var key = keys[i];
      var row = store.deliveries[key];
      if (!row) continue;
      if (row.status === 'sent' || row.status === 'dead' || row.status === 'skipped' || row.status === 'failed') continue;
      var nextTry = Date.parse(row.nextTryAt || '') || 0;
      if (nextTry && nextTry > nowMs) continue;
      var lease = Date.parse(row.leaseUntil || '') || 0;
      if (row.claimToken && lease > nowMs && (row.status === 'sending' || row.status === 'claimed')) continue;
      if (Number(row.attempts || 0) >= MAX_ATTEMPTS) {
        row.status = 'dead';
        row.lastError = 'Retry limit reached.';
        continue;
      }

      var claimToken = Utilities.getUuid();
      row.claimToken = claimToken;
      row.leaseUntil = leaseUntil;
      row.status = 'sending';
      claimed.push({ key: key, claimToken: claimToken });
    }
    summary.claimed = claimed.length;
    return claimed;
  }

  function findPackage_(state, event) {
    if (!state) return null;
    if (event.entityType === 'document') {
      var item = (state.DocItems || []).find(function (row) { return row.id === event.entityId; });
      if (!item) return null;
      return (state.DocPackages || []).find(function (row) { return row.id === item.packageId; }) || null;
    }
    if (event.entityType === 'finance') {
      var book = (state.FinBooks || []).find(function (row) { return row.id === event.entityId; });
      if (!book || !book.packageId) return null;
      return (state.DocPackages || []).find(function (row) { return row.id === book.packageId; }) || null;
    }
    return null;
  }

  function buildMessage_(event, state) {
    var pkg = findPackage_(state, event);
    var typeCode = pkg ? String(pkg.activityType || '') : '';
    var year = pkg ? String(pkg.year || '') : '';
    var typeLabel = ACTIVITY_LABEL[typeCode] || 'Activity';
    var workType = event.entityType === 'finance' ? 'Finance' : 'Document';
    var statusText = KIND_TEXT[event.kind] || 'Status updated';
    var link = portalPublicUrl_().replace(/\/$/, '') +
      '/admin.html?mode=oc&package=' + encodeURIComponent(event.packageId || '') +
      '&entity=' + encodeURIComponent(event.entityId || '');
    return {
      text: typeLabel + (year ? ' ' + year : '') + ' · ' + workType + ' · ' + statusText + '\n' + link,
      link: link
    };
  }

  function sendMessage_(binding, message) {
    if (!configured_()) throw new Error('Telegram bot is not configured.');
    var chatId = String(binding.telegramChatId || binding.telegramUserId || '');
    if (!chatId) throw new Error('Telegram chat is missing.');
    var payload = {
      chat_id: chatId,
      text: message.text,
      reply_markup: JSON.stringify({
        inline_keyboard: [[{ text: 'Open workspace', url: message.link }]]
      })
    };
    var response = UrlFetchApp.fetch(apiBase_() + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      followRedirects: true
    });
    return {
      code: Number(response.getResponseCode()),
      body: parseJsonSafe_(response.getContentText()) || {}
    };
  }

  function applySendResult_(store, key, claimToken, result, summary) {
    var row = store.deliveries[key];
    if (!row) return;
    if (row.claimToken !== claimToken) {
      summary.staleWriteback = (summary.staleWriteback || 0) + 1;
      return;
    }

    var nowMs = nowMs_();
    var now = new Date(nowMs).toISOString();
    row.attempts = Number(row.attempts || 0) + 1;

    if (result.kind === 'ok') {
      row.status = 'sent';
      row.sentAt = now;
      row.lastError = '';
      delete row.claimToken;
      delete row.leaseUntil;
      summary.sent = (summary.sent || 0) + 1;
      return;
    }

    if (result.kind === 'skipped') {
      row.status = 'skipped';
      row.lastError = result.reason || 'Skipped.';
      delete row.claimToken;
      delete row.leaseUntil;
      summary.skipped = (summary.skipped || 0) + 1;
      return;
    }

    if (result.kind === 'permanent') {
      row.status = 'dead';
      row.lastError = result.reason || 'Delivery failed.';
      delete row.claimToken;
      delete row.leaseUntil;
      summary.dead = (summary.dead || 0) + 1;
      if (result.disableRecipient) {
        var binding = store.bindings[row.recipientEmail];
        if (binding) binding.enabled = false;
      }
      return;
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      row.status = 'dead';
      row.lastError = result.reason || 'Retry limit reached.';
      delete row.claimToken;
      delete row.leaseUntil;
      summary.dead = (summary.dead || 0) + 1;
      return;
    }
    row.status = 'retry';
    row.lastError = result.reason || 'Temporary error.';
    row.nextTryAt = result.nextTryAt ||
      new Date(nowMs + Math.min(300000, 30000 * Math.pow(2, Math.min(row.attempts, 4)))).toISOString();
    delete row.claimToken;
    delete row.leaseUntil;
    summary.retried = (summary.retried || 0) + 1;
  }

  function classifyHttp_(code, body) {
    if (code >= 200 && code < 300 && body && body.ok) return { kind: 'ok' };
    if (code === 429) {
      var retryAfter = body && body.parameters && Number(body.parameters.retry_after);
      var seconds = Number.isFinite(retryAfter) ? Math.max(1, Math.min(3600, retryAfter)) : 30;
      return {
        kind: 'retry',
        reason: 'Rate limited by Telegram.',
        nextTryAt: new Date(nowMs_() + seconds * 1000).toISOString()
      };
    }
    if (code === 403) {
      return { kind: 'permanent', reason: 'Telegram delivery blocked.', disableRecipient: true };
    }
    if (code === 400) {
      return { kind: 'permanent', reason: 'Telegram rejected the request.' };
    }
    if (code >= 500) {
      return { kind: 'retry', reason: 'Telegram service unavailable.' };
    }
    return { kind: 'retry', reason: 'Telegram delivery error.' };
  }

  function process() {
    // Trigger runs as the installing owner; enforce that strictly (empty effective user is a failure).
    requireOwner_();

    var summary = {
      updates: 0,
      pendingCreated: 0,
      rejectedUpdates: 0,
      reconciled: 0,
      claimed: 0,
      sent: 0,
      retried: 0,
      dead: 0,
      skipped: 0,
      staleWriteback: 0,
      workerError: '',
      errors: []
    };

    if (!configured_()) {
      summary.errors.push('Telegram bot is not configured.');
      summary.workerError = 'Telegram bot is not configured.';
    }

    // Phase 1: inbound getUpdates — HTTP strictly outside any lock.
    var offset = 0;
    try {
      offset = loadStore_().updatesOffset || 0;
    } catch (error) {
      summary.errors.push('Telegram storage is unavailable.');
      return summary;
    }

    var updates = [];
    if (configured_()) {
      updates = fetchUpdates_(offset, summary);
      summary.updates = updates.length;
    }

    // Persist worker-level errors (409, config, network) so status can surface them.
    withWorkerLock_(function () {
      var store = loadStore_();
      var changed = false;
      if (summary.workerError) {
        if (store.workerError !== summary.workerError) {
          store.workerError = summary.workerError;
          store.workerErrorAt = new Date().toISOString();
          changed = true;
        }
      } else if (store.workerError) {
        store.workerError = '';
        store.workerErrorAt = '';
        changed = true;
      }
      if (updates.length) {
        applyUpdates_(store, updates, summary);
        changed = true;
      }
      if (changed) saveStore_(store);
    });

    // Phase 2: reconcile from business state (read-only). Single save.
    var state = null;
    try {
      state = loadState_();
    } catch (error) {
      summary.errors.push('Business state unavailable.');
      state = null;
    }
    if (state) {
      withWorkerLock_(function () {
        var store = loadStore_();
        var before = JSON.stringify(store);
        reconcile_(store, state, summary);
        if (JSON.stringify(store) !== before) saveStore_(store);
      });
    }

    // Phase 3: claim batch. Single save.
    var claimed = [];
    withWorkerLock_(function () {
      var store = loadStore_();
      claimed = claimBatch_(store, summary);
      if (claimed.length) saveStore_(store);
    });

    // Phase 4: per job — re-verify under short lock with FRESH business state,
    // HTTP outside lock, write-back under lock. Role revocation and stage drift
    // since phase 2 must skip the send.
    for (var i = 0; i < claimed.length; i++) {
      var job = claimed[i];
      var key = job.key;
      var claimToken = job.claimToken;

      var decision = withWorkerLock_(function () {
        // Read-only re-check. No save here.
        var store = loadStore_();
        var row = store.deliveries[key];
        if (!row || row.claimToken !== claimToken) {
          return { kind: 'skipped', reason: 'Claim lost.' };
        }
        var binding = store.bindings[row.recipientEmail];
        if (!binding) return { kind: 'skipped', reason: 'Recipient is not linked.' };
        if (!binding.enabled) return { kind: 'skipped', reason: 'Notifications are disabled.' };
        if (Number(binding.bindingVersion) !== Number(row.bindingVersion)) {
          return { kind: 'skipped', reason: 'Binding version changed.' };
        }
        var createdMs = Date.parse(row.createdAt || '') || 0;
        var enabledSinceMs = Date.parse(binding.enabledSince || '') || 0;
        if (enabledSinceMs && createdMs && createdMs < enabledSinceMs) {
          return { kind: 'skipped', reason: 'Event predates notifications being enabled.' };
        }

        // FRESH business state — package role may have been revoked since phase 2.
        var freshState = null;
        try {
          freshState = loadState_();
        } catch (error) {
          return { kind: 'retry', reason: 'Business state unavailable.' };
        }

        var event = (freshState.notificationEvents || []).filter(function (ev) {
          return ev.id === row.eventId && Number(ev.entityVersion) === Number(row.entityVersion);
        })[0];
        if (!event) return { kind: 'skipped', reason: 'Event is no longer current.' };
        if (normEmail_(event.actorEmail) === normEmail_(row.recipientEmail)) {
          return { kind: 'skipped', reason: 'Operator is the recipient.' };
        }
        // Stage filter: entity may have moved on (e.g. already Approved).
        if (!stageMatchesEvent_(freshState, event)) {
          return { kind: 'skipped', reason: 'Event stage is no longer current.' };
        }
        if (!eventStillVisible_(freshState, event, row.recipientEmail)) {
          return { kind: 'skipped', reason: 'Recipient is no longer authorised.' };
        }
        var message = buildMessage_(event, freshState);
        return {
          kind: 'send',
          binding: {
            telegramChatId: binding.telegramChatId,
            telegramUserId: binding.telegramUserId
          },
          message: message
        };
      });

      if (!decision || decision.kind !== 'send') {
        withWorkerLock_(function () {
          var store = loadStore_();
          applySendResult_(store, key, claimToken, decision || { kind: 'skipped', reason: 'Claim lost.' }, summary);
          saveStore_(store); // single save for this write-back
        });
        continue;
      }

      // HTTP strictly outside any lock.
      var result;
      try {
        var sent = sendMessage_(decision.binding, decision.message);
        result = classifyHttp_(sent.code, sent.body);
      } catch (error) {
        result = { kind: 'retry', reason: generalizeError_(error) };
      }

      withWorkerLock_(function () {
        var store = loadStore_();
        applySendResult_(store, key, claimToken, result, summary);
        saveStore_(store); // single save for this write-back
      });
    }

    return summary;
  }

  // ---------- installer ----------

  function install() {
    if (!configured_()) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
    }
    // Strict owner check — empty effective user is rejected.
    requireOwner_();

    var existing = ScriptApp.getProjectTriggers().filter(function (trigger) {
      return trigger.getHandlerFunction() === 'processTelegramNotifications';
    });
    if (existing.length > 0) {
      return {
        installed: true,
        triggerCount: existing.length,
        message: 'Worker trigger already installed.'
      };
    }
    ScriptApp.newTrigger('processTelegramNotifications').timeBased().everyMinutes(1).create();
    return {
      installed: true,
      triggerCount: 1,
      message: 'Worker trigger installed (everyMinutes(1)).'
    };
  }

  // Public surface (frozen). Load must not call Google services.
  return {
    rpc: rpc,
    process: process,
    install: install
  };
})();
