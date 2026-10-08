(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const nav = [['Overview', 'Dashboard'], ['Members', 'Members'], ['Activities', 'Attendance'], ['Exams', 'Examinations'], ['Duty', 'Annual Duty'], ['Awards', 'Awards'], ['Data', 'Data Center'], ['Catalog', 'Catalogue'], ['Import', 'Import & export'], ['Settings', 'Settings & backups']];
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h4"/></svg>';
  const titles = Object.fromEntries(nav);
  const memberOptions = () => state.Members.map(row => [row.id, row.name + ' · ' + (row.sjamId || row.id)]);
  const definitions = {
    Members: [['name', 'Full name', 'text', true], ['ic', 'IC', 'text'], ['sjamId', 'SJAM ID (optional)', 'text'], ['race', 'Race', 'text'], ['form', 'Tingkatan', 'text'], ['joined', 'Date joined', 'date'], ['status', 'Status', KPT.statuses]],
    Activities: [['name', 'Activity name', 'text', true], ['date', 'Date', 'date', true], ['tags', 'Categories', 'tags'], ['examType', 'Exam category (if tagged Exam)', () => ['', ...state.Catalog.filter(row => row.kind === 'Exam' && !row.archived).map(row => row.name)]]],
    Exams: [['memberId', 'Student', memberOptions, true], ['activityId', 'Linked activity (optional)', () => [['', 'Standalone examination'], ...state.Activities.filter(row => !row.archived && row.tags.includes('Exam')).map(row => [row.id, row.name + ' · ' + row.date])]], ['type', 'Exam type', () => state.Catalog.filter(row => row.kind === 'Exam' && !row.archived).map(row => row.name), true], ['date', 'Exam date', 'date', true], ['result', 'Result', KPT.results], ['attended', 'Participation confirmed', 'checkbox'], ['certificate', 'Certificate number', 'text']],
    Duty: [['memberId', 'Student', memberOptions, true], ['year', 'Year', 'number', true], ['hours', 'Total hours (blank = not recorded)', 'number']],
    Awards: [['memberId', 'Student', memberOptions, true], ['category', 'Award category', KPT.categories], ['name', 'Award / recognition', () => [...new Set(state.Catalog.filter(row => row.kind === 'Award' && !row.archived).map(row => row.name))], true], ['date', 'Award date', 'date', true], ['level', 'Level / rank', () => [...new Set(['', ...state.Catalog.filter(row => row.kind === 'Award' && !row.archived).map(row => row.level)])]], ['certificate', 'Certificate number (private)', 'text'], ['notes', 'Internal notes (private)', 'textarea']],
    Catalog: [['kind', 'Type', ['Exam', 'Award']], ['category', 'Award category (awards only)', ['', ...KPT.categories]], ['name', 'Name', 'text', true], ['level', 'Level / rank (awards only)', 'text']],
    Enrolments: [['memberId', 'Student', memberOptions, true], ['year', 'Year', 'number', true], ['form', 'Tingkatan for this year', 'text'], ['status', 'Status for this year', KPT.statuses]]
  };
  let state;
  let user;
  let admins = [];
  let sync = { ok: true };
  let view = 'Overview';
  let query = '';
  let page = 0;
  let dialogRecord;
  let dialogTable;
  let dialogRevision;
  let importFile;
  let importPreview;
  let backups = [];
  let busy = false;
  byId('navigation').innerHTML = nav.map(([key, label]) => '<button type="button" data-nav="' + key + '">' + icon + escape(label) + '</button>').join('');
  byId('year').value = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).slice(0, 4)) || new Date().getFullYear();
  const year = () => Number(byId('year').value);
  function notice(message, error) { byId('notice').className = 'message' + (error ? ' error' : ''); byId('notice').textContent = message || ''; }
  function pill(value) { return '<span class="pill ' + (['Active', 'Efficient', 'Pending', 'Pass', 'Fail', 'Absent'].includes(value) ? value : '') + '">' + escape(value) + '</span>'; }
  function memberName(id) { const row = state.Members.find(member => member.id === id); return row ? row.name : id; }
  function button(label, action, id, table) { return '<button class="button small" type="button" data-action="' + action + '" data-id="' + escape(id || '') + '" data-table="' + escape(table || '') + '">' + escape(label) + '</button>'; }
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
  function memberList() {
    const rows = state.Members.filter(match).sort((first, second) => first.name.localeCompare(second.name));
    return listHead('Search name, SJAM ID or IC', 'Members', 'Add student') + table(['Name', 'SJAM ID', 'IC · private', 'Tingkatan', 'Status', 'Actions'], paginate(rows).map(row => [escape(row.name) + '<br><small>' + escape(row.id) + '</small>', escape(row.sjamId || 'Not assigned'), escape(row.ic || '—'), escape(row.form || '—'), pill(row.status), '<div class="row-tools">' + button('View', 'detail', row.id) + button('Edit', 'edit', row.id, 'Members') + '</div>'])) + pager(rows.length);
  }
  function activityList() {
    const rows = state.Activities.filter(row => Number(row.date.slice(0, 4)) === year() && match(row)).sort((first, second) => second.date.localeCompare(first.date));
    return '<p class="page-intro">Create an activity, select one or more categories, then mark attendance. Examination activities generate linked exam records from attendance.</p>' + listHead('Activities for ' + year(), 'Activities', 'Add activity') + table(['Activity', 'Date', 'Categories', 'Present', 'Actions'], paginate(rows).map(row => [escape(row.name) + (row.archived ? ' ' + pill('Archived') : ''), escape(row.date), escape(row.tags.join(' / ')), state.Attendance.filter(item => item.activityId === row.id && item.present).length, '<div class="row-tools">' + (!row.archived ? button('Attendance', 'attendance', row.id) : '') + button('Edit', 'edit', row.id, 'Activities') + button(row.archived ? 'Unarchive' : 'Archive', 'archive', row.id, 'Activities') + '</div>'])) + pager(rows.length);
  }
  function examList() {
    const rows = state.Exams.filter(row => Number(row.date.slice(0, 4)) === year() && match(row)).sort((first, second) => second.date.localeCompare(first.date));
    return listHead('Examinations for ' + year(), 'Exams', 'Add exam record') + table(['Student', 'Exam', 'Date', 'Result', 'Participation', 'Certificate · private', 'Actions'], paginate(rows).map(row => [escape(memberName(row.memberId)), escape(row.type) + (row.archived ? ' ' + pill('Archived') : '') + (row.activityId ? '<br><small>Linked activity</small>' : ''), escape(row.date), pill(row.result), row.attended ? 'Confirmed' : 'Not confirmed', escape(row.certificate || '—'), '<div class="row-tools">' + button('Edit', 'edit', row.id, 'Exams') + button(row.archived ? 'Unarchive' : 'Archive', 'archive', row.id, 'Exams') + '</div>'])) + pager(rows.length);
  }
  function dutyList() {
    const rows = annualMembers().filter(match);
    return '<p class="page-intro">Enter each member’s total hours for ' + year() + '. Leave blank when the total is not known. Individual duty events will be added in a later version.</p>' + listHead('Annual Duty hours', null) + table(['Student', 'SJAM ID', 'Hours', 'Threshold', 'Actions'], paginate(rows).map(member => { const duty = state.Duty.find(row => row.memberId === member.id && row.year === year()); const hours = duty ? duty.hours : null; return [escape(member.name), escape(member.sjamId || '—'), hours === null ? '<span class="muted">Not recorded</span>' : escape(hours), pill(hours === null ? 'Pending' : hours >= 60 ? 'Efficient' : 'Below 60'), button('Enter hours', 'duty', member.id)]; })) + pager(rows.length);
  }
  function awardList() {
    const rows = state.Awards.filter(match).sort((first, second) => second.date.localeCompare(first.date));
    return '<p class="page-intro">Saved awards appear in the public directory. Certificate numbers and internal notes remain private. Archived awards are not published.</p>' + listHead('Awards & recognition', 'Awards', 'Record award') + table(['Student', 'Award', 'Category', 'Date', 'Level', 'Actions'], paginate(rows).map(row => [escape(memberName(row.memberId)), escape(row.name) + (row.archived ? ' ' + pill('Archived') : ''), escape(row.category), escape(row.date), escape(row.level || '—'), '<div class="row-tools">' + button('Edit', 'edit', row.id, 'Awards') + button(row.archived ? 'Unarchive' : 'Archive', 'archive', row.id, 'Awards') + '</div>'])) + pager(rows.length);
  }
  function summaryRows() {
    return annualMembers().map(member => Object.assign({ id: member.id, name: member.name, sjamId: member.sjamId, ic: member.ic, form: member.form, status: member.annualStatus }, KPT.summary(state, member.id, year())));
  }
  function dataList() {
    const rows = summaryRows().filter(match);
    return '<p class="page-intro">Private annual summary. Historical Tingkatan and status use the saved annual enrolment when available.</p>' + listHead('Data Center · ' + year(), null) + '<div class="toolbar" style="margin-bottom:18px">' + button('Edit annual enrolment', 'add', '', 'Enrolments') + button('Export with summary', 'exportSummary') + '</div>' + table(['Student', 'SJAM ID', 'IC · private', 'Tingkatan', 'Status', 'Duty', 'DIM', 'Inspection', 'Exam attended', 'Efficiency', 'Annual profile'], paginate(rows).map(row => { const annual = state.Enrolments.find(item => item.memberId === row.id && item.year === year()); return [escape(row.name), escape(row.sjamId || '—'), escape(row.ic || '—'), escape(row.form || '—'), pill(row.status), row.hours === null ? 'Pending' : escape(row.hours), row.dim, row.inspection ? 'Yes' : 'Not recorded', row.exam ? 'Yes' : 'Not recorded', pill(row.efficient), annual ? button('Edit', 'edit', annual.id, 'Enrolments') : button('Record', 'enrolment', row.id)]; })) + pager(rows.length);
  }
  function catalogList() {
    const rows = state.Catalog.filter(match);
    return '<p class="page-intro">Maintain examination categories and award options. Archive an option to stop new selections while keeping historical records.</p>' + listHead('Catalogue', 'Catalog', 'Add option') + table(['Type', 'Category', 'Name', 'Level', 'Status', 'Actions'], paginate(rows).map(row => [escape(row.kind), escape(row.category || '—'), escape(row.name), escape(row.level || '—'), row.archived ? 'Archived' : 'Available', '<div class="row-tools">' + button('Edit', 'edit', row.id, 'Catalog') + button(row.archived ? 'Unarchive' : 'Archive', 'archive', row.id, 'Catalog') + '</div>'])) + pager(rows.length);
  }
  function importView() {
    return '<div class="grid-two"><section class="card"><div class="eyebrow">Batch updates</div><h2>Import an Excel file</h2><p class="muted">Use the fixed template. You will review changes and errors before saving anything.</p><div class="file-input"><label for="excel-file">Choose an .xlsx file (maximum 10 MB)</label><br><input id="excel-file" type="file" accept=".xlsx"></div><div class="toolbar">' + button('Download template', 'template') + button('Preview import', 'previewImport') + '</div><p class="hint">For existing records, export first and keep their ID and version. Missing rows do not delete records.</p></section><section class="card"><div class="eyebrow">Portable records</div><h2>Export & backup</h2><p class="muted">Export the current private records as Excel. Includes IDs and versions for future updates.</p><div class="toolbar">' + button('Export all records', 'export') + button('Export with annual summary', 'exportSummary') + '</div><p class="hint">Store exports privately; they contain IC and other personal records.</p></section></div><section id="import-preview" style="margin-top:24px"></section>';
  }
  function settingsView() {
    return '<div class="grid-two"><section class="card"><h2>Your administrator access</h2><p><strong>' + escape(user.email) + '</strong><br><small>' + (user.owner ? 'Owner' : 'Administrator') + '</small></p><p class="muted">Both administrators can maintain everyday records. Only the owner can authorise administrators and restore a full backup.</p>' + (user.owner ? '<form id="admin-access-form"><div class="field"><label for="admin-emails">Administrator Gmail addresses, one per line</label><textarea id="admin-emails">' + escape(admins.join('\n')) + '</textarea></div><button class="button primary" type="submit" style="margin-top:12px">Save administrator access</button></form>' : '') + '</section><section class="card"><h2>Private backups</h2><p class="muted">Daily backups keep the latest 30 copies. Import and restore create an additional safety copy before changing data.</p><div class="toolbar">' + button('Back up now', 'backup') + button('Refresh backup list', 'listBackups') + (user.owner ? button('Enable daily backup', 'installBackup') : '') + '</div><div id="backup-list" style="margin-top:18px"></div></section></div><section class="card" style="margin-top:24px"><h2>Public directory sync</h2><p class="muted">Only the approved public fields are copied to the member directory. If a publish fails, private records remain saved and you can retry.</p>' + button('Retry public update', 'retrySync') + '<p class="sync-line">Private revision: ' + state.revision + ' · Last saved: ' + escape(state.updatedAt ? new Date(state.updatedAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }) : 'No changes yet') + '</p></section>';
  }
  function render() {
    if (!state) return;
    byId('page-title').textContent = titles[view];
    document.querySelectorAll('[data-nav]').forEach(element => { element.classList.toggle('active', element.dataset.nav === view); element.setAttribute('aria-current', element.dataset.nav === view ? 'page' : 'false'); });
    const views = { Overview: overview, Members: memberList, Activities: activityList, Exams: examList, Duty: dutyList, Awards: awardList, Data: dataList, Catalog: catalogList, Import: importView, Settings: settingsView };
    byId('content').innerHTML = views[view]();
    byId('sync-notice').hidden = sync.ok;
    byId('sync-notice').innerHTML = sync.ok ? '' : 'Private data is saved. The public directory is awaiting an update. ' + button('Retry', 'retrySync');
    if (view === 'Settings' && backups.length) renderBackups();
    if (view === 'Import' && importPreview) renderImport();
  }
  async function call(request) {
    if (busy) throw new Error('Please wait for the current operation.');
    busy = true;
    document.body.setAttribute('aria-busy', 'true');
    try { return await window.KPTTransport.call(request); } finally { busy = false; document.body.removeAttribute('aria-busy'); }
  }
  async function refresh() {
    const response = await call({ action: 'bootstrap' });
    state = response.state;
    user = response.user;
    sync = response.sync;
    admins = response.admins || [];
    byId('account').textContent = user.email;
    byId('role').textContent = user.owner ? 'Owner' : 'Administrator';
    byId('demo-banner').hidden = !window.KPTTransport.demo;
    const publicUrl = window.KPTTransport.publicUrl || '';
    if (/^https:\/\/[\w.-]+\.github\.io\//.test(publicUrl) || window.KPTTransport.demo) byId('public-link').href = publicUrl || 'index.html';
    else byId('public-link').hidden = true;
    render();
  }
  function applySave(response) { state = response.state; sync = response.sync || sync; importPreview = null; importFile = null; render(); notice(response.unchanged ? 'No changes to import.' : 'Records saved.' + (sync.ok ? ' Public directory is up to date.' : ' Public update needs a retry.')); }
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
    dialogRecord = KPT.copy(state[tableName].find(row => row.id === id) || Object.assign({ status: 'Active', archived: false, tags: ['DIM'], date: year() + '-01-01', year: year(), result: 'Pending', attended: false, kind: 'Exam', category: tableName === 'Catalog' ? '' : 'Probadge' }, defaults || {}));
    dialogRevision = state.revision;
    byId('editor-title').textContent = (id ? 'Edit ' : 'Add ') + ({ Members: 'student', Activities: 'activity', Exams: 'exam record', Duty: 'annual Duty', Awards: 'award', Catalog: 'catalogue option', Enrolments: 'annual enrolment' }[tableName]);
    byId('editor-message').textContent = '';
    byId('editor-body').innerHTML = '<form id="record-form"><div class="form-grid">' + definitions[tableName].map(definition => fieldControl(definition, dialogRecord)).join('') + '</div>' + (tableName === 'Members' ? '<p class="hint">An annual Tingkatan/status snapshot will also be recorded for ' + year() + '. The internal student ID stays unchanged.</p>' : '') + (tableName === 'Exams' ? '<p class="hint">Linked exam participation, date and type follow its activity. Change attendance on the activity, then record Pass/Fail or certificate here.</p>' : '') + '<div class="dialog-actions"><button class="button" type="button" data-action="close">Cancel</button><button class="button primary" type="submit">Save record</button></div></form>';
    if (tableName === 'Awards') updateAwardOptions();
    if (tableName === 'Exams') updateExamLink();
    byId('editor').showModal();
  }
  function updateAwardOptions() {
    const category = byId('field-category').value;
    const available = state.Catalog.filter(row => row.kind === 'Award' && row.category === category && (!row.archived || row.name === dialogRecord.name));
    const name = byId('field-name').value || dialogRecord.name;
    byId('field-name').innerHTML = options([...new Set(available.map(row => row.name))], name);
    byId('field-level').innerHTML = options(available.filter(row => row.name === byId('field-name').value).map(row => row.level), byId('field-level').value || dialogRecord.level);
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
    byId('editor-body').innerHTML = '<div class="detail-grid">' + [['Internal ID', member.id], ['SJAM ID', member.sjamId || 'Not assigned'], ['IC · private', member.ic || '—'], ['Race', member.race || '—'], ['Joined', member.joined || '—'], ['Status', member.status]].map(([label, value]) => '<div><small>' + label + '</small><strong>' + escape(value) + '</strong></div>').join('') + '</div><h3>' + year() + ' efficiency · ' + pill(summary.efficient) + '</h3>' + table(['Duty', 'DIM', 'Inspection', 'Examination'], [[summary.hours === null ? 'Pending' : escape(summary.hours) + ' hours', summary.dim, summary.inspection ? 'Participated' : 'Not recorded', summary.exam ? 'Participated' : 'Not recorded']]) + '<h3 style="margin-top:24px">Examination history</h3>' + table(['Date', 'Exam', 'Result', 'Certificate'], state.Exams.filter(row => row.memberId === id && !row.archived).map(row => [escape(row.date), escape(row.type), pill(row.result), escape(row.certificate)])) + '<h3 style="margin-top:24px">Awards</h3>' + table(['Date', 'Award', 'Level'], state.Awards.filter(row => row.memberId === id && !row.archived).map(row => [escape(row.date), escape(row.name), escape(row.level)])) + '<h3 style="margin-top:24px">Attendance history</h3>' + table(['Date', 'Activity', 'Categories', 'Attendance'], state.Attendance.filter(row => row.memberId === id).map(row => { const activity = state.Activities.find(item => item.id === row.activityId); return [escape(activity.date), escape(activity.name), escape(activity.tags.join(' / ')), row.present ? 'Present' : 'Absent']; })) + '<div class="dialog-actions">' + button('Close', 'close') + '</div>';
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
    if (name === 'duty') { const existing = state.Duty.find(row => row.memberId === id && row.year === year()); openEditor('Duty', existing && existing.id, { memberId: id, year: year(), hours: '' }); return; }
    if (name === 'enrolment') { openEditor('Enrolments', '', { memberId: id, year: year() }); return; }
    if (name === 'previous') { page = Math.max(0, page - 1); render(); return; }
    if (name === 'next') { if ((page + 1) * 40 < Number(id)) page++; render(); return; }
    if (name === 'selectAll' || name === 'clearAll') { document.querySelectorAll('#attendance-form input[name="present"]').forEach(input => { input.checked = name === 'selectAll'; }); return; }
    if (name === 'template') { KPTWorkbook.download(state, true); return; }
    if (name === 'export' || name === 'exportSummary') { KPTWorkbook.download(state, false, name === 'exportSummary' ? summaryRows() : null); return; }
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
    if (dialogTable === 'Awards' && ['field-category', 'field-name'].includes(event.target.id)) updateAwardOptions();
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
