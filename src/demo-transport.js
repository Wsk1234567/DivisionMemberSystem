(function () {
  'use strict';
  let state;
  let backups = [];
  let admins = ['preview-secretary@example.test'];
  let treasurers = ['preview-treasurer@example.test'];
  let currentPhase = 1;
  let counter = 0;
  let demoRole = 'owner';
  const context = () => ({ actor: 'preview-owner@example.test', now: new Date().toISOString(), uuid: () => 'demo-' + ++counter });
  const identity = () => ({
    email: demoRole === 'treasurer' ? 'preview-treasurer@example.test' : demoRole === 'admin' ? 'preview-secretary@example.test' : 'preview-owner@example.test',
    owner: demoRole === 'owner',
    admin: demoRole === 'owner' || demoRole === 'admin',
    treasurer: demoRole === 'owner' || demoRole === 'treasurer',
    roles: demoRole === 'owner' ? ['owner', 'admin', 'treasurer'] : [demoRole]
  });
  const copy = value => KPT.copy(value);
  function backup(reason) { const item = { id: 'backup-' + ++counter, name: 'Preview backup · ' + reason + ' · r' + state.revision, at: new Date().toISOString(), state: copy(state) }; backups.unshift(item); return item; }
  window.KPTTransport = {
    demo: true,
    publicUrl: 'index.html',
    async setDemoRole(role) {
      if (!['owner', 'admin', 'treasurer'].includes(role)) throw new Error('Unknown demo role.');
      demoRole = role;
      return identity();
    },
    async call(request) {
      if (!state) { const response = await fetch('demo-private.json'); if (!response.ok) throw new Error('Preview data could not be loaded.'); state = KPT.upgradeState(await response.json()); }
      await new Promise(resolve => setTimeout(resolve, 30));
      const actor = identity();
      if (request.action === 'bootstrap') return { state: copy(state), user: actor, sync: { ok: true, revision: state.revision }, admins: copy(admins), treasurers: copy(treasurers), currentPhase };
      if (['save', 'attendance', 'saveFinanceBook'].includes(request.action)) {
        if (request.action === 'saveFinanceBook') {
          if (!actor.treasurer) throw new Error('Access denied. Treasurer access is required.');
        } else if (!actor.admin) throw new Error('Access denied. Administrator access is required.');
        state = KPT.mutate(state, request, context());
        return { state: copy(state), sync: { ok: true, revision: state.revision } };
      }
      if (['previewDelete', 'previewDeleteAllMembers'].includes(request.action)) {
        if (!actor.owner) throw new Error('Only the owner can perform this action.');
        return request.action === 'previewDelete' ? KPT.recycleBundle(state, request.table, request.id) : KPT.allMembersBundle(state);
      }
      if (['deleteRecord', 'deleteAllMembers', 'restoreTrash', 'purgeTrash', 'restore', 'setAdmins', 'setAccess', 'setCurrentPhase', 'installBackup'].includes(request.action)) {
        if (!actor.owner) throw new Error('Only the owner can perform this action.');
      }
      if (['previewImport', 'commitImport', 'previewSetupDefaults', 'applySetupDefaults'].includes(request.action) && !actor.admin && !actor.owner) {
        throw new Error('Access denied. Administrator access is required.');
      }
      if (request.action === 'previewImport' || request.action === 'commitImport') {
        if (request.revision !== state.revision) throw new Error('Conflict: reload current data before importing.');
        const preview = KPT.importRows(state, request.workbook, context());
        if (request.action === 'previewImport') return { changes: preview.changes, errors: preview.errors, revision: preview.revision };
        if (preview.errors.length) throw new Error('Import has validation errors.');
        if (preview.changes.length) { backup('Before import'); state = preview.state; }
        return { state: copy(state), sync: { ok: true }, unchanged: !preview.changes.length };
      }
      if (request.action === 'previewSetupDefaults') return KPT.setupPreview(state);
      if (request.action === 'applySetupDefaults') {
        backup('Before recommended setup');
        state = KPT.applyRecommendedSetup(state, Object.assign(context(), { revision: request.revision }));
        return { state: copy(state), sync: { ok: true, revision: state.revision } };
      }
      if (request.action === 'retrySync') return { state: copy(state), sync: { ok: true } };
      if (request.action === 'backup') { const item = backup('Manual'); return { id: item.id, name: item.name }; }
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
          return { admins: copy(admins), treasurers: copy(treasurers) };
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
  };
})();