(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const t = (key) => {
    if (window.KPTI18n && window.KPTI18n.t) return window.KPTI18n.t(key);
    return key;
  };
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const nav = {
    treasurer: [['Overview', 'Dashboard'], ['Finance', 'Organizing Treasurer'], ['Settings', 'Settings']],
    admin: [['Overview', 'Overview'], ['Phase', 'Phase'], ['Members', 'Members'], ['Activities', 'Activities'], ['Exams', 'Exams'], ['Duty', 'Duty'], ['Awards', 'Awards'], ['Documents', 'Documents'], ['Data', 'Data'], ['Setup', 'Setup'], ['Import', 'Import'], ['Trash', 'Trash'], ['Settings', 'Settings']],
    owner: [['Owner', 'Owner'], ['Settings', 'Settings']],
    portal: [['Portal', 'Portal']],
    oc: []
  };
  const ocNav = [['Documents', 'Documents']];
  const navLabel = key => t('nav.' + key);
  const workspaceNav = mode => {
    if (mode === 'portal') return nav.portal;
    if (mode === 'oc') {
      const extra = [];
      if (user && (user.owner || user.treasurer || activePackageRoles().indexOf('ot') >= 0)) extra.push(['Finance', 'Organizing Treasurer']);
      return ocNav.concat(extra);
    }
    if (mode === 'admin' && user && !user.admin && user.oc && !user.owner && !user.treasurer) return ocNav;
    return nav[mode] || nav.admin;
  };
  const isOcOnly = () => !!(user && user.oc && !user.admin && !user.owner && !user.treasurer);
  const packageRoleMatch = (pkg, email) => {
    const mail = String(email || '').toLowerCase();
    return [pkg.ocEmail, pkg.osEmail, pkg.otEmail].map(v => String(v || '').toLowerCase()).filter(Boolean).includes(mail);
  };
  const packageRolesFor = (pkg, email) => {
    if (!pkg) return [];
    const mail = String(email || '').toLowerCase();
    const roles = [];
    if (String(pkg.ocEmail || '').toLowerCase() === mail) roles.push('oc');
    if (String(pkg.osEmail || '').toLowerCase() === mail) roles.push('os');
    if (String(pkg.otEmail || '').toLowerCase() === mail) roles.push('ot');
    return roles;
  };
  const packageRoleFor = (pkg, email) => {
    if (!pkg || !user) return '';
    if (user.owner || user.admin) return 'admin';
    return packageRolesFor(pkg, email)[0] || '';
  };
  const activePackageRoles = () => {
    const pkg = openDocPackageId ? (state && state.DocPackages || []).find(row => row.id === openDocPackageId) : null;
    if (pkg) return user && (user.owner || user.admin) ? ['admin'] : packageRolesFor(pkg, user && user.email);
    const mine = ocPackages()[0];
    if (mine) return user && (user.owner || user.admin) ? ['admin'] : packageRolesFor(mine, user && user.email);
    return isOcOnly() ? ['oc'] : [];
  };
  const activePackageRole = () => activePackageRoles()[0] || '';
  const ocPackages = () => {
    if (!user || !state || !state.DocPackages) return [];
    const email = String(user.email || '').toLowerCase();
    return state.DocPackages.filter(pkg => {
      if (pkg.archived || pkg.status === 'Archived') return false;
      if (user.owner || user.admin) return true;
      if (user.treasurer && state.FinBooks.some(book => book.packageId === pkg.id)) return true;
      return packageRoleMatch(pkg, email);
    }).sort((a, b) => b.year - a.year || String(a.activityType).localeCompare(String(b.activityType)));
  };
  const canOpenPackage = pkg => {
    if (!pkg || !user) return false;
    if (user.owner || user.admin) return true;
    if (user.treasurer && state.FinBooks.some(book => book.packageId === pkg.id)) return true;
    return packageRoleMatch(pkg, user.email);
  };
  const titles = {};
  Object.values(nav).flat().forEach(([key]) => { titles[key] = key; });
  const workspaceTitles = mode => {
    const map = {};
    workspaceNav(mode).forEach(([key]) => { map[key] = navLabel(key); });
    return map;
  };
  const phases = [
    { title: '学生名单进入系统', owner: 'Secretary', goal: '先把学生名单安全地放进系统。', steps: ['在 Excel 的 Members sheet 填写 name 和 sjamId；sjamId 可以暂时留空。', 'id、version 和 status 留空，系统会自动建立内部 ID，并设为 Active。', '先按 Preview Import 检查，再按 Confirm Import 正式加入资料。'] },
    { title: '补完整学生资料', owner: 'Owner & Secretary', goal: '名单确认后，再慢慢补齐个人资料。', steps: ['补上 ic、race、form、joined 和正确的 status。', '不需要一次填完，空白资料以后仍然可以补上。', '补资料时使用系统内部 id，原本的历史记录不会断开。'] },
    { title: '准备考试与奖项类别', owner: 'Owner & Secretary', goal: '先整理好以后会使用的选项。', steps: ['在 System Setup 设置 Exam、Award、Promotion 和其他类别。', '确认奖项名称、类别和等级，避免之后重复输入不同写法。', '不再使用的选项可以 Archive，旧记录会继续保留。'] },
    { title: '开始记录活动与出席', owner: 'Secretary', goal: '建立活动，并记录谁有参加。', steps: ['建立 Activity，选择 DIM、Inspection、Exam 或 Other。', '在 Attendance 批量勾选出席学生。', '同一活动可以有多个类别，但同一学生每场 DIM 最多计算一次。'] },
    { title: '记录考试、Duty 与 Efficient', owner: 'Owner & Secretary', goal: '完成每年的参与和效率资料。', steps: ['记录 Exam 结果，以及每位学生每年的 Duty Hour。', '系统会检查 Duty、DIM、Inspection 和 Exam Participation。', '资料齐全后显示 Efficient 或 Not Efficient；资料不足显示 Pending。'] },
    { title: '奖项、权限、备份与正式使用', owner: 'Owner', goal: '完成最后检查，再放入真实完整资料。', steps: ['整理 Awards，并检查公开页面没有 IC、证书编号或内部备注。', '确认 Owner 与 Secretary 权限，以及每日 Backup。', '完成手机、Excel 导入、同步失败和恢复测试后正式使用。'] }
  ];
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h4"/></svg>';
  const memberOptions = () => state.Members.map(row => [row.id, row.name + ' · ' + (row.sjamId || row.id)]);
  const standardOptions = (values, current) => ['', ...values, ...(current && !values.includes(current) ? [[current, current + ' (Legacy)']] : [])];
  const examOptions = () => {
    const current = dialogRecord && dialogTable === 'Exams' ? dialogRecord.type : dialogRecord && dialogTable === 'Activities' ? dialogRecord.examType : '';
    const configured = state.Catalog.filter(row => row.kind === 'Exam' && !row.archived).sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name)).map(row => row.name);
    return [...new Set([...configured, ...(current ? [current] : [])])];
  };
  const awardCatalogOptions = () => state.Catalog.filter(row => row.kind === 'Award' && (!row.archived || row.id === (dialogRecord && dialogRecord.catalogId))).sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name)).map(row => [row.id, row.category + ' · ' + row.name + (row.level ? ' · ' + row.level : '')]);
  const definitions = {
    Members: [['name', 'Full name', 'text', true], ['ic', 'IC', 'text'], ['sjamId', 'SJAM ID (optional)', 'text'], ['race', 'Race', () => standardOptions(KPT.races, dialogRecord && dialogRecord.race)], ['form', 'Tingkatan', () => standardOptions(KPT.forms, dialogRecord && dialogRecord.form)], ['joined', 'Date joined', 'date'], ['status', 'Status', KPT.statuses]],
    Activities: [['name', 'Activity name', 'text', true], ['date', 'Date', 'date', true], ['tags', 'Categories', 'tags'], ['examType', 'Exam category (if tagged Exam)', () => ['', ...examOptions()]]],
    Exams: [['memberId', 'Student', memberOptions, true], ['activityId', 'Linked activity (optional)', () => [['', 'Standalone examination'], ...state.Activities.filter(row => !row.archived && row.tags.includes('Exam')).map(row => [row.id, row.name + ' · ' + row.date])]], ['type', 'Exam type', examOptions, true], ['date', 'Exam date', 'date', true], ['result', 'Result', KPT.results], ['attended', 'Participation confirmed', 'checkbox'], ['certificate', 'Certificate number', 'text']],
    Duty: [['memberId', 'Student', memberOptions, true], ['year', 'Year', 'number', true], ['hours', 'Total hours (blank = not recorded)', 'number']],
    Awards: [['memberId', 'Student', memberOptions, true], ['catalogId', 'Award / recognition', awardCatalogOptions, true], ['date', 'Award date', 'date', true], ['certificate', 'Certificate number (private)', 'text'], ['notes', 'Internal notes (private)', 'textarea']],
    Catalog: [['kind', 'Type', ['Exam', 'Award']], ['category', 'Award category (awards only)', ['', ...KPT.categories]], ['name', 'Name', 'text', true], ['level', 'Level / rank (awards only)', 'text']],
    Enrolments: [['memberId', 'Student', memberOptions, true], ['year', 'Year', 'number', true], ['form', 'Tingkatan for this year', () => standardOptions(KPT.forms, dialogRecord && dialogRecord.form)], ['status', 'Status for this year', KPT.statuses]]
  };
  let state;
  let user;
  let admins = [];
  let treasurers = [];
  let ocs = [];
  let docFolders = { templates: '', submissions: '' };
  let openDocPackageId = null;
  let docEditOpen = false;
  let docEditDraft = null;
  let activityIntroExpanded = false;
  let workspaceMode = 'admin';
  let currentPhase = 1;
  let sync = { ok: true };
  let view = 'Overview';
  let query = '';
  let page = 0;
  let dialogRecord;
  let dialogTable;
  let dialogRevision;
  let importFile;
  let importPreview;
  // Typed import: one data kind at a time. ALL is the advanced multi-sheet path.
  let importType = 'Members';
  let importGeneration = 0;
  let importIgnoredSheets = [];
  let importFileName = '';
  const IMPORT_TYPES = ['Members', 'Attendance', 'Exams', 'Duty', 'Awards', 'Activities', 'Enrolments', 'ALL'];
  let setupDefaultsPreview;
  let backups = [];
  let busy = false;
  let financeDraft = null;
  let financeReceiptFiles = [];
  // Hub (studio / hall / notifications) — package-role workspace
  let hubTab = 'studio';
  let hubSelectedId = null;
  let hubNotifications = { notifications: [], unreadCount: 0, activityUnread: {}, studioUnread: {} };
  let hubNotifyLoading = false;
  let hubNotifyTimer = null;
  let hubDirty = false;
  let hubReceiptBusy = false;
  // Live updates: 5s lightweight probe + changeKey, never full state every tick.
  let hubLiveInFlight = false;
  let hubLiveChangeKey = null;
  let hubLiveEmail = null;
  let hubLiveErrors = 0;
  let hubLiveBackoffTimer = null;
  let hubLivePending = false;
  let hubLiveRequestId = 0;
  let hubLiveGeneration = 0;
  let hubLiveAppliedRevision = -1;
  let hubLivePendingSnapshot = null;
  const HUB_LIVE_MS = 5000;
  const HUB_LIVE_MAX_BACKOFF = 60000;
  let telegramBinding = null;
  function renderTelegramSettings(status) {
    const preview = !!window.KPTTransport.demo;
    const who = value => escape((value.displayName || '') + (value.username ? ' @' + value.username : '') + ' · ID ' + value.id);
    let html = '<p>' + escape(langLabel('Private reminders for your current activity roles. Approvals stay in this system.', '按你当前的活动岗位接收私人提醒，审批仍在本系统完成。')) + '</p>';
    html += '<p class="hint">' + escape(langLabel('Formal submissions, returns and approval updates only. Draft saves continue to use in-app notifications.', 'Telegram 提醒正式提交、退回和审批变化；草稿保存继续使用站内通知。')) + '</p>';
    if (preview) html += '<p class="message warning">' + escape(langLabel('Local preview does not contact Telegram.', '本地预览不会连接 Telegram。')) + '</p>';
    if (!status.configured) html += '<p class="message warning">' + escape(langLabel('Telegram notifications have not been configured by the administrator.', '管理员尚未配置 Telegram 通知。')) + '</p>';
    if (!status.workerInstalled) html += '<p class="hint">' + escape(langLabel('A background task was not detected by this request. The Owner can verify processTelegramNotifications in Apps Script Triggers.', '本次请求未检测到后台任务。Owner 可在 Apps Script 的触发器列表确认 processTelegramNotifications。')) + '</p>';
    if (status.linked && status.telegramUser) {
      html += '<section class="card"><h3>' + escape(langLabel('Linked Telegram account', '已绑定的 Telegram 账号')) + '</h3><p>' + who(status.telegramUser) + '</p><p>' + escape(status.enabled ? langLabel('Notifications on', '通知已开启') : langLabel('Notifications paused', '通知已暂停')) + '</p><div class="toolbar">'
        + button(status.enabled ? langLabel('Pause notifications', '暂停通知') : langLabel('Enable notifications', '开启通知'), 'telegramEnable', status.enabled ? 'false' : 'true')
        + button(langLabel('Unlink account', '解除绑定'), 'telegramUnlink') + '</div></section>';
    }
    if (status.pending) {
      html += '<section class="card"><h3>' + escape(langLabel('Confirm this Telegram identity', '确认这个 Telegram 身份')) + '</h3><p>' + escape((status.pending.displayName || '') + (status.pending.username ? ' @' + status.pending.username : '') + ' · ID ' + status.pending.userId) + '</p><p>' + escape(langLabel('Confirm only if this is your own account. Starting the bot alone does not link it.', '请确认这是你本人的账号。只在 Bot 点击 Start 不会完成绑定。')) + '</p><div class="toolbar">'
        + button(langLabel('Confirm account', '确认绑定'), 'telegramConfirm', status.pending.id) + button(langLabel('Reject request', '拒绝请求'), 'telegramCancel') + '</div></section>';
    }
    if (telegramBinding && Date.parse(telegramBinding.expiresAt) <= Date.now()) telegramBinding = null;
    if (telegramBinding && !status.pending) {
      const url = new URL(telegramBinding.url);
      if (url.origin !== 'https://t.me' || url.pathname !== '/' + status.botUsername || !/^[A-Za-z0-9_-]{1,64}$/.test(url.searchParams.get('start') || '')) throw new Error('Invalid Telegram binding link.');
      html += '<section class="card"><h3>' + escape(langLabel('Open the bot, then return here', '打开 Bot 后返回这里')) + '</h3><p>' + escape(langLabel('Press Start in Telegram. Wait for background sync, then refresh below and confirm your identity.', '在 Telegram 点击 Start，等待后台同步后，在下方刷新并确认身份。')) + '</p><a class="button primary" href="' + escape(url.href) + '" target="_blank" rel="noopener noreferrer">' + escape(langLabel('Open @' + status.botUsername, '打开 @' + status.botUsername)) + '</a><p class="hint">' + escape(langLabel('If linking does not advance, copy the entire command below and send it to this bot. This private command expires in 10 minutes; do not share it. Then refresh here and confirm your identity.', '如果绑定没有进展，请复制下面的完整命令，发送给这个 Bot。命令十分钟内有效，请勿分享；之后回这里刷新并确认身份。')) + '</p><input id="telegram-binding-command" type="text" readonly autocomplete="off" spellcheck="false" aria-label="' + escape(langLabel('Private Telegram binding command', 'Telegram 私人绑定命令')) + '" value="' + escape('/start ' + url.searchParams.get('start')) + '"></section>';
    }
    const delivery = status.delivery || {};
    html += '<p class="hint">' + escape(langLabel('Pending delivery: ', '待发送：')) + Number(delivery.pending || 0) + ' · ' + escape(langLabel('Failed: ', '失败：')) + Number(delivery.failed || 0) + '</p>';
    if (delivery.lastError) html += '<p class="message warning">' + escape(delivery.lastError) + '</p>';
    html += '<div class="toolbar">' + (status.configured ? button(status.linked ? langLabel('Link a different account', '更换绑定账号') : langLabel('Link Telegram', '绑定 Telegram'), 'telegramCreate') : '')
      + button(langLabel('Refresh status', '刷新状态'), 'telegramRefresh') + (telegramBinding && !status.pending ? button(langLabel('Cancel link request', '取消绑定请求'), 'telegramCancel') : '') + '</div>';
    byId('editor-title').textContent = langLabel('Telegram private notifications', 'Telegram 私人通知');
    byId('editor-message').textContent = '';
    byId('editor-body').innerHTML = html;
    if (!byId('editor').open) byId('editor').showModal();
  }
  const hubRoles = () => {
    if (!user) return [];
    // Concurrent roles are a union — never collapse OS/OT/OC into one.
    const roles = [];
    const add = role => { if (role && roles.indexOf(role) < 0) roles.push(role); };
    if (user.owner) {
      ['owner', 'admin', 'treasurer', 'oc', 'os', 'ot'].forEach(add);
    } else {
      if (user.admin) add('admin');
      if (user.treasurer) add('treasurer');
      const selected = (state && state.DocPackages || []).find(pkg => pkg.id === (hubSelectedId || openDocPackageId)) || (ocPackages().length === 1 ? ocPackages()[0] : null);
      const set = packageRolesFor(selected, user.email);
      set.forEach(add);
    }
    return roles;
  };
  const hubHas = role => hubRoles().indexOf(role) >= 0;
  const hubPackage = () => {
    if (!state || !state.DocPackages) return null;
    if (hubSelectedId) return state.DocPackages.find(row => row.id === hubSelectedId && !row.archived) || null;
    const mine = ocPackages();
    // Auto-open only when there is exactly one activity; multi-activity must pick.
    if (mine.length === 1) {
      hubSelectedId = mine[0].id;
      openDocPackageId = mine[0].id;
      return mine[0];
    }
    return null;
  };
  const hubPackages = () => ocPackages();
  const hubFinAttachments = bookId => bookId ? ((state && state.finAttachments) || []).filter(row => row.active && row.bookId === bookId) : [];
  function loadFinanceDraft(book) {
    financeDraft = Object.assign({}, book, {
      incomes: state.FinIncomes.filter(row => row.bookId === book.id).map(KPT.copy),
      expenses: state.FinExpenses.filter(row => row.bookId === book.id).map(KPT.copy),
      reimbursements: state.FinReimbursements.filter(row => row.bookId === book.id).map(row => Object.assign(KPT.copy(row), { lines: state.FinReimburseLines.filter(line => line.reimbursementId === row.id).map(KPT.copy) }))
    });
  }
  function hubConfirmLeave() {
    if (!hubDirty) return true;
    if (!confirm(t('hub.unsavedTitle') + '\n' + t('hub.unsavedBody'))) return false;
    financeDraft = null;
    hubDirty = false;
    return true;
  }
  async function hubMarkEntityRead(entityId, version) {
    const entries = (hubNotifications.notifications || []).filter(row => row.unread && row.entityId === entityId && row.entityVersion <= version).map(row => ({ id: row.id, entityVersion: row.entityVersion }));
    if (!entries.length) return;
    const result = await window.KPTTransport.call({ action: 'markHubNotificationsRead', notifications: entries });
    hubNotifications = result;
    hubRefreshBadges();
  }
  const hubStageOf = status => {
    if (status === 'Approved') return 'done';
    if (status === 'Submitted') return 'review';
    if (status === 'OCChecked') return 'checked';
    if (status === 'AwaitingOC') return 'withOc';
    return 'draft';
  };
  const hubCounters = () => {
    const pkg = hubPackage();
    if (!pkg || !state) return { pendingSubmit: 0, pendingCheck: 0, pendingReview: 0 };
    const items = state.DocItems.filter(row => row.packageId === pkg.id && !row.archived);
    const book = (state.FinBooks || []).find(row => row.packageId === pkg.id && !row.archived);
    let pendingSubmit = items.filter(row => row.status === 'Draft' || row.status === 'Rejected').length;
    let pendingCheck = items.filter(row => row.status === 'AwaitingOC').length;
    let pendingReview = items.filter(row => row.status === 'Submitted' || row.status === 'OCChecked').length;
    if (book) {
      if (book.status === 'Draft' || book.status === 'Rejected') pendingSubmit += 1;
      if (book.status === 'AwaitingOC') pendingCheck += 1;
      if (book.status === 'OCChecked' || book.status === 'Submitted') pendingReview += 1;
    }
    return { pendingSubmit, pendingCheck, pendingReview };
  };
  function hubRoleChip() {
    const roles = user && user.owner ? ['owner'] : hubRoles();
    return roles.map(role => '<span class="hub-role-chip ' + escape(role) + '"><span class="hub-dot none" aria-hidden="true"></span>' + escape(t('hub.role.' + role)) + '</span>').join(' ');
  }
  function hubTabsBar() {
    const counts = hubCounters();
    const unread = hubNotifications.unreadCount || 0;
    return '<div class="hub-tabs" role="navigation" aria-label="' + escape(t('hub.studio')) + '">'
      + '<button type="button" class="button' + (hubTab === 'studio' ? ' primary' : '') + '" data-action="hubTab" data-id="studio" aria-current="' + (hubTab === 'studio' ? 'page' : 'false') + '">' + escape(t('hub.studio')) + '</button>'
      + '<button type="button" class="button' + (hubTab === 'hall' ? ' primary' : '') + '" data-action="hubTab" data-id="hall" aria-current="' + (hubTab === 'hall' ? 'page' : 'false') + '">' + escape(t('hub.hall')) + (counts.pendingSubmit || counts.pendingCheck || counts.pendingReview ? ' <span class="hub-badge quiet">' + (counts.pendingSubmit + counts.pendingCheck + counts.pendingReview) + '</span>' : '') + '</button>'
      + '<button type="button" class="button' + (hubTab === 'notifications' ? ' primary' : '') + '" data-action="hubTab" data-id="notifications" aria-current="' + (hubTab === 'notifications' ? 'page' : 'false') + '">' + escape(t('hub.notifications')) + (unread ? ' <span class="hub-badge">' + unread + '</span>' : '') + '</button>'
      + '</div>';
  }
  function hubSidebar() {
    const counts = hubCounters();
    const unread = hubNotifications.unreadCount || 0;
    const lang = (window.KPTI18n && window.KPTI18n.getLang()) || 'en';
    const navItem = (id, label, badge) =>
      '<button type="button" data-action="hubTab" data-id="' + id + '" aria-current="' + (hubTab === id ? 'page' : 'false') + '"' + (hubTab === id ? ' class="active"' : '') + '>' + icon + '<span>' + escape(label) + '</span>' + (badge ? ' ' + badge : '') + '</button>';
    const taskBadge = (counts.pendingSubmit || counts.pendingCheck || counts.pendingReview)
      ? '<span class="hub-badge quiet">' + (counts.pendingSubmit + counts.pendingCheck + counts.pendingReview) + '</span>' : '';
    const unreadBadge = unread ? '<span class="hub-badge">' + unread + '</span>' : '';
    let html = '<div class="nav hub-nav" role="navigation" aria-label="' + escape(t('hub.studio')) + '">'
      + navItem('studio', t('hub.studio'))
      + navItem('hall', t('hub.hall'), taskBadge)
      + navItem('notifications', t('hub.notifications'), unreadBadge);
    const packages = hubPackages();
    if (packages.length > 1) {
      html += '<div class="hub-nav-section">' + packages.map(pkg => {
        const label = pkg.activityType + ' ' + pkg.year;
        return '<button type="button" data-action="hubPick" data-id="' + escape(pkg.id) + '"' + (hubSelectedId === pkg.id ? ' class="active"' : '') + '>' + icon + '<span>' + escape(label) + '</span></button>';
      }).join('') + '</div>';
    } else if (packages.length === 1) {
      html += '<div class="hub-nav-section"><button type="button" data-action="hubPick" data-id="' + escape(packages[0].id) + '">' + icon + '<span>' + escape(packages[0].activityType + ' ' + packages[0].year) + '</span></button></div>';
    }
    html += '<div class="hub-nav-section">'
      + '<button type="button" data-action="toggleLang">' + icon + '<span>' + (lang === 'zh' ? 'English' : '中文') + '</span></button>'
      + '<button type="button" data-action="telegramSettings">' + icon + '<span>Telegram</span></button>'
      + '</div>';
    html += '</div>';
    byId('navigation').innerHTML = html;
    document.querySelectorAll('#navigation [data-action="hubTab"]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.id === hubTab);
    });
  }
  function hubDefaultTab() {
    // OC lives in submissions; OS/OT live in workbench. Concurrent roles keep workbench.
    if (hubHas('oc') && !hubHas('os') && !hubHas('ot')) return 'hall';
    return 'studio';
  }
  function hubNotificationTab(row) {
    if (row && row.role === 'oc') return 'hall';
    if (row && (row.kind === 'ReturnedByOC' || row.kind === 'ReturnedByFinal')) return 'studio';
    return row && row.destination === 'studio' ? 'studio' : 'hall';
  }
  function hubActivityPicker() {
    const packages = hubPackages();
    if (!packages.length) return '<section class="card"><h2>' + escape(t('hub.pickActivity')) + '</h2><p class="muted">' + escape(t('hub.pickActivityHint')) + '</p></section>';
    if (packages.length === 1 && !hubSelectedId) {
      hubSelectedId = packages[0].id;
      openDocPackageId = packages[0].id;
    }
    return '<section class="card"><div class="section-heading" style="margin-top:0"><h2>' + escape(t('hub.pickActivity')) + '</h2></div><div class="hub-card-grid">'
      + packages.map(pkg => {
        const progress = docProgress(pkg);
        const roles = user && user.owner ? ['admin'] : packageRolesFor(pkg, user && user.email);
        const role = roles[0] || 'oc';
        return '<article class="hub-task-card"><h3>' + escape(pkg.activityType + ' ' + pkg.year) + '</h3><p class="meta">' + escape(t('hub.identity')) + ' · ' + escape(t('hub.role.' + role)) + '</p>'
          + '<div class="hub-progress" aria-hidden="true"><span style="width:' + (progress.total ? Math.round(progress.approved / progress.total * 100) : 0) + '%"></span></div>'
          + '<p class="meta">' + progress.approved + ' / ' + progress.total + ' ' + escape(t('docs.requiredApproved')) + '</p>'
          + '<button type="button" class="button primary" data-action="hubPick" data-id="' + escape(pkg.id) + '">' + escape(t('docs.open')) + '</button></article>';
      }).join('') + '</div></section>';
  }
  function hubStudioBody(pkg) {
    const items = state.DocItems.filter(row => row.packageId === pkg.id && !row.archived).sort((a, b) => a.sortOrder - b.sortOrder);
    const book = (state.FinBooks || []).find(row => row.packageId === pkg.id && !row.archived) || null;
    // Capability is a union of real roles. Admin is not auto finance editor/approver.
    const canOs = hubHas('os') || hubHas('owner') || hubHas('admin');
    const canOt = hubHas('ot') || hubHas('owner') || hubHas('treasurer');
    const canOc = hubHas('oc') || hubHas('owner') || hubHas('admin');
    const counts = hubCounters();
    let title = t('hub.workbenchTitle.oc');
    if (canOs && canOt) title = t('hub.workbenchTitle.os') + ' · ' + t('hub.workbenchTitle.ot');
    else if (canOs) title = t('hub.workbenchTitle.os');
    else if (canOt) title = t('hub.workbenchTitle.ot');
    let body = '<section class="card"><div class="eyebrow">' + escape(t('hub.doWork')) + '</div>'
      + '<h2 style="margin-top:0">' + escape(title) + '</h2>'
      + '<p class="muted">' + escape(t(canOs || canOt ? 'hub.doWorkHint' : 'hub.ocPersonalHint')) + '</p>'
      + '<div class="toolbar"><button type="button" class="button btn-submit" data-action="hubTab" data-id="hall">' + escape(t(canOs || canOt ? 'hub.readyToSubmit' : 'hub.hall')) + '</button></div></section>';
    if (canOs) {
      const rows = items.filter(row => ['Pending', 'Draft', 'Rejected'].indexOf(row.status) >= 0);
      body += '<section class="card"><h2>' + escape(t('docs.checklist')) + '</h2>'
        + '<p class="muted">' + escape(t('hub.role.os')) + '</p>'
        + table(['#', t('docs.document'), t('docs.due'), t('docs.statusCol'), t('docs.actions')], rows.map(item => {
        const tools = [];
        if (item.fileId) tools.push(button(t('docs.download'), 'docDownload', item.id));
        if (item.templateId) tools.push(button(t('docs.template'), 'docDownloadTemplate', item.id));
        tools.push('<label class="button small" for="hub-up-' + escape(item.id) + '">' + escape(t('docs.upload')) + '<input id="hub-up-' + escape(item.id) + '" type="file" data-doc-upload="' + escape(item.id) + '" accept=".docx,.xlsx,.pdf,.pptx,.jpg,.jpeg,.png,.zip" hidden></label>');
        return [String(item.sortOrder), '<span data-hub-entity="' + escape(item.id) + '">' + escape(item.title) + '</span>', escape(docDueBadge(pkg, item)), pill(workflowStatusLabel(item.status)), '<div class="row-tools">' + tools.join(' ') + '</div>'];
      })) + '</section>';
    }
    if (canOt) {
      if (book && (!financeDraft || financeDraft.packageId !== pkg.id)) loadFinanceDraft(book);
      body += financeDraft && financeDraft.packageId === pkg.id ? financeEditor() : '<section class="card"><h2>' + escape(t('hub.noFinanceBook')) + '</h2><button class="button primary" type="button" data-action="financeAddBook">' + escape(t('hub.createFinanceBook')) + '</button></section>';
    }
    if (canOc && !canOs && !canOt) {
      body += '<section class="card"><h2>' + escape(t('hub.progress')) + '</h2><p class="muted">' + escape(t('hub.ocHint')) + '</p>'
        + '<div class="hub-count-row"><span class="hub-count">' + escape(t('hub.count.pendingSubmit')) + ' <strong>' + counts.pendingSubmit + '</strong></span>'
        + '<span class="hub-count">' + escape(t('hub.count.pendingCheck')) + ' <strong>' + counts.pendingCheck + '</strong></span>'
        + '<span class="hub-count">' + escape(t('hub.count.pendingReview')) + ' <strong>' + counts.pendingReview + '</strong></span></div>'
        + '<div class="toolbar"><button type="button" class="button btn-submit" data-action="hubTab" data-id="hall">' + escape(t('hub.hall')) + '</button></div></section>';
    } else {
      body += '<section class="card"><h2>' + escape(t('hub.progress')) + '</h2>'
        + '<div class="hub-count-row"><span class="hub-count">' + escape(t('hub.count.pendingSubmit')) + ' <strong>' + counts.pendingSubmit + '</strong></span>'
        + '<span class="hub-count">' + escape(t('hub.count.pendingCheck')) + ' <strong>' + counts.pendingCheck + '</strong></span>'
        + '<span class="hub-count">' + escape(t('hub.count.pendingReview')) + ' <strong>' + counts.pendingReview + '</strong></span></div>'
        + '</section>';
    }
    return body;
  }
  function hubHallBody(pkg) {
    const items = state.DocItems.filter(row => row.packageId === pkg.id && !row.archived).sort((a, b) => a.sortOrder - b.sortOrder);
    const book = (state.FinBooks || []).find(row => row.packageId === pkg.id && !row.archived) || null;
    const canOs = hubHas('os') || hubHas('owner') || hubHas('admin');
    const canOt = hubHas('ot') || hubHas('owner') || hubHas('treasurer');
    const canOc = hubHas('oc') || hubHas('owner') || hubHas('admin');
    const canFinalDoc = hubHas('owner') || hubHas('admin');
    const canFinalFin = hubHas('owner') || hubHas('treasurer');
    const counts = hubCounters();
    let body = '<section class="card"><div class="eyebrow">' + escape(t('hub.handoff')) + '</div><h2 style="margin-top:0">' + escape(t('hub.tasks')) + ' · ' + escape(pkg.activityType + ' ' + pkg.year) + '</h2>'
      + '<div class="hub-count-row"><span class="hub-count">' + escape(t('hub.count.pendingSubmit')) + ' <strong>' + counts.pendingSubmit + '</strong></span>'
      + '<span class="hub-count">' + escape(t('hub.count.pendingCheck')) + ' <strong>' + counts.pendingCheck + '</strong></span>'
      + '<span class="hub-count">' + escape(t('hub.count.pendingReview')) + ' <strong>' + counts.pendingReview + '</strong></span></div>'
      + '<p class="muted">' + escape(t('hub.handoffHint')) + '</p></section>';
    const docRows = items.map(item => {
      const tools = [];
      if (item.fileId) tools.push(button(t('docs.download'), 'docDownload', item.id));
      if (canOs && (item.status === 'Draft' || item.status === 'Rejected')) {
        tools.push('<button type="button" class="button small btn-submit" data-action="docSubmit" data-id="' + escape(item.id) + '">' + escape(t('hub.submitToOc')) + '</button>');
      }
      // OC checks and sends on right here — no jump to workbench.
      if (canOc && item.status === 'AwaitingOC') {
        tools.push('<button type="button" class="button small btn-check" data-action="docCheck" data-id="' + escape(item.id) + '" data-table="pass">' + escape(t('hub.checkPass')) + '</button>');
        tools.push('<button type="button" class="button small btn-return" data-action="docCheck" data-id="' + escape(item.id) + '">' + escape(t('hub.returnOs')) + '</button>');
      }
      if (canOc && item.status === 'OCChecked') {
        tools.push('<button type="button" class="button small btn-submit" data-action="docForward" data-id="' + escape(item.id) + '">' + escape(t('hub.forwardDoc')) + '</button>');
      }
      if (canFinalDoc && item.status === 'Submitted') {
        tools.push(button(t('docs.approve'), 'docApprove', item.id));
        tools.push(button(t('docs.reject'), 'docReject', item.id));
      }
      return [String(item.sortOrder), '<span data-hub-entity="' + escape(item.id) + '">' + escape(item.title) + '</span>', escape(t('hub.stage.' + hubStageOf(item.status))), pill(workflowStatusLabel(item.status)), '<div class="row-tools">' + tools.join(' ') + '</div>'];
    });
    body += '<section class="card"><h2>' + escape(t('docs.checklist')) + '</h2>'
      + (canOc ? '<p class="muted">' + escape(t('hub.ocHint')) + '</p>' : '')
      + table(['#', t('docs.document'), t('hub.stage'), t('docs.statusCol'), t('docs.actions')], docRows) + '</section>';
    if (book) {
      const st = book.status || 'Draft';
      const tools = [];
      if (canOt && (st === 'Draft' || st === 'Rejected')) {
        tools.push('<button type="button" class="button small btn-submit" data-action="finSubmit" data-id="' + escape(book.id) + '">' + escape(t('hub.submitToOc')) + '</button>');
      }
      if (canOc && st === 'AwaitingOC') {
        tools.push('<button type="button" class="button small btn-check" data-action="finCheck" data-id="' + escape(book.id) + '" data-table="pass">' + escape(t('hub.checkPass')) + '</button>');
        tools.push('<button type="button" class="button small btn-return" data-action="finCheck" data-id="' + escape(book.id) + '">' + escape(t('hub.returnOt')) + '</button>');
      }
      if (canOc && st === 'OCChecked') {
        tools.push('<button type="button" class="button small btn-submit" data-action="finForward" data-id="' + escape(book.id) + '">' + escape(t('hub.forwardFin')) + '</button>');
      }
      if (canFinalFin && st === 'Submitted') {
        tools.push(button(t('docs.approve'), 'finApprove', book.id));
        tools.push(button(t('docs.reject'), 'finReject', book.id));
      }
      body += '<section class="card"><h2>' + escape(t('hub.openFinance')) + '</h2><p>' + escape(workflowStatusLabel(st)) + '</p><div class="toolbar">'
        + button(t('hub.openFinance'), 'financeOpenBook', book.id) + tools.join(' ') + '</div></section>';
      if (financeDraft && financeDraft.id === book.id) body += financeEditor();
    }
    return body;
  }
  function hubNotificationsBody() {
    const list = hubNotifications.notifications || [];
    return '<section class="card"><div class="section-heading" style="margin-top:0"><h2>' + escape(t('hub.notifications')) + '</h2><div class="toolbar">'
      + (list.length ? '<button type="button" class="button" data-action="hubMarkRead">' + escape(t('hub.markAllRead')) + '</button>' : '')
      + '</div></div>'
      + (list.length ? '<div class="hub-notif-list">' + list.slice(0, 100).map(row => {
        const kind = t('hub.kind.' + row.kind) || row.kind;
        return '<article class="hub-notif' + (row.unread ? ' unread' : '') + '">'
          + (row.unread ? '<span class="hub-dot" aria-label="' + escape(t('hub.unread')) + '"></span>' : '<span class="hub-dot none"></span>')
          + '<div><strong>' + escape(kind) + '</strong><div class="when">' + escape(row.entityTitle || '') + ' · ' + escape(t('hub.dest.' + hubNotificationTab(row))) + '</div></div>'
          + '<button type="button" class="button small" data-action="hubOpenNotif" data-id="' + escape(row.id) + '" data-package="' + escape(row.packageId || '') + '" data-entity="' + escape(row.entityId || '') + '">' + escape(t('hub.openItem')) + '</button>'
          + '</article>';
      }).join('') + '</div>' : '<p class="muted">' + escape(t('hub.notificationsEmpty')) + '</p>')
      + '<p class="hint">' + escape(t('hub.reducedMotionNote')) + '</p></section>';
  }
  function hubView() {
    if (hubTab === 'notifications') return hubNotificationsBody();
    const packages = hubPackages();
    const pkg = hubPackage();
    if (!packages.length) return hubActivityPicker();
    if (!pkg) return hubActivityPicker();
    const body = hubTab === 'hall' ? hubHallBody(pkg) : hubTab === 'notifications' ? hubNotificationsBody() : hubStudioBody(pkg);
    return '<p class="muted">' + escape(pkg.activityType + ' ' + pkg.year) + ' · ' + hubRoleChip() + '</p>'
      + activityAboutCard(pkg) + body;
  }
  function hubRefreshBadges() {
    // Partial badge update only — never re-render the page (would clobber dirty inputs).
    const unread = hubNotifications.unreadCount || 0;
    const unreadItems = (hubNotifications.notifications || []).filter(row => row.unread);
    const studioTotal = unreadItems.filter(row => hubNotificationTab(row) === 'studio').length;
    const activityTotal = unreadItems.filter(row => hubNotificationTab(row) === 'hall').length;
    document.querySelectorAll('[data-action="hubTab"]').forEach(btn => {
      const id = btn.dataset.id;
      let badge = btn.querySelector('.hub-badge:not(.quiet)');
      const count = id === 'notifications' ? unread : id === 'studio' ? studioTotal : activityTotal;
      if (!count) {
        if (badge) badge.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'hub-badge';
        btn.appendChild(badge);
      }
      badge.textContent = String(count);
    });
  }
  async function hubLoadNotifications(silent) {
    if (hubNotifyLoading) return;
    if (!window.KPTTransport || !window.KPTTransport.call) return;
    hubNotifyLoading = true;
    const email = user && user.email;
    try {
      const result = await window.KPTTransport.call({ action: 'getHubNotifications' });
      const next = {
        notifications: (result && result.notifications) || [],
        unreadCount: (result && result.unreadCount) || 0,
        activityUnread: (result && result.activityUnread) || {},
        studioUnread: (result && result.studioUnread) || {}
      };
      if (!user || user.email !== email) return;
      // Independent cache — never replace application state.
      hubNotifications = next;
      hubRefreshBadges();
      const linkedEntityId = new URLSearchParams(location.search).get('entity');
      const linkedEntity = (state.DocItems || []).find(row => row.id === linkedEntityId) || (state.FinBooks || []).find(row => row.id === linkedEntityId);
      const visibleDocument = [...document.querySelectorAll('[data-hub-entity]')].some(element => element.dataset.hubEntity === linkedEntityId);
      const visibleBook = financeDraft && financeDraft.id === linkedEntityId && byId('finance-activity-name');
      if (linkedEntity && (visibleDocument || visibleBook)) await hubMarkEntityRead(linkedEntityId, linkedEntity.version);
      if (!silent && hubTab === 'notifications' && !hubDirty) render();
    } catch (error) {
      if (!silent) notice(error.message, true);
    } finally {
      hubNotifyLoading = false;
    }
  }
  function hubStartPolling() {
    if (hubNotifyTimer) return;
    hubNotifyTimer = setInterval(() => {
      if (document.hidden) return;
      hubLiveTick(true);
    }, 5000);
    hubLiveTick(true);
  }
  function hubStopPolling() {
    if (hubNotifyTimer) clearInterval(hubNotifyTimer);
    hubNotifyTimer = null;
    hubInvalidateLive();
  }
  function hubIsSafeToApplyLive() {
    if (busy) return false;
    if (hubDirty) return false;
    if (hubReceiptBusy) return false;
    if (financeDraft && financeDraft.id) {
      // Open finance editor counts as in-use even if not dirty yet (file pickers etc).
      const editor = byId('finance-activity-name');
      if (editor && !editor.readOnly) return false;
    }
    const dialog = byId('editor');
    if (dialog && dialog.open) return false;
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput && fileInput.files && fileInput.files.length) return false;
    return true;
  }
  function hubShowPendingBanner() {
    if (byId('live-update-banner')) return;
    const host = byId('notice') && byId('notice').parentNode;
    if (!host) return;
    const banner = document.createElement('div');
    banner.id = 'live-update-banner';
    banner.className = 'message warning live-pending';
    banner.setAttribute('role', 'status');
    banner.innerHTML = escape(t('hub.livePending')) + ' <button type="button" class="button small" data-action="hubApplyLive">' + escape(t('hub.liveApplyNow')) + '</button> <button type="button" class="button small" data-action="hubDismissLive">' + escape(t('hub.liveLater')) + '</button>';
    host.insertBefore(banner, byId('notice').nextSibling);
  }
  function hubHidePendingBanner() {
    const banner = byId('live-update-banner');
    if (banner) banner.remove();
    hubLivePending = false;
  }
  async function hubApplyLiveSnapshot(snapshot, requestId, email, generation) {
    // Drop stale/cross-account/generation-lost responses.
    if (generation !== hubLiveGeneration) return;
    if (requestId !== hubLiveRequestId) return;
    if (!user || user.email !== email) return;
    if (!snapshot || !snapshot.state) return;
    const incomingRevision = Number(snapshot.state.revision);
    // Never clobber a newer local save (revision went forward after this snapshot was requested).
    if (Number.isFinite(incomingRevision) && Number.isFinite(hubLiveAppliedRevision) && incomingRevision < hubLiveAppliedRevision) return;
    if (Number.isFinite(incomingRevision) && state && Number.isFinite(Number(state.revision)) && incomingRevision < Number(state.revision)) return;
    if (!hubIsSafeToApplyLive()) {
      // Stage for later; do NOT advance applied changeKey.
      hubLivePendingSnapshot = snapshot;
      hubLivePending = true;
      hubShowPendingBanner();
      return;
    }
    // Preserve activity/mode/tab context.
    const keepTab = hubTab;
    const keepSelected = hubSelectedId;
    const keepMode = workspaceMode;
    const keepView = view;
    state = snapshot.state;
    // Sync identity/permission fields so setAccess changes take effect.
    if (snapshot.user) {
      user = Object.assign({}, user, {
        email: snapshot.user.email || user.email,
        owner: !!snapshot.user.owner,
        admin: !!snapshot.user.admin,
        treasurer: !!snapshot.user.treasurer,
        oc: !!snapshot.user.oc
      });
      // Rebuild roles from the server flags — never keep stale role lists.
      if (Array.isArray(snapshot.user.roles) && snapshot.user.roles.length) {
        user.roles = snapshot.user.roles.slice();
      } else {
        user.roles = [user.owner ? 'owner' : null, user.admin ? 'admin' : null, user.treasurer ? 'treasurer' : null, user.oc ? 'oc' : null].filter(Boolean);
      }
    }
    hubTab = keepTab;
    hubSelectedId = keepSelected;
    workspaceMode = keepMode;
    view = keepView;
    sync = snapshot.sync || sync;
    if (financeDraft && financeDraft.id) {
      const latestBook = (state.FinBooks || []).find(book => book.id === financeDraft.id);
      if (latestBook) loadFinanceDraft(latestBook);
      else financeDraft = null;
    }
    byId('role').textContent = roleLabel();
    hubLiveAppliedRevision = Number(snapshot.state.revision);
    // Advance applied key only after a successful apply.
    if (snapshot.changeKey) hubLiveChangeKey = snapshot.changeKey;
    if (snapshot.feed) {
      hubNotifications = {
        notifications: snapshot.feed.notifications || [],
        unreadCount: snapshot.feed.unreadCount || 0,
        activityUnread: snapshot.feed.activityUnread || {},
        studioUnread: snapshot.feed.studioUnread || {}
      };
    }
    hubLivePendingSnapshot = null;
    hubHidePendingBanner();
    render();
  }
  async function hubLiveTick(silent) {
    if (!window.KPTTransport || !window.KPTTransport.call) return;
    if (!user) return;
    if (hubLiveInFlight) return;
    if (document.hidden) return;
    if (hubLiveBackoffTimer) return;
    const emailNow = user.email;
    if (hubLiveEmail && emailNow !== hubLiveEmail) {
      // Identity changed: discard old keys/in-flight work and bump generation.
      hubLiveGeneration += 1;
      hubLiveChangeKey = null;
      hubLivePendingSnapshot = null;
      hubLiveAppliedRevision = -1;
      hubLiveErrors = 0;
      hubHidePendingBanner();
    }
    hubLiveEmail = emailNow;
    // Baseline must come from bootstrap.changeKey (set in refresh); never accept first probe blindly.
    if (hubLiveChangeKey == null) {
      // Wait for bootstrap baseline — do not invent one from probe.
      return;
    }
    hubLiveInFlight = true;
    const generation = hubLiveGeneration;
    const requestId = ++hubLiveRequestId;
    const email = emailNow;
    try {
      const probe = await window.KPTTransport.call({ action: 'liveProbe' });
      if (generation !== hubLiveGeneration || requestId !== hubLiveRequestId || !user || user.email !== email) return;
      const changeKey = probe && probe.changeKey;
      if (!changeKey) return;
      if (changeKey === hubLiveChangeKey) {
        // No authorised change since applied key — try staged pending only if safe (already staged).
        hubLiveErrors = 0;
        return;
      }
      if (hubLivePendingSnapshot && hubLivePendingSnapshot.changeKey === changeKey) {
        hubLiveErrors = 0;
        if (hubIsSafeToApplyLive()) await hubApplyLiveSnapshot(hubLivePendingSnapshot, requestId, email, generation);
        else if (hubLivePending) hubShowPendingBanner();
        return;
      }
      const snapshot = await window.KPTTransport.call({ action: 'liveSnapshot' });
      if (generation !== hubLiveGeneration || requestId !== hubLiveRequestId || !user || user.email !== email) return;
      hubLiveErrors = 0;
      await hubApplyLiveSnapshot(snapshot, requestId, email, generation);
    } catch (error) {
      if (generation !== hubLiveGeneration || requestId !== hubLiveRequestId || !user || user.email !== email) return;
      hubLiveErrors = Math.min(hubLiveErrors + 1, 6);
      const delay = Math.min(HUB_LIVE_MS * Math.pow(2, hubLiveErrors - 1), HUB_LIVE_MAX_BACKOFF);
      if (!silent) notice(error.message, true);
      if (hubLiveBackoffTimer) clearTimeout(hubLiveBackoffTimer);
      hubLiveBackoffTimer = setTimeout(() => {
        hubLiveBackoffTimer = null;
        hubLiveTick(true);
      }, delay);
    } finally {
      // Only clear inFlight for this generation's request — never clobber a newer flight.
      if (generation === hubLiveGeneration && requestId === hubLiveRequestId) hubLiveInFlight = false;
    }
  }
  function hubInvalidateLive() {
    hubLiveGeneration += 1;
    hubLiveRequestId += 1;
    hubLiveInFlight = false;
    hubLiveChangeKey = null;
    hubLivePendingSnapshot = null;
    hubLiveAppliedRevision = -1;
    hubLiveErrors = 0;
    if (hubLiveBackoffTimer) { clearTimeout(hubLiveBackoffTimer); hubLiveBackoffTimer = null; }
  }
  function hubFinanceAttachmentsBlock() {
    const bookId = financeDraft && financeDraft.id;
    const list = hubFinAttachments(bookId);
    const savedBook = bookId ? ((state && state.FinBooks) || []).find(b => b.id === bookId) : null;
    const status = savedBook ? (savedBook.status || 'Draft') : 'Draft';
    const locked = ['AwaitingOC', 'OCChecked', 'Submitted', 'Approved'].indexOf(status) >= 0;
    const pkg = savedBook && savedBook.packageId ? (state.DocPackages || []).find(p => p.id === savedBook.packageId) : null;
    const roles = pkg ? packageRolesFor(pkg, user && user.email) : [];
    // OC may view drafts read-only; only Owner / Treasurer / this activity's OT can edit attachments.
    const canEditAttach = !(document.body.dataset.mode === 'hub' && hubTab === 'hall') && !locked && !!bookId && !!(user.owner || user.treasurer || roles.indexOf('ot') >= 0);
    return '<section class="card" style="margin-top:18px"><div class="section-heading" style="margin-top:0"><div><div class="eyebrow">' + escape(t('hub.receipts')) + '</div><h2 style="margin:0">' + escape(t('hub.receipts')) + '</h2></div>'
      + (canEditAttach ? '<label class="button" for="hub-receipt-file">' + escape(t('hub.uploadReceipt')) + '<input id="hub-receipt-file" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" multiple hidden></label>' : '')
      + '</div><p class="hint">' + escape(t('hub.receiptsHint')) + ' ' + escape(t('hub.exportOptional')) + '</p>'
      + '<div class="hub-finance-attach">'
      + (list.length ? list.map(row => {
        const isImage = /^image\//.test(row.mime || '') || /\.(jpg|jpeg|png)$/i.test(row.fileName || '');
        return '<div class="row"><div class="name">' + (isImage ? '<img hidden alt="' + escape(row.fileName) + '" data-attach-preview="' + escape(row.id) + '">' : '') + '<div>' + escape(row.fileName) + ' · ' + Number(row.bytes || 0) + ' ' + escape(t('hub.bytes')) + '</div></div>'
          + '<div class="row-tools">'
          + '<button type="button" class="button small btn-download" data-action="hubDownloadAttach" data-id="' + escape(row.id) + '">' + escape(t('hub.downloadReceipt')) + '</button>'
          + (isImage ? button(langLabel('Preview', '预览'), 'hubPreviewAttach', row.id) : '')
          + (canEditAttach ? '<button type="button" class="button small btn-return" data-action="hubRemoveAttach" data-id="' + escape(row.id) + '">' + escape(t('hub.removeReceipt')) + '</button>' : '')
          + '</div></div>';
      }).join('') : '<p class="muted">' + escape(t('hub.notificationsEmpty')) + '</p>')
      + '</div></section>';
  }
  byId('year').value = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4)) || new Date().getFullYear();
  function preferredMode() {
    if (!user) return 'admin';
    const hash = String(location.hash || '').replace('#', '').toLowerCase();
    const queryMode = String(new URLSearchParams(location.search).get('mode') || '').toLowerCase();
    const requested = queryMode || hash;
    if (requested === 'portal') return 'portal';
    if (requested === 'treasurer' && (user.treasurer || user.owner)) return 'treasurer';
    if (requested === 'owner' && user.owner) return 'owner';
    if (requested === 'admin' && (user.admin || user.owner)) return 'admin';
    if (requested === 'oc' && user.oc) return 'oc';
    if (user.owner) return 'portal';
    if (user.treasurer && !user.admin) return 'treasurer';
    if (user.admin) return 'portal';
    if (user.oc) return 'oc';
    return 'portal';
  }
  function modeSwitcher() {
    if (!user) return '';
    const items = [];
    if (isOcOnly()) return '';
    items.push(['portal', 'Member System']);
    if (user.owner || user.treasurer) items.push(['treasurer', 'Treasurer Work']);
    if (user.owner || user.admin) items.push(['admin', 'Admin Work']);
    if (user.owner) items.push(['owner', 'Owner']);
    if (items.length < 2) return '';
    return '<div class="mode-switcher" role="navigation" aria-label="Workspace">' + items.map(([mode, label]) => '<button type="button" class="button small' + (workspaceMode === mode ? ' primary' : '') + '" data-action="setMode" data-id="' + mode + '">' + escape(label) + '</button>').join('') + '</div>';
  }
  function roleLabel() {
    if (!user) return '';
    if (user.owner) return 'Owner';
    if (user.admin && user.treasurer) return 'Admin · Treasurer';
    if (user.admin) return 'Administrator';
    const role = activePackageRole();
    const mine = (state && state.DocPackages && openDocPackageId) ? state.DocPackages.find(row => row.id === openDocPackageId) : ocPackages()[0];
    const suffix = mine ? ' · ' + mine.activityType + ' (' + mine.year + ')' : '';
    if (role === 'oc') return 'Organizing Chairman' + suffix;
    if (role === 'os') return 'Organizing Secretary' + suffix;
    if (role === 'ot') return 'Organizing Treasurer' + suffix;
    if (isOcOnly() || user.oc) return 'Activity member' + suffix;
    if (user.treasurer) return 'Treasurer';
    return 'Guest';
  }
  function renderNavigation() {
    const ocMode = workspaceMode === 'oc' || isOcOnly();
    let html = workspaceNav(workspaceMode).map(([key]) => {
      const text = key === 'Documents' && openDocPackageId ? t('nav.AllActivities') : navLabel(key);
      return '<button type="button" data-nav="' + key + '">' + icon + escape(text) + '</button>';
    }).join('');
    if (ocMode && state && state.DocPackages) {
      const packages = ocPackages();
      if (packages.length) {
        html += packages.map(pkg => {
          const label = pkg.activityType + ' (' + pkg.year + ')';
          return '<button type="button" class="doc-package-link" data-action="docOpen" data-id="' + escape(pkg.id) + '" data-package="' + escape(pkg.id) + '">' + icon + escape(label) + '</button>';
        }).join('');
      }
    }
    const lang = (window.KPTI18n && window.KPTI18n.getLang()) || 'en';
    html += '<button type="button" data-action="telegramSettings">' + icon + 'Telegram</button>';
    html += '<button type="button" data-action="toggleLang" style="margin-top:auto">' + icon + (lang === 'zh' ? 'EN' : '中') + '</button>';
    byId('navigation').innerHTML = html;
    document.querySelectorAll('[data-package]').forEach(element => {
      element.classList.toggle('active', !!openDocPackageId && element.dataset.package === openDocPackageId);
    });
  }
  function applyWorkspaceTheme() {
    document.body.dataset.mode = isOcOnly() || workspaceMode === 'oc' ? 'oc' : workspaceMode;
  }
  const year = () => Number(byId('year').value);
  function notice(message, error) { byId('notice').className = 'message' + (error ? ' error' : ''); byId('notice').textContent = message || ''; }
  function clearSessionHash() {
    try { history.replaceState({}, '', location.pathname + location.search.replace(/[?&]mode=portal/g, '').replace(/[?&]package=[^&]*/g, '')); } catch (error) { /* ignore */ }
  }
  function openGoogleAccountUrl(url) {
    // HtmlService runs inside a Google iframe; accounts.google.com refuses framing.
    // Navigate the top window, or fall back to a new tab.
    try {
      if (window.top && window.top !== window) window.top.location.href = url;
      else location.href = url;
    } catch (error) {
      window.open(url, '_blank', 'noopener');
    }
  }
  function adminSelfUrl() {
    return /^https:\/\/script\.google\.com\//.test(location.href) ? location.href.split('?')[0] : location.href.split('#')[0];
  }
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = String(reader.result || '');
        const comma = data.indexOf(',');
        resolve(comma >= 0 ? data.slice(comma + 1) : data);
      };
      reader.onerror = () => reject(new Error('Could not read ' + file.name));
      reader.readAsDataURL(file);
    });
  }
  function busyNotice(message) { byId('notice').className = 'message working'; byId('notice').innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + escape(message); }
  function pill(value) { return '<span class="pill ' + (['Active', 'Efficient', 'Pending', 'Pass', 'Fail', 'Absent', 'Current', 'Completed', 'Upcoming', 'Ready', 'Missing', 'Approved', 'Rejected'].includes(value) ? value : '') + '">' + escape(value) + '</span>'; }
  function memberName(id) { const row = state.Members.find(member => member.id === id); return row ? row.name : id; }
  function button(label, action, id, table) { return '<button class="button small" type="button" data-action="' + action + '" data-id="' + escape(id || '') + '" data-table="' + escape(table || '') + '">' + escape(label) + '</button>'; }
  function deleteButton(tableName, id) { return user.owner ? button('Delete', 'delete', id, tableName) : ''; }
  function table(headers, rows) { return '<div class="table-wrap"><table><thead><tr>' + headers.map(header => '<th scope="col">' + escape(header) + '</th>').join('') + '</tr></thead><tbody>' + (rows.length ? rows.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + headers.length + '" class="empty">No records yet.</td></tr>') + '</tbody></table></div>'; }
  function paginate(rows) {
    const size = 40;
    page = Math.min(page, Math.max(0, Math.ceil(rows.length / size) - 1));
    return rows.slice(page * size, (page + 1) * size);
  }
  function pager(total) { return '<div class="section-heading"><small>' + total + ' records · Page ' + (page + 1) + ' of ' + Math.max(1, Math.ceil(total / 40)) + '</small><div class="toolbar">' + button('Previous', 'previous') + button('Next', 'next', String(total)) + '</div></div>'; }
  function listHead(title, tableName, addLabel) {
    return '<div class="section-heading"><div class="field"><label for="filter">' + title + '</label><input id="filter" type="search" placeholder="Filter records…" value="' + escape(query) + '"></div>' + (tableName ? '<button class="button primary" type="button" data-action="add" data-table="' + tableName + '">' + escape(addLabel || 'Add record') + '</button>' : '') + '</div>';
  }
  function match(row) { return !query || KPT.norm(Object.values(row).join(' ') + (row.memberId ? ' ' + memberName(row.memberId) : '')).includes(KPT.norm(query)); }
  function annualMembers() { return state.Members.filter(member => !member.joined || Number(member.joined.slice(0, 4)) <= year() || state.Enrolments.some(row => row.memberId === member.id && row.year === year())).map(member => { const annual = state.Enrolments.find(row => row.memberId === member.id && row.year === year()); return Object.assign({}, member, annual ? { form: annual.form, annualStatus: annual.status } : { annualStatus: member.status }); }); }
  function overview() {
    const members = annualMembers();
    const summaries = members.map(member => KPT.summary(state, member.id, year()));
    const metrics = [['Members on record', state.Members.length, 'Current & former members'], ['Active members', members.filter(row => row.annualStatus === 'Active').length, 'For the selected reporting year'], ['Efficient', summaries.filter(row => row.efficient === 'Efficient').length, 'All four conditions met'], ['Duty awaiting entry', summaries.filter(row => row.hours === null).length, 'Annual hours not yet recorded']];
    const activities = state.Activities.filter(row => !row.archived && Number(row.date.slice(0, 4)) === year()).sort((first, second) => second.date.localeCompare(first.date)).slice(0, 5);
    const packages = ocPackages();
    const packageCard = packages.length ? '<section class="card" style="margin-top:24px"><div class="section-heading" style="margin-top:0"><h2>Annual Activity</h2>' + button('Open', 'navigate', 'Documents') + '</div><div class="activity-line-wrap">' + packages.map(pkg => {
      const progress = docProgress(pkg);
      return '<div class="activity-line"><div><strong>' + escape(pkg.activityType + ' (' + pkg.year + ')') + '</strong><small>' + escape((pkg.eventDate || 'Date TBC') + ' · ' + (progress.total ? progress.approved + '/' + progress.total + ' approved' : pkg.status)) + '</small></div>' + button('Open', 'docOpen', pkg.id) + '</div>';
    }).join('') + '</div></section>' : '';
    return '<p class="page-intro">Your division’s records, connected in one place. Select a year to review annual participation and efficiency.</p><div class="metrics">' + metrics.map(([label, value, caption]) => '<div class="metric"><div class="label">' + label + '</div><div class="value">' + value + '</div><small>' + caption + '</small></div>').join('') + '</div><div class="grid-two"><section class="card"><div class="section-heading" style="margin-top:0"><h2>Recent activities</h2>' + button('Manage', 'navigate', 'Activities') + '</div>' + (activities.length ? activities.map(row => '<div class="activity-line"><div><strong>' + escape(row.name) + '</strong><small>' + escape(row.date + ' · ' + row.tags.join(' / ')) + '</small></div>' + button('Attendance', 'attendance', row.id) + '</div>').join('') : '<p class="muted">No activities recorded for this year.</p>') + '</section><section class="card"><h2>Annual efficiency</h2><p class="muted">All conditions must be met within ' + year() + '.</p><ul class="rule-list"><li><span>Duty service</span><strong>≥ 60 hours</strong></li><li><span>DIM participation</span><strong>≥ 12 activities</strong></li><li><span>Inspection</span><strong>Participated</strong></li><li><span>Examination</span><strong>Participated</strong></li></ul><p class="inline-help">Pass or Fail both count as participation. Absent does not. Pending results count only when participation is confirmed.</p></section></div>' + packageCard + '<section class="card" style="margin-top:24px"><h2>Recent changes</h2>' + table(['When', 'Administrator', 'Change'], (state.audit || []).slice(-5).reverse().map(row => [escape(new Date(row.at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })), escape(row.actor), escape(row.action)])) + '</section>';
  }
  function phaseView() {
    const controls = user.owner ? '<div class="phase-owner"><div><strong>Owner control</strong><small>选择目前正在进行的阶段。这个选择不会自动改变，也不会跟着资料备份恢复。</small></div><div class="phase-buttons">' + phases.map((phase, index) => '<button class="button small' + (currentPhase === index + 1 ? ' primary' : '') + '" type="button" data-action="setPhase" data-id="' + (index + 1) + '">Phase ' + (index + 1) + '</button>').join('') + '</div></div>' : '<div class="message warning">目前是 Phase ' + currentPhase + '。只有 Owner 可以更改 Current Phase；Secretary 可以查看所有说明。</div>';
    return '<p class="page-intro">这页把整个系统分成 6 个容易跟着做的阶段。一次完成一个阶段，不需要一开始就把所有资料填满。</p>' + controls + '<div class="phase-grid">' + phases.map((phase, index) => { const number = index + 1; const status = number < currentPhase ? 'Completed' : number === currentPhase ? 'Current' : 'Upcoming'; return '<section class="phase-card ' + status.toLowerCase() + '"><div class="phase-card-top"><span class="phase-number">Phase ' + number + '</span>' + pill(status) + '</div><h2>' + escape(phase.title) + '</h2><p>' + escape(phase.goal) + '</p><div class="phase-owner-label"><span>负责人</span><strong>' + escape(phase.owner) + '</strong></div><ol>' + phase.steps.map(step => '<li>' + escape(step) + '</li>').join('') + '</ol></section>'; }).join('') + '</div>';
  }
  function memberList() {
    const rows = state.Members.filter(match).sort((first, second) => first.name.localeCompare(second.name));
    const bulkDelete = user.owner && state.Members.length ? '<section class="card" style="margin-top:24px"><h2>Bulk student removal</h2><p class="muted">Move every student and all linked Attendance, Exam, Duty, Award and Enrolment records into one restorable Recycle Bin item. Activities and Catalogue options are kept.</p><button class="button danger" type="button" data-action="deleteAllMembers">Delete all students</button></section>' : '';
    return listHead('Search name, SJAM ID or IC', 'Members', 'Add student') + table(['Name', 'SJAM ID', 'IC · private', 'Tingkatan', 'Status', 'Actions'], paginate(rows).map(row => [escape(row.name) + '<br><small>' + escape(row.id) + '</small>', escape(row.sjamId || 'Not assigned'), escape(row.ic || '—'), escape(row.form || '—'), pill(row.status), '<div class="row-tools">' + button('View', 'detail', row.id) + button('Edit', 'edit', row.id, 'Members') + deleteButton('Members', row.id) + '</div>'])) + pager(rows.length) + bulkDelete;
  }
  function activityList() {
    const rows = state.Activities.filter(row => Number(row.date.slice(0, 4)) === year() && match(row)).sort((first, second) => second.date.localeCompare(first.date));
    return '<p class="page-intro">Create an activity, select one or more categories, then mark attendance. Examination activities generate linked exam records from attendance.</p>' + listHead('Activities for ' + year(), 'Activities', 'Add activity') + table(['Activity', 'Date', 'Categories', 'Present', 'Actions'], paginate(rows).map(row => [escape(row.name) + (row.archived ? ' ' + pill('Archived') : ''), escape(row.date), escape(row.tags.join(' / ')), state.Attendance.filter(item => item.activityId === row.id && item.present).length, '<div class="row-tools">' + (!row.archived ? button('Attendance', 'attendance', row.id) : '') + button('Edit', 'edit', row.id, 'Activities') + button(row.archived ? 'Unarchive' : 'Archive', 'archive', row.id, 'Activities') + deleteButton('Activities', row.id) + '</div>'])) + pager(rows.length);
  }
  function examList() {
    const rows = state.Exams.filter(row => Number(row.date.slice(0, 4)) === year() && match(row)).sort((first, second) => second.date.localeCompare(first.date));
    return listHead('Examinations for ' + year(), 'Exams', 'Add exam record') + table(['Student', 'Exam', 'Date', 'Result', 'Participation', 'Certificate · private', 'Actions'], paginate(rows).map(row => [escape(memberName(row.memberId)), escape(row.type) + (row.archived ? ' ' + pill('Archived') : '') + (row.activityId ? '<br><small>Linked activity</small>' : ''), escape(row.date), pill(row.result), row.attended ? 'Confirmed' : 'Not confirmed', escape(row.certificate || '—'), '<div class="row-tools">' + button('Edit', 'edit', row.id, 'Exams') + button(row.archived ? 'Unarchive' : 'Archive', 'archive', row.id, 'Exams') + deleteButton('Exams', row.id) + '</div>'])) + pager(rows.length);
  }
  function dutyList() {
    const rows = annualMembers().filter(match);
    return '<p class="page-intro">Enter each member’s total hours for ' + year() + '. Leave blank when the total is not known. Individual duty events will be added in a later version.</p>' + listHead('Annual Duty hours', null) + table(['Student', 'SJAM ID', 'Hours', 'Threshold', 'Actions'], paginate(rows).map(member => { const duty = state.Duty.find(row => row.memberId === member.id && row.year === year()); const hours = duty ? duty.hours : null; return [escape(member.name), escape(member.sjamId || '—'), hours === null ? '<span class="muted">Not recorded</span>' : escape(hours), pill(hours === null ? 'Pending' : hours >= 60 ? 'Efficient' : 'Below 60'), '<div class="row-tools">' + button('Enter hours', 'duty', member.id) + (duty ? deleteButton('Duty', duty.id) : '') + '</div>']; })) + pager(rows.length);
  }
  const moneyText = value => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : '0.00';
  };
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  function financeList() {
    const roleSet = activePackageRoles();
    const isGlobal = !!(user && (user.owner || user.treasurer || user.admin));
    const myPackageIds = new Set((state && state.DocPackages || []).filter(pkg => {
      if (user && (user.owner || user.admin)) return true;
      return packageRolesFor(pkg, user && user.email).length > 0;
    }).map(pkg => pkg.id));
    const books = state.FinBooks.filter(book => {
      if (!match(book)) return false;
      if (isGlobal) return true;
      // Package roles only see books for packages they are assigned to.
      return book.packageId && myPackageIds.has(book.packageId);
    }).slice().sort((first, second) => first.activityName.localeCompare(second.activityName));
    const how = '<section class="card how-card"><h2>How to use this page</h2><ol><li><strong>Income &amp; Expenses</strong> — type all money in and money out for the activity.</li><li><strong>Reimbursement forms</strong> — each form holds up to 11 lines. A full form automatically continues on a new form.</li><li><strong>Receipts</strong> — photograph every slip, then download one PDF.</li></ol></section>';
    const canReview = !!(user.owner || user.treasurer);
    const canAdd = !!(user.owner || user.treasurer || roleSet.indexOf('ot') >= 0);
    return '<p class="page-intro">Enter an activity name to start a new finance record. Anyone signed in here can fill these tables; downloads match the official formats.</p>' + how + listHead('Activity finance records', null) + (canAdd ? '<div class="section-heading"><span></span><button class="button primary" type="button" data-action="financeAddBook">Add activity</button></div>' : '') + table(['Activity', 'Status', 'Income lines', 'Expense lines', 'Reimbursement forms', 'Actions'], books.map(book => {
      const incomes = state.FinIncomes.filter(row => row.bookId === book.id).length;
      const expenses = state.FinExpenses.filter(row => row.bookId === book.id).length;
      const forms = state.FinReimbursements.filter(row => row.bookId === book.id).length;
      const status = book.status || 'Draft';
      const tools = [button('Open', 'financeOpenBook', book.id)];
      if (canReview && status === 'Submitted') {
        tools.push(button('Approve', 'finApprove', book.id));
        tools.push(button('Reject', 'finReject', book.id));
      }
      if (canReview && status === 'Approved' && (user.owner || user.admin)) tools.push(button('Reopen', 'finReopen', book.id));
      tools.push(deleteButton('FinBooks', book.id));
      return [escape(book.activityName), pill(workflowStatusLabel(status)), incomes, expenses, forms, '<div class="row-tools">' + tools.join(' ') + '</div>'];
    })) + pager(books.length);
  }
  function financeInput(kind, index, key, value, type, attrs) {
    return '<input type="' + type + '" data-fin="' + kind + '" data-index="' + index + '" data-key="' + key + '" value="' + escape(value == null ? '' : value) + '" ' + (attrs || '') + '>';
  }
  function financeRows(kind, rows, columns) {
    if (!rows.length) return '<p class="muted finance-empty">No rows yet. Use Add row.</p>';
    return rows.map((row, index) => '<div class="finance-row" data-finance-row="' + kind + '" data-index="' + index + '">' + columns.map(column => '<label><span>' + escape(column.label) + '</span>' + financeInput(kind, index, column.key, row[column.key], column.type || 'text', column.attrs || '') + '</label>').join('') + '<button class="button small danger finance-remove" type="button" data-action="financeRemoveRow" data-id="' + kind + '" data-index="' + index + '" aria-label="Remove row">Remove</button></div>').join('');
  }
  function financeFormBlock(form, formIndex) {
    const lines = form.lines || [];
    const total = lines.reduce((sum, line) => sum + (Number(line.total) || 0), 0);
    return '<section class="card finance-form-card"><div class="section-heading" style="margin-top:0"><div><div class="eyebrow">Form ' + form.formSeq + '</div><h2>Reimbursement ' + escape(form.purpose || 'Line items') + '</h2></div><div class="toolbar">' + button('Download form', 'financeDownloadForm', String(formIndex)) + button('Remove form', 'financeRemoveForm', String(formIndex), '') + '</div></div><div class="form-grid finance-form-meta">' + '<div class="field"><label>Treasurer name</label>' + financeInput('form' + formIndex, 0, 'treasurerName', form.treasurerName, 'text', 'required') + '</div>' + '<div class="field"><label>Form date</label>' + financeInput('form' + formIndex, 0, 'formDate', form.formDate, 'date') + '</div>' + '<div class="field"><label>Purpose / Event</label>' + financeInput('form' + formIndex, 0, 'purpose', form.purpose, 'text') + '</div>' + '<div class="field"><label>Cheque No (optional)</label>' + financeInput('form' + formIndex, 0, 'chequeNo', form.chequeNo, 'text') + '</div>' + '</div><p class="hint">Up to 11 lines per form. When the 11th line is filled, use <strong>Add form</strong> for the rest.</p><div class="section-heading"><h3 style="margin:0">Lines · ' + lines.length + '/11 · Total RM ' + moneyText(total) + '</h3><button class="button small" type="button" data-action="financeAddLine" data-id="' + formIndex + '">Add line</button></div>' + financeRows('line' + formIndex, lines, [
      { label: 'Date', key: 'date', type: 'date' },
      { label: 'Invoice No', key: 'invoiceNo', type: 'text' },
      { label: 'Particular', key: 'particular', type: 'text' },
      { label: 'Total (MYR)', key: 'total', type: 'number', attrs: 'min="0" step="0.01" inputmode="decimal"' }
    ]) + '</section>';
  }
  function financeEditor() {
    const book = financeDraft;
    const incomeTotal = book.incomes.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const expenseTotal = book.expenses.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const files = financeReceiptFiles;
    const savedBook = book.id ? (state && state.FinBooks || []).find(row => row.id === book.id) : null;
    const liveStatus = savedBook ? (savedBook.status || 'Draft') : 'Draft';
    const locked = ['AwaitingOC', 'OCChecked', 'Submitted', 'Approved'].indexOf(liveStatus) >= 0;
    const reviewView = document.body.dataset.mode === 'hub' && hubTab === 'hall';
    const canEdit = !reviewView && !locked && (() => {
      if (!book.id && !book.packageId) return !!(user.owner || user.treasurer);
      if (!book.packageId) return !!(user.owner || user.treasurer);
      const pkg = (state && state.DocPackages || []).find(p => p.id === book.packageId);
      if (!pkg) return !!(user.owner || user.treasurer);
      const roles = packageRolesFor(pkg, user.email);
      return roles.indexOf('ot') >= 0 || !!user.owner || !!user.treasurer;
    })();
    const canReview = !!(user.owner || user.treasurer);
    const readOnly = locked || !canEdit ? ' readonly' : '';
    const disableAdd = locked || !canEdit ? ' disabled' : '';
    const reviewBar = canReview && liveStatus === 'Submitted' ? '<div class="toolbar">' + button('Approve', 'finApprove', book.id) + button('Reject', 'finReject', book.id) + '</div>' : '';
    const how = canEdit
      ? '<section class="card how-card"><h2>' + escape(langLabel('Your OT finance workbench', '你的 OT 财务工作台')) + '</h2><ol><li>' + escape(langLabel('Fill in the accounts and reimbursement forms, then save.', '填好账目和报销表，记得保存。')) + '</li><li>' + escape(langLabel('Add your JPG, PNG or PDF receipts below. Account changes are saved before uploading.', '在下方加上 JPG、PNG 或 PDF 收据。上传前会先保存账目。')) + '</li><li>' + escape(langLabel('When ready, open Submissions & approvals and hand it in to OC. No Excel or PDF download is needed.', '做好后去「提交与审批」交给 OC，不用先下载 Excel 或 PDF。')) + '</li></ol></section>'
      : '<section class="card how-card"><h2>' + escape(langLabel('Read the accounts and receipts', '看看账目和收据')) + '</h2><p>' + escape(langLabel('This is a read-only copy. OC can check it here, then send it to the Treasurer for approval.', '这里可以看账目和收据，不能直接改。OC 看过没问题后，再交给财政批准。')) + '</p></section>';
    return '<div class="section-heading"><div><div class="eyebrow">' + escape(langLabel('Activity finance', '活动财务')) + ' · ' + escape(workflowStatusLabel(liveStatus)) + '</div><h2 style="margin:0">' + escape(book.activityName || 'New activity') + '</h2></div><div class="toolbar">' + button('Back to list', 'financeBack') + reviewBar + (canEdit && !locked ? '<button class="button primary" type="button" data-action="financeSave">Save</button>' : '') + '</div></div>' + (locked ? '<p class="hint">' + escape(langLabel('This book is in the approval flow. Editing is locked until it is returned or reopened.', '本账本正在审批流中，退回或重开前不能编辑。')) + '</p>' : '') + how + '<section class="card"><div class="field full"><label for="finance-activity-name">Activity name</label><input id="finance-activity-name" type="text" data-fin="book" data-index="0" data-key="activityName" value="' + escape(book.activityName) + '" maxlength="200" placeholder="e.g. Badminton Competition 2026"' + readOnly + '></div></section>' +
      '<section class="card" style="margin-top:18px"><div class="section-heading" style="margin-top:0"><div><div class="eyebrow">Step 1</div><h2 style="margin:0">Income &amp; Expenses</h2></div><div class="toolbar"><button class="button small" type="button" data-action="financeAddIncome"' + disableAdd + '>Add income</button><button class="button small" type="button" data-action="financeAddExpense"' + disableAdd + '>Add expense</button>' + button('Download Excel', 'financeDownloadIE') + '</div></div>' +
      '<h3>Income · RM ' + moneyText(incomeTotal) + '</h3>' + financeRows('income', book.incomes, [{ label: 'Date', key: 'date', type: 'date', attrs: readOnly.trim() }, { label: 'Description', key: 'description', type: 'text', attrs: readOnly.trim() }, { label: 'Amount (RM)', key: 'amount', type: 'number', attrs: 'min="0" step="0.01" inputmode="decimal"' + readOnly }]) +
      '<h3 style="margin-top:20px">Expenditure · RM ' + moneyText(expenseTotal) + '</h3>' + financeRows('expense', book.expenses, [{ label: 'Date', key: 'date', type: 'date', attrs: readOnly.trim() }, { label: 'Item', key: 'item', type: 'text', attrs: readOnly.trim() }, { label: 'Description', key: 'description', type: 'text', attrs: readOnly.trim() }, { label: 'Quantity', key: 'quantity', type: 'text', attrs: readOnly.trim() }, { label: 'Cost per unit (RM)', key: 'unitCost', type: 'text', attrs: readOnly.trim() }, { label: 'Amount (RM)', key: 'amount', type: 'number', attrs: 'min="0" step="0.01" inputmode="decimal"' + readOnly }]) +
      '</section>' +
      '<section class="card" style="margin-top:18px"><div class="section-heading" style="margin-top:0"><div><div class="eyebrow">Step 2</div><h2 style="margin:0">Reimbursement forms</h2></div><button class="button small" type="button" data-action="financeAddForm"' + disableAdd + '>Add form</button></div>' +
      (book.reimbursements.length ? book.reimbursements.map((form, index) => financeFormBlock(form, index)).join('') : '<p class="muted">No forms yet.</p>') +
      '</section>' +
      hubFinanceAttachmentsBlock() + '<details class="card" style="margin-top:18px"><summary>' + escape(langLabel('Optional: combine local photos into a PDF', '可选：将本机照片合并成 PDF')) + '</summary><div class="toolbar"><label class="button" for="finance-receipts">Add photos<input id="finance-receipts" type="file" accept="image/*" multiple hidden></label><button class="button" type="button" data-action="financeDownloadReceipts"' + (files.length ? '' : ' disabled') + '>Download PDF</button></div>' +
      '<p class="hint">' + files.length + ' · ' + escape(langLabel('This helper only creates a file on this device. Use Add receipt above to save receipts with the accounts.', '这个工具只在本机生成文件。要把收据保存到账本，请使用上方的“添加收据”。')) + '</p>' +
      (files.length ? '<div class="receipt-grid">' + files.map((file, index) => '<figure><img alt="' + escape(file.name) + '" src="' + escape(file.preview || '') + '"><figcaption>' + escape(file.name) + '</figcaption><button class="button small" type="button" data-action="financeRemoveReceipt" data-id="' + index + '">Remove</button></figure>').join('') + '</div>' : '') +
      '</details>' + (canEdit && !locked ? '<p class="hint">' + escape(t('hub.gotoHall')) + '</p>' : '');
  }
  function awardList() {
    const rows = state.Awards.filter(match).sort((first, second) => second.date.localeCompare(first.date));
    const eligibility = KPT.awardEligibility(state);
    const eligibleRows = eligibility.eligible.map(row => [escape(memberName(row.memberId)), escape(row.level), escape(row.metric === 'lifetimeDutyHours' ? row.value + ' total Duty Hours' : row.value + ' Efficient year' + (row.value === 1 ? '' : 's')), button('Record award', 'recordEligible', row.memberId + '|' + row.catalogId)]);
    const eligible = '<section class="card eligibility-card"><div class="section-heading" style="margin-top:0"><div><div class="eyebrow">Calculated from recorded data</div><h2>Eligible Awards</h2></div></div><p class="muted">These are suggestions only. An award becomes official only after an administrator records its date.</p>' + table(['Student', 'Eligible award', 'Basis', 'Action'], eligibleRows) + '</section>';
    return '<p class="page-intro">Saved awards appear in the public directory. Certificate numbers and internal notes remain private. Archived awards are not published.</p>' + eligible + listHead('Awards & recognition', 'Awards', 'Record award') + table(['Student', 'Award', 'Category', 'Date', 'Level', 'Actions'], paginate(rows).map(row => [escape(memberName(row.memberId)), escape(row.name) + (row.archived ? ' ' + pill('Archived') : ''), escape(row.category), escape(row.date), escape(row.level || '—'), '<div class="row-tools">' + button('Edit', 'edit', row.id, 'Awards') + button(row.archived ? 'Unarchive' : 'Archive', 'archive', row.id, 'Awards') + deleteButton('Awards', row.id) + '</div>'])) + pager(rows.length);
  }
  function summaryRows() {
    return annualMembers().map(member => Object.assign({ id: member.id, name: member.name, sjamId: member.sjamId, ic: member.ic, form: member.form, status: member.annualStatus }, KPT.summary(state, member.id, year())));
  }
  function dataList() {
    const rows = summaryRows().filter(match);
    return '<p class="page-intro">Private annual summary. Historical Tingkatan and status use the saved annual enrolment when available.</p>' + listHead('Data Center · ' + year(), null) + '<div class="toolbar" style="margin-bottom:18px">' + button('Edit annual enrolment', 'add', '', 'Enrolments') + button('Export with summary', 'exportSummary') + '</div>' + table(['Student', 'SJAM ID', 'IC · private', 'Tingkatan', 'Status', 'Duty', 'DIM', 'Inspection', 'Exam attended', 'Efficiency', 'Annual profile'], paginate(rows).map(row => { const annual = state.Enrolments.find(item => item.memberId === row.id && item.year === year()); return [escape(row.name), escape(row.sjamId || '—'), escape(row.ic || '—'), escape(row.form || '—'), pill(row.status), row.hours === null ? 'Pending' : escape(row.hours), row.dim, row.inspection ? 'Yes' : 'Not recorded', row.exam ? 'Yes' : 'Not recorded', pill(row.efficient), '<div class="row-tools">' + (annual ? button('Edit', 'edit', annual.id, 'Enrolments') + deleteButton('Enrolments', annual.id) : button('Record', 'enrolment', row.id)) + '</div>']; })) + pager(rows.length);
  }
  function setupView() {
    const preview = KPT.setupPreview(state);
    const groups = [
      ['Exam Types', row => row.kind === 'Exam'],
      ['Cadet Probadge', row => row.category === 'Probadge'],
      ['Promotion', row => row.category === 'Promotion'],
      ['Special Service Shield', row => row.category === 'Special Service Shield'],
      ['Service Stripe & Star', row => row.category === 'Service Stripe & Star']
    ];
    const recommended = groups.map(([title, test]) => {
      const expected = KPT.recommendedCatalog.filter(test);
      const ready = expected.every(item => state.Catalog.some(row => row.code === item.code && !row.archived));
      const items = expected.map(item => { const saved = state.Catalog.find(row => row.code === item.code); return '<li><span>' + escape(item.name + (item.level ? ' · ' + item.level : '')) + '</span>' + pill(saved && !saved.archived ? 'Ready' : 'Missing') + '</li>'; }).join('');
      return '<section class="setup-card"><div class="phase-card-top"><h2>' + escape(title) + '</h2>' + pill(ready ? 'Ready' : 'Needs Setup') + '</div><ul class="setup-list">' + items + '</ul></section>';
    }).join('');
    const memberOptions = '<section class="setup-card"><div class="phase-card-top"><h2>Member Options</h2>' + pill('Ready') + '</div><p><strong>Tingkatan</strong></p><p class="muted">' + escape(KPT.forms.join(' · ')) + '</p><p><strong>Race</strong></p><p class="muted">' + escape(KPT.races.join(' · ')) + '</p></section>';
    const rules = '<section class="setup-card"><div class="phase-card-top"><h2>Efficiency Rules</h2>' + pill('Ready') + '</div><ul class="rule-list"><li><span>Duty</span><strong>≥ 60 hours</strong></li><li><span>DIM</span><strong>≥ 12</strong></li><li><span>Inspection</span><strong>Participated</strong></li><li><span>Exam</span><strong>Participated</strong></li></ul></section>';
    const setupActions = '<section class="card"><div class="section-heading" style="margin-top:0"><div><div class="eyebrow">Recommended configuration</div><h2>' + (preview.ready ? 'System setup is ready' : preview.missing.length + ' options still need setup') + '</h2></div><div class="toolbar">' + button('Preview recommended setup', 'previewSetup') + (setupDefaultsPreview && !setupDefaultsPreview.ready ? button('Apply missing defaults', 'applySetup') : '') + '</div></div><p class="muted">Applying defaults adds missing options and archives the old plain EFA/BFA choices. Historical records remain available. A private backup is created first.</p>' + (setupDefaultsPreview ? '<div class="message warning">Preview: add or connect ' + setupDefaultsPreview.missing.length + ' options; archive ' + setupDefaultsPreview.legacyExams.length + ' legacy exam options. No data has changed yet.</div>' : '') + '</section>';
    const rows = state.Catalog.filter(match).sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name));
    const advanced = '<section class="card"><div class="eyebrow">Advanced catalogue</div><p class="muted">Owner and Secretary can add custom choices or archive choices that are no longer used. Recommended internal codes and eligibility rules are protected.</p>' + listHead('Filter catalogue', 'Catalog', 'Add custom option') + table(['Type', 'Category', 'Name', 'Level', 'Status', 'Actions'], paginate(rows).map(row => [escape(row.kind), escape(row.category || '—'), escape(row.name), escape(row.level || '—'), row.archived ? 'Archived' : 'Available', '<div class="row-tools">' + button('Edit', 'edit', row.id, 'Catalog') + button(row.archived ? 'Unarchive' : 'Archive', 'archive', row.id, 'Catalog') + deleteButton('Catalog', row.id) + '</div>'])) + pager(rows.length) + '</section>';
    return '<p class="page-intro">Prepare the choices used in later phases before regular data entry begins.</p>' + setupActions + '<div class="setup-grid">' + memberOptions + rules + recommended + '</div>' + advanced;
  }
  function importView() {
    const type = importType;
    const isAll = type === 'ALL';
    const typeLabel = t('importType.' + type);
    const typeHelp = t('importHelp.' + type);
    const options = IMPORT_TYPES.map(value => '<option value="' + escape(value) + '"' + (value === type ? ' selected' : '') + '>' + escape(t('importType.' + value)) + '</option>').join('');
    const steps = '<ol class="import-steps">'
      + '<li>' + escape(t('importStep.pick')) + '</li>'
      + '<li>' + escape(t('importStep.template')) + '</li>'
      + '<li>' + escape(t('importStep.fill')) + '</li>'
      + '<li>' + escape(t('importStep.upload')) + '</li>'
      + '<li>' + escape(t('importStep.confirm')) + '</li>'
      + '</ol>';
    return '<div class="grid-two"><section class="card"><div class="eyebrow">' + escape(t('importTitle')) + '</div>'
      + '<h2>' + escape(t('importPickerLabel')) + '</h2>'
      + '<div class="field full"><label for="import-type">' + escape(t('importPickerLabel')) + '</label>'
      + '<select id="import-type" data-action="importTypeChange">' + options + '</select>'
      + '<p class="hint">' + escape(typeHelp) + '</p></div>'
      + steps
      + '<div class="toolbar">'
      + button(t('importDownloadTemplate'), 'importTemplate')
      + button(t('importDownloadExisting'), 'importExisting')
      + '</div>'
      + '<p class="hint">' + escape(isAll ? t('importAllHint') : String(t('importTypedHint')).replace('{type}', typeLabel)) + '</p>'
      + '<div class="file-input"><label for="excel-file">' + escape(t('importChooseFile')) + '</label><br><input id="excel-file" type="file" accept=".xlsx"></div>'
      + '<div class="toolbar">' + button(t('importPreviewBtn'), 'previewImport') + '</div>'
      + (isAll ? '<p class="hint">' + escape(t('importAdvancedNote')) + '</p>' : '')
      + '</section><section class="card"><div class="eyebrow">Portable records</div><h2>Export &amp; backup</h2><p class="muted">Export the current private records as Excel. Includes IDs and versions for future updates.</p><div class="toolbar">' + button('Export all records', 'export') + button('Export with annual summary', 'exportSummary') + '</div><p class="hint">Store exports privately; they contain IC and other personal records.</p></section></div><section id="import-preview" style="margin-top:24px"></section>';
  }
  function docProgress(pkg) {
    const items = state.DocItems.filter(row => row.packageId === pkg.id && !row.archived);
    const required = items.filter(row => row.required && row.status !== 'NotRequired');
    const approved = required.filter(row => row.status === 'Approved').length;
    return { items, required, approved, total: required.length };
  }
  function docDueLabel(pkg, item) {
    if (pkg.eventDate) {
      const due = new Date(pkg.eventDate + 'T00:00:00');
      due.setDate(due.getDate() + Number(item.dueOffsetDays || 0));
      return due.toISOString().slice(0, 10);
    }
    return 'T' + (Number(item.dueOffsetDays) < 0 ? '' : '+') + item.dueOffsetDays;
  }
  function downloadBase64(fileName, contentBase64) {
    const binary = atob(contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    const url = URL.createObjectURL(new Blob([bytes]));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'download';
    link.click();
    URL.revokeObjectURL(url);
  }
  function langLabel(en, zh) {
    return (window.KPTI18n && window.KPTI18n.getLang()) === 'zh' ? zh : en;
  }
  function docActionsFor(item) {
    const tools = [];
    const roleSet = activePackageRoles();
    const isOc = user.owner || user.admin || roleSet.indexOf('oc') >= 0;
    const isOs = user.owner || user.admin || roleSet.indexOf('os') >= 0 || roleSet.indexOf('oc') >= 0;
    const isFinal = user.owner || user.admin;
    if (item.fileId) tools.push(button(t('docs.download'), 'docDownload', item.id));
    if (item.status === 'Approved') {
      if (isFinal) tools.push(button(t('docs.reopen'), 'docReopen', item.id));
    } else if (item.status === 'AwaitingOC') {
      if (isOc) {
        tools.push(button(langLabel('Check pass', '检查通过'), 'docCheck', item.id, 'pass'));
        tools.push(button(langLabel('Return', '退回'), 'docCheck', item.id, 'return'));
      }
    } else if (item.status === 'OCChecked') {
      if (isOc) tools.push(button(t('hub.forwardDoc'), 'docForward', item.id));
    } else if (item.status === 'Submitted') {
      if (isFinal) {
        tools.push(button(t('docs.approve'), 'docApprove', item.id));
        tools.push(button(t('docs.reject'), 'docReject', item.id));
      }
    } else {
      if (isOs) {
        tools.push('<label class="button small" for="doc-upload-' + escape(item.id) + '">' + escape(t('docs.upload')) + '<input id="doc-upload-' + escape(item.id) + '" type="file" data-doc-upload="' + escape(item.id) + '" accept=".docx,.xlsx,.pdf,.pptx,.jpg,.jpeg,.png,.zip" hidden></label>');
        if (item.status === 'Draft' || item.status === 'Rejected') tools.push(button(langLabel('Submit to OC', '提交给 OC'), 'docSubmit', item.id));
      }
    }
    if (item.templateId) tools.push(button(t('docs.template'), 'docDownloadTemplate', item.id));
    return tools.join(' ');
  }
  function docDueBadge(pkg, item) {
    const base = docDueLabel(pkg, item);
    if (item.taskStatus === 'Done') return base + ' · Done';
    if (item.taskStatus === 'Cancelled') return base + ' · Cancelled';
    if (!pkg.eventDate) return base;
    const due = new Date(pkg.eventDate + 'T00:00:00');
    due.setDate(due.getDate() + Number(item.dueOffsetDays || 0));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((due - today) / 86400000);
    if (days < 0) return base + ' · OverDue';
    if (days <= 3) return base + ' · On due';
    return base;
  }
  function taskStatusPill(item) {
    const st = item.taskStatus || 'Open';
    const cls = st === 'Done' ? 'Approved' : st === 'Cancelled' ? 'Rejected' : 'Pending';
    return '<span class="pill ' + cls + '">' + escape(st) + '</span>';
  }
  function ocDashboardCard(pkg, items) {
    const open = items.filter(row => (row.taskStatus || 'Open') === 'Open');
    const done = items.filter(row => row.taskStatus === 'Done');
    const cancelled = items.filter(row => row.taskStatus === 'Cancelled');
    const overdue = open.filter(row => {
      if (!pkg.eventDate) return false;
      const due = new Date(pkg.eventDate + 'T00:00:00');
      due.setDate(due.getDate() + Number(row.dueOffsetDays || 0));
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return due < today;
    });
    const pendingReview = items.filter(row => row.status === 'Submitted');
    const total = items.length;
    const pct = total ? Math.round(done.length / total * 100) : 0;
    return '<section class="card" style="margin-bottom:18px"><div class="eyebrow">Dashboard · ' + escape(pkg.activityType + ' ' + pkg.year) + '</div><h2 style="margin:0 0 12px">Progress</h2>'
      + '<div class="metrics" style="margin:0">'
      + '<div class="metric"><div class="label">Completed</div><div class="value">' + done.length + '/' + total + '</div><small>task marked Done</small></div>'
      + '<div class="metric"><div class="label">Open</div><div class="value">' + open.length + '</div><small>not finished</small></div>'
      + '<div class="metric"><div class="label">Overdue</div><div class="value">' + overdue.length + '</div><small>past due date</small></div>'
      + '<div class="metric"><div class="label">Pending review</div><div class="value">' + pendingReview.length + '</div><small>waiting approval</small></div>'
      + '</div><div class="progress" style="margin:14px 0 0"><span style="width:' + pct + '%"></span></div><p class="muted" style="margin-top:8px">Overall progress ' + pct + '% · cancelled ' + cancelled.length + '</p></section>';
  }
  function activityAboutCard(pkg) {
    if (!pkg || !window.KPTActivityIntro) return '';
    const lang = (window.KPTI18n && window.KPTI18n.getLang()) === 'zh' ? 'zh' : 'en';
    const copy = Object.assign({}, window.KPTActivityIntro.introFor(pkg.activityType, lang));
    copy.eyebrow = lang === 'zh' ? '活动指南 · ' + pkg.activityType : 'Activity guide · ' + pkg.activityType;
    copy.do = lang === 'zh' ? '按你的岗位在工作台准备资料，准备好后到「提交与审批」交上去。' : 'Prepare your part on My Workbench, then hand it in under Submissions & approvals.';
    copy.note = lang === 'zh' ? '工作台用来准备，提交与审批用来交上去和批准；兼任岗位会看到自己的全部任务。' : 'My Workbench is for preparing. Submissions & approvals is for handing in and approving. Concurrent roles see all of their own tasks.';
    const icon = pkg.activityType === 'AGM'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 7h8M8 12h8M8 17h5"/><rect x="4" y="3" width="16" height="18" rx="2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h4"/></svg>';
    const panelId = 'activity-intro-more';
    const expanded = !!activityIntroExpanded;
    const moreLabel = lang === 'zh' ? 'See more · 展开说明' : 'See more';
    const lessLabel = lang === 'zh' ? 'See less · 收起说明' : 'See less';
    const guide = (copy.guide && copy.guide.length) ? copy.guide : [
      { title: lang === 'zh' ? '这是什么' : 'What it is', body: copy.what },
      { title: lang === 'zh' ? '为什么重要' : 'Why it matters', body: copy.why },
      { title: lang === 'zh' ? '你要做什么' : 'What you do', body: copy.do },
      { title: lang === 'zh' ? '注意' : 'Note', body: copy.note }
    ];
    return '<section class="activity-about" aria-label="' + escape(copy.eyebrow) + '">'
      + '<div class="activity-about-rail" aria-hidden="true"></div>'
      + '<div class="activity-about-body">'
      + '<div class="activity-about-head"><span class="activity-about-icon" aria-hidden="true">' + icon + '</span><div><p class="activity-about-eyebrow">' + escape(copy.eyebrow) + '</p><h2>' + escape(pkg.activityType) + ' <span class="activity-about-year">' + pkg.year + '</span></h2></div><span class="activity-about-badge">' + escape(lang === 'zh' ? '先看这里' : 'Start here') + '</span></div>'
      + '<ul class="activity-about-points">'
      + '<li><span class="dot what"></span><div><strong>' + escape(lang === 'zh' ? '这是什么' : 'What it is') + '</strong><p>' + escape(copy.what) + '</p></div></li>'
      + '<li><span class="dot why"></span><div><strong>' + escape(lang === 'zh' ? '为什么重要' : 'Why it matters') + '</strong><p>' + escape(copy.why) + '</p></div></li>'
      + '<li><span class="dot do"></span><div><strong>' + escape(lang === 'zh' ? '你要做什么' : 'What you do') + '</strong><p>' + escape(copy.do) + '</p></div></li>'
      + '</ul>'
      + '<p class="activity-about-note"><span aria-hidden="true">⚠</span> ' + escape(copy.note) + '</p>'
      + '<div class="activity-about-actions">'
      + '<button type="button" class="button small primary" data-action="toggleActivityIntro" aria-expanded="' + (expanded ? 'true' : 'false') + '" aria-controls="' + panelId + '">' + escape(expanded ? lessLabel : moreLabel) + '</button>'
      + '</div>'
      + '<div id="' + panelId + '" class="activity-guide-list activity-intro-more"' + (expanded ? '' : ' hidden') + '>'
      + guide.map(section => '<section class="activity-guide-section"><h3>' + escape(section.title) + '</h3><p>' + escape(section.body) + '</p></section>').join('')
      + '</div>'
      + '</div></section>';
  }
  function documentsView() {
    if (isOcOnly() && openDocPackageId) {
      const minePkg = state.DocPackages.find(row => row.id === openDocPackageId);
      if (!canOpenPackage(minePkg)) openDocPackageId = null;
    }
    if (!openDocPackageId) {
      const packages = ocPackages();
      if (isOcOnly()) {
        return packages.length
          ? '<section class="card"><div class="section-heading" style="margin-top:0"><h2>Annual Activity</h2></div><div class="activity-line-wrap">' + packages.map(pkg => { const progress = docProgress(pkg); return '<div class="activity-line"><div><strong>' + escape(pkg.activityType + ' (' + pkg.year + ')') + '</strong><small>' + escape((pkg.eventDate || 'Date TBC') + ' · ' + progress.approved + '/' + progress.total + ' approved') + '</small></div>' + button('Open', 'docOpen', pkg.id) + '</div>'; }).join('') + '</div></section>'
          : '<section class="card"><h2>No annual activity yet</h2><p class="muted">When the Owner assigns you as Organizing Chairman, Secretary or Treasurer on an activity, it will appear here.</p></section>';
      }
      const guide = '<section class="card" style="margin-bottom:20px"><div class="eyebrow">How it works</div><h2>Annual Activity</h2><ol class="rule-list"><li><span>1</span><strong>Owner opens an activity for the year (optional: clone last year structure)</strong></li><li><span>2</span><strong>Download templates, edit locally, upload, then Submit</strong></li><li><span>3</span><strong>Owner or Secretary Approves · Organizing Chairman edits due dates</strong></li></ol><p class="hint">Treasurer accounts cannot open Annual Activity. Each OC only sees activities assigned to their Gmail account.</p></section>';
      const create = user.owner ? '<section class="card"><div class="section-heading" style="margin-top:0"><h2>Start new package</h2></div><form id="doc-package-form" class="form-grid"><div class="field"><label for="doc-activity">Activity</label><select id="doc-activity">' + options(KPT.docActivityTypes.map(value => [value, value === 'AGM' ? 'AGM (Annual General Meeting)' : value]), 'AGM') + '</select></div><div class="field"><label for="doc-year">Year</label><input id="doc-year" type="number" min="1900" max="2200" value="' + year() + '" required></div><div class="field"><label for="doc-event-date">Event date (optional)</label><input id="doc-event-date" type="date"></div><div class="field"><label for="doc-oc-email">Organizing Chairman (OC) email</label><input id="doc-oc-email" type="email" placeholder="organizer@gmail.com"></div><div class="field"><label for="doc-base">Base structure</label><select id="doc-base"><option value="">First package (default checklist)</option>' + packages.filter(row => !row.archived).map(row => '<option value="' + escape(row.id) + '">' + escape(row.activityType + ' ' + row.year) + '</option>').join('') + '</select></div><div class="field"><button class="button primary" type="submit">Create package</button></div></form></section>' : '';
      const list = packages.length ? table(['Activity', 'Year', 'OC', 'Event date', 'Progress', 'Status', 'Actions'], packages.map(pkg => {
        const progress = docProgress(pkg);
        return [escape(pkg.activityType), escape(String(pkg.year)), escape(pkg.ocEmail || '—'), escape(pkg.eventDate || '—'), progress.total ? progress.approved + '/' + progress.total : '—', pill(pkg.archived ? 'Archived' : pkg.status), '<div class="row-tools">' + button('Open', 'docOpen', pkg.id) + (user.owner ? button(pkg.archived ? 'Unarchive' : 'Archive', 'docArchive', pkg.id) : '') + '</div>'];
      })) : '';
      return guide + create + '<section class="card" style="margin-top:20px"><div class="section-heading" style="margin-top:0"><h2>Activities</h2></div>' + (list || '<p class="muted">No annual activities yet. Owner creates the first one.</p>') + '</section>';
    }
    const pkg = state.DocPackages.find(row => row.id === openDocPackageId);
    if (!pkg) { openDocPackageId = null; return documentsView(); }
    const progress = docProgress(pkg);
    const items = progress.items.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const nextItem = items.find(row => row.required && row.status !== 'Approved' && row.status !== 'NotRequired');
    const aboutCard = activityAboutCard(pkg);
    const nextCard = nextItem ? '<section class="card" style="margin-bottom:18px"><div class="eyebrow">' + escape(t('docs.nextStep')) + '</div><p><strong>' + escape(nextItem.title) + '</strong> — ' + escape(nextItem.status === 'Pending' ? t('docs.pending') : nextItem.status === 'Draft' ? t('docs.draft') : nextItem.status === 'Rejected' ? t('docs.rejectedNext') : nextItem.status === 'Submitted' ? t('docs.submittedNext') : workflowStatusLabel(nextItem.status)) + '</p></section>' : (progress.total && progress.approved === progress.total ? '<section class="card" style="margin-bottom:18px"><div class="eyebrow">' + escape(t('docs.completed')) + '</div><p>' + escape(t('docs.completedMsg')) + '</p></section>' : '');
    const roleSetEarly = activePackageRoles();
    const isOsEarly = user.owner || user.admin || roleSetEarly.indexOf('os') >= 0;
    const isOtEarly = user.owner || user.admin || user.treasurer || roleSetEarly.indexOf('ot') >= 0;
    const isOcEarly = user.owner || user.admin || roleSetEarly.indexOf('oc') >= 0;
    const activeRole = activePackageRole();
    const roleTitle = activeRole === 'os' ? 'Organizing Secretary workplace' : activeRole === 'ot' ? 'Organizing Treasurer workplace' : activeRole === 'oc' ? 'Organizing Chairman workplace' : 'Activity workplace';
    const metaTitle = (isOtEarly && !isOsEarly && !isOcEarly) ? langLabel('Activity finance', '活动财务') : langLabel('Document checklist', '文书清单');
    const meta = '<section class="card"><div class="section-heading" style="margin-top:0"><div><div class="eyebrow">' + escape(roleTitle) + ' · ' + escape(pkg.activityType) + ' · ' + pkg.year + '</div><h2 style="margin:0">' + escape(metaTitle) + '</h2></div><div class="toolbar">' + button('Back to list', 'docBack') + '<form id="doc-event-form" class="toolbar"><label class="field"><span>Event date</span><input id="doc-event-edit" type="date" value="' + escape(pkg.eventDate) + '"></label>' + (user.owner ? '<label class="field"><span>OC email</span><input id="doc-oc-edit" type="email" value="' + escape(pkg.ocEmail || '') + '" placeholder="oc@gmail.com"></label><label class="field"><span>OS email</span><input id="doc-os-edit" type="email" value="' + escape(pkg.osEmail || '') + '" placeholder="os@gmail.com"></label><label class="field"><span>OT email</span><input id="doc-ot-edit" type="email" value="' + escape(pkg.otEmail || '') + '" placeholder="ot@gmail.com"></label>' : '') + '<button class="button small" type="submit">Save</button></form></div></div><p class="muted">' + progress.approved + ' / ' + progress.total + ' required approved · status <strong>' + escape(pkg.archived ? 'Archived' : pkg.status) + '</strong> · OC <strong>' + escape(pkg.ocEmail || '—') + '</strong> · OS <strong>' + escape(pkg.osEmail || '—') + '</strong> · OT <strong>' + escape(pkg.otEmail || '—') + '</strong></p></section>';
    const financeCard = activityFinanceCard(pkg);
    const templates = (state.DocTemplates || []).filter(row => row.activityType === pkg.activityType && !row.archived);
    const canEditStructure = !!(user.owner || user.admin);
    const templateSection = user.owner ? '<section class="card" style="margin-top:20px"><div class="section-heading" style="margin-top:0"><h2>Official templates · ' + escape(pkg.activityType) + '</h2></div><p class="hint">Owner uploads master templates. Checklist items link when titles match.</p>' + (templates.length ? table(['Title', 'File', 'Version', 'Actions'], templates.map(row => [escape(row.title), escape(row.fileName), escape(row.versionLabel || '—'), '<label class="button small" for="tpl-' + escape(row.id) + '">Replace<input id="tpl-' + escape(row.id) + '" type="file" data-tpl-upload="' + escape(row.id) + '" accept=".docx,.xlsx,.pdf,.pptx,.jpg,.jpeg,.png,.zip" hidden></label>'])) : '<p class="muted">No templates yet for this activity.</p>') + '<form id="tpl-new-form" class="form-grid" style="margin-top:12px"><div class="field"><label for="tpl-new-title">New template title</label><input id="tpl-new-title" type="text" required placeholder="Match checklist title"></div><div class="field"><label for="tpl-new-file">File</label><input id="tpl-new-file" type="file" accept=".docx,.xlsx,.pdf,.pptx,.jpg,.jpeg,.png,.zip" required></div><div class="field"><button class="button" type="submit">Add template</button></div></form></section>' : '';
    const folders = user.owner && !docFolders.templates ? '<section class="card" style="margin-top:16px"><h2>Document folders</h2><p class="muted">Drive folders are not initialised yet.</p><button class="button primary" type="button" data-action="initDocFolders">Initialize document folders</button></section>' : '';
    if (docEditOpen && docEditDraft) {
      const editToolbar = '<div class="toolbar" style="margin-bottom:14px">' + button(canEditStructure ? '添加文件要求' : '保存截止日', 'docEditAddRow') + button('取消', 'docEditCancel') + '</div>';
      const editRows = docEditDraft.items.map((row, index) => {
        const locked = !canEditStructure;
        return '<div class="form-grid" style="border-top:1px solid var(--line);padding:12px 0;align-items:end">'
          + '<div class="field"><label>标题</label><input data-doc-edit="title" data-index="' + index + '" value="' + escape(row.title) + '"' + (locked ? ' readonly' : '') + '></div>'
          + '<div class="field"><label>角色提示</label><input data-doc-edit="role" data-index="' + index + '" value="' + escape(row.role || '') + '"' + (locked ? ' readonly' : '') + '></div>'
          + '<div class="field"><label>相对截止日（天）</label><input type="number" min="-365" max="365" data-doc-edit="dueOffsetDays" data-index="' + index + '" value="' + escape(String(row.dueOffsetDays)) + '"></div>'
          + '<div class="field"><label>必交</label><label style="display:flex;gap:8px;align-items:center;min-height:44px"><input type="checkbox" data-doc-edit="required" data-index="' + index + '"' + (row.required ? ' checked' : '') + (locked ? ' disabled' : '') + '> required</label></div>'
          + (canEditStructure ? '<div class="field"><button type="button" class="button small danger" data-action="docEditRemoveRow" data-id="' + escape(row.id) + '">删除</button></div>' : '')
          + '</div>';
      }).join('');
      const addRows = canEditStructure ? (docEditDraft.addItems || []).map((row, index) => {
        return '<div class="form-grid" style="border-top:1px dashed var(--line);padding:12px 0;align-items:end;background:#fbfbfc">'
          + '<div class="field"><label>新文件标题</label><input data-doc-add="title" data-index="' + index + '" value="' + escape(row.title) + '"></div>'
          + '<div class="field"><label>角色提示</label><input data-doc-add="role" data-index="' + index + '" value="' + escape(row.role || '') + '"></div>'
          + '<div class="field"><label>相对截止日（天）</label><input type="number" min="-365" max="365" data-doc-add="dueOffsetDays" data-index="' + index + '" value="' + escape(String(row.dueOffsetDays == null ? -7 : row.dueOffsetDays)) + '"></div>'
          + '<div class="field"><label>必交</label><label style="display:flex;gap:8px;align-items:center;min-height:44px"><input type="checkbox" data-doc-add="required" data-index="' + index + '"' + (row.required !== false ? ' checked' : '') + '> required</label></div>'
          + '<div class="field"><button type="button" class="button small danger" data-action="docEditRemoveAddRow" data-id="' + index + '">移除</button></div>'
          + '</div>';
      }).join('') : '';
      const editForm = '<section class="card" style="margin-bottom:18px"><div class="section-heading" style="margin-top:0"><div><div class="eyebrow">' + (canEditStructure ? '编辑清单' : '编辑截止日') + '</div><h2 style="margin:0">' + escape(pkg.activityType + ' ' + pkg.year) + '</h2></div><div class="toolbar">' + button('保存', 'docEditSave') + button('取消', 'docEditCancel') + '</div></div><p class="hint">' + (canEditStructure ? '一次改完所有要求的文件、角色与相对截止日。OC 只能改截止日。' : '你是 OC：只能改相对截止日，不能改标题或增删文件。') + '</p>' + editToolbar + editRows + addRows + '<div style="margin-top:14px"><button type="button" class="button small" data-action="docEditSave">保存全部修改</button></div></section>';
      return aboutCard + editForm;
    }
    const listToolbar = (canEditStructure || activePackageRole() === 'oc') ? '<div class="toolbar" style="margin-top:10px">' + button(canEditStructure ? '编辑清单' : '编辑截止日', 'docEditOpen') + '</div>' : '';
    const rows = items.map(item => [
      String(item.sortOrder),
      escape(item.title) + (item.required ? '' : ' <small>· optional</small>') + (item.role ? '<br><small>' + escape(item.role) + '</small>' : '') + (item.assignee ? '<br><small>PIC · ' + escape(item.assignee) + '</small>' : ''),
      escape(docDueBadge(pkg, item)),
      taskStatusPill(item) + ' ' + pill(workflowStatusLabel(item.status)) + (item.rejectStage ? '<br><small>' + escape(langLabel('Returned at ', '退回于 ') + item.rejectStage) + '</small>' : '') + (item.remarks ? '<br><small style="color:#852b3d">' + escape(item.remarks) + '</small>' : ''),
      escape(item.fileName || '—'),
      '<div class="row-tools">' + (item.taskStatus === 'Done' ? button('Reopen', 'taskOpen', item.id) : button('Done', 'taskDone', item.id)) + (item.taskStatus !== 'Cancelled' ? button('Cancel', 'taskCancel', item.id) : button('Uncancel', 'taskOpen', item.id)) + docActionsFor(item) + '</div>'
    ]);
    const roleSet = activePackageRoles();
    const isOs = user.owner || user.admin || roleSet.indexOf('os') >= 0;
    const isOt = user.owner || user.admin || user.treasurer || roleSet.indexOf('ot') >= 0;
    const isOc = user.owner || user.admin || roleSet.indexOf('oc') >= 0;
    const isOsOnly = isOs && !isOt && !isOc;
    const isOtOnly = isOt && !isOs && !isOc;
    const showDocs = isOs || isOc || user.owner || user.admin;
    const showFinance = isOt || isOc || user.owner || user.admin || user.treasurer;
    const ocDocQueue = items.filter(row => row.status === 'AwaitingOC');
    const ocFinBook = state.FinBooks && state.FinBooks.find(row => !row.archived && row.packageId === pkg.id);
    const ocFinQueued = ocFinBook && ocFinBook.status === 'AwaitingOC';
    const ocFinChecked = ocFinBook && ocFinBook.status === 'OCChecked';
    const ocQueues = isOc ? '<section class="card"><div class="eyebrow">' + escape(langLabel('OC check queue', 'OC 待检查队列')) + '</div>'
      + '<h2>' + escape(langLabel('Documents waiting for OC', '待检查文书')) + ' · ' + ocDocQueue.length + '</h2>'
      + (ocDocQueue.length ? table(['#', 'Document', 'Due', 'Actions'], ocDocQueue.map(item => [String(item.sortOrder), escape(item.title), escape(docDueBadge(pkg, item)), '<div class="row-tools">' + button(langLabel('Check pass', '检查通过'), 'docCheck', item.id, 'pass') + button(langLabel('Return', '退回'), 'docCheck', item.id) + '</div>'])) : '<p class="muted">' + escape(langLabel('No documents waiting.', '没有待检查文书。')) + '</p>')
      + '<h2 style="margin-top:18px">' + escape(langLabel('Finance waiting for OC', '待检查财务')) + '</h2>'
      + (ocFinQueued ? '<div class="toolbar">' + button(langLabel('Check pass', '检查通过'), 'finCheck', ocFinBook.id, 'pass') + button(langLabel('Return', '退回'), 'finCheck', ocFinBook.id) + '</div>'
        : ocFinChecked ? '<p>' + escape(t('hub.ocHint')) + '</p><div class="toolbar">' + button(t('hub.forwardFin'), 'finForward', ocFinBook.id) + '</div>'
        : '<p class="muted">' + escape(langLabel('No finance waiting for OC.', '没有待检查财务。')) + '</p>')
      + '</section>' : '';
    const osBlock = isOs ? '<section class="card"><div class="eyebrow">' + escape(langLabel('OS · Documents', 'OS · 文书')) + '</div><h2 style="margin-top:0">' + escape(langLabel('Upload and submit documents to OC', '上传并提交文书给 OC')) + '</h2><p class="muted">' + escape(langLabel('Draft files here, then Submit to OC. Returned items show the reason.', '在此上传草稿后提交给 OC。被退回的文件会显示原因。')) + '</p></section>' : '';
    const otBlock = isOt ? '<section class="card"><div class="eyebrow">' + escape(langLabel('OT · Finance', 'OT · 财务')) + '</div><h2 style="margin-top:0">' + escape(langLabel('Fill I&E, Claims and Receipts', '填写收支、报销与收据')) + '</h2><p class="muted">' + escape(langLabel('Keep this activity book updated, then Submit to OC.', '维护本活动账本后提交给 OC 检查。')) + '</p></section>' : '';
    const dashboard = isOc ? ocDashboardCard(pkg, items) : '';
    const docSection = showDocs ? listToolbar + '<section class="card"><h2>' + escape(langLabel('Document checklist', '文书清单')) + '</h2>' + table(['#', 'Document', 'Due', 'Status', 'File', 'Actions'], rows) + '</section>' : (isOtOnly ? '<section class="card"><h2>' + escape(langLabel('Activity progress', '活动进度')) + '</h2><p class="muted">' + progress.approved + ' / ' + progress.total + ' ' + escape(langLabel('required documents approved', '项必交文件已批准')) + '</p></section>' : '');
    const financeSection = showFinance ? financeCard : '';
    return aboutCard + dashboard + ocQueues + nextCard + meta + osBlock + otBlock + financeSection + docSection + folders + templateSection;
  }
  function activityFinanceCard(pkg) {
    if (!state || !state.FinBooks) return '';
    const books = state.FinBooks.filter(row => !row.archived && row.packageId === pkg.id);
    const book = books[0] || null;
    const status = book ? (book.status || 'Draft') : 'Draft';
    const pillClass = status === 'Approved' ? 'Approved' : status === 'Rejected' ? 'Rejected' : status === 'Submitted' || status === 'AwaitingOC' || status === 'OCChecked' ? 'Pending' : '';
    const roleSet = activePackageRoles();
    const canReview = !!(user.owner || user.treasurer);
    const canSubmitFinance = !!(user.owner || user.treasurer || roleSet.indexOf('ot') >= 0);
    const canCheckFinance = !!(user.owner || roleSet.indexOf('oc') >= 0);
    return '<section class="card" style="margin-top:18px"><div class="section-heading" style="margin-top:0"><h2>Activity finance · I&E / Reimbursement / Receipts</h2><div class="toolbar">'
      + (book ? button('Open finance', 'financeOpenBook', book.id) : (user.owner || user.treasurer || roleSet.indexOf('ot') >= 0 ? button('Create finance book', 'financeAddBook') : ''))
      + '</div></div>'
      + '<p class="muted">OT fills Income &amp; Expenses, Reimbursement forms and Receipts here. Submit to OC for check, then OC forwards for Treasurer review.</p>'
      + (book ? '<p>Finance status: <span class="pill ' + pillClass + '">' + escape(workflowStatusLabel(status)) + '</span>'
        + (book.rejectStage ? ' · ' + escape(langLabel('Returned at ', '退回于 ') + book.rejectStage) : '')
        + (book.remarks ? '<br><small style="color:#852b3d">' + escape(book.remarks) + '</small>' : '')
        + '</p><div class="toolbar">'
        + (canSubmitFinance && (status === 'Draft' || status === 'Rejected') ? button('Submit to OC', 'finSubmit', book.id) : '')
        + (canCheckFinance && status === 'AwaitingOC' ? button('Check pass', 'finCheck', book.id, 'pass') + button('Return', 'finCheck', book.id) : '')
        + (canCheckFinance && status === 'OCChecked' ? button('Forward for approval', 'finForward', book.id) : '')
        + (canReview && status === 'Submitted' ? button('Approve', 'finApprove', book.id) + button('Reject', 'finReject', book.id) : '')
        + (canReview && status === 'Approved' && (user.owner || user.admin) ? button('Reopen', 'finReopen', book.id) : '')
        + '</div>'
        : '<p class="muted">此活动尚未关联财务账本。有第一笔开支时再建立。</p>')
      + '</section>';
  }
  function workflowStatusLabel(status) {
    const map = {
      AwaitingOC: langLabel('Waiting for OC to look at it', '等 OC 看一遍'),
      OCChecked: langLabel('OC looked at it', 'OC 已看过'),
      Submitted: langLabel('Waiting for the approver', '等审批人批准'),
      Approved: langLabel('Approved', '已批准'),
      Rejected: langLabel('Returned for edits', '已退回修改'),
      Draft: langLabel('Draft', '草稿'),
      Pending: langLabel('Not started yet', '还没开始'),
      NotRequired: langLabel('Not needed', '不需要')
    };
    return map[status] || status;
  }
  function portalView() {
    const packages = ocPackages();
    const email = escape(user && user.email || '');
    const role = escape(roleLabel());
    const packageCards = packages.length ? packages.map(pkg => {
      const progress = docProgress(pkg);
      return '<article class="card"><div class="eyebrow">' + escape(pkg.activityType) + '</div><h2>' + escape(pkg.activityType + ' (' + pkg.year + ')') + '</h2><p class="muted">' + escape((pkg.eventDate || 'Date TBC') + ' · ' + (progress.total ? progress.approved + '/' + progress.total + ' required files approved' : pkg.status)) + '</p><div class="toolbar">' + button('Open activity workspace', 'docOpen', pkg.id) + '</div></article>';
    }).join('') : '<article class="card"><h2>No activity package</h2><p class="muted">When the Owner assigns you to an activity (for example AGM 2027), it will appear here.</p></article>';
    const workspaces = [];
    if (user && (user.admin || user.owner)) workspaces.push('<a class="button" href="?mode=admin">Admin Work</a>');
    if (user && (user.treasurer || user.owner)) workspaces.push('<a class="button" href="?mode=treasurer">Treasurer Work</a>');
    if (user && user.owner) workspaces.push('<a class="button" href="?mode=owner">Owner</a>');
    return '<section class="card" style="margin-bottom:20px"><div class="eyebrow">TCCD Member System</div><h2>Welcome</h2><p><strong>' + email + '</strong> · ' + role + '</p><p class="muted">This is your login home. Open an activity workspace below, or switch to Admin / Treasurer work if you have access.</p><div class="toolbar">' + workspaces.join('') + '<a class="button" href="' + escape((window.KPT_CONFIG && window.KPT_CONFIG.publicSiteUrl) || 'https://wsk1234567.github.io/DivisionMemberSystem/') + '" target="_blank" rel="noopener">Find Member</a>' + button('Logout', 'logoutPortal') + '</div></section><div class="grid-two">' + packageCards + '</div>';
  }
  function trashView() {
    const rows = state.trash || [];
    return '<p class="page-intro">Owner 删除的资料会先放在这里。Restore 会恢复整组关联资料；Permanently delete 无法从系统恢复，但执行前会自动建立私人 Backup。</p>' + (user.owner ? table(['Deleted record', 'Deleted at', 'Deleted by', 'Included records', 'Actions'], rows.map(row => [escape(row.rootTable + ' · ' + row.label), escape(new Date(row.deletedAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })), escape(row.actor), escape(Object.entries(row.counts || {}).map(([name, count]) => name + ': ' + count).join(' · ')), '<div class="row-tools">' + button('Restore', 'restoreTrash', row.id) + button('Permanently delete', 'purgeTrash', row.id) + '</div>'])) : '<div class="card"><p class="muted">Only the Owner can view and manage deleted records.</p></div>');
  }
  function settingsView() {
    const demoSwitch = window.KPTTransport.demo && user && user.owner ? '<section class="card" style="margin-bottom:24px"><div class="eyebrow">Preview role switch</div><h2>Try another workspace</h2><p class="muted">Preview only. Helps you see Treasurer / Admin / Owner / OC / OS / OT shells.</p><div class="toolbar">' + button('Owner shell', 'demoRole', 'owner') + button('Admin shell', 'demoRole', 'admin') + button('Treasurer shell', 'demoRole', 'treasurer') + button('OC shell', 'demoRole', 'oc') + button('OS shell', 'demoRole', 'os') + button('OT shell', 'demoRole', 'ot') + '</div></section>' : '';
    const accessCard = user.owner ? '' : '<section class="card"><h2>Access</h2><p class="muted">You are signed in as ' + escape(roleLabel()) + '. Ask the Owner if a workspace is missing.</p></section>';
    const switchCard = '<section class="card" style="margin-bottom:24px"><div class="eyebrow">Signed in as</div><h2>Switch Google account</h2><p><strong>' + escape(user.email) + '</strong> · ' + escape(roleLabel()) + '</p><p class="muted">This app uses the Google account signed into this browser. Use <strong>Sign out of Google</strong>, pick the next account (or press Back if Google lands on an error page), then <strong>Open Admin</strong>.</p><div class="toolbar">' + button('Sign out of Google', 'signOutGoogle') + button('Open Admin', 'openAdmin') + button('Reload data', 'reloadNow') + '</div><p class="hint">Tip: keep an incognito window on Owner to test two accounts side by side.</p></section>';
    return demoSwitch + switchCard + accessCard + '<div class="grid-two"><section class="card"><h2>Your account</h2><p><strong>' + escape(user.email) + '</strong><br><small>' + escape(roleLabel()) + '</small></p><p class="muted">Treasurer work and Admin work use separate allow lists maintained by the Owner.</p></section><section class="card"><h2>Private backups</h2><p class="muted">Daily backups keep the latest 30 copies. Import and restore create an additional safety copy before changing data.</p><div class="toolbar">' + (user.admin || user.owner ? button('Back up now', 'backup') + button('Refresh backup list', 'listBackups') : '') + (user.owner ? button('Enable daily backup', 'installBackup') : '') + '</div><div id="backup-list" style="margin-top:18px"></div></section></div>' + (user.admin || user.owner ? '<section class="card" style="margin-top:24px"><h2>Public directory sync</h2><p class="muted">Only the approved public fields are copied to the member directory. If a publish fails, private records remain saved and you can retry.</p>' + (user.admin || user.owner ? button('Retry public update', 'retrySync') : '') + '<p class="sync-line">Private revision: ' + state.revision + ' · Last saved: ' + escape(state.updatedAt ? new Date(state.updatedAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }) : 'No changes yet') + '</p></section>' : '');
  }
  function ownerAccessView() {
    if (!user.owner) return '<div class="card"><p class="muted">Only the Owner can manage access.</p></div>';
    return '<p class="page-intro">Set who works as Secretary (Admin Work), Organizing Treasurer (Treasurer Work) and Organizing Chairman / OC (Annual Activity due dates &amp; checklist). You always have full access.</p><section class="card"><form id="access-form"><div class="form-grid"><div class="field full"><label for="admin-emails">Secretary / Admin Work · Gmail list</label><textarea id="admin-emails" rows="4">' + escape(admins.join('\n')) + '</textarea><p class="hint">These accounts manage members, activities, exams, duty and awards — and can approve documents.</p></div><div class="field full"><label for="treasurer-emails">Organizing Treasurer · Gmail list</label><textarea id="treasurer-emails" rows="4">' + escape(treasurers.join('\n')) + '</textarea><p class="hint">These accounts manage event finance books only.</p></div><div class="field full"><label for="oc-emails">Organizing Chairman (OC) · Gmail list</label><textarea id="oc-emails" rows="3">' + escape(ocs.join('\n')) + '</textarea><p class="hint">Once approved here, OC opens Annual Activity and selects an assigned activity there. OC can edit due dates, upload and submit, but cannot approve.</p></div></div><button class="button primary" type="submit">Save access lists</button></form></section>';
  }
  function render() {
    if (!state) return;
    const useHub = workspaceMode === 'oc' || isOcOnly() || (user && !user.owner && !user.admin && !user.treasurer && ocPackages().length > 0);
    if (useHub) {
      hubSidebar();
      document.body.dataset.mode = 'hub';
      const eyebrow = document.querySelector('.admin-top .eyebrow');
      if (eyebrow) eyebrow.textContent = t('brand.ActivityWorkspace');
      const brandSub = document.querySelector('.sidebar .brand-sub');
      if (brandSub) brandSub.textContent = t('brand.ActivityWorkspace');
      byId('page-title').textContent = hubTab === 'hall' ? t('hub.hall') : hubTab === 'notifications' ? t('hub.notifications') : t('hub.studio');
      byId('mode-switcher-slot').innerHTML = user.owner || user.admin || user.treasurer ? modeSwitcher() : '';
      const yearField = document.querySelector('.admin-top .field');
      if (yearField) yearField.hidden = true;
      byId('content').innerHTML = hubView();
      hubRefreshBadges();
      applyFinanceReadOnly();
      byId('sync-notice').hidden = sync.ok;
      hubStartPolling();
      return;
    }
    hubStopPolling();
    renderNavigation();
    applyWorkspaceTheme();
    const ocShell = isOcOnly() || workspaceMode === 'oc';
    const modeTitles = workspaceTitles(workspaceMode);
    byId('page-title').innerHTML = escape(navLabel(view) || titles[view] || view);
    byId('mode-switcher-slot').innerHTML = ocShell ? '' : modeSwitcher();
    const yearField = document.querySelector('.admin-top .field');
    if (yearField) yearField.hidden = ocShell;
    document.querySelectorAll('[data-nav]').forEach(element => { element.classList.toggle('active', element.dataset.nav === view); element.setAttribute('aria-current', element.dataset.nav === view ? 'page' : 'false'); });
    const views = {
      Overview: overview,
      Phase: phaseView,
      Members: memberList,
      Activities: activityList,
      Finance: () => (financeDraft ? financeEditor() : financeList()),
      Exams: examList,
      Duty: dutyList,
      Awards: awardList,
      Documents: documentsView,
      Data: dataList,
      Setup: setupView,
      Import: importView,
      Trash: trashView,
      Owner: ownerAccessView,
      Settings: settingsView,
      Portal: portalView
    };
    if (!ocShell && !workspaceNav(workspaceMode).some(([key]) => key === view)) {
      view = workspaceNav(workspaceMode)[0] ? workspaceNav(workspaceMode)[0][0] : 'Documents';
      byId('page-title').textContent = workspaceTitles(workspaceMode)[view] || view;
    }
    if (ocShell) {
      // Package shell defaults to Documents; OT/Owner/Treasurer may open Finance.
      const rolesNow = activePackageRoles();
      const canUseFinance = (() => {
        if (!user) return false;
        if (user.owner || user.treasurer) return true;
        if (!financeDraft) return rolesNow.indexOf('ot') >= 0 || user.admin;
        const pkg = (state && state.DocPackages || []).find(p => p.id === financeDraft.packageId);
        if (!pkg) return false;
        const roles = packageRolesFor(pkg, user.email);
        return roles.indexOf('ot') >= 0 || roles.indexOf('oc') >= 0;
      })();
      if (!(view === 'Finance' && canUseFinance)) view = 'Documents';
      if (openDocPackageId && !canOpenPackage(state.DocPackages.find(row => row.id === openDocPackageId))) openDocPackageId = null;
      const opened = openDocPackageId ? state.DocPackages.find(row => row.id === openDocPackageId) : null;
      if (opened) byId('page-title').textContent = opened.activityType + ' (' + opened.year + ')';
      else byId('page-title').textContent = t('docs.title');
      document.querySelector('.admin-top .eyebrow').textContent = t('brand.ActivityWorkspace');
      const brandSub = document.querySelector('.sidebar .brand-sub');
      if (brandSub) brandSub.textContent = t('brand.ActivityWorkspace');
    } else {
      const brandSub = document.querySelector('.sidebar .brand-sub');
      if (brandSub && workspaceMode === 'admin') brandSub.textContent = t('brand.Administration');
    }
    byId('content').innerHTML = views[view] ? views[view]() : '';
    applyFinanceReadOnly();
    byId('sync-notice').hidden = sync.ok;
    byId('sync-notice').innerHTML = sync.ok ? '' : 'Private data is saved. The public directory is awaiting an update. ' + button('Retry', 'retrySync');
    if (view === 'Settings' && backups.length) renderBackups();
    if (view === 'Import' && importPreview) renderImport();
  }
  function applyFinanceReadOnly() {
    if (!financeDraft || !byId('finance-activity-name')) return;
    const saved = state.FinBooks.find(book => book.id === financeDraft.id);
    const pkg = state.DocPackages.find(item => item.id === financeDraft.packageId);
    const editable = !(document.body.dataset.mode === 'hub' && hubTab === 'hall') && (user.owner || user.treasurer || packageRolesFor(pkg, user.email).includes('ot')) && !['AwaitingOC', 'OCChecked', 'Submitted', 'Approved'].includes(saved && saved.status);
    if (editable) return;
    document.querySelectorAll('#content input, #content textarea, #content select').forEach(input => { input.readOnly = true; if (input.type === 'file' || input.tagName === 'SELECT') input.disabled = true; });
    document.querySelectorAll('#content [data-action]').forEach(element => { if (/^finance(Add|Remove)/.test(element.dataset.action)) element.disabled = true; });
  }
  const busyLabels = { bootstrap: 'Loading records…', save: 'Saving records…', attendance: 'Saving attendance…', saveFinanceBook: 'Saving finance records…', previewImport: 'Checking Excel file…', commitImport: 'Importing Excel changes…', applySetupDefaults: 'Applying system setup…', deleteRecord: 'Moving to Recycle Bin…', deleteAllMembers: 'Moving students to Recycle Bin…', restoreTrash: 'Restoring from Recycle Bin…', purgeTrash: 'Deleting permanently…', retrySync: 'Updating public directory…', backup: 'Creating private backup…', listBackups: 'Loading backups…', restore: 'Restoring backup…', setAdmins: 'Saving administrator access…', setAccess: 'Saving access lists…', setCurrentPhase: 'Updating phase…', installBackup: 'Installing daily backup…', createDocPackage: 'Creating package…', docItemUpload: 'Uploading file…', docItemSubmit: 'Submitting to OC…', docItemCheck: 'OC checking…', docItemForward: 'Forwarding…', docItemReview: 'Reviewing document…', docItemReopen: 'Reopening document…', saveDocTemplate: 'Saving template…', docPackageArchive: 'Updating package…', initDocFolders: 'Creating folders…', submitFinBook: 'Submitting finance to OC…', checkFinBook: 'OC finance check…', forwardFinBook: 'Forwarding finance…', reviewFinBook: 'Reviewing finance…', reopenFinBook: 'Reopening finance…' };
  async function call(request, label) {
    if (busy) throw new Error('Please wait for the current operation.');
    busy = true;
    document.body.setAttribute('aria-busy', 'true');
    busyNotice(label || busyLabels[request.action] || 'Working…');
    try {
      const result = await window.KPTTransport.call(request);
      if (request.action === 'bootstrap') notice('Records loaded.');
      return result;
    } catch (error) {
      if (!byId('editor').open) notice(error.message, true);
      throw error;
    } finally {
      busy = false;
      document.body.removeAttribute('aria-busy');
      if (request.action !== 'bootstrap' && user) hubLoadNotifications(true);
    }
  }
  async function refresh() {
    const response = await call({ action: 'bootstrap' }, 'Loading records…');
    if (!user || user.email !== response.user.email) {
      financeDraft = null;
      financeReceiptFiles = [];
      hubSelectedId = null;
      openDocPackageId = null;
      hubTab = 'studio';
      hubDirty = false;
      telegramBinding = null;
      if (byId('editor').open) byId('editor').close();
      hubNotifications = { notifications: [], unreadCount: 0, activityUnread: {}, studioUnread: {} };
    }
    state = response.state;
    user = response.user;
    user.admin = user.admin != null ? !!user.admin : !!user.owner;
    user.treasurer = user.treasurer != null ? !!user.treasurer : !!user.owner;
    user.roles = user.roles || [user.owner ? 'owner' : null, user.admin ? 'admin' : null, user.treasurer ? 'treasurer' : null].filter(Boolean);
    sync = response.sync;
    // Release any in-flight live poll first (old finally must not block new ticks).
    hubInvalidateLive();
    // Live baseline comes from bootstrap.changeKey — not from the first probe.
    hubLiveEmail = user.email;
    hubLiveChangeKey = (response && response.changeKey) || null;
    hubLiveAppliedRevision = state && Number(state.revision);
    hubLivePendingSnapshot = null;
    hubLiveErrors = 0;
    admins = response.admins || [];
    treasurers = response.treasurers || [];
    ocs = response.ocs || [];
    docFolders = response.docFolders || { templates: '', submissions: '' };
    currentPhase = response.currentPhase || 1;
    workspaceMode = preferredMode();
    // Role-based default: OC in submissions; OS/OT in workbench.
    hubTab = hubDefaultTab();
    const packageParam = new URLSearchParams(String(location.search || '')).get('package');
    if (packageParam && state && state.DocPackages) {
      const linked = state.DocPackages.find(row => row.id === packageParam);
      if (linked && canOpenPackage(linked)) {
        openDocPackageId = linked.id;
        hubSelectedId = linked.id;
        workspaceMode = 'oc';
        const entityId = new URLSearchParams(location.search).get('entity');
        const linkedBook = state.FinBooks.find(book => book.id === entityId && book.packageId === linked.id);
        const linkedItem = state.DocItems.find(item => item.id === entityId && item.packageId === linked.id);
        if (linkedBook) { loadFinanceDraft(linkedBook); hubTab = hubHas('oc') || linkedBook.status === 'Submitted' ? 'hall' : 'studio'; }
        if (linkedItem) hubTab = hubHas('oc') || ['OCChecked', 'Submitted', 'Approved'].includes(linkedItem.status) ? 'hall' : 'studio';
      }
    }
    if (workspaceMode === 'portal') view = 'Portal';
    else if (isOcOnly()) view = 'Documents';
    else if (workspaceMode === 'treasurer') view = 'Finance';
    else if (workspaceMode === 'owner') view = 'Owner';
    byId('account').textContent = user.email;
    byId('role').textContent = roleLabel();
    byId('demo-banner').hidden = !window.KPTTransport.demo;
    const publicUrl = window.KPTTransport.publicUrl || '';
    if (/^https:\/\/[\w.-]+\.github\.io\//.test(publicUrl) || window.KPTTransport.demo) byId('public-link').href = publicUrl || 'index.html';
    else byId('public-link').hidden = true;
    render();
  }
  function applySave(response) {
    state = response.state;
    sync = response.sync || sync;
    if (state && Number.isFinite(Number(state.revision))) hubLiveAppliedRevision = Number(state.revision);
    // Local save is newest — drop any staged older snapshot and keep last applied key until probe catches up.
    hubLivePendingSnapshot = null;
    importPreview = null;
    importFile = null;
    setupDefaultsPreview = null;
    if (financeDraft && financeDraft.id) {
      const saved = state.FinBooks.find(row => row.id === financeDraft.id);
      if (saved) financeDraft.id = saved.id;
    }
    render();
    notice(response.unchanged ? 'No changes to import.' : 'Records saved.' + (sync.ok ? ' Public directory is up to date.' : ' Public update needs a retry.'));
  }
  function options(values, selected) { return values.map(value => { const pair = Array.isArray(value) ? value : [value, value || 'None']; return '<option value="' + escape(pair[0]) + '"' + (String(pair[0]) === String(selected || '') ? ' selected' : '') + '>' + escape(pair[1]) + '</option>'; }).join(''); }
  function fieldControl(definition, row) {
    const [key, label, initialType, required] = definition;
    const type = typeof initialType === 'function' ? initialType() : initialType;
    const value = row[key] == null ? '' : row[key];
    if (type === 'tags') return '<div class="field full"><label>' + label + '</label><div class="check-group">' + ['DIM', 'Inspection', 'Exam', 'Other'].map(tag => '<label><input type="checkbox" name="tags" value="' + tag + '"' + ((row.tags || []).includes(tag) ? ' checked' : '') + '>' + tag + '</label>').join('') + '</div></div>';
    if (type === 'checkbox') return '<div class="field"><div class="check-group"><label><input type="checkbox" id="field-' + key + '" name="' + key + '"' + (value ? ' checked' : '') + '>' + escape(label) + '</label></div></div>';
    const attributes = ' id="field-' + key + '" name="' + key + '"' + (required ? ' required' : '');
    const control = Array.isArray(type) ? '<select' + attributes + '>' + options(type, value) + '</select>' : type === 'textarea' ? '<textarea' + attributes + ' maxlength="2000">' + escape(value) + '</textarea>' : '<input' + attributes + ' type="' + type + '" value="' + escape(value) + '"' + (type === 'number' ? ' min="0" step="' + (key === 'hours' ? 'any' : '1') + '"' : ' maxlength="2000"') + '>';
    return '<div class="field' + (type === 'textarea' ? ' full' : '') + '"><label for="field-' + key + '">' + escape(label) + '</label>' + control + '</div>';
  }
  function openEditor(tableName, id, defaults) {
    dialogTable = tableName;
    dialogRecord = KPT.copy(state[tableName].find(row => row.id === id) || Object.assign({ status: 'Active', archived: false, tags: ['DIM'], date: year() + '-01-01', year: year(), result: 'Pending', attended: false, kind: 'Exam', category: tableName === 'Catalog' ? '' : 'Probadge', sortOrder: 999, eligibilityMetric: '', eligibilityThreshold: null }, defaults || {}));
    if (tableName === 'Awards' && !dialogRecord.catalogId) {
      const catalog = state.Catalog.find(row => row.kind === 'Award' && row.category === dialogRecord.category && row.name === dialogRecord.name && row.level === dialogRecord.level);
      if (catalog) dialogRecord.catalogId = catalog.id;
    }
    dialogRevision = state.revision;
    byId('editor-title').textContent = (id ? 'Edit ' : 'Add ') + ({ Members: 'student', Activities: 'activity', Exams: 'exam record', Duty: 'annual Duty', Awards: 'award', Catalog: 'catalogue option', Enrolments: 'annual enrolment' }[tableName]);
    byId('editor-message').textContent = '';
    byId('editor-body').innerHTML = '<form id="record-form"><div class="form-grid">' + definitions[tableName].map(definition => fieldControl(definition, dialogRecord)).join('') + '</div>' + (tableName === 'Members' ? '<p class="hint">An annual Tingkatan/status snapshot will also be recorded for ' + year() + '. The internal student ID stays unchanged.</p>' : '') + (tableName === 'Exams' ? '<p class="hint">Linked exam participation, date and type follow its activity. Change attendance on the activity, then record Pass/Fail or certificate here.</p>' : '') + '<div class="dialog-actions"><button class="button" type="button" data-action="close">Cancel</button><button class="button primary" type="submit">Save record</button></div></form>';
    if (tableName === 'Exams') updateExamLink();
    byId('editor').showModal();
  }
  function updateExamLink() {
    const activity = state.Activities.find(row => row.id === byId('field-activityId').value);
    const linked = !!activity;
    ['type', 'date', 'attended'].forEach(key => { byId('field-' + key).disabled = linked; });
    if (!linked) return;
    const attendance = state.Attendance.find(row => row.activityId === activity.id && row.memberId === byId('field-memberId').value);
    const participated = !!(attendance && attendance.present);
    byId('field-type').value = activity.examType;
    byId('field-date').value = activity.date;
    byId('field-attended').checked = participated;
    if (!participated) byId('field-result').value = 'Absent';
  }
  function openAttendance(id) {
    const activity = state.Activities.find(row => row.id === id);
    const recorded = state.Attendance.filter(row => row.activityId === id);
    const activityYear = Number(activity.date.slice(0, 4));
    const roster = state.Members.filter(member => { const enrolment = state.Enrolments.find(row => row.memberId === member.id && row.year === activityYear); return (((!member.joined || Number(member.joined.slice(0, 4)) <= activityYear || !!enrolment) && (enrolment ? enrolment.status : member.status) === 'Active') || recorded.some(row => row.memberId === member.id)); }).sort((first, second) => first.name.localeCompare(second.name));
    dialogRevision = state.revision;
    byId('editor-title').textContent = activity.name + ' · Attendance';
    byId('editor-message').textContent = '';
    byId('editor-body').innerHTML = '<p class="muted">' + escape(activity.date + ' · ' + activity.tags.join(' / ')) + '</p><form id="attendance-form" data-id="' + escape(id) + '"><div class="toolbar" style="margin-bottom:16px">' + button('Select all', 'selectAll') + button('Clear all', 'clearAll') + '</div><div class="roster">' + roster.map(member => '<label><input type="checkbox" name="present" value="' + escape(member.id) + '"' + (recorded.some(row => row.memberId === member.id && row.present) ? ' checked' : '') + '><span>' + escape(member.name) + '<br><small>' + escape(member.sjamId || member.id) + '</small></span></label>').join('') + '</div><p class="hint">Unchecked members in this roster are recorded as absent. Historical attendance for other members is retained.</p><div class="dialog-actions"><button class="button" type="button" data-action="close">Cancel</button><button class="button primary" type="submit">Save attendance</button></div></form>';
    byId('editor').showModal();
  }
  function openDetail(id) {
    const member = state.Members.find(row => row.id === id);
    const summary = KPT.summary(state, id, year());
    byId('editor-title').textContent = member.name;
    byId('editor-message').textContent = '';
    byId('editor-body').innerHTML = '<div class="detail-grid">' + [['Internal ID', member.id], ['SJAM ID', member.sjamId || 'Not assigned'], ['IC · private', member.ic || '—'], ['Race', member.race || '—'], ['Joined', member.joined || '—'], ['Status', member.status]].map(([label, value]) => '<div><small>' + label + '</small><strong>' + escape(value) + '</strong></div>').join('') + '</div><h3>' + year() + ' efficiency · ' + pill(summary.efficient) + '</h3>' + table(['Duty', 'DIM', 'Inspection', 'Examination'], [[summary.hours === null ? 'Pending' : escape(summary.hours) + ' hours', summary.dim, summary.inspection ? 'Participated' : 'Not recorded', summary.exam ? 'Participated' : 'Not recorded']]) + '<h3 style="margin-top:24px">Examination history</h3>' + table(['Date', 'Exam', 'Result', 'Certificate'], state.Exams.filter(row => row.memberId === id && !row.archived).map(row => [escape(row.date), escape(row.type), pill(row.result), escape(row.certificate)])) + '<h3 style="margin-top:24px">Awards</h3>' + table(['Date', 'Award', 'Level'], state.Awards.filter(row => row.memberId === id && !row.archived).map(row => [escape(row.date), escape(row.name), escape(row.level)])) + '<h3 style="margin-top:24px">Attendance history</h3>' + table(['Date', 'Activity', 'Categories', 'Attendance', 'Action'], state.Attendance.filter(row => row.memberId === id).map(row => { const activity = state.Activities.find(item => item.id === row.activityId); return [escape(activity.date), escape(activity.name), escape(activity.tags.join(' / ')), row.present ? 'Present' : 'Absent', deleteButton('Attendance', row.id)]; })) + '<div class="dialog-actions">' + button('Close', 'close') + '</div>';
    byId('editor').showModal();
  }
  function renderImport() {
    const element = byId('import-preview');
    if (!element) return;
    if (!importPreview) { element.innerHTML = ''; return; }
    const ignored = importIgnoredSheets && importIgnoredSheets.length
      ? '<p class="hint">' + escape(t('importIgnoredSheets')) + ' <strong>' + escape(importIgnoredSheets.join(', ')) + '</strong></p>'
      : '';
    const typeNote = '<p class="muted">' + escape(t('importPreviewFor')) + ' <strong>' + escape(t('importType.' + importType)) + '</strong>' + (importFileName ? ' · ' + escape(importFileName) : '') + '</p>';
    element.innerHTML = '<div class="card"><h2>' + escape(t('importPreviewTitle')) + '</h2>' + typeNote
      + '<p>' + importPreview.changes.length + ' proposed changes · ' + importPreview.errors.length + ' errors</p>'
      + ignored
      + (importPreview.errors.length ? table(['Sheet', 'Excel row', 'Problem'], importPreview.errors.slice(0, 100).map(row => [escape(row.sheet), escape(row.row || '—'), escape(row.message)])) : table(['Sheet', 'Excel row', 'Record', 'Change'], importPreview.changes.slice(0, 100).map(row => [escape(row.sheet), escape(row.row), escape(row.id), escape(row.change)])))
      + '<p class="hint">' + escape(t('importPreviewHint')) + '</p>'
      + (!importPreview.errors.length && importPreview.changes.length ? '<button class="button primary" type="button" data-action="commitImport" style="margin-top:18px">' + escape(t('importConfirmBtn')) + ' ' + importPreview.changes.length + '</button>' : '')
      + '</div>';
  }
  function renderBackups() {
    if (!byId('backup-list')) return;
    byId('backup-list').innerHTML = table(['Backup', 'Action'], backups.slice(0, 30).map(row => [escape(row.name), user.owner ? button('Restore', 'restore', row.id) : 'Owner only']));
  }
  async function action(element) {
    const { action: name, id, table: tableName } = element.dataset;
    if (['telegramSettings', 'telegramRefresh', 'telegramCreate', 'telegramConfirm', 'telegramCancel', 'telegramEnable', 'telegramUnlink'].includes(name)) {
      if (name === 'telegramUnlink' && !confirm(langLabel('Unlink Telegram and stop private notifications?', '解除 Telegram 绑定并停止私人通知？'))) return;
      const actions = { telegramSettings: 'getTelegramStatus', telegramRefresh: 'getTelegramStatus', telegramCreate: 'createTelegramBinding', telegramConfirm: 'confirmTelegramBinding', telegramCancel: 'cancelTelegramBinding', telegramEnable: 'setTelegramEnabled', telegramUnlink: 'unlinkTelegram' };
      const request = { action: actions[name] };
      if (name === 'telegramConfirm') request.bindingId = id;
      if (name === 'telegramEnable') request.enabled = id === 'true';
      const status = await call(request);
      if (['telegramConfirm', 'telegramCancel', 'telegramUnlink'].includes(name)) telegramBinding = null;
      if (status.binding) telegramBinding = status.binding;
      renderTelegramSettings(status);
      notice(langLabel('Telegram status updated.', 'Telegram 状态已更新。'));
      return;
    }
    if (/^finance(AddIncome|AddExpense|AddForm|AddLine|RemoveRow|RemoveForm|RemoveLine)$/.test(name)) hubDirty = true;
    if (name === 'close') { byId('editor').close(); return; }
    if (name === 'hubTab') {
      if (id !== hubTab && !hubConfirmLeave()) return;
      hubTab = id === 'hall' || id === 'notifications' ? id : 'studio';
      render();
      if (hubTab === 'notifications') hubLoadNotifications(false);
      return;
    }
    if (name === 'hubPick') {
      if (!hubConfirmLeave()) return;
      hubSelectedId = id || null;
      openDocPackageId = id || null;
      financeDraft = null;
      // Multi-activity: pick first, then default tab by role.
      if (id) hubTab = hubDefaultTab();
      render();
      return;
    }
    if (name === 'hubApplyLive') {
      const staged = hubLivePendingSnapshot;
      if (!staged) { hubHidePendingBanner(); hubLiveTick(true); return; }
      const requestId = hubLiveRequestId;
      const email = user && user.email;
      await hubApplyLiveSnapshot(staged, requestId, email, hubLiveGeneration);
      return;
    }
    if (name === 'hubDismissLive') {
      // Keep staged snapshot and applied key — next safe moment or next tick can still apply.
      hubHidePendingBanner();
      return;
    }
    if (name === 'hubMarkRead') {
      const payload = (hubNotifications.notifications || []).filter(row => row.unread).slice(0, 100).map(row => ({ id: row.id, entityVersion: row.entityVersion }));
      if (!payload.length) return;
      try {
        const result = await window.KPTTransport.call({ action: 'markHubNotificationsRead', notifications: payload });
        if (result && result.notifications) {
          hubNotifications = {
            notifications: result.notifications || [],
            unreadCount: result.unreadCount || 0,
            activityUnread: result.activityUnread || {},
            studioUnread: result.studioUnread || {}
          };
        } else {
          await hubLoadNotifications(true);
        }
        hubRefreshBadges();
        render();
      } catch (error) { notice(error.message, true); }
      return;
    }
    if (name === 'hubOpenNotif') {
      if (!hubConfirmLeave()) return;
      const packageId = element.dataset.package || '';
      const entityId = element.dataset.entity || '';
      const row = (hubNotifications.notifications || []).find(n => n.id === id);
      const latest = await call({ action: 'bootstrap' });
      state = latest.state;
      sync = latest.sync || sync;
      financeDraft = null;
      if (packageId) {
        hubSelectedId = packageId;
        openDocPackageId = packageId;
      }
      if (entityId && state) {
        const item = (state.DocItems || []).find(r => r.id === entityId);
        const book = (state.FinBooks || []).find(r => r.id === entityId);
        const kind = row && row.kind;
        const isReturn = kind === 'ReturnedByOC' || kind === 'ReturnedByFinal';
        const isOcFacing = kind === 'SubmittedToOC' || kind === 'OCChecked' || kind === 'ForwardedForApproval';
        // Historical destination stays compatible; otherwise route by kind.
        if (row) hubTab = hubNotificationTab(row);
        else if (isOcFacing) hubTab = 'hall';
        else if (isReturn) hubTab = 'studio';
        else hubTab = hubDefaultTab();
        if (book) {
          // Finance opened from submissions stays put — no forced jump back to workbench.
          loadFinanceDraft(book);
        }
        if (!item && !book) { await hubLoadNotifications(true); render(); notice('This item is no longer available.', true); return; }
      }
      render();
      const displayed = [...document.querySelectorAll('[data-hub-entity]')].find(element => element.dataset.hubEntity === entityId);
      const book = (state.FinBooks || []).find(item => item.id === entityId);
      if (displayed || (book && byId('finance-activity-name') && financeDraft && financeDraft.id === entityId)) {
        const entity = book || state.DocItems.find(item => item.id === entityId);
        try { await hubMarkEntityRead(entityId, entity.version); } catch (error) { notice(error.message, true); }
        if (displayed) displayed.scrollIntoView({ block: 'center' });
      }
      return;
    }
    if (name === 'hubDownloadAttach') {
      try {
        const result = await window.KPTTransport.call({ action: 'downloadFinanceAttachment', attachmentId: id });
        if (result && result.contentBase64) downloadBase64(result.fileName || 'attachment', result.contentBase64);
      } catch (error) { notice(error.message, true); }
      return;
    }
    if (name === 'hubPreviewAttach') {
      const result = await call({ action: 'downloadFinanceAttachment', attachmentId: id });
      if (!['image/jpeg', 'image/png'].includes(result.mime)) throw new Error('Only JPG and PNG receipts can be previewed.');
      const image = [...document.querySelectorAll('[data-attach-preview]')].find(item => item.dataset.attachPreview === id);
      if (image) { image.src = 'data:' + result.mime + ';base64,' + result.contentBase64; image.hidden = false; }
      notice(langLabel('Receipt preview ready.', '收据预览已打开。'));
      return;
    }
    if (name === 'hubRemoveAttach') {
      if (!confirm(t('hub.removeReceipt') + '?')) return;
      try {
        const result = await window.KPTTransport.call({ action: 'removeFinanceAttachment', attachmentId: id, revision: state.revision });
        if (result && result.state) { state = result.state; sync = result.sync || sync; }
        notice(t('hub.receiptRemoved'));
        render();
      } catch (error) { notice(error.message, true); }
      return;
    }
    if (name === 'navigate') { view = id; query = ''; page = 0; render(); return; }
    if (name === 'add' || name === 'edit') { openEditor(tableName, id); return; }
    if (name === 'attendance') { openAttendance(id); return; }
    if (name === 'detail') { openDetail(id); return; }
    if (name === 'recordEligible') { const [memberId, catalogId] = id.split('|'); openEditor('Awards', '', { memberId, catalogId, date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }) }); return; }
    if (name === 'duty') { const existing = state.Duty.find(row => row.memberId === id && row.year === year()); openEditor('Duty', existing && existing.id, { memberId: id, year: year(), hours: '' }); return; }
    if (name === 'setMode') {
      if (id === 'portal') {
        workspaceMode = 'portal';
        view = 'Portal';
        render();
        notice('Member System home.');
        return;
      }
      if (id === 'treasurer' && !(user.treasurer || user.owner)) throw new Error('No Treasurer access.');
      if (id === 'admin' && !(user.admin || user.owner)) throw new Error('No Admin access.');
      if (id === 'owner' && !user.owner) throw new Error('Owner only.');
      workspaceMode = id;
      view = id === 'treasurer' ? 'Finance' : id === 'owner' ? 'Owner' : id === 'portal' ? 'Portal' : 'Overview';
      try {
        const url = new URL(location.href);
        url.searchParams.set('mode', id);
        history.replaceState({}, '', url);
      } catch (error) { /* ignore */ }
      render();
      notice('Switched to ' + id + ' workspace.');
      return;
    }
    if (name === 'demoRole') {
      if (!window.KPTTransport.demo) return;
      await window.KPTTransport.setDemoRole(id);
      await refresh();
      notice('Preview role: ' + id);
      return;
    }
    if (name === 'enrolment') { openEditor('Enrolments', '', { memberId: id, year: year() }); return; }
    if (name === 'financeAddBook') {
      const linkedPackageId = openDocPackageId || '';
      if (!(user.owner || user.treasurer) && !linkedPackageId) throw new Error('Open an activity package first.');
      financeDraft = { id: '', version: 0, activityName: '', packageId: linkedPackageId, incomes: [], expenses: [], reimbursements: [] };
      financeReceiptFiles = [];
      view = 'Finance';
      render();
      notice('Enter the activity name, then Save.');
      return;
    }
    if (name === 'financeOpenBook') {
      if (!hubConfirmLeave()) return;
      const book = state.FinBooks.find(row => row.id === id);
      if (!book) throw new Error('Finance record not found. Reload data.');
      if (!(user.owner || user.treasurer || user.admin)) {
        const pkg = book.packageId ? (state.DocPackages || []).find(row => row.id === book.packageId) : null;
        const roles = pkg ? packageRolesFor(pkg, user.email) : [];
        if (!roles.length) throw new Error('You can only open finance for your activity package.');
      }
      financeDraft = {
        id: book.id,
        version: book.version,
        activityName: book.activityName,
        packageId: book.packageId || '',
        incomes: state.FinIncomes.filter(row => row.bookId === id).map(row => KPT.copy(row)),
        expenses: state.FinExpenses.filter(row => row.bookId === id).map(row => KPT.copy(row)),
        reimbursements: state.FinReimbursements.filter(row => row.bookId === id).map(row => Object.assign(KPT.copy(row), { lines: state.FinReimburseLines.filter(line => line.reimbursementId === row.id).map(line => KPT.copy(line)) }))
      };
      financeReceiptFiles = [];
      hubDirty = false;
      view = 'Finance';
      if (hubTab !== 'hall') hubTab = 'studio';
      render();
      if (byId('finance-activity-name')) hubMarkEntityRead(book.id, book.version).catch(error => notice(error.message, true));
      notice(langLabel('Book opened. You can read the entries and receipts here.', '账本打开了，可以在这里看账目和收据。'));
      return;
    }
    if (name === 'financeBack') { if (!hubConfirmLeave()) return; financeDraft = null; financeReceiptFiles = []; render(); return; }
    if (name === 'financeSave') {
      if (!financeDraft) return;
      if (!financeDraft.activityName) throw new Error('Enter an activity name before saving.');
      financeDraft.reimbursements.forEach((form, index) => {
        form.formSeq = index + 1;
        if (!form.treasurerName) throw new Error('Form ' + form.formSeq + ': treasurer name is required.');
        if (!form.formDate) form.formDate = today();
        if (!form.purpose) form.purpose = financeDraft.activityName;
        form.amount = form.lines.reduce((sum, line) => sum + (Number(line.total) || 0), 0);
        form.lines.forEach((line, lineIndex) => {
          line.lineNo = lineIndex + 1;
          if (!line.date) throw new Error('Form ' + form.formSeq + ': every line needs a date.');
          if (!line.particular) throw new Error('Form ' + form.formSeq + ': every line needs a particular.');
        });
      });
      financeDraft.incomes.forEach(row => { if (!row.date) row.date = today(); if (!row.description) throw new Error('Each income row needs a description.'); });
      financeDraft.expenses.forEach(row => { if (!row.date) row.date = today(); if (!row.item && !row.description) throw new Error('Each expense row needs an item or description.'); });
      const knownIds = new Set(state.FinBooks.map(row => row.id));
      const response = await call({ action: 'saveFinanceBook', revision: state.revision, book: financeDraft });
      state = response.state;
      sync = response.sync || sync;
      const saved = (financeDraft.id && state.FinBooks.find(row => row.id === financeDraft.id))
        || state.FinBooks.find(row => !knownIds.has(row.id) && row.activityName === financeDraft.activityName)
        || state.FinBooks.find(row => row.activityName === financeDraft.activityName);
      if (saved) {
        financeDraft.id = saved.id;
        financeDraft.version = saved.version;
        financeDraft.incomes = state.FinIncomes.filter(row => row.bookId === saved.id).map(row => KPT.copy(row));
        financeDraft.expenses = state.FinExpenses.filter(row => row.bookId === saved.id).map(row => KPT.copy(row));
        financeDraft.reimbursements = state.FinReimbursements.filter(row => row.bookId === saved.id).map(row => Object.assign(KPT.copy(row), { lines: state.FinReimburseLines.filter(line => line.reimbursementId === row.id).map(line => KPT.copy(line)) }));
      }
      hubDirty = false;
      render();
      notice(t('hub.saved'));
      if (isOcOnly() || hubHas('os') || hubHas('ot') || hubHas('oc')) {
        // Primary CTA after save: hand in from Activity Hall (formal submit only there).
        const goHall = document.querySelector('[data-action="hubTab"][data-id="hall"]');
        if (goHall) goHall.focus();
      }
      return;
    }
    if (name === 'financeAddIncome') { financeDraft.incomes.push({ id: '', version: 0, date: today(), description: '', amount: '' }); render(); return; }
    if (name === 'financeAddExpense') { financeDraft.expenses.push({ id: '', version: 0, date: today(), item: '', description: '', quantity: '', unitCost: '', amount: '' }); render(); return; }
    if (name === 'financeAddForm') {
      financeDraft.reimbursements.push({
        id: '', version: 0, formSeq: financeDraft.reimbursements.length + 1,
        treasurerName: financeDraft.reimbursements[financeDraft.reimbursements.length - 1]?.treasurerName || '',
        formDate: today(), purpose: financeDraft.activityName, chequeNo: '', amount: '', lines: []
      });
      render();
      notice('New form added. Each form holds up to 11 lines.');
      return;
    }
    if (name === 'financeAddLine') {
      const form = financeDraft.reimbursements[Number(id)];
      if (!form) return;
      if (form.lines.length >= 11) { notice('This form is full (11 lines). Use Add form for the rest.', true); return; }
      form.lines.push({ id: '', version: 0, lineNo: form.lines.length + 1, date: today(), invoiceNo: '', particular: '', total: '' });
      render();
      return;
    }
    if (name === 'financeRemoveRow') {
      const kind = id;
      const index = Number(element.dataset.index);
      if (kind === 'income') financeDraft.incomes.splice(index, 1);
      else if (kind === 'expense') financeDraft.expenses.splice(index, 1);
      else if (kind.startsWith('line')) financeDraft.reimbursements[Number(kind.slice(4))].lines.splice(index, 1);
      render();
      return;
    }
    if (name === 'financeRemoveForm') { financeDraft.reimbursements.splice(Number(id), 1); financeDraft.reimbursements.forEach((form, index) => { form.formSeq = index + 1; }); render(); return; }
    if (name === 'financeDownloadIE') {
      if (!financeDraft.activityName) throw new Error('Enter an activity name first.');
      await KPTFinanceWorkbook.downloadIncomeExpenses(financeDraft);
      notice('Income & Expenses Excel downloaded.');
      return;
    }
    if (name === 'financeDownloadForm') {
      const form = financeDraft.reimbursements[Number(id)];
      if (!form) return;
      if (!form.treasurerName) throw new Error('Enter the treasurer name on this form first.');
      await KPTFinanceWorkbook.downloadReimbursement(Object.assign({}, form, { formSeq: Number(id) + 1 }), financeDraft.activityName);
      notice('Reimbursement form downloaded.');
      return;
    }
    if (name === 'financeDownloadReceipts') {
      const files = financeReceiptFiles.map(row => row.file);
      if (!files.length) throw new Error('Add receipt photos first.');
      await KPTFinancePdf.downloadReceiptPdf(files, financeDraft.activityName);
      notice('Receipt PDF downloaded.');
      return;
    }
    if (name === 'financeRemoveReceipt') { financeReceiptFiles.splice(Number(id), 1); render(); return; }
    if (name === 'previous') { page = Math.max(0, page - 1); render(); return; }
    if (name === 'next') { if ((page + 1) * 40 < Number(id)) page++; render(); return; }
    if (name === 'selectAll' || name === 'clearAll') { document.querySelectorAll('#attendance-form input[name="present"]').forEach(input => { input.checked = name === 'selectAll'; }); return; }
    if (name === 'template') { KPTWorkbook.download(state, true); return; }
    if (name === 'importTemplate') {
      const opts = importType === 'ALL' ? undefined : { table: importType };
      KPTWorkbook.download(state, true, null, opts);
      notice(t('importTemplateDone'));
      return;
    }
    if (name === 'importExisting') {
      // Export this type's current rows (with IDs) so updates can keep id/version.
      const opts = importType === 'ALL' ? undefined : { table: importType };
      KPTWorkbook.download(state, false, null, opts);
      notice(t('importExistingDone'));
      return;
    }
    if (name === 'export' || name === 'exportSummary') { KPTWorkbook.download(state, false, name === 'exportSummary' ? summaryRows() : null); return; }
    if (name === 'delete') {
      const preview = KPT.recycleBundle(state, tableName, id);
      const included = Object.entries(preview.counts).map(([table, count]) => table + ': ' + count).join('\n');
      if (!confirm('Move ' + preview.rootTable + ' · ' + preview.label + ' to Recycle Bin?\n\nAffected records:\n' + included + '\n\nA private backup will be created first.')) return;
      const response = await call({ action: 'deleteRecord', table: tableName, id, revision: state.revision });
      if (byId('editor').open) byId('editor').close();
      applySave(response);
      notice('Record moved to Recycle Bin.');
      return;
    }
    if (name === 'deleteAllMembers') {
      const preview = KPT.allMembersBundle(state);
      const included = Object.entries(preview.counts).map(([table, count]) => table + ': ' + count).join('\n');
      const confirmation = prompt('This will move ALL ' + preview.counts.Members + ' students and their linked records to the Recycle Bin.\n\nAffected records:\n' + included + '\n\nA private backup will be created first.\n\nType DELETE ALL STUDENTS to continue.');
      if (confirmation !== 'DELETE ALL STUDENTS') { if (confirmation !== null) notice('Delete all students cancelled: confirmation text did not match.', true); return; }
      applySave(await call({ action: 'deleteAllMembers', revision: state.revision }));
      notice(preview.counts.Members + ' students moved to one Recycle Bin item.');
      return;
    }
    if (name === 'restoreTrash') {
      if (!confirm('Restore this record and all included linked records? A private backup will be created first.')) return;
      applySave(await call({ action: 'restoreTrash', trashId: id, revision: state.revision }));
      notice('Record restored from Recycle Bin.');
      return;
    }
    if (name === 'purgeTrash') {
      if (!confirm('Permanently delete this Recycle Bin item? This cannot be undone from the system. A private backup will be created first.')) return;
      applySave(await call({ action: 'purgeTrash', trashId: id, revision: state.revision }));
      notice('Recycle Bin item permanently deleted.');
      return;
    }
    if (name === 'setPhase') {
      const phase = Number(id);
      if (!confirm('Set Phase ' + phase + ' as the Current Phase?')) return;
      const result = await call({ action: 'setCurrentPhase', phase });
      currentPhase = result.currentPhase;
      render();
      notice('Current Phase updated to Phase ' + currentPhase + '.');
      return;
    }
    if (name === 'previewSetup') {
      setupDefaultsPreview = KPT.setupPreview(state);
      render();
      notice(setupDefaultsPreview.ready ? 'Recommended system setup is already complete.' : 'Setup preview ready. Review it, then apply the missing defaults.');
      return;
    }
    if (name === 'applySetup') {
      if (!setupDefaultsPreview || setupDefaultsPreview.ready) throw new Error('Preview the recommended setup first.');
      if (!confirm('Apply the recommended Exam and Award setup? A private backup will be created first.')) return;
      applySave(await call({ action: 'applySetupDefaults', revision: state.revision }));
      setupDefaultsPreview = null;
      notice('Recommended system setup applied.');
      return;
    }
    if (name === 'openAdmin') {
      openGoogleAccountUrl(adminSelfUrl());
      return;
    }
    if (name === 'logoutSwitchAccount' || name === 'signOutGoogle' || name === 'switchGoogleAccount') {
      // Logout then Google's own account picker. Do not continue into Apps Script
      // (that hop 400s or 404s). User returns with Open Admin / browser Back.
      notice('Signing out of Google. Pick an account, then press Open Admin (or browser Back).');
      openGoogleAccountUrl('https://accounts.google.com/Logout?continue=' + encodeURIComponent('https://accounts.google.com/AccountChooser'));
      return;
    }
    if (name === 'reloadNow') {
      if (!busy) { importPreview = null; importFile = null; await refresh(); notice('Records reloaded with the current Google account.'); }
      return;
    }
    if (name === 'toggleActivityIntro') {
      activityIntroExpanded = !activityIntroExpanded;
      render();
      const toggle = document.querySelector('[data-action="toggleActivityIntro"]');
      if (toggle) toggle.focus();
      return;
    }
    if (name === 'taskDone' || name === 'taskCancel' || name === 'taskOpen') {
      const taskStatus = name === 'taskDone' ? 'Done' : name === 'taskCancel' ? 'Cancelled' : 'Open';
      applySave(await call({ action: 'setDocItemTaskStatus', itemId: id, taskStatus, revision: state.revision }));
      notice('Task marked ' + taskStatus + '.');
      return;
    }
    if (name === 'finSubmit') {
      applySave(await call({ action: 'submitFinBook', bookId: id, revision: state.revision }));
      notice(t('hub.submitted'));
      return;
    }
    if (name === 'finCheck') {
      const pass = element && element.dataset.table === 'pass';
      if (!pass) {
        const remarks = prompt(langLabel('Why are you returning this? (required)', '退回原因（必填）:'));
        if (remarks === null) return;
        if (!String(remarks).trim()) { notice(langLabel('Please say why you are returning this.', '请填写退回原因。'), true); return; }
        applySave(await call({ action: 'checkFinBook', bookId: id, approve: false, remarks: String(remarks).trim(), revision: state.revision }));
        notice(t('hub.returnedOt'));
        return;
      }
      applySave(await call({ action: 'checkFinBook', bookId: id, approve: true, revision: state.revision }));
      notice(t('hub.checkedFin'));
      return;
    }
    if (name === 'finForward') {
      applySave(await call({ action: 'forwardFinBook', bookId: id, revision: state.revision }));
      notice(t('hub.sentFin'));
      return;
    }
    if (name === 'finApprove') {
      if (!(user.owner || user.treasurer)) throw new Error('Treasurer review is required.');
      applySave(await call({ action: 'reviewFinBook', bookId: id, approve: true, revision: state.revision }));
      notice('Activity finance approved.');
      return;
    }
    if (name === 'finReject') {
      if (!(user.owner || user.treasurer)) throw new Error('Treasurer review is required.');
      const remarks = prompt('Reason for rejecting this activity finance:');
      if (remarks === null) return;
      if (!String(remarks).trim()) { notice('A reason is required when rejecting.', true); return; }
      applySave(await call({ action: 'reviewFinBook', bookId: id, approve: false, remarks: String(remarks).trim(), revision: state.revision }));
      notice('Activity finance rejected.');
      return;
    }
    if (name === 'finReopen') {
      if (!(user.owner || user.admin)) throw new Error('Owner or Secretary can reopen.');
      applySave(await call({ action: 'reopenFinBook', bookId: id, revision: state.revision }));
      notice('Activity finance reopened as Draft.');
      return;
    }
    if (name === 'docEditOpen') {
      const pkg = state.DocPackages.find(row => row.id === openDocPackageId);
      if (!pkg) return;
      if (!(user.owner || user.admin || user.oc)) throw new Error('No access.');
      docEditOpen = true;
      docEditDraft = {
        items: state.DocItems.filter(row => row.packageId === pkg.id && !row.archived)
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(row => ({ id: row.id, title: row.title, role: row.role || '', dueOffsetDays: row.dueOffsetDays, required: !!row.required, sortOrder: row.sortOrder })),
        addItems: []
      };
      render();
      return;
    }
    if (name === 'docEditCancel') { docEditOpen = false; docEditDraft = null; render(); return; }
    if (name === 'docEditAddRow') {
      if (!(user.owner || user.admin)) throw new Error('Only Owner or Secretary can add documents.');
      if (docEditDraft) docEditDraft.addItems = (docEditDraft.addItems || []).concat([{ title: '', role: 'Secretary', dueOffsetDays: -7, required: true }]);
      render();
      return;
    }
    if (name === 'docEditRemoveRow') {
      if (!(user.owner || user.admin)) throw new Error('Only Owner or Secretary can remove documents.');
      if (docEditDraft) docEditDraft.items = docEditDraft.items.filter(row => row.id !== id);
      render();
      return;
    }
    if (name === 'docEditRemoveAddRow') {
      if (!(user.owner || user.admin)) return;
      if (docEditDraft) docEditDraft.addItems.splice(Number(id), 1);
      render();
      return;
    }
    if (name === 'docEditSave') {
      if (!docEditDraft || !openDocPackageId) return;
      const items = docEditDraft.items.map((row, index) => {
        const src = state.DocItems.find(x => x.id === row.id);
        return {
          id: row.id,
          title: row.title,
          role: row.role,
          dueOffsetDays: row.dueOffsetDays,
          required: row.required,
          sortOrder: src ? src.sortOrder : index + 1
        };
      });
      const addItems = (docEditDraft.addItems || []).filter(row => row.title && row.title.trim()).map((row, index) => ({
        title: row.title.trim(),
        role: row.role || '',
        dueOffsetDays: row.dueOffsetDays,
        required: row.required !== false,
        sortOrder: 9000 + index
      }));
      const originalIds = state.DocItems.filter(row => row.packageId === openDocPackageId && !row.archived).map(row => row.id);
      const draftIds = new Set(docEditDraft.items.map(row => row.id));
      const removeItemIds = originalIds.filter(id => !draftIds.has(id));
      applySave(await call({
        action: 'saveDocItemsMeta',
        packageId: openDocPackageId,
        items,
        addItems,
        removeItemIds,
        revision: state.revision
      }, 'Saving checklist…'));
      docEditOpen = false;
      docEditDraft = null;
      render();
      notice('Checklist saved.');
      return;
    }
    if (name === 'toggleLang') {
      if (window.KPTI18n) window.KPTI18n.toggleLang();
      render();
      notice((window.KPTI18n && window.KPTI18n.getLang() === 'zh') ? '语言已切换为中文' : 'Language switched to English');
      return;
    }
    if (name === 'docOpen') {
      const pkg = state.DocPackages.find(row => row.id === id);
      if (!canOpenPackage(pkg)) throw new Error('You can only open your own activity package.');
      openDocPackageId = id;
      activityIntroExpanded = false;
      query = ''; page = 0;
      workspaceMode = 'oc';
      hubSelectedId = id;
      hubTab = 'studio';
      view = 'Documents';
      render();
      return;
    }
    if (name === 'logoutPortal') {
      if (window.KPTTransport && window.KPTTransport.logout) await window.KPTTransport.logout();
      clearSessionHash();
      try { sessionStorage.removeItem('tccd-portal'); } catch (error) { /* ignore */ }
      notice('Signed out of this session.');
      showLoginGate('Signed out. Sign in again to continue.');
      return;
    }
    if (name === 'docBack') { openDocPackageId = null; docEditOpen = false; docEditDraft = null; activityIntroExpanded = false; render(); return; }
    if (name === 'docSubmit') {
      applySave(await call({ action: 'docItemSubmit', itemId: id, revision: state.revision }));
      notice(t('hub.submitted'));
      return;
    }
    if (name === 'docCheck') {
      const pass = element && element.dataset.table === 'pass';
      if (!pass) {
        const remarks = prompt(langLabel('Why are you returning this? (required)', '退回原因（必填）:'));
        if (remarks === null) return;
        if (!String(remarks).trim()) { notice(langLabel('Please say why you are returning this.', '请填写退回原因。'), true); return; }
        applySave(await call({ action: 'docItemCheck', itemId: id, approve: false, remarks: String(remarks).trim(), revision: state.revision }));
        notice(t('hub.returnedOs'));
        return;
      }
      applySave(await call({ action: 'docItemCheck', itemId: id, approve: true, revision: state.revision }));
      notice(t('hub.checkedDoc'));
      return;
    }
    if (name === 'docForward') {
      applySave(await call({ action: 'docItemForward', itemId: id, revision: state.revision }));
      notice(t('hub.sentDoc'));
      return;
    }
    if (name === 'docApprove') {
      if (!(user.owner || user.admin)) throw new Error('Only Owner or Secretary can approve documents.');
      applySave(await call({ action: 'docItemReview', itemId: id, approve: true, revision: state.revision }));
      notice('Document approved.');
      return;
    }
    if (name === 'docReject') {
      if (!(user.owner || user.admin)) throw new Error('Only Owner or Secretary can approve documents.');
      const remarks = prompt('Reason for rejection (required):');
      if (remarks === null) return;
      if (!String(remarks).trim()) { notice('A reason is required when rejecting.', true); return; }
      applySave(await call({ action: 'docItemReview', itemId: id, approve: false, remarks: String(remarks).trim(), revision: state.revision }));
      notice('Document rejected.');
      return;
    }
    if (name === 'docReopen') {
      if (!(user.owner || user.admin)) throw new Error('Only Owner or Secretary can reopen documents.');
      if (!confirm('Reopen this approved item?')) return;
      applySave(await call({ action: 'docItemReopen', itemId: id, revision: state.revision }));
      notice('Document reopened.');
      return;
    }
    if (name === 'docDownload' || name === 'docDownloadTemplate') {
      const result = await call({ action: 'docDownload', itemId: id, source: name === 'docDownloadTemplate' ? 'template' : 'file' }, 'Preparing file…');
      if (!result || !result.contentBase64) throw new Error('No file available to download.');
      downloadBase64(result.fileName, result.contentBase64);
      notice('Downloaded ' + result.fileName);
      return;
    }
    if (name === 'docArchive') {
      if (!user.owner) throw new Error('Only the owner can archive packages.');
      const pkg = state.DocPackages.find(row => row.id === id);
      if (!confirm((pkg && pkg.archived ? 'Unarchive' : 'Archive') + ' this package?')) return;
      applySave(await call({ action: 'docPackageArchive', packageId: id, revision: state.revision }));
      notice('Package updated.');
      return;
    }
    if (name === 'initDocFolders') {
      const result = await call({ action: 'initDocFolders' }, 'Creating folders…');
      docFolders = result || { templates: '', submissions: '' };
      render();
      notice('Document folders initialised.');
      return;
    }
    if (name === 'archive') {
      const row = KPT.copy(state[tableName].find(item => item.id === id));
      if (!confirm((row.archived ? 'Unarchive' : 'Archive') + ' this record? History will be kept.')) return;
      row.archived = !row.archived;
      applySave(await call({ action: 'save', table: tableName, row, revision: state.revision, year: year() }));
      return;
    }
    if (name === 'previewImport') {
      const file = byId('excel-file').files[0];
      if (!file || !/\.xlsx$/i.test(file.name)) throw new Error(t('importNeedXlsx'));
      if (file.size > 10 * 1024 * 1024) throw new Error(t('importTooLarge'));
      const generation = ++importGeneration;
      const typeAtStart = importType;
      const opts = typeAtStart === 'ALL' ? undefined : { table: typeAtStart };
      let parsed;
      try {
        parsed = KPTWorkbook.parse(await file.arrayBuffer(), opts);
      } catch (error) {
        if (generation !== importGeneration || typeAtStart !== importType) return;
        importFile = null;
        importPreview = { changes: [], errors: [{ sheet: '', row: '', message: error.message || String(error) }], revision: state.revision };
        importIgnoredSheets = [];
        renderImport();
        notice(t('importParseFailed'), true);
        return;
      }
      // Stale parse from a previous type/file — discard.
      if (generation !== importGeneration || typeAtStart !== importType) return;
      importFile = parsed.workbook;
      importFileName = file.name;
      importIgnoredSheets = parsed.ignoredSheets || [];
      if (parsed.errors && parsed.errors.length) {
        importPreview = { changes: [], errors: parsed.errors, revision: state.revision, generation, type: typeAtStart, fileName: file.name };
        renderImport();
        notice(t('importParseFailed'), true);
        return;
      }
      // Missing selected sheet must fail — do not guess another type.
      if (typeAtStart !== 'ALL') {
        const sheets = parsed.workbook && parsed.workbook.SheetNames ? parsed.workbook.SheetNames : [];
        if (sheets.length && !sheets.includes(typeAtStart)) {
          importPreview = {
            changes: [],
            errors: [{ sheet: typeAtStart, row: '', message: t('importMissingSheet') }],
            revision: state.revision, generation, type: typeAtStart, fileName: file.name
          };
          importFile = null;
          renderImport();
          notice(t('importMissingSheet'), true);
          return;
        }
      }
      let preview;
      try {
        preview = await call({ action: 'previewImport', workbook: importFile, revision: state.revision });
      } catch (error) {
        if (generation !== importGeneration || typeAtStart !== importType) return;
        importPreview = { changes: [], errors: [{ sheet: '', row: '', message: error.message || String(error) }], revision: state.revision, generation, type: typeAtStart, fileName: file.name };
        importFile = null;
        renderImport();
        notice(t('importPreviewFailed'), true);
        return;
      }
      if (generation !== importGeneration || typeAtStart !== importType) return;
      importPreview = Object.assign({}, preview, { generation, type: typeAtStart, fileName: file.name });
      renderImport();
      return;
    }
    if (name === 'commitImport') {
      if (!importPreview || importPreview.errors.length || !importFile) throw new Error(t('importPreviewFirst'));
      // Only the last successful preview of this type/file/generation may commit.
      if (importPreview.generation !== importGeneration || importPreview.type !== importType) throw new Error(t('importStalePreview'));
      const file = byId('excel-file').files[0];
      if (file && importPreview.fileName && file.name !== importPreview.fileName) throw new Error(t('importStalePreview'));
      element.disabled = true;
      try {
        applySave(await call({ action: 'commitImport', workbook: importFile, revision: importPreview.revision }));
        importPreview = null;
        importFile = null;
        importIgnoredSheets = [];
        renderImport();
      } finally { element.disabled = false; }
      return;
    }
    if (name === 'retrySync') { applySave(await call({ action: 'retrySync' })); return; }
    if (name === 'backup') { const result = await call({ action: 'backup' }); notice('Private backup created: ' + result.name); return; }
    if (name === 'listBackups') { backups = await call({ action: 'listBackups' }); renderBackups(); if (!backups.length) notice('No backups yet. Use Back up now.'); return; }
    if (name === 'installBackup') { const result = await call({ action: 'installBackup' }); notice(result.message); return; }
    if (name === 'restore') {
      if (!confirm('Restore this full backup? Current records will be replaced. A safety backup will be created first.')) return;
      applySave(await call({ action: 'restore', backupId: id, revision: state.revision }));
    }
  }
  document.addEventListener('click', event => {
    const element = event.target.closest('[data-action]');
    if (!element) return;
    if (busy) return;
    action(element).catch(error => { if (byId('editor').open) byId('editor-message').textContent = error.message; else notice(error.message, true); });
  });
  byId('navigation').addEventListener('click', event => {
    const packageButton = event.target.closest('[data-package]');
    if (packageButton) {
      if (busy || !state) return;
      const id = packageButton.dataset.id;
      const pkg = state.DocPackages.find(row => row.id === id);
      if (!canOpenPackage(pkg)) { notice('You can only open your own activity package.', true); return; }
      openDocPackageId = id;
      docEditOpen = false;
      docEditDraft = null;
      view = 'Documents';
      if (isOcOnly() || workspaceMode === 'oc') workspaceMode = 'oc';
      else if (user && (user.admin || user.owner)) workspaceMode = workspaceMode === 'portal' ? 'portal' : workspaceMode;
      render();
      return;
    }
    const element = event.target.closest('[data-nav]');
    if (!element || busy || !state) return;
    if (element.dataset.nav === 'Documents') openDocPackageId = null;
    view = element.dataset.nav; query = ''; page = 0; notice(''); render();
  });
  byId('close-editor').addEventListener('click', () => { if (!busy) byId('editor').close(); });
  byId('reload').addEventListener('click', () => { if (!busy) { importPreview = null; importFile = null; refresh().then(() => notice('Current records loaded.')).catch(error => notice(error.message, true)); } });
  byId('year').addEventListener('change', () => { if (!Number.isInteger(year()) || year() < 1900 || year() > 2200) { notice('Choose a year between 1900 and 2200.', true); return; } page = 0; render(); });
  document.addEventListener('input', event => {
    if (event.target.id === 'filter') { const cursor = event.target.selectionStart; query = event.target.value; page = 0; render(); byId('filter').focus(); byId('filter').setSelectionRange(cursor, cursor); }
    const docEdit = event.target.dataset && event.target.dataset.docEdit;
    if (docEdit && docEditDraft) {
      const index = Number(event.target.dataset.index);
      const row = docEditDraft.items[index];
      if (!row) return;
      if (docEdit === 'required') row.required = event.target.checked;
      else if (docEdit === 'dueOffsetDays') row.dueOffsetDays = Number(event.target.value);
      else row[docEdit] = event.target.value;
      return;
    }
    const docAdd = event.target.dataset && event.target.dataset.docAdd;
    if (docAdd && docEditDraft && docEditDraft.addItems) {
      const index = Number(event.target.dataset.index);
      const row = docEditDraft.addItems[index];
      if (!row) return;
      if (docAdd === 'required') row.required = event.target.checked;
      else if (docAdd === 'dueOffsetDays') row.dueOffsetDays = Number(event.target.value);
      else row[docAdd] = event.target.value;
      return;
    }
    const fin = event.target.dataset && event.target.dataset.fin;
    if (!fin || !financeDraft) return;
    hubDirty = true;
    const key = event.target.dataset.key;
    const value = event.target.value;
    if (fin === 'book') { financeDraft[key] = value; return; }
    if (fin === 'income') { financeDraft.incomes[Number(event.target.dataset.index)][key] = value; return; }
    if (fin === 'expense') { financeDraft.expenses[Number(event.target.dataset.index)][key] = value; return; }
    if (fin.startsWith('form')) {
      const form = financeDraft.reimbursements[Number(fin.slice(4))];
      if (form) form[key] = value;
      return;
    }
    if (fin.startsWith('line')) {
      const form = financeDraft.reimbursements[Number(fin.slice(4))];
      if (form) form.lines[Number(event.target.dataset.index)][key] = value;
    }
  });
  document.addEventListener('change', event => {
    if (dialogTable === 'Exams' && ['field-activityId', 'field-memberId'].includes(event.target.id)) updateExamLink();
    if (event.target.id === 'import-type') {
      // Type switch must invalidate in-flight parse/preview — not just clear UI.
      importGeneration += 1;
      importType = IMPORT_TYPES.includes(event.target.value) ? event.target.value : 'Members';
      importPreview = null;
      importFile = null;
      importIgnoredSheets = [];
      importFileName = '';
      render();
      notice(t('importTypeChanged'));
      return;
    }
    if (event.target.id === 'excel-file') {
      importGeneration += 1;
      importPreview = null;
      importFile = null;
      importIgnoredSheets = [];
      importFileName = '';
      if (byId('import-preview')) byId('import-preview').innerHTML = '';
    }
    const docUploadId = event.target.dataset && event.target.dataset.docUpload;
    if (docUploadId) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { notice('Use a file smaller than 8 MB.', true); event.target.value = ''; return; }
      fileToBase64(file).then(async base64 => {
        applySave(await call({ action: 'docItemUpload', itemId: docUploadId, fileName: file.name, fileBase64: base64, revision: state.revision }, 'Uploading file…'));
        notice('File uploaded. Review it, then press Submit.');
      }).catch(error => notice(error.message, true));
      return;
    }
    const tplUploadId = event.target.dataset && event.target.dataset.tplUpload;
    if (tplUploadId) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { notice('Use a file smaller than 8 MB.', true); event.target.value = ''; return; }
      const template = (state.DocTemplates || []).find(row => row.id === tplUploadId);
      if (!template) return;
      fileToBase64(file).then(async base64 => {
        const response = await call({
          action: 'saveDocTemplate',
          revision: state.revision,
          row: Object.assign({}, template, { fileName: file.name, version: template.version, versionLabel: String(new Date().getFullYear()) + '.1' }),
          fileBase64: base64
        }, 'Uploading template…');
        state = response.state;
        sync = response.sync || sync;
        render();
        notice('Template replaced.');
      }).catch(error => notice(error.message, true));
      return;
    }
    if (event.target.id === 'hub-receipt-file') {
      const files = [...(event.target.files || [])];
      event.target.value = '';
      if (!files.length) return;
      if (hubReceiptBusy) return;
      if (files.some(file => !/\.(jpg|jpeg|png|pdf)$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024)) { notice(t('hub.uploadFailed'), true); return; }
      hubReceiptBusy = true;
      (async () => {
        try {
          if (hubDirty || !financeDraft || !financeDraft.id) await action({ dataset: { action: 'financeSave' } });
          for (let index = 0; index < files.length; index++) {
            const file = files[index];
            notice(t('hub.uploading') + ' ' + (index + 1) + '/' + files.length + ' · ' + file.name);
            const extension = file.name.split('.').pop().toLowerCase();
            const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' }[extension];
            const response = await call({ action: 'uploadFinanceAttachment', bookId: financeDraft.id, revision: state.revision, fileName: file.name, mime, contentBase64: await fileToBase64(file) });
            state = response.state;
            sync = response.sync || sync;
          }
          render();
          notice(t('hub.saved'));
        } catch (error) { render(); notice(t('hub.uploadFailed') + ' ' + error.message, true); }
        finally { hubReceiptBusy = false; }
      })();
      return;
    }
    if (event.target.id === 'finance-receipts') {
      const chosen = [...event.target.files];
      Promise.all(chosen.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ file, name: file.name, preview: reader.result });
        reader.onerror = () => reject(new Error('Could not read ' + file.name));
        reader.readAsDataURL(file);
      }))).then(items => {
        financeReceiptFiles = financeReceiptFiles.concat(items);
        render();
        notice(items.length + ' receipt photo(s) added.');
      }).catch(error => notice(error.message, true));
    }
  });
  document.addEventListener('submit', async event => {
    if (!['record-form', 'attendance-form', 'admin-access-form', 'access-form', 'doc-package-form', 'doc-event-form', 'tpl-new-form'].includes(event.target.id)) return;
    event.preventDefault();
    if (busy) return;
    const submit = event.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      if (event.target.id === 'record-form') {
        const row = KPT.copy(dialogRecord);
        definitions[dialogTable].forEach(([key, label, type]) => {
          if (type === 'tags') row[key] = [...event.target.querySelectorAll('[name="tags"]:checked')].map(element => element.value);
          else row[key] = type === 'checkbox' ? byId('field-' + key).checked : byId('field-' + key).value;
        });
        if (dialogTable === 'Exams') {
          if (['Pass', 'Fail'].includes(row.result)) row.attended = true;
          if (row.result === 'Absent') row.attended = false;
        }
        const response = await call({ action: 'save', table: dialogTable, row, revision: dialogRevision, year: year() });
        byId('editor').close(); applySave(response);
      } else if (event.target.id === 'attendance-form') {
        const all = [...event.target.querySelectorAll('[name="present"]')];
        const response = await call({ action: 'attendance', activityId: event.target.dataset.id, rosterIds: all.map(input => input.value), presentIds: all.filter(input => input.checked).map(input => input.value), revision: dialogRevision });
        byId('editor').close(); applySave(response);
      } else if (event.target.id === 'access-form') {
        const result = await call({
          action: 'setAccess',
          admins: byId('admin-emails').value.split(/\s+/).filter(Boolean),
          treasurers: byId('treasurer-emails').value.split(/\s+/).filter(Boolean),
          ocs: byId('oc-emails') ? byId('oc-emails').value.split(/\s+/).filter(Boolean) : []
        });
        admins = result.admins || [];
        treasurers = result.treasurers || [];
        ocs = result.ocs || [];
        render();
        notice('Access lists saved.');
      } else if (event.target.id === 'doc-package-form') {
        const response = await call({
          action: 'createDocPackage',
          activityType: byId('doc-activity').value,
          year: Number(byId('doc-year').value),
          eventDate: byId('doc-event-date').value || '',
          ocEmail: (byId('doc-oc-email') && byId('doc-oc-email').value.trim()) || '',
          basePackageId: byId('doc-base').value || '',
          revision: state.revision
        }, 'Creating package…');
        state = response.state;
        sync = response.sync || sync;
        openDocPackageId = response.packageId || (state.DocPackages[state.DocPackages.length - 1] || {}).id;
        render();
        notice('Package created.');
      } else if (event.target.id === 'doc-event-form') {
        applySave(await call({
          action: 'saveDocPackageMeta',
          packageId: openDocPackageId,
          eventDate: byId('doc-event-edit').value,
          ocEmail: byId('doc-oc-edit') ? byId('doc-oc-edit').value.trim() : undefined,
          osEmail: byId('doc-os-edit') ? byId('doc-os-edit').value.trim() : undefined,
          otEmail: byId('doc-ot-edit') ? byId('doc-ot-edit').value.trim() : undefined,
          revision: state.revision
        }));
        notice('Package details saved.');
      } else if (event.target.id === 'tpl-new-form') {
        const file = byId('tpl-new-file').files[0];
        if (!file) throw new Error('Choose a template file.');
        if (file.size > 8 * 1024 * 1024) throw new Error('Use a file smaller than 8 MB.');
        const pkg = state.DocPackages.find(row => row.id === openDocPackageId);
        const base64 = await fileToBase64(file);
        const response = await call({
          action: 'saveDocTemplate',
          revision: state.revision,
          row: { id: '', version: 0, activityType: pkg ? pkg.activityType : 'AGM', title: byId('tpl-new-title').value.trim(), fileName: file.name, mime: file.type || '', fileId: '', versionLabel: String(new Date().getFullYear()) + '.1', active: true, archived: false },
          fileBase64: base64
        }, 'Uploading template…');
        state = response.state;
        sync = response.sync || sync;
        render();
        notice('Template saved.');
      } else {
        const result = await call({ action: 'setAdmins', emails: byId('admin-emails').value.split(/\s+/).filter(Boolean) });
        admins = Array.isArray(result) ? result : (result.admins || []);
        render(); notice('Administrator access updated.');
      }
    } catch (error) { if (byId('editor').open) byId('editor-message').textContent = error.message; else notice(error.message, true); }
    finally { submit.disabled = false; }
  });
  function showLoginGate(message) {
    const clientId = (window.KPT_CONFIG && window.KPT_CONFIG.googleClientId) || '';
    byId('page-title').textContent = 'Sign in';
    byId('content').innerHTML = '<section class="card"><div class="eyebrow">TCCD Member System</div><h2>Sign in</h2><p class="muted">' + escape(message || 'Sign in with the Gmail account granted access by the Owner.') + '</p>'
      + (clientId
        ? '<div id="gis-button" style="margin:18px 0"></div><p class="hint">Secretary, Treasurer, Organizing Chairman, or Owner Gmail only.</p>'
        : '<p class="hint">Set <strong>googleClientId</strong> in config.public.json (Google OAuth Web client ID) to enable sign-in on this page.</p>')
      + '</section>';
    if (!clientId) return;
    const startGis = () => {
      if (!window.google || !google.accounts || !google.accounts.id) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: response => {
          window.KPTTransport.loginWithIdToken(response.credential)
            .then(() => refresh())
            .catch(error => notice(error.message, true));
        }
      });
      const holder = byId('gis-button');
      if (holder) google.accounts.id.renderButton(holder, { theme: 'outline', size: 'large', text: 'signin_with' });
    };
    if (window.google && google.accounts) startGis();
    else window.addEventListener('load', startGis, { once: true });
  }
  window.addEventListener('beforeunload', event => {
    if (hubDirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  byId('editor').addEventListener('close', () => { telegramBinding = null; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (isOcOnly() || hubHas('os') || hubHas('ot') || hubHas('oc')) hubLiveTick(true);
  });
  window.addEventListener('focus', () => {
    // Focus only runs the lightweight live probe — never bootstrap, never overwrite dirty drafts.
    if (user && !document.hidden) hubLiveTick(true);
  });
  refresh().catch(error => {
    const message = String(error.message || error);
    if (/sign-in|sign in|login/i.test(message)) {
      notice(message, true);
      showLoginGate(message);
      return;
    }
    notice(message, true);
    byId('content').innerHTML = '<div class="card empty"><strong>Records could not be loaded</strong>Check administrator authorisation, then use Reload data.</div>';
  });
})();
