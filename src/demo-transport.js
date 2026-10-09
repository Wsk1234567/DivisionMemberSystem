(function () {
  'use strict';
  let state;
  let backups = [];
  let admins = ['preview-secretary@example.test'];
  let currentPhase = 1;
  let counter = 0;
  const context = () => ({ actor: 'preview-owner@example.test', now: new Date().toISOString(), uuid: () => 'demo-' + ++counter });
  const identity = { email: 'preview-owner@example.test', owner: true };
  const copy = value => KPT.copy(value);
  function backup(reason) { const item = { id: 'backup-' + ++counter, name: 'Preview backup · ' + reason + ' · r' + state.revision, at: new Date().toISOString(), state: copy(state) }; backups.unshift(item); return item; }
  window.KPTTransport = {
    demo: true,
    publicUrl: 'index.html',
    async call(request) {
      if (!state) { const response = await fetch('demo-private.json'); if (!response.ok) throw new Error('Preview data could not be loaded.'); state = await response.json(); }
      await new Promise(resolve => setTimeout(resolve, 30));
      if (request.action === 'bootstrap') return { state: copy(state), user: identity, sync: { ok: true, revision: state.revision }, admins: copy(admins), currentPhase };
      if (['save', 'attendance'].includes(request.action)) { state = KPT.mutate(state, request, context()); return { state: copy(state), sync: { ok: true, revision: state.revision } }; }
      if (['previewImport', 'commitImport'].includes(request.action)) {
        if (request.revision !== state.revision) throw new Error('Conflict: reload current data before importing.');
        const preview = KPT.importRows(state, request.workbook, context());
        if (request.action === 'previewImport') return { changes: preview.changes, errors: preview.errors, revision: preview.revision };
        if (preview.errors.length) throw new Error('Import has validation errors.');
        if (preview.changes.length) { backup('Before import'); state = preview.state; }
        return { state: copy(state), sync: { ok: true }, unchanged: !preview.changes.length };
      }
      if (request.action === 'retrySync') return { state: copy(state), sync: { ok: true } };
      if (request.action === 'backup') { const item = backup('Manual'); return { id: item.id, name: item.name }; }
      if (request.action === 'listBackups') return backups.map(item => ({ id: item.id, name: item.name, at: item.at }));
      if (request.action === 'restore') {
        if (request.revision !== state.revision) throw new Error('Conflict: reload before restoring.');
        const item = backups.find(row => row.id === request.backupId);
        if (!item) throw new Error('Backup not found.');
        const next = copy(item.state);
        next.revision = state.revision;
        next.sequence = Math.max(next.sequence, state.sequence);
        KPT.tables.forEach(table => next[table].forEach(row => { row.version = Math.max(row.version, (state[table].find(previous => previous.id === row.id) || {}).version || 0) + 1; }));
        backup('Before restore');
        state = KPT.finish(next, identity.email, 'Restore preview backup', new Date().toISOString());
        return { state: copy(state), sync: { ok: true } };
      }
      if (request.action === 'setAdmins') { admins = request.emails; return copy(admins); }
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
