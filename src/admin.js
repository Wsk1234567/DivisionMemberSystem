(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const nav = [['Overview', 'Dashboard'], ['Phase', 'TCCD Data System Phase'], ['Members', 'Members'], ['Activities', 'Attendance'], ['Exams', 'Examinations'], ['Duty', 'Annual Duty'], ['Awards', 'Awards'], ['Data', 'Data Center'], ['Setup', 'System Setup'], ['Import', 'Import & export'], ['Trash', 'Recycle Bin'], ['Settings', 'Settings & backups']];
  const phases = [
    { title: '学生名单进入系统', owner: 'Secretary', goal: '先把学生名单安全地放进系统。', steps: ['在 Excel 的 Members sheet 填写 name 和 sjamId；sjamId 可以暂时留空。', 'id、version 和 status 留空，系统会自动建立内部 ID，并设为 Active。', '先按 Preview Import 检查，再按 Confirm Import 正式加入资料。'] },
    { title: '补完整学生资料', owner: 'Owner & Secretary', goal: '名单确认后，再慢慢补齐个人资料。', steps: ['补上 ic、race、form、joined 和正确的 status。', '不需要一次填完，空白资料以后仍然可以补上。', '补资料时使用系统内部 id，原本的历史记录不会断开。'] },
    { title: '准备考试与奖项类别', owner: 'Owner & Secretary', goal: '先整理好以后会使用的选项。', steps: ['在 System Setup 设置 Exam、Award、Promotion 和其他类别。', '确认奖项名称、类别和等级，避免之后重复输入不同写法。', '不再使用的选项可以 Archive，旧记录会继续保留。'] },
    { title: '开始记录活动与出席', owner: 'Secretary', goal: '建立活动，并记录谁有参加。', steps: ['建立 Activity，选择 DIM、Inspection、Exam 或 Other。', '在 Attendance 批量勾选出席学生。', '同一活动可以有多个类别，但同一学生每场 DIM 最多计算一次。'] },
    { title: '记录考试、Duty 与 Efficient', owner: 'Owner & Secretary', goal: '完成每年的参与和效率资料。', steps: ['记录 Exam 结果，以及每位学生每年的 Duty Hour。', '系统会检查 Duty、DIM、Inspection 和 Exam Participation。', '资料齐全后显示 Efficient 或 Not Efficient；资料不足显示 Pending。'] },
    { title: '奖项、权限、备份与正式使用', owner: 'Owner', goal: '完成最后检查，再放入真实完整资料。', steps: ['整理 Awards，并检查公开页面没有 IC、证书编号或内部备注。', '确认 Owner 与 Secretary 权限，以及每日 Backup。', '完成手机、Excel 导入、同步失败和恢复测试后正式使用。'] }
  ];
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h4"/></svg>';
  const titles = Object.fromEntries(nav);
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
  let setupDefaultsPreview;
  let backups = [];
  let busy = false;
  byId('navigation').innerHTML = nav.map(([key, label]) => '<button type="button" data-nav="' + key + '">' + icon + escape(label) + '</button>').join('');
  byId('year').value = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4)) || new Date().getFullYear();
  const year = () => Number(byId('year').value);
  function notice(message, error) { byId('notice').className = 'message' + (error ? ' error' : ''); byId('notice').textContent = message || ''; }
  function busyNotice(message) { byId('notice').className = 'message working'; byId('notice').innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + escape(message); }
  function pill(value) { return '<span class="pill ' + (['Active', 'Efficient', 'Pending', 'Pass', 'Fail', 'Absent', 'Current', 'Completed', 'Upcoming', 'Ready', 'Missing'].includes(value) ? value : '') + '">' + escape(value) + '</span>'; }
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
    return '<p class="page-intro">Your division’s records, connected in one place. Select a year to review annual participation and efficiency.</p><div class="metrics">' + metrics.map(([label, value, caption]) => '<div class="metric"><div class="label">' + label + '</div><div class="value">' + value + '</div><small>' + caption + '</small></div>').join('') + '</div><div class="grid-two"><section class="card"><div class="section-heading" style="margin-top:0"><h2>Recent activities</h2>' + button('Manage', 'navigate', 'Activities') + '</div>' + (activities.length ? activities.map(row => '<div class="activity-line"><div><strong>' + escape(row.name) + '</strong><small>' + escape(row.date + ' · ' + row.tags.join(' / ')) + '</small></div>' + button('Attendance', 'attendance', row.id) + '</div>').join('') : '<p class="muted">No activities recorded for this year.</p>') + '</section><section class="card"><h2>Annual efficiency</h2><p class="muted">All conditions must be met within ' + year() + '.</p><ul class="rule-list"><li><span>Duty service</span><strong>≥ 60 hours</strong></li><li><span>DIM participation</span><strong>≥ 12 activities</strong></li><li><span>Inspection</span><strong>Participated</strong></li><li><span>Examination</span><strong>Participated</strong></li></ul><p class="inline-help">Pass or Fail both count as participation. Absent does not. Pending results count only when participation is confirmed.</p></section></div><section class="card" style="margin-top:24px"><h2>Recent changes</h2>' + table(['When', 'Administrator', 'Change'], (state.audit || []).slice(-5).reverse().map(row => [escape(new Date(row.at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })), escape(row.actor), escape(row.action)])) + '</section>';
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
    return '<div class="grid-two"><section class="card"><div class="eyebrow">Batch updates</div><h2>Import an Excel file</h2><p class="muted">Phase 1 新学生只需填写 Members sheet 的 name；sjamId 可以填写或留空。id、version、status 留空即可。</p><div class="file-input"><label for="excel-file">Choose an .xlsx file (maximum 10 MB)</label><br><input id="excel-file" type="file" accept=".xlsx"></div><div class="toolbar">' + button('Download template', 'template') + button('Preview import', 'previewImport') + '</div><p class="hint">系统会为新学生建立内部 ID，并把空白 status 设为 Active。其他 sheets 可以完全留空。Existing records 必须保留原本的 ID 和 version。</p></section><section class="card"><div class="eyebrow">Portable records</div><h2>Export & backup</h2><p class="muted">Export the current private records as Excel. Includes IDs and versions for future updates.</p><div class="toolbar">' + button('Export all records', 'export') + button('Export with annual summary', 'exportSummary') + '</div><p class="hint">Store exports privately; they contain IC and other personal records.</p></section></div><section id="import-preview" style="margin-top:24px"></section>';
  }
  function trashView() {
    const rows = state.trash || [];
    return '<p class="page-intro">Owner 删除的资料会先放在这里。Restore 会恢复整组关联资料；Permanently delete 无法从系统恢复，但执行前会自动建立私人 Backup。</p>' + (user.owner ? table(['Deleted record', 'Deleted at', 'Deleted by', 'Included records', 'Actions'], rows.map(row => [escape(row.rootTable + ' · ' + row.label), escape(new Date(row.deletedAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })), escape(row.actor), escape(Object.entries(row.counts || {}).map(([name, count]) => name + ': ' + count).join(' · ')), '<div class="row-tools">' + button('Restore', 'restoreTrash', row.id) + button('Permanently delete', 'purgeTrash', row.id) + '</div>'])) : '<div class="card"><p class="muted">Only the Owner can view and manage deleted records.</p></div>');
  }
  function settingsView() {
    return '<div class="grid-two"><section class="card"><h2>Your administrator access</h2><p><strong>' + escape(user.email) + '</strong><br><small>' + (user.owner ? 'Owner' : 'Administrator') + '</small></p><p class="muted">Both administrators can maintain everyday records. Only the owner can authorise administrators and restore a full backup.</p>' + (user.owner ? '<form id="admin-access-form"><div class="field"><label for="admin-emails">Administrator Gmail addresses, one per line</label><textarea id="admin-emails">' + escape(admins.join('\n')) + '</textarea></div><button class="button primary" type="submit" style="margin-top:12px">Save administrator access</button></form>' : '') + '</section><section class="card"><h2>Private backups</h2><p class="muted">Daily backups keep the latest 30 copies. Import and restore create an additional safety copy before changing data.</p><div class="toolbar">' + button('Back up now', 'backup') + button('Refresh backup list', 'listBackups') + (user.owner ? button('Enable daily backup', 'installBackup') : '') + '</div><div id="backup-list" style="margin-top:18px"></div></section></div><section class="card" style="margin-top:24px"><h2>Public directory sync</h2><p class="muted">Only the approved public fields are copied to the member directory. If a publish fails, private records remain saved and you can retry.</p>' + button('Retry public update', 'retrySync') + '<p class="sync-line">Private revision: ' + state.revision + ' · Last saved: ' + escape(state.updatedAt ? new Date(state.updatedAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }) : 'No changes yet') + '</p></section>';
  }
  function render() {
    if (!state) return;
    byId('page-title').textContent = titles[view];
    document.querySelectorAll('[data-nav]').forEach(element => { element.classList.toggle('active', element.dataset.nav === view); element.setAttribute('aria-current', element.dataset.nav === view ? 'page' : 'false'); });
    const views = { Overview: overview, Phase: phaseView, Members: memberList, Activities: activityList, Exams: examList, Duty: dutyList, Awards: awardList, Data: dataList, Setup: setupView, Import: importView, Trash: trashView, Settings: settingsView };
    byId('content').innerHTML = views[view]();
    byId('sync-notice').hidden = sync.ok;
    byId('sync-notice').innerHTML = sync.ok ? '' : 'Private data is saved. The public directory is awaiting an update. ' + button('Retry', 'retrySync');
    if (view === 'Settings' && backups.length) renderBackups();
    if (view === 'Import' && importPreview) renderImport();
  }
  const busyLabels = { bootstrap: 'Loading records…', save: 'Saving records…', attendance: 'Saving attendance…', previewImport: 'Checking Excel file…', commitImport: 'Importing Excel changes…', applySetupDefaults: 'Applying system setup…', deleteRecord: 'Moving to Recycle Bin…', deleteAllMembers: 'Moving students to Recycle Bin…', restoreTrash: 'Restoring from Recycle Bin…', purgeTrash: 'Deleting permanently…', retrySync: 'Updating public directory…', backup: 'Creating private backup…', listBackups: 'Loading backups…', restore: 'Restoring backup…', setAdmins: 'Saving administrator access…', setCurrentPhase: 'Updating phase…', installBackup: 'Installing daily backup…' };
  async function call(request, label) {
    if (busy) throw new Error('Please wait for the current operation.');
    busy = true;
    document.body.setAttribute('aria-busy', 'true');
    busyNotice(label || busyLabels[request.action] || 'Working…');
    try { return await window.KPTTransport.call(request); } finally { busy = false; document.body.removeAttribute('aria-busy'); }
  }
  async function refresh() {
    const response = await call({ action: 'bootstrap' }, 'Loading records…');
    state = response.state;
    user = response.user;
    sync = response.sync;
    admins = response.admins || [];
    currentPhase = response.currentPhase || 1;
    byId('account').textContent = user.email;
    byId('role').textContent = user.owner ? 'Owner' : 'Administrator';
    byId('demo-banner').hidden = !window.KPTTransport.demo;
    const publicUrl = window.KPTTransport.publicUrl || '';
    if (/^https:\/\/[\w.-]+\.github\.io\//.test(publicUrl) || window.KPTTransport.demo) byId('public-link').href = publicUrl || 'index.html';
    else byId('public-link').hidden = true;
    render();
  }
  function applySave(response) { state = response.state; sync = response.sync || sync; importPreview = null; importFile = null; setupDefaultsPreview = null; render(); notice(response.unchanged ? 'No changes to import.' : 'Records saved.' + (sync.ok ? ' Public directory is up to date.' : ' Public update needs a retry.')); }
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
    if (!element || !importPreview) return;
    element.innerHTML = '<div class="card"><h2>Import preview</h2><p>' + importPreview.changes.length + ' proposed changes · ' + importPreview.errors.length + ' errors</p>' + (importPreview.errors.length ? table(['Sheet', 'Excel row', 'Problem'], importPreview.errors.slice(0, 100).map(row => [escape(row.sheet), escape(row.row || '—'), escape(row.message)])) : table(['Sheet', 'Excel row', 'Record', 'Change'], importPreview.changes.slice(0, 100).map(row => [escape(row.sheet), escape(row.row), escape(row.id), escape(row.change)]))) + '<p class="hint">Showing the first 100 entries. No data has been changed. A private backup is created before applying an import.</p>' + (!importPreview.errors.length && importPreview.changes.length ? '<button class="button primary" type="button" data-action="commitImport" style="margin-top:18px">Confirm and import ' + importPreview.changes.length + ' changes</button>' : '') + '</div>';
  }
  function renderBackups() {
    if (!byId('backup-list')) return;
    byId('backup-list').innerHTML = table(['Backup', 'Action'], backups.slice(0, 30).map(row => [escape(row.name), user.owner ? button('Restore', 'restore', row.id) : 'Owner only']));
  }
  async function action(element) {
    const { action: name, id, table: tableName } = element.dataset;
    if (name === 'close') { byId('editor').close(); return; }
    if (name === 'navigate') { view = id; query = ''; page = 0; render(); return; }
    if (name === 'add' || name === 'edit') { openEditor(tableName, id); return; }
    if (name === 'attendance') { openAttendance(id); return; }
    if (name === 'detail') { openDetail(id); return; }
    if (name === 'recordEligible') { const [memberId, catalogId] = id.split('|'); openEditor('Awards', '', { memberId, catalogId, date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }) }); return; }
    if (name === 'duty') { const existing = state.Duty.find(row => row.memberId === id && row.year === year()); openEditor('Duty', existing && existing.id, { memberId: id, year: year(), hours: '' }); return; }
    if (name === 'enrolment') { openEditor('Enrolments', '', { memberId: id, year: year() }); return; }
    if (name === 'previous') { page = Math.max(0, page - 1); render(); return; }
    if (name === 'next') { if ((page + 1) * 40 < Number(id)) page++; render(); return; }
    if (name === 'selectAll' || name === 'clearAll') { document.querySelectorAll('#attendance-form input[name="present"]').forEach(input => { input.checked = name === 'selectAll'; }); return; }
    if (name === 'template') { KPTWorkbook.download(state, true); return; }
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
    if (name === 'archive') {
      const row = KPT.copy(state[tableName].find(item => item.id === id));
      if (!confirm((row.archived ? 'Unarchive' : 'Archive') + ' this record? History will be kept.')) return;
      row.archived = !row.archived;
      applySave(await call({ action: 'save', table: tableName, row, revision: state.revision, year: year() }));
      return;
    }
    if (name === 'previewImport') {
      const file = byId('excel-file').files[0];
      if (!file || !/\.xlsx$/i.test(file.name)) throw new Error('Choose an .xlsx file.');
      if (file.size > 10 * 1024 * 1024) throw new Error('Use a file smaller than 10 MB.');
      const parsed = KPTWorkbook.parse(await file.arrayBuffer());
      importFile = parsed.workbook;
      importPreview = parsed.errors.length ? { changes: [], errors: parsed.errors, revision: state.revision } : await call({ action: 'previewImport', workbook: importFile, revision: state.revision });
      renderImport();
      return;
    }
    if (name === 'commitImport') {
      if (!importPreview || importPreview.errors.length || !importFile) throw new Error('Preview a valid file first.');
      element.disabled = true;
      try { applySave(await call({ action: 'commitImport', workbook: importFile, revision: importPreview.revision })); } finally { element.disabled = false; }
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
    const element = event.target.closest('[data-nav]');
    if (!element || busy || !state) return;
    view = element.dataset.nav; query = ''; page = 0; notice(''); render();
  });
  byId('close-editor').addEventListener('click', () => { if (!busy) byId('editor').close(); });
  byId('reload').addEventListener('click', () => { if (!busy) { importPreview = null; importFile = null; refresh().then(() => notice('Current records loaded.')).catch(error => notice(error.message, true)); } });
  byId('year').addEventListener('change', () => { if (!Number.isInteger(year()) || year() < 1900 || year() > 2200) { notice('Choose a year between 1900 and 2200.', true); return; } page = 0; render(); });
  document.addEventListener('input', event => {
    if (event.target.id === 'filter') { const cursor = event.target.selectionStart; query = event.target.value; page = 0; render(); byId('filter').focus(); byId('filter').setSelectionRange(cursor, cursor); }
  });
  document.addEventListener('change', event => {
    if (dialogTable === 'Exams' && ['field-activityId', 'field-memberId'].includes(event.target.id)) updateExamLink();
    if (event.target.id === 'excel-file') { importPreview = null; importFile = null; if (byId('import-preview')) byId('import-preview').innerHTML = ''; }
  });
  document.addEventListener('submit', async event => {
    if (!['record-form', 'attendance-form', 'admin-access-form'].includes(event.target.id)) return;
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
      } else {
        admins = await call({ action: 'setAdmins', emails: byId('admin-emails').value.split(/\s+/).filter(Boolean) });
        render(); notice('Administrator access updated.');
      }
    } catch (error) { if (byId('editor').open) byId('editor-message').textContent = error.message; else notice(error.message, true); }
    finally { submit.disabled = false; }
  });
  refresh().catch(error => { notice(error.message, true); byId('content').innerHTML = '<div class="card empty"><strong>Records could not be loaded</strong>Check administrator authorisation, then use Reload data.</div>'; });
})();
