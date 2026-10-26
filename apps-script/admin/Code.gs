function properties_() { return PropertiesService.getScriptProperties(); }
function installTelegramNotifications() { return TCCDTelegram.install(); }
function processTelegramNotifications() { return TCCDTelegram.process(); }
function configuration_() {
  const props = properties_();
  const owner = String(props.getProperty('OWNER_EMAIL') || '').trim().toLowerCase();
  if (!owner) throw new Error('Owner has not configured the application.');
  const admins = JSON.parse(props.getProperty('ADMINS') || props.getProperty('ADMIN_EMAILS') || '[]').map(email => String(email).trim().toLowerCase());
  const treasurers = JSON.parse(props.getProperty('TREASURER_EMAILS') || '[]').map(email => String(email).trim().toLowerCase());
  const ocs = JSON.parse(props.getProperty('OC_EMAILS') || '[]').map(email => String(email).trim().toLowerCase());
  return { owner, admins, treasurers, ocs, privateId: props.getProperty('PRIVATE_SHEET_ID'), publicId: props.getProperty('PUBLIC_SHEET_ID'), backupsId: props.getProperty('BACKUP_FOLDER_ID'), templatesId: props.getProperty('DOC_TEMPLATES_FOLDER_ID'), submissionsId: props.getProperty('DOC_SUBMISSIONS_FOLDER_ID') };
}
function actorFromEmail_(email) {
  const config = configuration_();
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) throw new Error('Sign in with the authorised Google account.');
  const isOwner = normalized === config.owner;
  const isAdmin = config.admins.includes(normalized);
  const isTreasurer = config.treasurers.includes(normalized);
  const inOcList = config.ocs.includes(normalized);
  return {
    email: normalized,
    owner: isOwner,
    admin: isOwner || isAdmin,
    treasurer: isOwner || isTreasurer,
    oc: isOwner || inOcList,
    config
  };
}
function registerPackageRoleEmails_(emails) {
  const props = properties_();
  let ocs = [];
  try { ocs = JSON.parse(props.getProperty('OC_EMAILS') || '[]'); } catch (error) { ocs = []; }
  const set = new Set(ocs.map(v => String(v).trim().toLowerCase()).filter(Boolean));
  let changed = false;
  (emails || []).forEach(raw => {
    const value = String(raw || '').trim().toLowerCase();
    if (value && /^[^\s@]+@gmail\.com$/.test(value) && !set.has(value)) {
      set.add(value);
      changed = true;
    }
  });
  if (changed) props.setProperty('OC_EMAILS', JSON.stringify([...set].slice(0, 40)));
}
function isPackageRoleEmail_(email) {
  try {
    const state = loadState_();
    return (state.DocPackages || []).some(pkg => {
      if (pkg.archived || pkg.status === 'Archived') return false;
      return ['ocEmail', 'osEmail', 'otEmail'].map(key => String(pkg[key] || '').trim().toLowerCase()).filter(Boolean).includes(email);
    });
  } catch (error) {
    return false;
  }
}
function identity_(ownerOnly, requireAccess, apiEmail) {
  const config = configuration_();
  let email;
  if (apiEmail) {
    email = String(apiEmail).trim().toLowerCase();
  } else {
    email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
    // Execute-as-deployer web apps may have empty getActiveUser; callers should pass apiEmail.
    if (email && effective && email !== effective && !apiEmail) throw new Error('Sign in using the authorised Google account.');
    if (!email) throw new Error('Sign in with the authorised Google account.');
  }
  const isOwner = email === config.owner;
  const isAdmin = config.admins.includes(email);
  const isTreasurer = config.treasurers.includes(email);
  const isOc = isOwner || config.ocs.includes(email);
  if (requireAccess !== false && !isOwner && !isAdmin && !isTreasurer && !config.ocs.includes(email)) {
    // Portal/API path: allow anyone already assigned as OC/OS/OT on a package, then register for future logins.
    if (apiEmail && isPackageRoleEmail_(email)) {
      registerPackageRoleEmails_([email]);
    } else {
      throw new Error('Access denied. This Google account is not an administrator, officer or treasurer.');
    }
  }
  if (ownerOnly && !isOwner) throw new Error('Only the owner can perform this action.');
  return { email, owner: isOwner, admin: isOwner || isAdmin, treasurer: isOwner || isTreasurer, oc: isOwner || config.ocs.includes(email) || (!isOwner && !isAdmin && !isTreasurer && isPackageRoleEmail_(email)), config };
}
function requireFinance_(actor) {
  if (!actor.owner && !actor.treasurer) throw new Error('Access denied. Treasurer access is required.');
}
function requireAdmin_(actor) {
  if (!actor.owner && !actor.admin) throw new Error('Access denied. Administrator access is required.');
}
function requireDocuments_(actor) {
  if (actor.owner || actor.admin || actor.oc) return;
  throw new Error('Access denied. Documents access is required.');
}
function requireDocumentApprover_(actor) {
  if (actor.owner || actor.admin) return;
  throw new Error('Access denied. Only Owner or Secretary can approve documents.');
}
function requireFinanceApprover_(actor) {
  if (actor.owner || actor.treasurer) return;
  throw new Error('Access denied. Only Owner or Divisional Treasurer can approve finance.');
}
function packageRoleEmails_(pkg) {
  return ['ocEmail', 'osEmail', 'otEmail'].map(key => String(pkg[key] || '').trim().toLowerCase()).filter(Boolean);
}
// All package roles held by this email — concurrent roles must all apply, not first-match only.
function packageRolesForEmail_(pkg, email) {
  const mail = String(email || '').trim().toLowerCase();
  const roles = [];
  if (!pkg || !mail) return roles;
  if (String(pkg.ocEmail || '').trim().toLowerCase() === mail) roles.push('oc');
  if (String(pkg.osEmail || '').trim().toLowerCase() === mail) roles.push('os');
  if (String(pkg.otEmail || '').trim().toLowerCase() === mail) roles.push('ot');
  return roles;
}
function packageRole_(pkg, actor) {
  if (actor.owner || actor.admin) return 'admin';
  const roles = packageRolesForEmail_(pkg, actor.email);
  return roles[0] || '';
}
// Derive the real package from the item. request.packageId must not override item ownership.
function resolveDocPackage_(state, packageId, itemId) {
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
}
function requirePackageAccess_(state, actor, packageId, itemId) {
  const pkg = resolveDocPackage_(state, packageId, itemId);
  if (actor.owner || actor.admin) return pkg;
  const roles = packageRolesForEmail_(pkg, actor.email);
  if (roles.length) return pkg;
  throw new Error('Access denied. You are not assigned to this activity package.');
}
function requirePackageRole_(state, actor, packageId, itemId, allowed) {
  const pkg = resolveDocPackage_(state, packageId, itemId);
  if (actor.owner || actor.admin) return pkg;
  const roles = packageRolesForEmail_(pkg, actor.email);
  for (let i = 0; i < roles.length; i++) {
    if (allowed.indexOf(roles[i]) >= 0) return pkg;
  }
  throw new Error('Access denied. Your package role cannot perform this action.');
}
// Real book ownership always wins. A forged packageId must never retarget an existing book.
function resolveFinBook_(state, request) {
  let bookId = request.bookId || (request.book && request.book.id) || '';
  if (request.attachmentId) {
    const attachment = (state.finAttachments || []).find(row => row.id === request.attachmentId);
    if (attachment) {
      const derived = String(attachment.bookId || '');
      if (bookId && derived && bookId !== derived) throw new Error('Finance attachment belongs to another book.');
      bookId = derived || bookId;
    }
  }
  const claimed = request.packageId || (request.book && request.book.packageId) || '';
  const book = bookId ? state.FinBooks.find(row => row.id === bookId) : null;
  if (bookId && !book) throw new Error('Finance book not found.');
  if (book) {
    const actual = String(book.packageId || '');
    if (claimed && String(claimed) !== actual) throw new Error('Finance book belongs to another activity package.');
    return book;
  }
  return { id: '', packageId: String(claimed || '') };
}
function requireFinBookAccess_(state, actor, request) {
  const action = String(request.action || '');
  const book = resolveFinBook_(state, request);
  const packageId = String(book.packageId || '');
  if (actor.owner) return book;
  // Unlinked books: divisional treasurer finance duties only — OT cannot claim legacy books.
  if (!packageId) {
    if (actor.treasurer && action !== 'checkFinBook' && action !== 'forwardFinBook') return book;
    throw new Error('Access denied. Treasurer access is required.');
  }
  const pkg = state.DocPackages.find(row => row.id === packageId);
  if (!pkg) throw new Error('Document package not found.');
  const roles = packageRolesForEmail_(pkg, actor.email);
  // OC gate stays with the assigned OC (Owner exception above). Treasurer/Admin do not auto-pass.
  if (action === 'checkFinBook' || action === 'forwardFinBook') {
    if (roles.indexOf('oc') >= 0) return book;
    throw new Error('Access denied. Only the assigned OC can check or forward this finance book.');
  }
  // save/submit: assigned OT, or Divisional Treasurer finance duties.
  if (action === 'saveFinanceBook' || action === 'submitFinBook' || action === 'uploadFinanceAttachment' || action === 'removeFinanceAttachment') {
    if (roles.indexOf('ot') >= 0) return book;
    if (actor.treasurer) return book;
    throw new Error('Access denied. Only the assigned OT can work on this activity finance book.');
  }
  // Final review / reopen: Divisional Treasurer (and Secretary reopen via separate gate).
  if (action === 'reviewFinBook') {
    if (actor.treasurer) return book;
    throw new Error('Access denied. Only Owner or Divisional Treasurer can approve finance.');
  }
  if (action === 'reopenFinBook') {
    if (actor.admin || actor.treasurer) return book;
    throw new Error('Access denied. Owner or Secretary can reopen.');
  }
  throw new Error('Access denied. Treasurer access is required.');
}
function portalPublicUrl_() {
  return String(properties_().getProperty('PUBLIC_SITE_URL') || properties_().getProperty('PORTAL_RETURN_URL') || 'https://wsk1234567.github.io/DivisionMemberSystem/');
}
function portalPublicOrigin_() {
  const match = portalPublicUrl_().trim().match(/^(https:\/\/[^/]+)/i);
  if (!match) throw new Error('PUBLIC_SITE_URL must be a valid HTTPS URL.');
  return match[1].toLowerCase();
}
function portalSessionList_() {
  try { return JSON.parse(properties_().getProperty('PORTAL_SESSIONS') || '{}'); } catch (error) { return {}; }
}
function portalSessionSave_(map) {
  const keys = Object.keys(map);
  if (keys.length > 40) {
    keys.sort((a, b) => String(map[b].createdAt || '').localeCompare(String(map[a].createdAt || '')));
    keys.slice(40).forEach(key => { delete map[key]; });
  }
  properties_().setProperty('PORTAL_SESSIONS', JSON.stringify(map));
}
function createPortalSession_(actor, state) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const packages = state.DocPackages.filter(pkg => {
    if (pkg.archived || pkg.status === 'Archived') return false;
    const email = String(actor.email || '').trim().toLowerCase();
    if (!email) return false;
    if (actor.owner || actor.admin) return true;
    return packageRoleEmails_(pkg).includes(email);
  }).map(pkg => ({
    id: pkg.id,
    label: pkg.activityType + ' (' + pkg.year + ')',
    activityType: pkg.activityType,
    year: pkg.year,
    eventDate: pkg.eventDate || '',
    ocEmail: pkg.ocEmail || '',
    osEmail: pkg.osEmail || '',
    otEmail: pkg.otEmail || ''
  }));
  const map = portalSessionList_();
  map[token] = {
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    email: actor.email,
    owner: !!actor.owner,
    admin: !!actor.admin,
    treasurer: !!actor.treasurer,
    oc: !!actor.oc,
    packages
  };
  portalSessionSave_(map);
  return token;
}
function readPortalSession_(token) {
  const map = portalSessionList_();
  const session = map[token];
  if (!session) throw new Error('Login expired. Please sign in again.');
  if (session.expiresAt && session.expiresAt < Date.now()) {
    delete map[token];
    portalSessionSave_(map);
    throw new Error('Login expired. Please sign in again.');
  }
  return session;
}
function portalAdminUrl_() {
  try {
    if (typeof ScriptApp !== 'undefined' && ScriptApp.getService) return ScriptApp.getService().getUrl();
  } catch (error) { /* ignore */ }
  return String(properties_().getProperty('ADMIN_URL') || '');
}
function portalNavbarPayload_(session) {
  return {
    email: session.email,
    owner: !!session.owner,
    admin: !!session.admin,
    treasurer: !!session.treasurer,
    oc: !!session.oc,
    packages: session.packages || [],
    adminUrl: portalAdminUrl_()
  };
}
function encodePortalPayload_(session) {
  const payload = portalNavbarPayload_(session);
  payload.exp = Date.now() + 24 * 60 * 60 * 1000;
  const json = JSON.stringify(payload);
  return Utilities.base64EncodeWebSafe(json);
}
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.api === '1') {
    try {
      let request = null;
      if (params.payload) {
        const raw = decodeURIComponent(String(params.payload));
        request = JSON.parse(raw);
      }
      if (!request) throw new Error('Missing API payload.');
      return apiJson_(apiRpc(request));
    } catch (error) {
      return apiJson_({ ok: false, error: String(error.message || error).slice(0, 500) });
    }
  }
  if (params.portalSession) {
    try {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, data: portalNavbarPayload_(readPortalSession_(String(params.portalSession))) })).setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(error.message || error) })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  if (params.portalLogout) {
    try {
      const map = portalSessionList_();
      delete map[String(params.portalLogout)];
      portalSessionSave_(map);
    } catch (error) { /* ignore */ }
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }
  if (params.mode === 'bridge') {
    return HtmlService.createHtmlOutput(bridgeHtml_())
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  const wantLogin = params.mode === 'login' || params.mode === 'portal' || params.portal === '1';
  try {
    const actor = identity_(false, true);
    if (wantLogin) {
      const state = loadState_();
      const session = createPortalSession_(actor, state);
      const map = portalSessionList_();
      const full = map[session] || { email: actor.email, owner: !!actor.owner, admin: !!actor.admin, treasurer: !!actor.treasurer, oc: !!actor.oc, packages: [] };
      const encoded = encodePortalPayload_(full);
      const base = portalPublicUrl_().replace(/#.*$/, '');
      const target = base + '#portal=' + encoded;
      // Must leave the HtmlService iframe; meta refresh alone often stays stuck on the iframe.
      return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TCCD</title><body style="font-family:system-ui,sans-serif;padding:32px"><p>Signing you in…</p><p><a id="go" href="' + target.replace(/"/g, '&quot;') + '">Continue to member system</a></p><script>var t=' + JSON.stringify(target) + ';try{if(window.top&&window.top!==window){window.top.location.replace(t);}else{window.location.replace(t);}}catch(e){document.getElementById("go").click();}<\/script></body>');
    }
    return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TCCD</title><body style="font-family:system-ui,sans-serif;padding:32px"><h1>TCCD Admin</h1><p>The admin UI is hosted on GitHub Pages.</p><p><a href="' + portalPublicUrl_().replace(/\/$/, '') + '/admin.html">Open admin</a></p></body>');
  } catch (error) {
    return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TCCD • Login</title><body style="font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 20px"><h1>TCCD Division Member System</h1><p>Sign in with the Gmail account granted access by the Owner.</p><p><a class="button" style="display:inline-block;background:#852b3d;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600" href="?mode=login">Sign in with Google</a></p><p style="color:#666;font-size:.9rem">Use Secretary, Treasurer, or Organizing Chairman access. Contact the Owner if you need permission.</p></body>');
  }
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
function book_(id) {
  if (!id) throw new Error('Run initialSetup_ in the script editor first.');
  return SpreadsheetApp.openById(id);
}
function chunks_(value) {
  const json = JSON.stringify(value).replace(/[\u007f-\uffff]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
  const rows = [];
  for (let offset = 0; offset < json.length; offset += 25000) rows.push([json.slice(offset, offset + 25000)]);
  return rows;
}
function writeSlot_(book, slot, value) {
  const name = 'Store' + slot;
  let sheet = book.getSheetByName(name);
  if (!sheet) sheet = book.insertSheet(name);
  const rows = chunks_(value);
  if (sheet.getMaxRows() < rows.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 1).setNumberFormat('@').setValues(rows.map(row => ['KPT:' + row[0]]));
  SpreadsheetApp.flush();
  const verified = readSlot_(book, slot);
  if (JSON.stringify(verified) !== JSON.stringify(value)) throw new Error('Stored data verification failed. Previous version remains active.');
}
function readSlot_(book, slot) {
  const sheet = book.getSheetByName('Store' + slot);
  if (!sheet || !sheet.getLastRow()) throw new Error('Data store is missing.');
  return JSON.parse(sheet.getRange(1, 1, sheet.getLastRow(), 1).getDisplayValues().map(row => { if (!row[0].startsWith('KPT:')) throw new Error('Storage chunk is invalid. Restore a verified backup.'); return row[0].slice(4); }).join(''));
}
function loadState_() {
  const config = configuration_();
  return KPT.upgradeState(readSlot_(book_(config.privateId), properties_().getProperty('CURRENT_SLOT') || '0'));
}
function commit_(state) {
  const slot = properties_().getProperty('CURRENT_SLOT') === '0' ? '1' : '0';
  writeSlot_(book_(configuration_().privateId), slot, state);
  properties_().setProperty('CURRENT_SLOT', slot);
  properties_().setProperty('SYNC_PENDING', String(state.revision));
  liveMarkWrite_(state.revision);
}
function permissionFingerprint_(actor) {
  const config = (actor && actor.config) || configuration_();
  const parts = [
    String(actor && actor.email || ''),
    actor && actor.owner ? '1' : '0',
    actor && actor.admin ? '1' : '0',
    actor && actor.treasurer ? '1' : '0',
    actor && actor.oc ? '1' : '0',
    (config.admins || []).slice().sort().join(','),
    (config.treasurers || []).slice().sort().join(','),
    (config.ocs || []).slice().sort().join(',')
  ];
  // Irreversible only — never return raw lists or parts (would leak other emails).
  return liveHash_(parts.join('|'));
}
function liveHash_(text) {
  const material = String(text || '');
  // SHA-256 only. Hash failure is a hard error — never fall back to a weak 32-bit digest.
  const charset = (Utilities.Charset && Utilities.Charset.UTF_8) || 'UTF-8';
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, material, charset);
  return 'sha256.' + String(Utilities.base64EncodeWebSafe(digest)).replace(/=+$/, '').slice(0, 32);
}
function liveMarkRead_() {
  try { return JSON.parse(properties_().getProperty('LIVE_MARK') || '{}') || {}; } catch (error) { return {}; }
}
function liveFallbackToken_() {
  const props = properties_();
  return String(props.getProperty('LIVE_MARK_FALLBACK') || '') + ':' + String(props.getProperty('LIVE_MARK_DIRTY') || '');
}
function liveMarkWrite_(revision) {
  const props = properties_();
  try {
    const previous = liveMarkRead_();
    props.setProperty('LIVE_MARK', JSON.stringify({
      revision: Number(revision) || 0,
      at: new Date().toISOString(),
      seq: Number(previous.seq || 0) + 1
    }));
    // Marker write succeeded — clear degraded tokens so probes stay stable.
    props.deleteProperty('LIVE_MARK_FALLBACK');
    props.deleteProperty('LIVE_MARK_DIRTY');
  } catch (error) {
    // Marker write failed: do NOT pretend revision-compare still works.
    // Bump an irreversible token so changeKey still moves after a successful save.
    try {
      const prev = Number(props.getProperty('LIVE_MARK_FALLBACK') || '0') || 0;
      props.setProperty('LIVE_MARK_FALLBACK', String(prev + 1));
      props.deleteProperty('LIVE_MARK_DIRTY');
    } catch (error2) {
      try { props.setProperty('LIVE_MARK_DIRTY', String(Date.now()) + '.' + String(revision)); } catch (error3) { /* last resort: next snapshot rebuilds baseline */ }
    }
  }
}
// Per-identity irreversible change key. No global counters, no raw config.
function liveChangeKey_(actor, revisionMarker, seqMarker) {
  return liveHash_([
    String(actor && actor.email || ''),
    permissionFingerprint_(actor),
    String(revisionMarker || 0),
    String(seqMarker || 0),
    liveFallbackToken_()
  ].join('|'));
}
function liveBaseline_(actor, revision, seq) {
  return liveChangeKey_(actor, revision, seq);
}
function sync_(state) {
  try {
    const book = book_(configuration_().publicId);
    let manifest = book.getSheetByName('Manifest');
    if (!manifest) manifest = book.insertSheet('Manifest');
    const slot = String(manifest.getRange('A1').getValue()) === '0' ? '1' : '0';
    writeSlot_(book, slot, KPT.projectPublic(state));
    manifest.getRange('A1:B1').setValues([[slot, state.revision]]);
    SpreadsheetApp.flush();
    properties_().setProperty('PUBLISHED_REVISION', String(state.revision));
    properties_().deleteProperty('SYNC_PENDING');
    return { ok: true, revision: state.revision };
  } catch (error) {
    properties_().setProperty('SYNC_PENDING', String(state.revision));
    return { ok: false, revision: state.revision, message: 'Private data saved. Public update failed; use Retry public update. Check Google permissions or quotas.' };
  }
}
function context_(actor) { return { actor, now: new Date().toISOString(), uuid: () => Utilities.getUuid() }; }
function docMime_(fileName) {
  const ext = String(fileName || '').slice(String(fileName || '').lastIndexOf('.')).toLowerCase();
  const map = { '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.pdf': 'application/pdf', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.zip': 'application/zip' };
  return map[ext] || 'application/octet-stream';
}
function storeDocFile_(folderId, fileName, base64) {
  if (!folderId) throw new Error('Document folders are not initialised. Owner must run Initialize document folders.');
  const blob = Utilities.newBlob(Utilities.base64Decode(String(base64 || '')), docMime_(fileName), String(fileName));
  return DriveApp.getFolderById(folderId).createFile(blob).getId();
}
function docDownload_(state, request) {
  let fileId = request.fileId || '';
  let fallbackName = request.fileName || '';
  if (!fileId && request.itemId) {
    const item = state.DocItems.find(row => row.id === request.itemId);
    if (!item) throw new Error('Document item not found.');
    if (request.source === 'template' && item.templateId) {
      const template = state.DocTemplates.find(row => row.id === item.templateId);
      fileId = template ? template.fileId : '';
      fallbackName = template ? template.fileName : '';
    } else {
      fileId = item.fileId;
      fallbackName = item.fileName;
    }
  }
  if (!fileId && request.templateId) {
    const template = state.DocTemplates.find(row => row.id === request.templateId);
    if (!template) throw new Error('Template not found.');
    fileId = template.fileId;
    fallbackName = template.fileName;
  }
  if (!fileId) throw new Error('No file available to download.');
  const file = DriveApp.getFileById(fileId);
  return { fileName: file.getName() || fallbackName, mime: file.getMimeType(), contentBase64: Utilities.base64Encode(file.getBlob().getBytes()) };
}
function hubReadsHeader_() { return ['userEmail', 'eventId', 'seenVersion']; }
function hubEnsureReadsSheet_(book) {
  let sheet = book.getSheetByName('HubNotificationReads');
  if (!sheet) {
    sheet = book.insertSheet('HubNotificationReads');
    sheet.getRange(1, 1, 1, 3).setValues([hubReadsHeader_()]);
    return sheet;
  }
  if (sheet.getLastRow() < 1) sheet.getRange(1, 1, 1, 3).setValues([hubReadsHeader_()]);
  return sheet;
}
function hubLoadReadMap_(book, email) {
  const sheet = book.getSheetByName('HubNotificationReads');
  if (!sheet) return {};
  const last = sheet.getLastRow();
  if (last < 2) return {};
  const rows = sheet.getRange(2, 1, last - 1, 3).getDisplayValues();
  const map = {};
  rows.forEach(row => {
    if (String(row[0]).trim().toLowerCase() === email) {
      const seen = Number(row[2]);
      if (row[1] && Number.isFinite(seen)) map[String(row[1])] = seen;
    }
  });
  return map;
}
function hubMarkRead_(book, email, entries, state, actor) {
  const feed = KPT.hubNotificationFeed(state, actor, hubLoadReadMap_(book, email), new Date().toISOString());
  const visibleById = new Map(feed.notifications.map(item => [item.id, item]));
  const merged = new Map();
  (entries || []).slice(0, 200).forEach(entry => {
    const id = String(entry && entry.id || '');
    if (!id) return;
    const item = visibleById.get(id);
    if (!item) return;
    const requested = Number(entry.entityVersion);
    if (!Number.isInteger(requested) || requested < 1 || requested > Number(item.entityVersion)) return;
    if (!merged.has(id) && merged.size >= 100) return;
    const prior = merged.get(id) || 0;
    merged.set(id, Math.max(prior, requested));
  });
  if (!merged.size) return hubLoadReadMap_(book, email);
  const sheet = hubEnsureReadsSheet_(book);
  const last = sheet.getLastRow();
  const existing = last > 1 ? sheet.getRange(2, 1, last - 1, 3).getDisplayValues() : [];
  const rowIndex = new Map();
  existing.forEach((row, i) => {
    const key = String(row[0]).trim().toLowerCase() + '|' + String(row[1]);
    rowIndex.set(key, i);
  });
  const appends = [];
  const updates = [];
  merged.forEach((version, id) => {
    const key = email + '|' + id;
    if (rowIndex.has(key)) {
      const i = rowIndex.get(key);
      const prior = Number(existing[i][2]);
      const stored = Number.isFinite(prior) ? Math.max(prior, version) : version;
      if (stored !== prior) {
        existing[i][2] = String(stored);
        updates.push(true);
      }
    } else {
      appends.push([email, id, String(version)]);
    }
  });
  if (updates.length && existing.length) {
    sheet.getRange(2, 1, existing.length, 3).setValues(existing.map(row => [row[0], row[1], String(row[2])]));
  }
  if (appends.length) {
    const needed = sheet.getLastRow() + appends.length;
    if (needed > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), needed - sheet.getMaxRows());
    sheet.getRange(sheet.getLastRow() + 1, 1, appends.length, 3).setValues(appends);
  }
  return hubLoadReadMap_(book, email);
}
function finReceiptsFolderId_() {
  const props = properties_();
  let folderId = props.getProperty('FIN_RECEIPTS_FOLDER_ID');
  if (folderId) return folderId;
  const folder = DriveApp.createFolder('TCCD Finance Receipts');
  folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  folderId = folder.getId();
  props.setProperty('FIN_RECEIPTS_FOLDER_ID', folderId);
  return folderId;
}
function finByteAt_(bytes, index) {
  const value = bytes[index];
  return (typeof value === 'number' ? value : Number(value)) & 255;
}
function finAttachmentMimeFromHeader_(bytes) {
  if (!bytes || bytes.length < 3) return '';
  const b0 = finByteAt_(bytes, 0), b1 = finByteAt_(bytes, 1), b2 = finByteAt_(bytes, 2), b3 = bytes.length > 3 ? finByteAt_(bytes, 3) : -1, b4 = bytes.length > 4 ? finByteAt_(bytes, 4) : -1;
  if (b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF) return 'image/jpeg';
  if (bytes.length >= 8 && b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47 && b4 === 0x0D && finByteAt_(bytes, 5) === 0x0A && finByteAt_(bytes, 6) === 0x1A && finByteAt_(bytes, 7) === 0x0A) return 'image/png';
  if (b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46 && b4 === 0x2D) return 'application/pdf';
  return '';
}
function finAttachmentAllowed_(fileName) {
  const name = String(fileName || '');
  const dot = name.lastIndexOf('.');
  const extension = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  const map = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf' };
  return map[extension] || '';
}
function finAttachmentEditable_(book) {
  return book && (book.status === 'Draft' || book.status === 'Rejected');
}
function withLock_(work) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Another save is in progress. Please retry shortly.');
  try { return work(); } finally { lock.releaseLock(); }
}
function backup_(state, reason) {
  const folder = DriveApp.getFolderById(configuration_().backupsId);
  const payload = { schema: 1, createdAt: new Date().toISOString(), reason, state };
  const file = folder.createFile('TCCD-' + payload.createdAt.replace(/[:.]/g, '-') + '-r' + state.revision + '.json', JSON.stringify(payload), 'application/json');
  return { id: file.getId(), name: file.getName() };
}
function listBackups_() {
  const files = DriveApp.getFolderById(configuration_().backupsId).getFiles();
  const rows = [];
  while (files.hasNext()) { const file = files.next(); if (/^(KPT|TCCD)-/.test(file.getName()) && file.getMimeType() === 'application/json') rows.push({ id: file.getId(), name: file.getName(), at: file.getDateCreated().toISOString() }); }
  return rows.sort((first, second) => second.at.localeCompare(first.at));
}
function bootstrap_(actor) {
  const state = loadState_();
  const currentPhase = Number(properties_().getProperty('CURRENT_PHASE') || 1);
  const mark = liveMarkRead_();
  if (Number(mark.revision || 0) !== state.revision) liveMarkWrite_(state.revision);
  const markAfter = liveMarkRead_();
  return {
    state: KPT.projectForActor(state, actor),
    user: {
      email: actor.email,
      owner: actor.owner,
      admin: actor.admin,
      treasurer: actor.treasurer,
      oc: actor.oc,
      roles: [actor.owner ? 'owner' : null, actor.admin ? 'admin' : null, actor.treasurer ? 'treasurer' : null, actor.oc ? 'oc' : null].filter(Boolean)
    },
    changeKey: liveChangeKey_(actor, state.revision, markAfter.seq),
    sync: { ok: properties_().getProperty('SYNC_PENDING') === null, revision: Number(properties_().getProperty('PUBLISHED_REVISION') || -1) },
    admins: actor.owner ? actor.config.admins : [],
    treasurers: actor.owner ? actor.config.treasurers : [],
    ocs: actor.owner ? actor.config.ocs : [],
    currentPhase: Number.isInteger(currentPhase) && currentPhase >= 1 && currentPhase <= 6 ? currentPhase : 1,
    docFolders: actor.owner ? { templates: actor.config.templatesId || '', submissions: actor.config.submissionsId || '' } : { templates: '', submissions: '' }
  };
}
// Public Apps Script entry point must derive identity from the session, never a caller email.
function rpc(request) {
  return rpcForEmail_(request);
}
// Only verified API/bridge callers pass an email through this private function.
function rpcForEmail_(request, apiEmail) {
  try {
    const actor = identity_(false, true, apiEmail);
    const response = rpcInternal_(request, apiEmail);
    if (response.ok && response.data && response.data.state) {
      response.data.state = KPT.projectForActor(response.data.state, actor);
    }
    return response;
  } catch (error) {
    return { ok: false, error: String(error.message || error).slice(0, 500) };
  }
}
function rpcInternal_(request, apiEmail) {
  try {
    if (!request || typeof request !== 'object') throw new Error('Invalid request.');
    const ownerOnlyActions = ['restore', 'setAdmins', 'setAccess', 'installBackup', 'setCurrentPhase', 'previewDelete', 'deleteRecord', 'previewDeleteAllMembers', 'deleteAllMembers', 'restoreTrash', 'purgeTrash', 'initDocFolders'];
    const adminOnlyActions = ['previewImport', 'commitImport', 'previewSetupDefaults', 'applySetupDefaults'];
    const financeActions = ['saveFinanceBook', 'submitFinBook', 'checkFinBook', 'forwardFinBook', 'reviewFinBook', 'reopenFinBook', 'uploadFinanceAttachment', 'removeFinanceAttachment'];
    const memberDataActions = ['save', 'attendance'];
    const documentActions = ['createDocPackage', 'saveDocPackageMeta', 'saveDocItemsMeta', 'docItemUpload', 'docItemSubmit', 'docItemCheck', 'docItemForward', 'docItemReopen', 'docPackageArchive', 'saveDocTemplate', 'docDownload'];
    const documentApproveActions = ['docItemReview'];
    const documentOcActions = ['docItemCheck', 'docItemForward'];
    const documentSubmitActions = ['docItemUpload', 'docItemSubmit'];
    if (request.action === 'bootstrap') return withLock_(() => ({ ok: true, data: bootstrap_(identity_(false, true, apiEmail)) }));
    // Lightweight live probe: no Sheet read, no business state, no writes.
    // Returns only a per-identity irreversible changeKey — never global counters or raw config.
    if (request.action === 'liveProbe') {
      const actor = identity_(false, true, apiEmail);
      const mark = liveMarkRead_();
      return {
        ok: true,
        data: {
          changeKey: liveChangeKey_(actor, mark.revision, mark.seq),
          serverTime: new Date().toISOString()
        }
      };
    }
    // Authorized snapshot — only after probe reports a change. Read-only for business data.
    if (request.action === 'liveSnapshot') {
      return withLock_(() => {
        const actor = identity_(false, true, apiEmail);
        const state = loadState_();
        const mark = liveMarkRead_();
        // Establish/update baseline marker so existing production data is not stuck at 0.
        if (Number(mark.revision || 0) !== state.revision) liveMarkWrite_(state.revision);
        const markAfter = liveMarkRead_();
        const readMap = hubLoadReadMap_(book_(actor.config.privateId), actor.email);
        return {
          ok: true,
          data: {
            state: KPT.projectForActor(state, actor),
            user: {
              email: actor.email,
              owner: actor.owner,
              admin: actor.admin,
              treasurer: actor.treasurer,
              oc: actor.oc,
              roles: [actor.owner ? 'owner' : null, actor.admin ? 'admin' : null, actor.treasurer ? 'treasurer' : null, actor.oc ? 'oc' : null].filter(Boolean)
            },
            changeKey: liveChangeKey_(actor, state.revision, markAfter.seq),
            feed: KPT.hubNotificationFeed(state, actor, readMap, new Date().toISOString())
          }
        };
      });
    }
    if (request.action === 'listBackups') {
      const listActor = identity_(false, true, apiEmail);
      requireAdmin_(listActor);
      return { ok: true, data: listBackups_() };
    }
    return withLock_(() => {
      const actor = identity_(ownerOnlyActions.includes(request.action), true, apiEmail);
      if (adminOnlyActions.includes(request.action)) requireAdmin_(actor);
      if (memberDataActions.includes(request.action)) requireAdmin_(actor);
      if (documentActions.includes(request.action) || documentApproveActions.includes(request.action)) requireDocuments_(actor);
      if (documentApproveActions.includes(request.action)) requireDocumentApprover_(actor);
      const state = loadState_();
      const context = context_(actor.email);
      if (['getTelegramStatus', 'createTelegramBinding', 'confirmTelegramBinding', 'cancelTelegramBinding', 'setTelegramEnabled', 'unlinkTelegram'].includes(request.action)) {
        return { ok: true, data: TCCDTelegram.rpc(request, state, actor) };
      }
      const packageScoped = ['saveDocPackageMeta', 'saveDocItemsMeta', 'docItemUpload', 'docItemSubmit', 'docItemCheck', 'docItemForward', 'docItemReview', 'docItemReopen', 'docPackageArchive', 'docDownload', 'setDocItemTaskStatus'];
      if (packageScoped.includes(request.action)) requirePackageAccess_(state, actor, request.packageId, request.itemId);
      if (documentOcActions.includes(request.action)) requirePackageRole_(state, actor, request.packageId, request.itemId, ['oc']);
      if (documentSubmitActions.includes(request.action) && !(actor.owner || actor.admin)) {
        requirePackageRole_(state, actor, request.packageId, request.itemId, ['os', 'oc']);
      }
      if (request.action === 'createDocPackage' && !actor.owner) throw new Error('Access denied. Only the owner can create document packages.');
      if (request.action === 'saveDocPackageMeta') {
        requirePackageAccess_(state, actor, request.packageId, request.itemId);
      }
      if (request.action === 'saveDocItemsMeta') {
        if (!(actor.owner || actor.admin)) request.canEditStructure = false;
        // Only OC (and Owner/Secretary) may change due dates — OS/OT may not.
        if (!(actor.owner || actor.admin)) {
          const itemId = (request.items && request.items[0] && request.items[0].id) || '';
          const item = itemId ? state.DocItems.find(row => row.id === itemId) : null;
          const pkg = item ? state.DocPackages.find(row => row.id === item.packageId) : (request.packageId ? state.DocPackages.find(row => row.id === request.packageId) : null);
          request.canEditDue = packageRole_(pkg || {}, actor) === 'oc';
        }
      }
      if (financeActions.includes(request.action)) {
        requireFinBookAccess_(state, actor, request);
      }
      if (request.action === 'reviewFinBook') {
        requireFinanceApprover_(actor);
      }
      if (request.action === 'reopenFinBook' && !(actor.owner || actor.admin)) throw new Error('Access denied. Owner or Secretary can reopen.');
      if (request.action === 'docItemUpload') {
        requireDocuments_(actor);
        if (!request.fileBase64 || request.fileId) throw new Error('Upload file content; a caller-supplied file ID is not allowed.');
        request.fileId = storeDocFile_(actor.config.submissionsId, request.fileName, request.fileBase64);
      }
      if (request.action === 'saveDocTemplate' && request.fileBase64) {
        if (!actor.owner) throw new Error('Access denied. Only the owner can manage templates.');
        if (!actor.config.templatesId) throw new Error('Document folders are not initialised. Owner must run Initialize document folders.');
        request.row = Object.assign({}, request.row, { fileId: storeDocFile_(actor.config.templatesId, request.row.fileName, request.fileBase64) });
      }
      if (['save', 'attendance', 'saveFinanceBook', 'createDocPackage', 'saveDocPackageMeta', 'saveDocItemsMeta', 'docItemUpload', 'docItemSubmit', 'docItemCheck', 'docItemForward', 'docItemReview', 'docItemReopen', 'docPackageArchive', 'saveDocTemplate', 'submitFinBook', 'checkFinBook', 'forwardFinBook', 'reviewFinBook', 'reopenFinBook', 'setDocItemTaskStatus', 'uploadFinanceAttachment', 'removeFinanceAttachment'].includes(request.action)) {
        if (request.action === 'uploadFinanceAttachment') {
          if (request.fileId || request.bytes != null) throw new Error('Caller-supplied internal attachment fields are not allowed.');
          if (request.revision !== state.revision) throw new Error('Conflict: newer data is available. Reload before uploading.');
          const preBook = state.FinBooks.find(row => row.id === request.bookId);
          if (!preBook) throw new Error('Finance book not found.');
          if (!finAttachmentEditable_(preBook)) throw new Error('Only draft or returned finance books can change attachments.');
          const activeList = (state.finAttachments || []).filter(row => row.bookId === preBook.id && row.active);
          if (activeList.length >= 30) throw new Error('A finance book allows at most 30 active attachments.');
          const existingBytes = activeList.reduce((sum, row) => sum + (Number(row.bytes) || 0), 0);
          if (!request.contentBase64) throw new Error('Attachment content is required.');
          const declaredMime = finAttachmentAllowed_(request.fileName);
          if (!declaredMime) throw new Error('Allowed attachments: JPG, PNG, PDF.');
          if (request.mime && request.mime !== declaredMime) throw new Error('Declared type does not match the file extension.');
          const bytes = Utilities.base64Decode(String(request.contentBase64 || ''));
          if (!bytes || !bytes.length) throw new Error('Attachment content is empty.');
          if (bytes.length > 5 * 1024 * 1024) throw new Error('Attachment exceeds the 5 MiB limit.');
          if (existingBytes + bytes.length > 50 * 1024 * 1024) throw new Error('A finance book allows at most 50 MiB of attachments.');
          const headerMime = finAttachmentMimeFromHeader_(bytes);
          if (headerMime !== declaredMime) throw new Error('Attachment content does not match the declared type.');
          const folderId = finReceiptsFolderId_();
          const blob = Utilities.newBlob(bytes, declaredMime, String(request.fileName));
          const file = DriveApp.getFolderById(folderId).createFile(blob);
          request.fileId = file.getId();
          request.bytes = bytes.length;
          request.mime = declaredMime;
          delete request.contentBase64;
        }
        if (request.action === 'removeFinanceAttachment') {
          const attachment = (state.finAttachments || []).find(row => row.id === request.attachmentId);
          if (!attachment) throw new Error('Finance attachment not found.');
          const ownerBook = state.FinBooks.find(row => row.id === attachment.bookId);
          if (!finAttachmentEditable_(ownerBook)) throw new Error('Only draft or returned finance books can change attachments.');
        }
        const next = KPT.mutate(state, request, context);
        if (request.action === 'createDocPackage' || request.action === 'saveDocPackageMeta') {
          registerPackageRoleEmails_([request.ocEmail, request.osEmail, request.otEmail]);
        }
        KPT.appendHubEvents(state, next, request, actor.email, { owner: actor.config.owner, admins: actor.config.admins, treasurers: actor.config.treasurers }, context);
        commit_(next);
        const sync = sync_(next);
        if (request.action === 'uploadFinanceAttachment') {
          const attachment = (next.finAttachments || []).find(row => row.bookId === request.bookId && row.fileId === request.fileId && row.active);
          return { ok: true, data: { state: next, sync, attachment } };
        }
        return { ok: true, data: { state: next, sync } };
      }
      if (request.action === 'getHubNotifications') {
        const readMap = hubLoadReadMap_(book_(actor.config.privateId), actor.email);
        return { ok: true, data: KPT.hubNotificationFeed(state, actor, readMap, new Date().toISOString()) };
      }
      if (request.action === 'markHubNotificationsRead') {
        const entries = Array.isArray(request.notifications) ? request.notifications.slice(0, 200) : [];
        const readMap = hubMarkRead_(book_(actor.config.privateId), actor.email, entries, state, actor);
        return { ok: true, data: KPT.hubNotificationFeed(state, actor, readMap, new Date().toISOString()) };
      }
      if (request.action === 'downloadFinanceAttachment') {
        const visible = KPT.projectForActor(state, actor);
        const attachment = (visible.finAttachments || []).find(row => row.id === request.attachmentId && row.active);
        if (!attachment) throw new Error('Access denied. Attachment is outside your reading scope.');
        const file = DriveApp.getFileById(attachment.fileId);
        return { ok: true, data: { fileName: file.getName() || attachment.fileName, mime: file.getMimeType() || attachment.mime, contentBase64: Utilities.base64Encode(file.getBlob().getBytes()) } };
      }
      if (request.action === 'docDownload') {
        requireDocuments_(actor);
        const visible = KPT.projectForActor(state, actor);
        const item = visible.DocItems.find(row => row.id === request.itemId);
        if (!item) throw new Error('Access denied. Document is outside your reading scope.');
        const template = request.source === 'template' ? visible.DocTemplates.find(row => row.id === item.templateId) : null;
        const allowedFileId = request.source === 'template' ? (template && template.fileId) : item.fileId;
        if (!allowedFileId) throw new Error('No file available to download.');
        if (request.fileId && request.fileId !== allowedFileId) throw new Error('Access denied. File does not match the document.');
        if (request.templateId && request.templateId !== item.templateId) throw new Error('Access denied. Template does not match the document.');
        request = Object.assign({}, request, { fileId: allowedFileId || '', templateId: '' });
        const result = docDownload_(visible, request);
        return { ok: true, data: result };
      }
      if (request.action === 'previewDelete') return { ok: true, data: KPT.recycleBundle(state, request.table, request.id) };
      if (request.action === 'previewDeleteAllMembers') return { ok: true, data: KPT.allMembersBundle(state) };
      if (['deleteRecord', 'deleteAllMembers', 'restoreTrash', 'purgeTrash'].includes(request.action)) {
        context.revision = request.revision;
        backup_(state, request.action === 'deleteRecord' ? 'Before moving record to Recycle Bin' : request.action === 'deleteAllMembers' ? 'Before deleting all students' : request.action === 'restoreTrash' ? 'Before restoring Recycle Bin item' : 'Before permanent deletion');
        const next = request.action === 'deleteRecord' ? KPT.recycleDelete(state, request.table, request.id, context) : request.action === 'deleteAllMembers' ? KPT.recycleDeleteAllMembers(state, context) : request.action === 'restoreTrash' ? KPT.restoreTrash(state, request.trashId, context) : KPT.purgeTrash(state, request.trashId, context);
        commit_(next);
        return { ok: true, data: { state: next, sync: sync_(next) } };
      }
      if (request.action === 'previewImport') {
        if (request.revision !== state.revision) throw new Error('Conflict: reload data before importing.');
        const preview = KPT.importRows(state, request.workbook, context);
        return { ok: true, data: { changes: preview.changes, errors: preview.errors, revision: preview.revision } };
      }
      if (request.action === 'previewSetupDefaults') return { ok: true, data: KPT.setupPreview(state) };
      if (request.action === 'applySetupDefaults') {
        if (request.revision !== state.revision) throw new Error('Conflict: reload before applying setup.');
        backup_(state, 'Before applying recommended system setup');
        const next = KPT.applyRecommendedSetup(state, Object.assign({}, context, { revision: request.revision }));
        commit_(next);
        return { ok: true, data: { state: next, sync: sync_(next) } };
      }
      if (request.action === 'commitImport') {
        if (request.revision !== state.revision) throw new Error('Conflict: data changed since preview. Preview the file again.');
        const preview = KPT.importRows(state, request.workbook, context);
        if (preview.errors.length) throw new Error('Import failed validation. Preview the file again.');
        if (!preview.changes.length) return { ok: true, data: { state, sync: { ok: properties_().getProperty('SYNC_PENDING') === null }, unchanged: true } };
        backup_(state, 'Before Excel import');
        commit_(preview.state);
        return { ok: true, data: { state: preview.state, sync: sync_(preview.state) } };
      }
      if (request.action === 'retrySync') { requireAdmin_(actor); return { ok: true, data: { state, sync: sync_(state) } }; }
      if (request.action === 'backup') { requireAdmin_(actor); return { ok: true, data: backup_(state, 'Manual backup') }; }
      if (request.action === 'restore') {
        if (request.revision !== state.revision) throw new Error('Conflict: reload before restoring.');
        const file = DriveApp.getFileById(request.backupId);
        const parents = file.getParents();
        let allowed = false;
        while (parents.hasNext()) if (parents.next().getId() === actor.config.backupsId) allowed = true;
        if (!allowed || !/^(KPT|TCCD)-/.test(file.getName())) throw new Error('Select a backup from the private backup folder.');
        const payload = JSON.parse(file.getBlob().getDataAsString());
        if (payload.schema !== 1 || !payload.state) throw new Error('Invalid backup format.');
        const restored = KPT.upgradeState(payload.state);
        KPT.validateState(restored);
        restored.revision = state.revision;
        restored.sequence = Math.max(restored.sequence, state.sequence);
        KPT.tables.forEach(table => restored[table].forEach(row => { row.version = Math.max(row.version, (state[table].find(item => item.id === row.id) || {}).version || 0) + 1; }));
        KPT.finish(restored, actor.email, 'Restore backup ' + file.getName(), context.now);
        backup_(state, 'Before restore');
        commit_(restored);
        return { ok: true, data: { state: restored, sync: sync_(restored) } };
      }
      if (request.action === 'setAdmins' || request.action === 'setAccess') {
        const normalizeList = (list, max) => {
          const values = [...new Set((list || []).map(value => String(value).trim().toLowerCase()))].filter(value => value && value !== actor.config.owner && /^[^\s@]+@gmail\.com$/.test(value));
          if (values.length > max) throw new Error('Use at most ' + max + ' Gmail accounts for this list.');
          return values;
        };
        const admins = normalizeList(request.action === 'setAccess' ? request.admins : request.emails, 5);
        const treasurers = normalizeList(request.action === 'setAccess' ? request.treasurers : [], 8);
        const ocs = normalizeList(request.action === 'setAccess' ? request.ocs : [], 8);
        const previous = new Set([...actor.config.admins, ...actor.config.treasurers, ...actor.config.ocs]);
        const nextSet = new Set([...admins, ...treasurers, ...ocs]);
        const privateFile = DriveApp.getFileById(actor.config.privateId);
        const publicFile = DriveApp.getFileById(actor.config.publicId);
        const folder = DriveApp.getFolderById(actor.config.backupsId);
        const docFolders = [actor.config.templatesId, actor.config.submissionsId].filter(Boolean).map(id => DriveApp.getFolderById(id));
        [...previous].filter(email => !nextSet.has(email)).forEach(email => {
          privateFile.removeEditor(email); publicFile.removeEditor(email); folder.removeEditor(email);
          docFolders.forEach(docFolder => { try { docFolder.removeEditor(email); } catch (error) { /* ignore */ } });
        });
        nextSet.forEach(email => {
          if (previous.has(email)) return;
          privateFile.addEditor(email); publicFile.addEditor(email); folder.addEditor(email);
          docFolders.forEach(docFolder => { try { docFolder.addEditor(email); } catch (error) { /* ignore */ } });
        });
        properties_().setProperty('ADMINS', JSON.stringify(admins));
        properties_().setProperty('ADMIN_EMAILS', JSON.stringify(admins));
        properties_().setProperty('TREASURER_EMAILS', JSON.stringify(treasurers));
        properties_().setProperty('OC_EMAILS', JSON.stringify(ocs));
        return { ok: true, data: { admins, treasurers, ocs } };
      }
      if (request.action === 'initDocFolders') {
        const props = properties_();
        const templatesId = props.getProperty('DOC_TEMPLATES_FOLDER_ID');
        const submissionsId = props.getProperty('DOC_SUBMISSIONS_FOLDER_ID');
        if (templatesId && submissionsId) return { ok: true, data: { templates: templatesId, submissions: submissionsId, existing: true } };
        const templates = DriveApp.createFolder('TCCD Document Templates');
        const submissions = DriveApp.createFolder('TCCD Document Submissions');
        [templates, submissions].forEach(folder => folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE));
        props.setProperty('DOC_TEMPLATES_FOLDER_ID', templates.getId());
        props.setProperty('DOC_SUBMISSIONS_FOLDER_ID', submissions.getId());
        const editors = new Set([actor.config.owner, ...actor.config.admins, ...actor.config.ocs]);
        editors.forEach(email => { templates.addEditor(email); submissions.addEditor(email); });
        return { ok: true, data: { templates: templates.getId(), submissions: submissions.getId() } };
      }
      if (request.action === 'setCurrentPhase') {
        const phase = Number(request.phase);
        if (!Number.isInteger(phase) || phase < 1 || phase > 6) throw new Error('Choose a phase from 1 to 6.');
        properties_().setProperty('CURRENT_PHASE', String(phase));
        return { ok: true, data: { currentPhase: phase } };
      }
      if (request.action === 'installBackup') { installDailyBackup_(); return { ok: true, data: { message: 'Daily backup scheduled in Asia/Kuala_Lumpur.' } }; }
      throw new Error('Unsupported request.');
    });
  } catch (error) {
    const message = String(error.message || error);
    const safe = /quota|too many|limit exceeded|service invoked/i.test(message) ? 'Google usage limit reached. Reload data to check whether your save completed before retrying later.' : message;
    return { ok: false, error: safe.slice(0, 500) };
  }
}
function initialSetup_() {
  const props = properties_();
  const email = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!email.endsWith('@gmail.com')) throw new Error('Use the owner personal Gmail account.');
  if (props.getProperty('OWNER_EMAIL') && props.getProperty('OWNER_EMAIL') !== email) throw new Error('Only the configured owner can initialise this project.');
  props.setProperty('OWNER_EMAIL', email);
  if (props.getProperty('PRIVATE_SHEET_ID')) { console.log('Already initialised. Existing data kept.'); return; }
  const privateBook = SpreadsheetApp.create('TCCD Private Data — do not edit storage tabs');
  const publicBook = SpreadsheetApp.create('TCCD Public Projection');
  const folder = DriveApp.createFolder('TCCD Private Backups');
  [DriveApp.getFileById(privateBook.getId()), DriveApp.getFileById(publicBook.getId()), folder].forEach(file => file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE));
  props.setProperties({ PRIVATE_SHEET_ID: privateBook.getId(), PUBLIC_SHEET_ID: publicBook.getId(), BACKUP_FOLDER_ID: folder.getId(), CURRENT_SLOT: '0', CURRENT_PHASE: '1', ADMINS: '[]' });
  const state = KPT.empty();
  writeSlot_(privateBook, '0', state);
  sync_(state);
  installDailyBackup_();
  console.log('Setup complete. Public spreadsheet ID: ' + publicBook.getId());
}
function installDailyBackup_() {
  identity_(true);
  ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'dailyBackup_').forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('dailyBackup_').timeBased().everyDays(1).atHour(2).inTimezone('Asia/Kuala_Lumpur').create();
}
function dailyBackup_() {
  if (String(Session.getEffectiveUser().getEmail() || '').toLowerCase() !== configuration_().owner) throw new Error('Backup trigger must run as the owner.');
  return withLock_(() => {
    backup_(loadState_(), 'Daily backup');
    listBackups_().slice(30).forEach(row => DriveApp.getFileById(row.id).setTrashed(true));
  });
}

