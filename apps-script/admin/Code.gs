function properties_() { return PropertiesService.getScriptProperties(); }
function configuration_() {
  const props = properties_();
  const owner = String(props.getProperty('OWNER_EMAIL') || '').trim().toLowerCase();
  if (!owner) throw new Error('Owner has not configured the application.');
  return { owner, admins: JSON.parse(props.getProperty('ADMINS') || '[]'), privateId: props.getProperty('PRIVATE_SHEET_ID'), publicId: props.getProperty('PUBLIC_SHEET_ID'), backupsId: props.getProperty('BACKUP_FOLDER_ID') };
}
function identity_(ownerOnly) {
  const config = configuration_();
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!email || email !== effective) throw new Error('Sign in using the authorised Google account. Deploy Admin as User accessing the web app.');
  if (email !== config.owner && !config.admins.includes(email)) throw new Error('Access denied. This Google account is not an administrator.');
  if (ownerOnly && email !== config.owner) throw new Error('Only the owner can perform this action.');
  return { email, owner: email === config.owner, config };
}
function doGet() {
  try {
    identity_(false);
    return HtmlService.createHtmlOutputFromFile('Admin').setTitle('TCCD • Administration').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width"><h1>Access unavailable</h1><p>Sign in with an authorised administrator account. If this is your first visit, complete the Google authorisation.</p>');
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
  return readSlot_(book_(config.privateId), properties_().getProperty('CURRENT_SLOT') || '0');
}
function commit_(state) {
  const slot = properties_().getProperty('CURRENT_SLOT') === '0' ? '1' : '0';
  writeSlot_(book_(configuration_().privateId), slot, state);
  properties_().setProperty('CURRENT_SLOT', slot);
  properties_().setProperty('SYNC_PENDING', String(state.revision));
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
  return { state, user: { email: actor.email, owner: actor.owner }, sync: { ok: properties_().getProperty('SYNC_PENDING') === null, revision: Number(properties_().getProperty('PUBLISHED_REVISION') || -1) }, admins: actor.owner ? actor.config.admins : [], currentPhase: Number.isInteger(currentPhase) && currentPhase >= 1 && currentPhase <= 6 ? currentPhase : 1 };
}
function rpc(request) {
  try {
    if (!request || typeof request !== 'object') throw new Error('Invalid request.');
    const ownerActions = ['restore', 'setAdmins', 'installBackup', 'setCurrentPhase'];
    let actor = identity_(ownerActions.includes(request.action));
    if (request.action === 'bootstrap') return withLock_(() => ({ ok: true, data: bootstrap_(identity_(false)) }));
    if (request.action === 'listBackups') return { ok: true, data: listBackups_() };
    return withLock_(() => {
      actor = identity_(ownerActions.includes(request.action));
      const state = loadState_();
      const context = context_(actor.email);
      if (['save', 'attendance'].includes(request.action)) {
        const next = KPT.mutate(state, request, context);
        commit_(next);
        const sync = sync_(next);
        return { ok: true, data: { state: next, sync } };
      }
      if (request.action === 'previewImport') {
        if (request.revision !== state.revision) throw new Error('Conflict: reload data before importing.');
        const preview = KPT.importRows(state, request.workbook, context);
        return { ok: true, data: { changes: preview.changes, errors: preview.errors, revision: preview.revision } };
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
      if (request.action === 'retrySync') return { ok: true, data: { state, sync: sync_(state) } };
      if (request.action === 'backup') return { ok: true, data: backup_(state, 'Manual backup') };
      if (request.action === 'restore') {
        if (request.revision !== state.revision) throw new Error('Conflict: reload before restoring.');
        const file = DriveApp.getFileById(request.backupId);
        const parents = file.getParents();
        let allowed = false;
        while (parents.hasNext()) if (parents.next().getId() === actor.config.backupsId) allowed = true;
        if (!allowed || !/^(KPT|TCCD)-/.test(file.getName())) throw new Error('Select a backup from the private backup folder.');
        const payload = JSON.parse(file.getBlob().getDataAsString());
        if (payload.schema !== 1 || !payload.state) throw new Error('Invalid backup format.');
        const restored = KPT.copy(payload.state);
        KPT.validateState(restored);
        restored.revision = state.revision;
        restored.sequence = Math.max(restored.sequence, state.sequence);
        KPT.tables.forEach(table => restored[table].forEach(row => { row.version = Math.max(row.version, (state[table].find(item => item.id === row.id) || {}).version || 0) + 1; }));
        KPT.finish(restored, actor.email, 'Restore backup ' + file.getName(), context.now);
        backup_(state, 'Before restore');
        commit_(restored);
        return { ok: true, data: { state: restored, sync: sync_(restored) } };
      }
      if (request.action === 'setAdmins') {
        const emails = [...new Set(request.emails.map(value => String(value).trim().toLowerCase()))].filter(value => value !== actor.config.owner);
        if (emails.length > 5 || emails.some(value => !/^[^\s@]+@gmail\.com$/.test(value))) throw new Error('Use at most five personal Gmail accounts.');
        const previous = actor.config.admins;
        const privateFile = DriveApp.getFileById(actor.config.privateId);
        const publicFile = DriveApp.getFileById(actor.config.publicId);
        const folder = DriveApp.getFolderById(actor.config.backupsId);
        previous.filter(email => !emails.includes(email)).forEach(email => { privateFile.removeEditor(email); publicFile.removeEditor(email); folder.removeEditor(email); });
        emails.forEach(email => { privateFile.addEditor(email); publicFile.addEditor(email); folder.addEditor(email); });
        properties_().setProperty('ADMINS', JSON.stringify(emails));
        return { ok: true, data: emails };
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
