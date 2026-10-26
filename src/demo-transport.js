(function () {
  'use strict';
  let state;
  let liveSeq = 0;
  let liveFallback = 0;
  let backups = [];
  let admins = ['preview-secretary@example.test'];
  let treasurers = ['preview-treasurer@example.test'];
  let ocs = ['preview-oc@example.test'];
  let currentPhase = 1;
  let counter = 0;
  let demoRole = 'owner';
  let docFolders = { templates: 'demo-templates', submissions: 'demo-submissions' };
  const demoFiles = new Map();
  const hubReadMaps = new Map();
  const emails = {
    owner: 'preview-owner@example.test',
    admin: 'preview-secretary@example.test',
    treasurer: 'preview-treasurer@example.test',
    oc: 'preview-oc@example.test',
    os: 'preview-os@example.test',
    ot: 'preview-ot@example.test'
  };
  const context = actor => ({ actor: (actor || identity()).email, now: new Date().toISOString(), uuid: () => 'demo-' + ++counter });
  const identity = () => ({
    email: emails[demoRole] || emails.owner,
    owner: demoRole === 'owner',
    admin: demoRole === 'owner' || demoRole === 'admin',
    treasurer: demoRole === 'owner' || demoRole === 'treasurer',
    oc: demoRole === 'owner' || demoRole === 'admin' || demoRole === 'oc',
    roles: demoRole === 'owner' ? ['owner', 'admin', 'treasurer', 'oc'] : [demoRole]
  });
  const copy = value => KPT.copy(value);
  const liveHash = text => {
    // Mirrors Code.gs liveHash_: SHA-256 of UTF-8 material. Node crypto (tests) and Web Crypto.
    const material = String(text || '');
    if (typeof require === 'function') {
      try {
        const crypto = require('node:crypto');
        return 'sha256.' + crypto.createHash('sha256').update(material, 'utf8').digest('base64url').slice(0, 32);
      } catch (error) { /* fall through */ }
    }
    if (globalThis.crypto && globalThis.crypto.subtle) {
      // Async path is not available here; use a synchronous UTF-8 SHA-256 implementation below.
    }
    // Synchronous SHA-256 (FIPS 180-4) so demo transport stays sync like Apps Script.
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const bytes = [];
    for (let i = 0; i < material.length; i++) {
      let code = material.charCodeAt(i);
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) { bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63)); }
      else if (code < 0xd800 || code >= 0xe000) { bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63)); }
      else { i++; const c2 = material.charCodeAt(i); const cp = 0x10000 + (((code & 0x3ff) << 10) | (c2 & 0x3ff)); bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)); }
    }
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);
    let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Array(64);
    for (let i = 0; i < bytes.length; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = (bytes[i + t * 4] << 24) | (bytes[i + t * 4 + 1] << 16) | (bytes[i + t * 4 + 2] << 8) | bytes[i + t * 4 + 3];
      for (let t = 16; t < 64; t++) {
        const s0 = ((w[t - 15] >>> 7) | (w[t - 15] << 25)) ^ ((w[t - 15] >>> 18) | (w[t - 15] << 14)) ^ (w[t - 15] >>> 3);
        const s1 = ((w[t - 2] >>> 17) | (w[t - 2] << 15)) ^ ((w[t - 2] >>> 19) | (w[t - 2] << 13)) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      H = [(H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0, (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0];
    }
    const hex = H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
    let b64 = '';
    try { b64 = (typeof btoa === 'function' ? btoa(String.fromCharCode.apply(null, H.flatMap(x => [(x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255]))) : hex); } catch (error) { b64 = hex; }
    return 'sha256.' + String(b64).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_').slice(0, 32);
  };
  const permissionFingerprint = actor => liveHash([
    String(actor && actor.email || ''),
    actor && actor.owner ? '1' : '0',
    actor && actor.admin ? '1' : '0',
    actor && actor.treasurer ? '1' : '0',
    actor && actor.oc ? '1' : '0',
    admins.slice().sort().join(','),
    treasurers.slice().sort().join(','),
    ocs.slice().sort().join(',')
  ].join('|'));
  const liveChangeKey = (actor, revisionMarker, seqMarker) => liveHash([
    String(actor && actor.email || ''),
    permissionFingerprint(actor),
    String(revisionMarker || 0),
    String(seqMarker || 0),
    String(liveFallback || 0)
  ].join('|'));
  const requireDocuments = actor => { if (!(actor.owner || actor.admin || actor.oc || actor.roles.includes('os') || actor.roles.includes('ot'))) throw new Error('Access denied. Documents access is required.'); };
  const requireApprover = actor => { if (!(actor.owner || actor.admin)) throw new Error('Access denied. Only Owner or Secretary can approve documents.'); };
  const requireFinanceApprover = actor => { if (!(actor.owner || actor.treasurer)) throw new Error('Access denied. Only Owner or Divisional Treasurer can approve finance.'); };
  const requireOwner = actor => { if (!actor.owner) throw new Error('Only the owner can perform this action.'); };
  const packageRolesForEmail = (pkg, email) => {
    const mail = String(email || '').trim().toLowerCase();
    const roles = [];
    if (!pkg || !mail) return roles;
    if (String(pkg.ocEmail || '').trim().toLowerCase() === mail) roles.push('oc');
    if (String(pkg.osEmail || '').trim().toLowerCase() === mail) roles.push('os');
    if (String(pkg.otEmail || '').trim().toLowerCase() === mail) roles.push('ot');
    return roles;
  };
  const packageRole = (pkg, actor) => {
    if (actor.owner || actor.admin) return 'admin';
    return packageRolesForEmail(pkg, actor.email)[0] || '';
  };
  const resolveDocPackage = (packageId, itemId) => {
    if (itemId) {
      const item = state.DocItems.find(row => row.id === itemId);
      if (!item) throw new Error('Document item not found.');
      if (packageId && String(packageId) !== String(item.packageId || '')) {
        throw new Error('Package does not match the document item.');
      }
      const pkg = state.DocPackages.find(row => row.id === item.packageId);
      if (!pkg) throw new Error('Document package not found.');
      return pkg;
    }
    const pkg = packageId ? state.DocPackages.find(row => row.id === packageId) : null;
    if (!pkg) throw new Error('Document package not found.');
    return pkg;
  };
  const requirePackageRole = (packageId, itemId, allowed, actor) => {
    const pkg = resolveDocPackage(packageId, itemId);
    if (actor.owner || actor.admin) return pkg;
    const roles = packageRolesForEmail(pkg, actor.email);
    for (let i = 0; i < roles.length; i++) {
      if (allowed.indexOf(roles[i]) >= 0) return pkg;
    }
    throw new Error('Access denied. Your package role cannot perform this action.');
  };
  const resolveFinBook = request => {
    const bookId = request.bookId || (request.book && request.book.id) || '';
    const claimed = request.packageId || (request.book && request.book.packageId) || '';
    const book = bookId ? state.FinBooks.find(row => row.id === bookId) : null;
    if (bookId && !book) throw new Error('Finance book not found.');
    if (book) {
      const actual = String(book.packageId || '');
      if (claimed && String(claimed) !== actual) throw new Error('Finance book belongs to another activity package.');
      return book;
    }
    return { id: '', packageId: String(claimed || '') };
  };
  const requireFinBookAccess = (request, actor) => {
    const action = String(request.action || '');
    const book = resolveFinBook(request);
    const packageId = String(book.packageId || '');
    if (actor.owner) return book;
    if (!packageId) {
      if (actor.treasurer && action !== 'checkFinBook' && action !== 'forwardFinBook') return book;
      throw new Error('Access denied. Treasurer access is required.');
    }
    const pkg = state.DocPackages.find(row => row.id === packageId);
    if (!pkg) throw new Error('Document package not found.');
    const roles = packageRolesForEmail(pkg, actor.email);
    if (action === 'checkFinBook' || action === 'forwardFinBook') {
      if (roles.indexOf('oc') >= 0) return book;
      throw new Error('Access denied. Only the assigned OC can check or forward this finance book.');
    }
    if (action === 'saveFinanceBook' || action === 'submitFinBook') {
      if (roles.indexOf('ot') >= 0) return book;
      if (actor.treasurer) return book;
      throw new Error('Access denied. Only the assigned OT can work on this activity finance book.');
    }
    if (action === 'reviewFinBook') {
      if (actor.treasurer) return book;
      throw new Error('Access denied. Only Owner or Divisional Treasurer can approve finance.');
    }
    if (action === 'reopenFinBook') {
      if (actor.admin || actor.treasurer) return book;
      throw new Error('Access denied. Owner or Secretary can reopen.');
    }
    throw new Error('Access denied. Treasurer access is required.');
  };
  function storeFile(fileName, base64) {
    const id = 'demo-file-' + ++counter;
    demoFiles.set(id, { fileName, contentBase64: String(base64 || 'demo'), mime: 'application/octet-stream' });
    return id;
  }
  function mutateWithHub(request, actor) {
    const ctx = context(actor);
    const next = KPT.mutate(state, request, ctx);
    KPT.appendHubEvents(state, next, request, actor, { owner: emails.owner, admins, treasurers }, ctx);
    state = next;
    liveSeq += 1;
  }
  function notificationFeed(actor) {
    return KPT.hubNotificationFeed(state, actor, hubReadMaps.get(actor.email) || {}, new Date().toISOString());
  }
  function receiptContent(request) {
    const fileName = String(request.fileName || '').trim();
    const mime = String(request.mime || '').trim();
    const expected = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' }[(fileName.split('.').pop() || '').toLowerCase()];
    if (!expected || expected !== mime) throw new Error('Choose a JPG, PNG or PDF with a matching file type.');
    const content = String(request.contentBase64 || '');
    if (!content || content.length > Math.ceil(5 * 1024 * 1024 / 3) * 4 || content.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) throw new Error('Attachment is empty, invalid or exceeds 5 MiB.');
    const bytes = atob(content);
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('Attachment is empty or exceeds 5 MiB.');
    const signature = Array.from(bytes.slice(0, 8), char => char.charCodeAt(0));
    const valid = mime === 'image/jpeg' ? signature[0] === 255 && signature[1] === 216 && signature[2] === 255
      : mime === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => signature[index] === value)
        : bytes.startsWith('%PDF-');
    if (!valid) throw new Error('File contents do not match its JPG, PNG or PDF type.');
    return { fileName, mime, contentBase64: content, bytes: bytes.length };
  }
  function backup(reason) { const item = { id: 'backup-' + ++counter, name: 'Preview backup · ' + reason + ' · r' + state.revision, at: new Date().toISOString(), state: copy(state) }; backups.unshift(item); return item; }
  function registerOcEmails(emails) {
    (emails || []).forEach(raw => {
      const value = String(raw || '').trim().toLowerCase();
      if (value && !ocs.includes(value)) ocs.push(value);
    });
  }
  function projectResponse(response, actor, request) {
    if (!response || typeof response !== 'object') return response;
    if (Array.isArray(response)) return response.map(item => (item && typeof item === 'object' && item.state) ? projectResponse(item, actor, request) : item);
    const out = Object.assign({}, response);
    if (out.state) {
      if (typeof KPT.projectForActor !== 'function') throw new Error('KPT.projectForActor is required for state projection.');
      // Filter only the response payload — never replace the in-memory demo state.
      out.state = KPT.projectForActor(out.state, actor);
    }
    if (request && request.action === 'bootstrap') {
      const isOwner = !!(actor && actor.owner);
      out.admins = isOwner ? copy(admins) : [];
      out.treasurers = isOwner ? copy(treasurers) : [];
      out.ocs = isOwner ? copy(ocs) : [];
      out.docFolders = isOwner ? copy(docFolders) : { templates: '', submissions: '' };
    }
    return out;
  }
  async function execute(request, actor) {
      if (!state) { const response = await fetch('demo-private.json'); if (!response.ok) throw new Error('Preview data could not be loaded.'); state = KPT.upgradeState(await response.json()); }
      await new Promise(resolve => setTimeout(resolve, 30));
      if (request.action === 'bootstrap') {
        return { state: copy(state), user: actor, changeKey: liveChangeKey(actor, state.revision, liveSeq), sync: { ok: true, revision: state.revision }, admins: copy(admins), treasurers: copy(treasurers), ocs: copy(ocs), currentPhase, docFolders: copy(docFolders) };
      }
      if (request.action === 'liveProbe') {
        // Per-identity irreversible changeKey only — no global counters or raw lists.
        return {
          changeKey: liveChangeKey(actor, state.revision, liveSeq),
          serverTime: new Date().toISOString()
        };
      }
      if (request.action === 'liveSnapshot') {
        return {
          state: KPT.projectForActor(state, actor),
          user: actor,
          changeKey: liveChangeKey(actor, state.revision, liveSeq),
          feed: notificationFeed(actor),
          sync: { ok: true, revision: state.revision }
        };
      }
      if (request.action === 'getHubNotifications') return notificationFeed(actor);
      if (request.action === 'getTelegramStatus') return { configured: false, botUsername: 'tccdnotifybot', linked: false, enabled: false, telegramUser: null, pending: null, delivery: { pending: 0, failed: 0, lastError: '' }, workerInstalled: false };
      if (['createTelegramBinding', 'confirmTelegramBinding', 'cancelTelegramBinding', 'setTelegramEnabled', 'unlinkTelegram'].includes(request.action)) throw new Error('Telegram linking is available in the deployed system. Local preview does not contact Telegram.');
      if (request.action === 'markHubNotificationsRead') {
        if (!Array.isArray(request.notifications) || request.notifications.length > 100) throw new Error('Choose at most 100 notifications to mark read.');
        const visible = new Map(notificationFeed(actor).notifications.map(row => [row.id, row]));
        const reads = Object.assign({}, hubReadMaps.get(actor.email) || {});
        request.notifications.forEach(row => {
          const event = row && visible.get(row.id);
          const version = Number(row && row.entityVersion);
          if (!event || !Number.isInteger(version) || version < 1 || version > event.entityVersion) return;
          reads[event.id] = Math.max(Number(reads[event.id]) || 0, version);
        });
        hubReadMaps.set(actor.email, reads);
        return notificationFeed(actor);
      }
      if (['uploadFinanceAttachment', 'removeFinanceAttachment', 'downloadFinanceAttachment'].includes(request.action)) {
        if (request.fileId || request.url || request.bytes != null) throw new Error('Access denied. Attachment storage fields are managed by the server.');
        const attachment = (state.finAttachments || []).find(row => row.id === request.attachmentId && row.active);
        if (request.action === 'downloadFinanceAttachment') {
          const visible = KPT.projectForActor(state, actor);
          if (!attachment || !(visible.finAttachments || []).some(row => row.id === attachment.id)) throw new Error('Access denied. Attachment is outside your reading scope.');
          const stored = demoFiles.get(attachment.fileId);
          if (!stored) throw new Error('Attachment file is unavailable.');
          return { fileName: stored.fileName, mime: stored.mime, contentBase64: stored.contentBase64 };
        }
        const bookId = request.action === 'uploadFinanceAttachment' ? request.bookId : attachment && attachment.bookId;
        if (!bookId) throw new Error('Finance attachment not found.');
        requireFinBookAccess({ action: 'saveFinanceBook', bookId }, actor);
        if (request.action === 'uploadFinanceAttachment') {
          const file = receiptContent(request);
          const fileId = 'demo-file-' + ++counter;
          mutateWithHub(Object.assign({}, request, { fileId, bytes: file.bytes }), actor);
          demoFiles.set(fileId, file);
          const saved = state.finAttachments.find(row => row.fileId === fileId);
          return { state: copy(state), sync: { ok: true, revision: state.revision }, attachment: copy(saved) };
        }
        mutateWithHub(Object.assign({}, request, { bookId }), actor);
        return { state: copy(state), sync: { ok: true, revision: state.revision } };
      }
      if (['save', 'attendance', 'saveFinanceBook'].includes(request.action)) {
        if (request.action === 'saveFinanceBook') {
          requireFinBookAccess(request, actor);
        } else if (!actor.admin) throw new Error('Access denied. Administrator access is required.');
        mutateWithHub(request, actor);
        return { state: copy(state), sync: { ok: true, revision: state.revision } };
      }
      const documentActions = ['createDocPackage', 'saveDocPackageMeta', 'saveDocItemsMeta', 'docItemUpload', 'docItemSubmit', 'docItemCheck', 'docItemForward', 'docItemReopen', 'docPackageArchive', 'saveDocTemplate', 'docDownload', 'docItemReview', 'setDocItemTaskStatus'];
      const financeFlowActions = ['submitFinBook', 'checkFinBook', 'forwardFinBook', 'reviewFinBook', 'reopenFinBook'];
      if (financeFlowActions.includes(request.action)) {
        if (request.action === 'reviewFinBook') requireFinanceApprover(actor);
        if (request.action === 'reopenFinBook' && !(actor.owner || actor.admin)) throw new Error('Access denied. Owner or Secretary can reopen.');
        requireFinBookAccess(request, actor);
        mutateWithHub(request, actor);
        return { state: copy(state), sync: { ok: true, revision: state.revision } };
      }
      if (documentActions.includes(request.action)) {
        requireDocuments(actor);
        if (request.action === 'docItemReview') requireApprover(actor);
        if (request.action === 'saveDocTemplate' && !actor.owner) throw new Error('Access denied. Only the owner can manage templates.');
        if (request.action === 'createDocPackage' && !actor.owner) throw new Error('Access denied. Only the owner can create document packages.');
        const packageScoped = ['saveDocPackageMeta', 'saveDocItemsMeta', 'docItemUpload', 'docItemSubmit', 'docItemCheck', 'docItemForward', 'docItemReview', 'docItemReopen', 'docPackageArchive', 'docDownload', 'setDocItemTaskStatus'];
        if (packageScoped.includes(request.action)) {
          const pkg = resolveDocPackage(request.packageId, request.itemId);
          const email = String(actor.email || '').toLowerCase();
          const roles = packageRolesForEmail(pkg, email);
          if (!(actor.owner || actor.admin || roles.length)) {
            throw new Error('Access denied. You are not assigned to this activity package.');
          }
          if (['docItemCheck', 'docItemForward'].includes(request.action)) {
            requirePackageRole(request.packageId, request.itemId, ['oc'], actor);
          }
          if (['docItemUpload', 'docItemSubmit'].includes(request.action) && !(actor.owner || actor.admin)) {
            requirePackageRole(request.packageId, request.itemId, ['os', 'oc'], actor);
          }
          if (request.action === 'saveDocItemsMeta' && !(actor.owner || actor.admin)) {
            request.canEditStructure = false;
            request.canEditDue = roles.indexOf('oc') >= 0;
          }
        }
        if (request.action === 'docDownload') {
          const visible = KPT.projectForActor(state, actor);
          const item = request.itemId ? (visible.DocItems || []).find(row => row.id === request.itemId) : null;
          if (request.itemId && !item) throw new Error('Access denied. Document is outside your reading scope.');
          let template = null;
          if (request.source === 'template' && item && item.templateId) {
            template = (visible.DocTemplates || []).find(row => row.id === item.templateId) || null;
          } else if (request.templateId && !item) {
            template = (visible.DocTemplates || []).find(row => row.id === request.templateId) || null;
            if (!template) throw new Error('Access denied. Template is outside your reading scope.');
          }
          const allowedFileId = request.source === 'template' && item
            ? (template && template.fileId) || ''
            : item
              ? item.fileId
              : (template && template.fileId) || '';
          if (!allowedFileId) throw new Error('No file available to download.');
          if (request.fileId && request.fileId !== allowedFileId) throw new Error('Access denied. File does not match the document.');
          if (request.templateId && item && request.templateId !== item.templateId) throw new Error('Access denied. Template does not match the document.');
          const stored = demoFiles.get(allowedFileId);
          if (!stored) throw new Error('No file available to download.');
          return { fileName: stored.fileName, contentBase64: stored.contentBase64 };
        }
        if (request.action === 'docItemUpload') {
          // Caller-supplied fileId is rejected — server generates the ID from fileBase64 only.
          if (request.fileId) throw new Error('Access denied. Upload must send fileBase64.');
          if (!request.fileBase64) throw new Error('Upload must send fileBase64.');
          request = Object.assign({}, request, { fileId: storeFile(request.fileName, request.fileBase64) });
        }
        if (request.action === 'createDocPackage' || request.action === 'saveDocPackageMeta') {
          registerOcEmails([request.ocEmail, request.osEmail, request.otEmail]);
        }
        if (request.action === 'saveDocTemplate' && request.fileBase64) {
          request = Object.assign({}, request, { row: Object.assign({}, request.row, { fileId: storeFile(request.row.fileName, request.fileBase64) }) });
        }
        if (request.action === 'createDocPackage' && !request.revision) request = Object.assign({}, request, { revision: state.revision });
        mutateWithHub(request, actor);
        if (request.action === 'createDocPackage') {
          const created = state.DocPackages[state.DocPackages.length - 1];
          return { state: copy(state), sync: { ok: true, revision: state.revision }, packageId: created.id };
        }
        if (request.action === 'saveDocTemplate') {
          const saved = state.DocTemplates[state.DocTemplates.length - 1];
          return { state: copy(state), sync: { ok: true, revision: state.revision }, template: copy(saved) };
        }
        return { state: copy(state), sync: { ok: true, revision: state.revision } };
      }
      if (request.action === 'initDocFolders') {
        requireOwner(actor);
        docFolders = { templates: 'demo-templates', submissions: 'demo-submissions' };
        return copy(docFolders);
      }
      if (['previewDelete', 'previewDeleteAllMembers'].includes(request.action)) {
        requireOwner(actor);
        return request.action === 'previewDelete' ? KPT.recycleBundle(state, request.table, request.id) : KPT.allMembersBundle(state);
      }
      if (['deleteRecord', 'deleteAllMembers', 'restoreTrash', 'purgeTrash', 'restore', 'setAdmins', 'setAccess', 'setCurrentPhase', 'installBackup'].includes(request.action)) {
        requireOwner(actor);
      }
      if (['previewImport', 'commitImport', 'previewSetupDefaults', 'applySetupDefaults'].includes(request.action) && !actor.admin && !actor.owner) {
        throw new Error('Access denied. Administrator access is required.');
      }
      if (request.action === 'previewImport' || request.action === 'commitImport') {
        if (request.revision !== state.revision) throw new Error('Conflict: reload current data before importing.');
        const preview = KPT.importRows(state, request.workbook, context(actor));
        if (request.action === 'previewImport') return { changes: preview.changes, errors: preview.errors, revision: preview.revision };
        if (preview.errors.length) throw new Error('Import has validation errors.');
        if (preview.changes.length) { backup('Before import'); state = preview.state; }
        return { state: copy(state), sync: { ok: true }, unchanged: !preview.changes.length };
      }
      if (request.action === 'previewSetupDefaults') return KPT.setupPreview(state);
      if (request.action === 'applySetupDefaults') {
        backup('Before recommended setup');
        state = KPT.applyRecommendedSetup(state, Object.assign(context(actor), { revision: request.revision }));
        return { state: copy(state), sync: { ok: true, revision: state.revision } };
      }
      if (request.action === 'retrySync') {
        if (!actor.owner && !actor.admin) throw new Error('Access denied. Administrator access is required.');
        return { state: copy(state), sync: { ok: true } };
      }
      if (request.action === 'backup') {
        if (!actor.owner && !actor.admin) throw new Error('Access denied. Administrator access is required.');
        const item = backup('Manual');
        return { id: item.id, name: item.name };
      }
      if (request.action === 'listBackups') {
        if (!actor.admin && !actor.owner) throw new Error('Access denied. Administrator access is required.');
        return backups.map(item => ({ id: item.id, name: item.name, at: item.at }));
      }
      if (request.action === 'restore') {
        if (request.revision !== state.revision) throw new Error('Conflict: reload before restoring.');
        const item = backups.find(row => row.id === request.backupId);
        if (!item) throw new Error('Backup not found.');
        const next = copy(item.state);
        next.revision = state.revision;
        next.sequence = Math.max(next.sequence, state.sequence);
        KPT.tables.forEach(table => next[table].forEach(row => { row.version = Math.max(row.version, (state[table].find(previous => previous.id === row.id) || {}).version || 0) + 1; }));
        backup('Before restore');
        state = KPT.finish(next, actor.email, 'Restore preview backup', new Date().toISOString());
        return { state: copy(state), sync: { ok: true } };
      }
      if (request.action === 'setAdmins' || request.action === 'setAccess') {
        if (request.action === 'setAccess') {
          admins = request.admins || [];
          treasurers = request.treasurers || [];
          ocs = request.ocs || [];
          return { admins: copy(admins), treasurers: copy(treasurers), ocs: copy(ocs) };
        }
        admins = request.emails;
        return copy(admins);
      }
      if (request.action === 'setCurrentPhase') {
        const phase = Number(request.phase);
        if (!Number.isInteger(phase) || phase < 1 || phase > 6) throw new Error('Choose a phase from 1 to 6.');
        currentPhase = phase;
        return { currentPhase };
      }
      if (request.action === 'installBackup') return { message: 'Preview only. Daily backup is scheduled when deployed to Google.' };
      throw new Error('Unsupported preview action.');
  }
  window.KPTTransport = {
    demo: true,
    publicUrl: 'index.html',
    async setDemoRole(role) {
      if (!['owner', 'admin', 'treasurer', 'oc', 'os', 'ot'].includes(role)) throw new Error('Unknown demo role.');
      demoRole = role;
      return identity();
    },
    async call(request) {
      const actor = identity();
      const response = await execute(request, actor);
      return projectResponse(response, actor, request);
    }
  };
})();
