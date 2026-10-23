(function () {
  'use strict';
  let state;
  let backups = [];
  let admins = ['preview-secretary@example.test'];
  let treasurers = ['preview-treasurer@example.test'];
  let ocs = ['preview-oc@example.test'];
  let currentPhase = 1;
  let counter = 0;
  let demoRole = 'owner';
  let docFolders = { templates: 'demo-templates', submissions: 'demo-submissions' };
  const demoFiles = new Map();
  const emails = {
    owner: 'preview-owner@example.test',
    admin: 'preview-secretary@example.test',
    treasurer: 'preview-treasurer@example.test',
    oc: 'preview-oc@example.test'
  };
  const context = () => ({ actor: identity().email, now: new Date().toISOString(), uuid: () => 'demo-' + ++counter });
  const identity = () => ({
    email: emails[demoRole] || emails.owner,
    owner: demoRole === 'owner',
    admin: demoRole === 'owner' || demoRole === 'admin',
    treasurer: demoRole === 'owner' || demoRole === 'treasurer',
    oc: demoRole === 'owner' || demoRole === 'admin' || demoRole === 'oc',
    roles: demoRole === 'owner' ? ['owner', 'admin', 'treasurer', 'oc'] : [demoRole]
  });
  const copy = value => KPT.copy(value);
  const requireDocuments = actor => { if (!(actor.owner || actor.admin || actor.oc)) throw new Error('Access denied. Documents access is required.'); };
  const requireApprover = actor => { if (!(actor.owner || actor.admin)) throw new Error('Access denied. Only Owner or Secretary can approve documents.'); };
  const requireOwner = actor => { if (!actor.owner) throw new Error('Only the owner can perform this action.'); };
  function storeFile(fileName, base64) {
    const id = 'demo-file-' + ++counter;
    demoFiles.set(id, { fileName, contentBase64: String(base64 || 'demo'), mime: 'application/octet-stream' });
    return id;
  }
  function backup(reason) { const item = { id: 'backup-' + ++counter, name: 'Preview backup · ' + reason + ' · r' + state.revision, at: new Date().toISOString(), state: copy(state) }; backups.unshift(item); return item; }
  window.KPTTransport = {
    demo: true,
    publicUrl: 'index.html',
    async setDemoRole(role) {
      if (!['owner', 'admin', 'treasurer', 'oc'].includes(role)) throw new Error('Unknown demo role.');
      demoRole = role;
      return identity();
    },
    async call(request) {
      if (!state) { const response = await fetch('demo-private.json'); if (!response.ok) throw new Error('Preview data could not be loaded.'); state = KPT.upgradeState(await response.json()); }
      await new Promise(resolve => setTimeout(resolve, 30));
      const actor = identity();
      if (request.action === 'bootstrap') {
        return { state: copy(state), user: actor, sync: { ok: true, revision: state.revision }, admins: copy(admins), treasurers: copy(treasurers), ocs: copy(ocs), currentPhase, docFolders: copy(docFolders) };
      }
      if (['save', 'attendance', 'saveFinanceBook'].includes(request.action)) {
        if (request.action === 'saveFinanceBook') {
          if (!actor.treasurer) throw new Error('Access denied. Treasurer access is required.');
        } else if (!actor.admin) throw new Error('Access denied. Administrator access is required.');
        state = KPT.mutate(state, request, context());
        return { state: copy(state), sync: { ok: true, revision: state.revision } };
      }
      const documentActions = ['createDocPackage', 'saveDocPackageMeta', 'saveDocItemsMeta', 'docItemUpload', 'docItemSubmit', 'docItemReopen', 'docPackageArchive', 'saveDocTemplate', 'docDownload', 'docItemReview', 'submitFinBook', 'reviewFinBook', 'reopenFinBook'];
      if (documentActions.includes(request.action)) {
        requireDocuments(actor);
        if (request.action === 'docItemReview') requireApprover(actor);
        if (request.action === 'saveDocTemplate' && !actor.owner) throw new Error('Access denied. Only the owner can manage templates.');
        if (request.action === 'createDocPackage' && !actor.owner) throw new Error('Access denied. Only the owner can create document packages.');
        if (request.action === 'reviewFinBook' && !(actor.owner || actor.admin || actor.treasurer)) throw new Error('Access denied. Treasurer review is required.');
        if (request.action === 'reopenFinBook' && !(actor.owner || actor.admin)) throw new Error('Access denied. Owner or Secretary can reopen.');
        const packageScoped = ['saveDocPackageMeta', 'saveDocItemsMeta', 'docItemUpload', 'docItemSubmit', 'docItemReview', 'docItemReopen', 'docPackageArchive', 'docDownload'];
        if (packageScoped.includes(request.action)) {
          let packageId = request.packageId || '';
          if (!packageId && request.itemId) {
            const item = state.DocItems.find(row => row.id === request.itemId);
            if (item) packageId = item.packageId;
          }
          const pkg = packageId && state.DocPackages.find(row => row.id === packageId);
          if (!pkg) throw new Error('Document package not found.');
          const email = String(actor.email || '').toLowerCase();
          const roles = [pkg.ocEmail, pkg.osEmail, pkg.otEmail].map(v => String(v || '').toLowerCase()).filter(Boolean);
          if (!(actor.owner || actor.admin || roles.includes(email))) {
            throw new Error('Access denied. You are not assigned to this activity package.');
          }
          if (request.action === 'saveDocItemsMeta' && !(actor.owner || actor.admin)) {
            request.canEditStructure = false;
            request.canEditDue = String(pkg.ocEmail || '').toLowerCase() === email;
          }
        }
        if (request.action === 'reviewFinBook' && !(actor.owner || actor.admin || actor.treasurer)) {
          throw new Error('Access denied. Treasurer review is required.');
        }
        if (request.action === 'docDownload') {
          const item = request.itemId ? state.DocItems.find(row => row.id === request.itemId) : null;
          const template = request.templateId ? state.DocTemplates.find(row => row.id === request.templateId) : request.source === 'template' && item && item.templateId ? state.DocTemplates.find(row => row.id === item.templateId) : null;
          const fileId = request.fileId || (template && template.fileId) || (item && item.fileId) || '';
          const stored = demoFiles.get(fileId);
          if (!fileId || !stored) throw new Error('No file available to download.');
          return { fileName: stored.fileName, contentBase64: stored.contentBase64 };
        }
        if (request.action === 'docItemUpload' && request.fileBase64 && !request.fileId) {
          request = Object.assign({}, request, { fileId: storeFile(request.fileName, request.fileBase64) });
        }
        if (request.action === 'saveDocTemplate' && request.fileBase64) {
          request = Object.assign({}, request, { row: Object.assign({}, request.row, { fileId: storeFile(request.row.fileName, request.fileBase64) }) });
        }
        if (request.action === 'createDocPackage' && !request.revision) request = Object.assign({}, request, { revision: state.revision });
        state = KPT.mutate(state, request, context());
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
  };
})();