// ---- JSON API for GitHub-hosted admin UI (Plan B) ----
function apiJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
function verifyGoogleIdToken_(idToken) {
  const token = String(idToken || '').trim();
  if (!token) throw new Error('Missing Google ID token.');
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('Google sign-in failed. Please login again.');
  const info = JSON.parse(response.getContentText() || '{}');
  const email = String(info.email || '').toLowerCase();
  if (!email || String(info.email_verified) === 'false') throw new Error('Google account is not verified.');
  const clientId = String(properties_().getProperty('GOOGLE_CLIENT_ID') || '').trim();
  const aud = String(info.aud || '');
  if (clientId && aud !== clientId) throw new Error('Google sign-in client mismatch.');
  if (!clientId && aud && !/\.apps\.googleusercontent\.com$/.test(aud)) throw new Error('Google sign-in audience is invalid.');
  return actorFromEmail_(email);
}
function actorFromSessionToken_(token) {
  const session = readPortalSession_(String(token || ''));
  return actorFromEmail_(session.email);
}
function portalRequestEmail_(request) {
  let sessionError = null;
  if (request.sessionToken) {
    try {
      return readPortalSession_(String(request.sessionToken)).email;
    } catch (error) {
      sessionError = error;
    }
  }
  if (request.idToken) return verifyGoogleIdToken_(request.idToken).email;
  if (sessionError) throw sessionError;
  throw new Error('Sign-in required.');
}
function authorizeExternalRequest() {
  return UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo', {
    muteHttpExceptions: true
  }).getResponseCode();
}
function portalLogin_(request) {
  const actor = verifyGoogleIdToken_(request.idToken);
  const state = loadState_();
  const sessionToken = createPortalSession_(actor, state);
  const map = portalSessionList_();
  const session = map[sessionToken] || {};
  return {
    sessionToken,
    user: {
      email: actor.email,
      owner: actor.owner,
      admin: actor.admin,
      treasurer: actor.treasurer,
      oc: actor.oc
    },
    packages: session.packages || []
  };
}
function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || (e && e.parameter && e.parameter.payload) || '';
    let request;
    try { request = JSON.parse(raw); } catch (error) { throw new Error('Invalid JSON request.'); }
    if (request.action === 'portalLogin') return apiJson_({ ok: true, data: portalLogin_(request) });
    if (request.action === 'portalLogout') {
      if (request.sessionToken) {
        const map = portalSessionList_();
        delete map[String(request.sessionToken)];
        portalSessionSave_(map);
      }
      return apiJson_({ ok: true, data: { loggedOut: true } });
    }
    const email = portalRequestEmail_(request);
    const result = rpcForEmail_(request, email);
    return apiJson_(result);
  } catch (error) {
    return apiJson_({ ok: false, error: String(error.message || error).slice(0, 500) });
  }
}

