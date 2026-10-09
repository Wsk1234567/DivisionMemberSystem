(function (root) {
  'use strict';
  const fields = {
    Members: ['id', 'version', 'name', 'ic', 'sjamId', 'race', 'form', 'joined', 'status'],
    Activities: ['id', 'version', 'name', 'date', 'tags', 'examType', 'archived'],
    Attendance: ['id', 'version', 'activityId', 'memberId', 'present'],
    Exams: ['id', 'version', 'memberId', 'activityId', 'type', 'date', 'result', 'attended', 'certificate', 'archived'],
    Duty: ['id', 'version', 'memberId', 'year', 'hours'],
    Awards: ['id', 'version', 'memberId', 'category', 'name', 'date', 'level', 'certificate', 'notes', 'archived'],
    Enrolments: ['id', 'version', 'memberId', 'year', 'form', 'status'],
    Catalog: ['id', 'version', 'kind', 'category', 'name', 'level', 'archived']
  };
  const categories = ['Probadge', 'Promotion', 'Special Service Shield', 'Service Stripe & Star'];
  const statuses = ['Active', 'Graduated', 'Withdrawn'];
  const results = ['Pass', 'Fail', 'Pending', 'Absent'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const str = value => String(value == null ? '' : value).trim();
  const norm = value => str(value).toLowerCase();
  const icKey = value => str(value).replace(/[\s-]/g, '').toUpperCase();
  const fail = message => { throw new Error(message); };
  const boolean = value => value === true || norm(value) === 'true';
  const dateValid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const yearOf = value => Number(str(value).slice(0, 4));
  const tables = Object.keys(fields);
  function empty() {
    const state = { schema: 1, revision: 0, sequence: 0, updatedAt: '', publishedRevision: -1, audit: [] };
    tables.forEach(table => { state[table] = []; });
    ['EFA', 'BFA', 'Home Nursing', 'AFA'].forEach((name, index) => state.Catalog.push({ id: 'CAT-' + (index + 1), version: 1, kind: 'Exam', category: '', name, level: '', archived: false }));
    return state;
  }
  function normalize(table, input) {
    if (!fields[table]) fail('Unknown table.');
    const row = {};
    fields[table].forEach(field => { row[field] = str(input[field]); });
    row.version = Number(input.version || 0);
    if (!Number.isInteger(row.version) || row.version < 0) fail('Version must be a non-negative integer.');
    if (table === 'Activities') row.tags = Array.isArray(input.tags) ? [...new Set(input.tags.map(str))] : [...new Set(str(input.tags).split('|').map(str).filter(Boolean))];
    ['present', 'attended', 'archived'].forEach(field => {
      if (fields[table].includes(field)) {
        if (![true, false, 'true', 'false', 'TRUE', 'FALSE', '', undefined, null].includes(input[field])) fail(field + ' must be TRUE or FALSE.');
        row[field] = boolean(input[field]);
      }
    });
    if (fields[table].includes('year')) row.year = Number(input.year);
    if (table === 'Duty') row.hours = str(input.hours) === '' ? null : Number(input.hours);
    return row;
  }
  function validateState(state) {
    if (state.schema !== 1) fail('Unsupported backup schema.');
    if (!Number.isInteger(state.revision) || state.revision < 0 || !Number.isInteger(state.sequence) || state.sequence < 0) fail('Invalid data revision or student sequence.');
    tables.forEach(table => { if (!Array.isArray(state[table])) fail('Missing table: ' + table); });
    const members = new Set(state.Members.map(row => row.id));
    const activities = new Map(state.Activities.map(row => [row.id, row]));
    const unique = (rows, getKey, label) => {
      const found = new Set();
      rows.forEach(row => { const key = getKey(row); if (key && found.has(key)) fail('Duplicate ' + label + ': ' + key); if (key) found.add(key); });
    };
    tables.forEach(table => {
      if (!Array.isArray(state[table])) fail('Missing table: ' + table);
      unique(state[table], row => row.id, table + ' ID');
      state[table].forEach(row => {
        try {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(row.id)) fail(table + ': invalid internal ID.');
        if (!Number.isInteger(row.version) || row.version < 1) fail('Invalid record version.');
        fields[table].forEach(field => { if (typeof row[field] === 'string' && row[field].length > 2000) fail(table + ': ' + field + ' is too long.'); });
        if ('memberId' in row && !members.has(row.memberId)) fail(table + ': unknown student ' + row.memberId);
        if (row.activityId && !activities.has(row.activityId)) fail(table + ': unknown activity ' + row.activityId);
        if ('year' in row && (!Number.isInteger(row.year) || row.year < 1900 || row.year > 2200)) fail(table + ': invalid year.');
        if ('date' in row && !dateValid(row.date)) fail(table + ': use a valid YYYY-MM-DD date.');
        if (table === 'Members') {
          if (!row.name) fail('Student name is required.');
          if (!statuses.includes(row.status)) fail('Choose Active, Graduated or Withdrawn.');
          if (row.joined && !dateValid(row.joined)) fail('Joining date must be YYYY-MM-DD.');
        }
        if (table === 'Activities') {
          if (!row.name || !row.tags.length || row.tags.some(tag => !['DIM', 'Inspection', 'Exam', 'Other'].includes(tag))) fail('Activity needs a name and valid categories.');
          if (row.tags.includes('Exam') && !state.Catalog.some(item => item.kind === 'Exam' && item.name === row.examType)) fail('Choose an examination category for this activity.');
        }
        if (table === 'Exams') {
          if (!results.includes(row.result)) fail('Invalid exam result.');
          if (!state.Catalog.some(item => item.kind === 'Exam' && item.name === row.type)) fail('Unknown exam category: ' + row.type);
          if ((['Pass', 'Fail'].includes(row.result) && !row.attended) || (row.result === 'Absent' && row.attended)) fail('Exam result and participation disagree.');
          if (row.activityId && !row.archived) {
            const activity = activities.get(row.activityId);
            const attendance = state.Attendance.find(item => item.activityId === row.activityId && item.memberId === row.memberId);
            if (activity.archived || !activity.tags.includes('Exam') || row.date !== activity.date || row.type !== activity.examType || row.attended !== !!(attendance && attendance.present)) fail('Linked exam must match the activity and its attendance.');
          }
        }
        if (table === 'Duty' && row.hours !== null && (!Number.isFinite(row.hours) || row.hours < 0 || row.hours > 8784)) fail('Duty hours must be between 0 and 8784, or blank.');
        if (table === 'Awards' && (!categories.includes(row.category) || !state.Catalog.some(item => item.kind === 'Award' && item.category === row.category && item.name === row.name && item.level === row.level))) fail('Choose an award and level from the catalogue.');
        if (table === 'Enrolments' && !statuses.includes(row.status)) fail('Invalid annual member status.');
        if (table === 'Catalog' && (!['Exam', 'Award'].includes(row.kind) || !row.name || (row.kind === 'Award' && !categories.includes(row.category)))) fail('Invalid catalogue entry.');
        } catch (error) { error.table = table; error.recordId = row.id; throw error; }
      });
    });
    unique(state.Members, row => icKey(row.ic), 'IC');
    unique(state.Members, row => norm(row.sjamId), 'SJAM ID');
    unique(state.Attendance, row => row.activityId + ':' + row.memberId, 'attendance');
    unique(state.Duty, row => row.memberId + ':' + row.year, 'annual Duty');
    unique(state.Enrolments, row => row.memberId + ':' + row.year, 'annual enrolment');
    unique(state.Exams.filter(row => row.activityId), row => row.activityId + ':' + row.memberId, 'linked exam');
    unique(state.Catalog, row => [row.kind, row.category, norm(row.name), norm(row.level)].join(':'), 'catalogue entry');
    if (state.Members.some(row => /^STU-\d+$/.test(row.id) && Number(row.id.slice(4)) > state.sequence)) fail('Student sequence is behind existing IDs.');
    return state;
  }
  function upsert(state, table, input, uuid) {
    const row = normalize(table, input);
    let previous = row.id && state[table].find(item => item.id === row.id);
    if (row.id && !previous) fail('Unknown record ID. Leave ID blank for a new record.');
    if (!previous && table === 'Members') {
      const existing = state.Members.find(item => (row.ic && icKey(item.ic) === icKey(row.ic)) || (row.sjamId && norm(item.sjamId) === norm(row.sjamId)));
      if (existing) fail('Student already exists: ' + existing.id + '. Export current data and use that ID/version.');
    }
    if (previous && row.version !== previous.version) fail('Conflict: this record changed. Reload current data before saving.');
    if (!previous && row.version) fail('New records must have a blank or zero version.');
    row.id = previous ? previous.id : table === 'Members' ? 'STU-' + String(++state.sequence).padStart(6, '0') : table.slice(0, 3).toUpperCase() + '-' + uuid();
    row.version = previous ? previous.version + 1 : 1;
    if (previous) state[table][state[table].indexOf(previous)] = row; else state[table].push(row);
    return row;
  }
  function finish(state, actor, action, now) {
    validateState(state);
    state.revision++;
    state.updatedAt = now;
    state.audit = [...(state.audit || []), { at: now, actor, action, revision: state.revision }].slice(-500);
    return state;
  }
  function reconcileExams(state, activity, uuid) {
    state.Exams.filter(row => row.activityId === activity.id).forEach(row => {
      if (activity.archived || !activity.tags.includes('Exam')) { row.archived = true; row.version++; }
    });
    if (activity.archived || !activity.tags.includes('Exam')) return;
    state.Attendance.filter(row => row.activityId === activity.id).forEach(attendance => {
      const exam = state.Exams.find(row => row.activityId === activity.id && row.memberId === attendance.memberId);
      const preserved = exam && exam.attended === attendance.present;
      const input = Object.assign({}, exam || {}, { memberId: attendance.memberId, activityId: activity.id, type: activity.examType, date: activity.date, attended: attendance.present, result: attendance.present ? (preserved && exam.result !== 'Absent' ? exam.result : 'Pending') : 'Absent', archived: false });
      upsert(state, 'Exams', input, uuid);
    });
  }
  function mutate(original, request, context) {
    const state = copy(original);
    if (request.revision !== state.revision) fail('Conflict: newer data is available. Reload before saving.');
    const table = request.table;
    if (request.action === 'save') {
      if (table === 'Attendance') fail('Use activity attendance to record participation.');
      const row = upsert(state, table, request.row, context.uuid);
      if (table === 'Activities') reconcileExams(state, row, context.uuid);
      if (table === 'Members') {
        const year = Number(request.year);
        const existing = state.Enrolments.find(item => item.memberId === row.id && item.year === year);
        upsert(state, 'Enrolments', Object.assign({}, existing || {}, { memberId: row.id, year, form: row.form, status: row.status }), context.uuid);
      }
    } else if (request.action === 'attendance') {
      const activity = state.Activities.find(row => row.id === request.activityId && !row.archived);
      if (!activity) fail('Activity not found or archived.');
      const present = new Set(request.presentIds);
      const roster = new Set(request.rosterIds);
      present.forEach(id => { if (!roster.has(id)) fail('Present student is outside the roster.'); });
      roster.forEach(memberId => {
        const previous = state.Attendance.find(row => row.memberId === memberId && row.activityId === activity.id);
        upsert(state, 'Attendance', Object.assign({}, previous || {}, { memberId, activityId: activity.id, present: present.has(memberId) }), context.uuid);
      });
      reconcileExams(state, activity, context.uuid);
    } else fail('Unsupported action.');
    return finish(state, context.actor, request.action + ':' + (table || request.activityId), context.now);
  }
  function summary(state, memberId, year) {
    const activities = new Map(state.Activities.filter(row => !row.archived && yearOf(row.date) === Number(year)).map(row => [row.id, row]));
    const attended = new Set(state.Attendance.filter(row => row.memberId === memberId && row.present && activities.has(row.activityId)).map(row => row.activityId));
    const dim = [...attended].filter(id => activities.get(id).tags.includes('DIM')).length;
    const inspection = [...attended].some(id => activities.get(id).tags.includes('Inspection'));
    const exam = state.Exams.some(row => !row.archived && row.memberId === memberId && yearOf(row.date) === Number(year) && row.attended && row.result !== 'Absent');
    const duty = state.Duty.find(row => row.memberId === memberId && row.year === Number(year));
    const hours = duty ? duty.hours : null;
    const participantRecords = state.Attendance.filter(row => row.memberId === memberId && activities.has(row.activityId));
    const dimKnown = dim >= 12 || participantRecords.some(row => activities.get(row.activityId).tags.includes('DIM'));
    const inspectionKnown = inspection || participantRecords.some(row => activities.get(row.activityId).tags.includes('Inspection'));
    const examKnown = exam || state.Exams.some(row => !row.archived && row.memberId === memberId && yearOf(row.date) === Number(year) && row.result === 'Absent');
    const efficient = hours === null || !dimKnown || !inspectionKnown || !examKnown ? 'Pending' : hours >= 60 && dim >= 12 && inspection && exam ? 'Efficient' : 'Not efficient';
    return { memberId, year: Number(year), hours, dim, inspection, exam, efficient };
  }
  function projectPublic(state) {
    return { schema: 1, revision: state.revision, updatedAt: state.updatedAt, members: state.Members.map(member => ({ name: member.name, sjamId: member.sjamId, status: member.status, awards: state.Awards.filter(award => award.memberId === member.id && !award.archived).map(award => ({ name: award.name, date: award.date, category: award.category, level: award.level })) })) };
  }
  function publicSearch(payload, query, mode) {
    const value = norm(query);
    if (!value) return [];
    if (!['name', 'sjamId'].includes(mode)) fail('Only name and SJAM ID searches are supported.');
    return payload.members.filter(member => mode === 'sjamId' ? norm(member.sjamId) === value : norm(member.name).includes(value));
  }
  function importRows(original, workbook, context) {
    const state = copy(original);
    const errors = [];
    const changes = [];
    const order = ['Catalog', 'Members', 'Activities', 'Attendance', 'Exams', 'Duty', 'Awards', 'Enrolments'];
    const seen = new Set();
    order.forEach(table => (workbook[table] || []).forEach((input, index) => {
      try {
        if (table === 'Catalog') {
          const templateRow = empty().Catalog.find(row => row.id === str(input.id));
          if (templateRow && JSON.stringify(normalize(table, input)) === JSON.stringify(normalize(table, templateRow))) return;
        }
        if (input.id && seen.has(table + ':' + input.id)) fail('Repeated record ID in file.');
        if (input.id) seen.add(table + ':' + input.id);
        const prepared = table === 'Members' && !str(input.id) && !str(input.status) ? Object.assign({}, input, { status: 'Active' }) : input;
        const previous = state[table].find(row => row.id === str(prepared.id));
        const normalized = normalize(table, prepared);
        if (previous && normalized.version !== previous.version) fail('Conflict: export current data first.');
        if (previous && JSON.stringify(normalized) === JSON.stringify(normalize(table, previous))) return;
        const row = upsert(state, table, prepared, context.uuid);
        changes.push({ sheet: table, row: input.__excelRow || index + 2, id: row.id, change: previous ? 'Update' : 'Add' });
      } catch (error) { errors.push({ sheet: table, row: input.__excelRow || index + 2, message: error.message }); }
    }));
    if (!errors.length) {
      try { validateState(state); } catch (error) {
        const change = changes.find(row => row.sheet === error.table && row.id === error.recordId);
        errors.push({ sheet: error.table || 'Relationships', row: change ? change.row : null, message: error.message });
      }
    }
    if (!errors.length && changes.length) finish(state, context.actor, 'Excel import: ' + changes.length + ' changes', context.now);
    return { state: errors.length ? null : state, changes, errors, revision: original.revision };
  }
  function recycleBundle(state, table, id) {
    if (!fields[table]) fail('Unknown record type.');
    const root = state[table].find(row => row.id === id);
    if (!root) fail('Record not found. Reload current data.');
    const selected = Object.fromEntries(tables.map(name => [name, new Set()]));
    selected[table].add(id);
    let changed = true;
    const add = (name, rows) => rows.forEach(row => { if (!selected[name].has(row.id)) { selected[name].add(row.id); changed = true; } });
    while (changed) {
      changed = false;
      const memberIds = selected.Members;
      if (memberIds.size) ['Attendance', 'Exams', 'Duty', 'Awards', 'Enrolments'].forEach(name => add(name, state[name].filter(row => memberIds.has(row.memberId))));
      const activityIds = selected.Activities;
      if (activityIds.size) {
        add('Attendance', state.Attendance.filter(row => activityIds.has(row.activityId)));
        add('Exams', state.Exams.filter(row => activityIds.has(row.activityId)));
      }
      if (selected.Attendance.size) add('Exams', state.Exams.filter(exam => exam.activityId && state.Attendance.some(attendance => selected.Attendance.has(attendance.id) && attendance.activityId === exam.activityId && attendance.memberId === exam.memberId)));
      selected.Catalog.forEach(catalogId => {
        const catalog = state.Catalog.find(row => row.id === catalogId);
        if (!catalog) return;
        if (catalog.kind === 'Exam') {
          add('Activities', state.Activities.filter(row => row.tags.includes('Exam') && row.examType === catalog.name));
          add('Exams', state.Exams.filter(row => row.type === catalog.name));
        } else add('Awards', state.Awards.filter(row => row.category === catalog.category && row.name === catalog.name && row.level === catalog.level));
      });
    }
    const records = {};
    tables.forEach(name => { const rows = state[name].filter(row => selected[name].has(row.id)); if (rows.length) records[name] = copy(rows); });
    const counts = Object.fromEntries(Object.entries(records).map(([name, rows]) => [name, rows.length]));
    const label = table === 'Members' ? root.name : table === 'Activities' ? root.name : table === 'Catalog' ? root.name : root.id;
    return { rootTable: table, rootId: id, label, records, counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) };
  }
  function recycleDelete(original, table, id, context) {
    const state = copy(original);
    if (context.revision !== state.revision) fail('Conflict: newer data is available. Reload before deleting.');
    const bundle = recycleBundle(state, table, id);
    Object.entries(bundle.records).forEach(([name, rows]) => { const ids = new Set(rows.map(row => row.id)); state[name] = state[name].filter(row => !ids.has(row.id)); });
    state.trash = Array.isArray(state.trash) ? state.trash : [];
    state.trash.unshift({ id: 'TRASH-' + context.uuid(), deletedAt: context.now, actor: context.actor, rootTable: bundle.rootTable, rootId: bundle.rootId, label: bundle.label, records: bundle.records, counts: bundle.counts });
    return finish(state, context.actor, 'Delete to Recycle Bin: ' + table + ':' + id, context.now);
  }
  function allMembersBundle(state) {
    if (!state.Members.length) fail('There are no students to delete.');
    const memberIds = new Set(state.Members.map(row => row.id));
    const records = { Members: copy(state.Members) };
    ['Attendance', 'Exams', 'Duty', 'Awards', 'Enrolments'].forEach(name => {
      const rows = state[name].filter(row => memberIds.has(row.memberId));
      if (rows.length) records[name] = copy(rows);
    });
    const counts = Object.fromEntries(Object.entries(records).map(([name, rows]) => [name, rows.length]));
    return { rootTable: 'Members', rootId: '*', label: 'All students', records, counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) };
  }
  function recycleDeleteAllMembers(original, context) {
    const state = copy(original);
    if (context.revision !== state.revision) fail('Conflict: newer data is available. Reload before deleting.');
    const bundle = allMembersBundle(state);
    Object.entries(bundle.records).forEach(([name, rows]) => { const ids = new Set(rows.map(row => row.id)); state[name] = state[name].filter(row => !ids.has(row.id)); });
    state.trash = Array.isArray(state.trash) ? state.trash : [];
    state.trash.unshift({ id: 'TRASH-' + context.uuid(), deletedAt: context.now, actor: context.actor, rootTable: bundle.rootTable, rootId: bundle.rootId, label: bundle.label, records: bundle.records, counts: bundle.counts });
    return finish(state, context.actor, 'Delete all students to Recycle Bin: ' + bundle.counts.Members, context.now);
  }
  function restoreTrash(original, trashId, context) {
    const state = copy(original);
    if (context.revision !== state.revision) fail('Conflict: newer data is available. Reload before restoring.');
    state.trash = Array.isArray(state.trash) ? state.trash : [];
    const item = state.trash.find(row => row.id === trashId);
    if (!item) fail('Recycle Bin item not found.');
    Object.entries(item.records).forEach(([name, rows]) => rows.forEach(saved => {
      if (state[name].some(row => row.id === saved.id)) fail('Cannot restore because record ID already exists: ' + saved.id);
      const row = copy(saved); row.version = Number(row.version) + 1; state[name].push(row);
    }));
    state.trash = state.trash.filter(row => row.id !== trashId);
    return finish(state, context.actor, 'Restore from Recycle Bin: ' + item.rootTable + ':' + item.rootId, context.now);
  }
  function purgeTrash(original, trashId, context) {
    const state = copy(original);
    if (context.revision !== state.revision) fail('Conflict: newer data is available. Reload before permanently deleting.');
    state.trash = Array.isArray(state.trash) ? state.trash : [];
    const item = state.trash.find(row => row.id === trashId);
    if (!item) fail('Recycle Bin item not found.');
    state.trash = state.trash.filter(row => row.id !== trashId);
    return finish(state, context.actor, 'Permanently delete: ' + item.rootTable + ':' + item.rootId, context.now);
  }
  const api = { fields, tables, categories, statuses, results, empty, normalize, validateState, mutate, summary, projectPublic, publicSearch, importRows, recycleBundle, recycleDelete, allMembersBundle, recycleDeleteAllMembers, restoreTrash, purgeTrash, copy, finish, norm, icKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KPT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
