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
    oc: 'preview-oc@example.test',
    os: 'preview-os@example.test',
    ot: 'preview-ot@example.test'
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
  const requireDocuments = actor => { if (!(actor.owner || actor.admin || actor.oc || demoRole === 'os' || demoRole === 'ot')) throw new Error('Access denied. Documents access is required.'); };
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
  const requirePackageRole = (packageId, itemId, allowed) => {
    const pkg = resolveDocPackage(packageId, itemId);
    const actor = identity();
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
  const requireFinBookAccess = request => {
    const actor = identity();
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
  async function execute(request) {
      if (!state) { const response = await fetch('demo-private.json'); if (!response.ok) throw new Error('Preview data could not be loaded.'); state = KPT.upgradeState(await response.json()); }
      await new Promise(resolve => setTimeout(resolve, 30));
      const actor = identity();
      if (request.action === 'bootstrap') {
        return { state: copy(state), user: actor, sync: { ok: true, revision: state.revision }, admins: copy(admins), treasurers: copy(treasurers), ocs: copy(ocs), currentPhase, docFolders: copy(docFolders) };
      }
      if (['save', 'attendance', 'saveFinanceBook'].includes(request.action)) {
        if (request.action === 'saveFinanceBook') {
          requireFinBookAccess(request);
        } else if (!actor.admin) throw new Error('Access denied. Administrator access is required.');
        state = KPT.mutate(state, request, context());
        return { state: copy(state), sync: { ok: true, revision: state.revision } };
      }
      const documentActions = ['createDocPackage', 'saveDocPackageMeta', 'saveDocItemsMeta', 'docItemUpload', 'docItemSubmit', 'docItemCheck', 'docItemForward', 'docItemReopen', 'docPackageArchive', 'saveDocTemplate', 'docDownload', 'docItemReview', 'setDocItemTaskStatus'];
      const financeFlowActions = ['submitFinBook', 'checkFinBook', 'forwardFinBook', 'reviewFinBook', 'reopenFinBook'];
      if (financeFlowActions.includes(request.action)) {
        if (request.action === 'reviewFinBook') requireFinanceApprover(actor);
        if (request.action === 'reopenFinBook' && !(actor.owner || actor.admin)) throw new Error('Access denied. Owner or Secretary can reopen.');
        requireFinBookAccess(request);
        state = KPT.mutate(state, request, context());
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
            requirePackageRole(request.packageId, request.itemId, ['oc']);
          }
          if (['docItemUpload', 'docItemSubmit'].includes(request.action) && !(actor.owner || actor.admin)) {
            requirePackageRole(request.packageId, request.itemId, ['os', 'oc']);
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
      const response = await execute(request);
      return projectResponse(response, identity(), request);
    }
  };
})();