// ---- Iframe bridge (avoids CORS from GitHub Pages) ----
function bridgeHtml_() {
  const origin = portalPublicOrigin_();
  const allowJs = JSON.stringify(origin);
  return '<!doctype html><meta charset="utf-8"><title>TCCD bridge</title><body><script>(function(){var allow=' + allowJs + ';function ok(e){return e&&e.origin===allow;}window.addEventListener("message",function(e){if(!ok(e)||!e.data||!e.data.kptBridge)return;var id=e.data.id;google.script.run.withSuccessHandler(function(r){try{e.source.postMessage({kptBridge:true,id:id,result:r},e.origin);}catch(err){}}).withFailureHandler(function(err){try{e.source.postMessage({kptBridge:true,id:id,result:{ok:false,error:String(err&&err.message||err)}},e.origin);}catch(err2){}}).apiRpc(e.data.payload);});try{parent.postMessage({kptBridgeReady:true},allow);}catch(err){try{parent.postMessage({kptBridgeReady:true},"*");}catch(err2){}}})();<\/script></body>';
}
function apiRpc(request) {
  try {
    if (!request || typeof request !== 'object') return { ok: false, error: 'Invalid request.' };
    if (request.action === 'portalLogin') return { ok: true, data: portalLogin_(request) };
    if (request.action === 'portalLogout') {
      if (request.sessionToken) {
        const map = portalSessionList_();
        delete map[String(request.sessionToken)];
        portalSessionSave_(map);
      }
      return { ok: true, data: { loggedOut: true } };
    }
    let email = '';
    try {
      email = portalRequestEmail_(request);
    } catch (error) {
      email = String(Session.getActiveUser().getEmail() || '');
      if (!email) throw error;
    }
    if (!email) return { ok: false, error: 'Sign-in required.' };
    return rpcForEmail_(request, email);
  } catch (error) {
    return { ok: false, error: String(error.message || error).slice(0, 500) };
  }
}
