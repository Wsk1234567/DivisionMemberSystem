(function (root) {
  'use strict';
  const fields = {
    Members: ['id', 'version', 'name', 'ic', 'sjamId', 'race', 'form', 'joined', 'status'],
    Activities: ['id', 'version', 'name', 'date', 'tags', 'examType', 'archived'],
    Attendance: ['id', 'version', 'activityId', 'memberId', 'present'],
    Exams: ['id', 'version', 'memberId', 'activityId', 'type', 'date', 'result', 'attended', 'certificate', 'archived'],
    Duty: ['id', 'version', 'memberId', 'year', 'hours'],
    Awards: ['id', 'version', 'memberId', 'catalogId', 'category', 'name', 'date', 'level', 'certificate', 'notes', 'archived'],
    Enrolments: ['id', 'version', 'memberId', 'year', 'form', 'status'],
    Catalog: ['id', 'version', 'code', 'sortOrder', 'kind', 'category', 'name', 'level', 'eligibilityMetric', 'eligibilityThreshold', 'archived'],
    FinBooks: ['id', 'version', 'activityName', 'status', 'remarks', 'submittedBy', 'submittedAt', 'reviewedBy', 'reviewedAt'],
    FinIncomes: ['id', 'version', 'bookId', 'date', 'description', 'amount'],
    FinExpenses: ['id', 'version', 'bookId', 'date', 'item', 'description', 'quantity', 'unitCost', 'amount'],
    FinReimbursements: ['id', 'version', 'bookId', 'formSeq', 'treasurerName', 'formDate', 'purpose', 'chequeNo', 'amount'],
    FinReimburseLines: ['id', 'version', 'reimbursementId', 'lineNo', 'date', 'invoiceNo', 'particular', 'total'],
    DocPackages: ['id', 'version', 'activityType', 'year', 'eventDate', 'status', 'basePackageId', 'ocEmail', 'osEmail', 'otEmail', 'createdBy', 'createdAt', 'approvedAt', 'archived'],
    DocItems: ['id', 'version', 'packageId', 'sortOrder', 'title', 'role', 'assignee', 'dueOffsetDays', 'required', 'templateId', 'status', 'taskStatus', 'fileName', 'fileId', 'uploadedBy', 'uploadedAt', 'submittedBy', 'submittedAt', 'reviewedBy', 'reviewedAt', 'remarks', 'archived'],
    DocTemplates: ['id', 'version', 'activityType', 'title', 'fileName', 'mime', 'fileId', 'versionLabel', 'active', 'archived']
  };
  const money = value => {
    if (value === '' || value == null) return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 1e8) return NaN;
    return Math.round(number * 100) / 100;
  };
  const categories = ['Probadge', 'Promotion', 'Special Service Shield', 'Service Stripe & Star'];
  const statuses = ['Active', 'Graduated', 'Withdrawn'];
  const results = ['Pass', 'Fail', 'Pending', 'Absent'];
  const forms = ['Peralihan', 'Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Adult'];
  const races = ['Melayu', 'India', 'Cina', 'Other'];
  const docActivityTypes = ['AGM', 'CadetEnrolment', 'OrientationDay', 'Exam', 'MidTermReview', 'JuniorCamp', 'InspectionDay'];
  const docItemStatuses = ['Pending', 'Draft', 'Submitted', 'Approved', 'Rejected', 'NotRequired'];
  const docPackageStatuses = ['Open', 'Completed', 'Archived'];
  const docUploadMimes = ['.docx', '.xlsx', '.pdf', '.pptx', '.jpg', '.jpeg', '.png', '.zip'];
  const finStatuses = ['Draft', 'Submitted', 'Approved', 'Rejected'];
  const taskStatuses = ['Open', 'Done', 'Cancelled'];
  const recommendedCatalog = [];
  const addRecommended = (code, sortOrder, kind, category, name, level, eligibilityMetric, eligibilityThreshold) => recommendedCatalog.push({ code, sortOrder, kind, category, name, level: level || '', eligibilityMetric: eligibilityMetric || '', eligibilityThreshold: eligibilityThreshold == null ? null : eligibilityThreshold, archived: false });
  ['EFA (New)', 'EFA (Recert)', 'BFA (New)', 'BFA (Recert)', 'BFA (Renew)', 'Home Nursing', 'AFA'].forEach((name, index) => addRecommended('EXAM_' + name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase(), index + 1, 'Exam', '', name));
  [
    [0, 'Knowledge of the Order of St. John'],
    [1, 'Combating Drugs & Substance Abuse'], [1, 'Caring for Animals'], [1, 'Caring for the Community'], [1, 'Caring for the Sick'], [1, 'Caring for the Children'],
    [2, 'Road Safety & Accident Prevention'], [2, 'Civil Defence'], [2, 'Fire Fighting & Prevention'], [2, 'Casualty Simulation'], [2, 'Survival Technique & Life Saving'],
    [3, 'Outdoor Pursuits'], [3, 'Physical Health & Fitness'], [3, 'Crafts'], [3, 'Map Reading & Navigation'], [3, 'Musician'],
    [4, 'Communication with People with Disabilities'], [4, 'Administrative & Management Skills'], [4, 'International St. John Friendship'], [4, 'Computer Technology & Social Media Skills'], [4, 'Signaling & Radio Communication'],
    [5, 'Citizenship'], [5, 'Living Skills'], [5, 'Cookery and Nutrition'], [5, 'Do-It-Yourself'], [5, 'Cadet Leadership & Training Course']
  ].forEach(([category, name], index) => addRecommended('PROBADGE_' + String(index + 1).padStart(2, '0'), 100 + index, 'Award', 'Probadge', name, 'Category ' + category));
  ['Lance Corporal', 'Corporal', 'Sergeant', 'Cadet Leader'].forEach((level, index) => addRecommended('PROMOTION_' + String(index + 1), 200 + index, 'Award', 'Promotion', 'Promotion', level));
  [[100, 'Green'], [200, 'Blue'], [500, 'Purple'], [700, 'Silver'], [1000, 'Emas']].forEach(([hours, colour], index) => addRecommended('SSS_' + hours, 300 + index, 'Award', 'Special Service Shield', 'Special Service Shield', 'SSS ' + hours + ' - ' + colour, 'lifetimeDutyHours', hours));
  ['1st Year - 1 Black-and-White Stripe', '2nd Year - 2 Black-and-White Stripes', '3rd Year - 1 Service Star', '4th Year - 1 Service Star + 1 Black-and-White Stripe', '5th Year - 2 Service Stars'].forEach((level, index) => addRecommended('SERVICE_YEAR_' + (index + 1), 400 + index, 'Award', 'Service Stripe & Star', 'Service Stripe & Star', level, 'efficientYears', index + 1));
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
    ['EFA', 'BFA', 'Home Nursing', 'AFA'].forEach((name, index) => state.Catalog.push({ id: 'CAT-' + (index + 1), version: 1, code: '', sortOrder: index + 1, kind: 'Exam', category: '', name, level: '', eligibilityMetric: '', eligibilityThreshold: null, archived: false }));
    return state;
  }
  function upgradeState(input) {
    const state = copy(input);
    state.trash = Array.isArray(state.trash) ? state.trash : [];
    tables.forEach(table => { if (!Array.isArray(state[table])) state[table] = []; });
    state.Catalog = (state.Catalog || []).map((row, index) => Object.assign({ code: '', sortOrder: index + 1, eligibilityMetric: '', eligibilityThreshold: null }, row));
    state.Awards = (state.Awards || []).map(row => {
      if (row.catalogId) return row;
      const catalog = state.Catalog.find(item => item.kind === 'Award' && item.category === row.category && item.name === row.name && item.level === row.level);
      return Object.assign({ catalogId: catalog ? catalog.id : '' }, row);
    });
    return state;
  }
  function normalize(table, input) {
    if (!fields[table]) fail('Unknown table.');
    const row = {};
    fields[table].forEach(field => { row[field] = str(input[field]); });
    row.version = Number(input.version || 0);
    if (!Number.isInteger(row.version) || row.version < 0) fail('Version must be a non-negative integer.');
    if (table === 'Activities') row.tags = Array.isArray(input.tags) ? [...new Set(input.tags.map(str))] : [...new Set(str(input.tags).split('|').map(str).filter(Boolean))];
    ['present', 'attended', 'archived', 'required', 'active'].forEach(field => {
      if (fields[table].includes(field)) {
        if (![true, false, 'true', 'false', 'TRUE', 'FALSE', '', undefined, null].includes(input[field])) fail(field + ' must be TRUE or FALSE.');
        row[field] = boolean(input[field]);
      }
    });
    if (fields[table].includes('year')) row.year = Number(input.year);
    if (table === 'Duty') row.hours = str(input.hours) === '' ? null : Number(input.hours);
    if (table === 'FinIncomes' || table === 'FinExpenses' || table === 'FinReimbursements') row.amount = money(input.amount);
    if (table === 'FinReimburseLines') {
      row.total = money(input.total);
      row.lineNo = str(input.lineNo) === '' ? 0 : Number(input.lineNo);
    }
    if (table === 'FinReimbursements') row.formSeq = str(input.formSeq) === '' ? 0 : Number(input.formSeq);
    if (table === 'FinBooks') row.status = str(input.status || '') || 'Draft';
    if (table === 'Catalog') {
      row.sortOrder = str(input.sortOrder) === '' ? 0 : Number(input.sortOrder);
      row.eligibilityThreshold = str(input.eligibilityThreshold) === '' ? null : Number(input.eligibilityThreshold);
    }
    if (table === 'DocItems') {
      row.sortOrder = str(input.sortOrder) === '' ? 0 : Number(input.sortOrder);
      row.dueOffsetDays = str(input.dueOffsetDays) === '' ? 0 : Number(input.dueOffsetDays);
      row.taskStatus = str(input.taskStatus || '') || 'Open';
    }
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
        if (table === 'Awards') {
          const catalog = row.catalogId && state.Catalog.find(item => item.id === row.catalogId && item.kind === 'Award');
          if (!categories.includes(row.category) || (!catalog && !state.Catalog.some(item => item.kind === 'Award' && item.category === row.category && item.name === row.name && item.level === row.level))) fail('Choose an award and level from the catalogue.');
        }
        if (table === 'Enrolments' && !statuses.includes(row.status)) fail('Invalid annual member status.');
        if (table === 'FinBooks') {
          if (!row.activityName) fail('Activity name is required.');
          const status = str(row.status || 'Draft');
          if (!finStatuses.includes(status)) fail('Invalid finance approval status.');
        }
        if (table === 'FinIncomes') {
          if (!row.bookId || !state.FinBooks.some(item => item.id === row.bookId)) fail('Unknown finance book.');
          if (!row.date) fail('Income date is required.');
          if (!row.description) fail('Income description is required.');
          if (row.amount === null || Number.isNaN(row.amount) || row.amount < 0) fail('Income amount must be between 0 and 100000000.');
        }
        if (table === 'FinExpenses') {
          if (!row.bookId || !state.FinBooks.some(item => item.id === row.bookId)) fail('Unknown finance book.');
          if (!row.date) fail('Expense date is required.');
          if (!row.description && !row.item) fail('Expense needs an item or description.');
          if (row.amount === null || Number.isNaN(row.amount) || row.amount < 0) fail('Expense amount must be between 0 and 100000000.');
        }
        if (table === 'FinReimbursements') {
          if (!row.bookId || !state.FinBooks.some(item => item.id === row.bookId)) fail('Unknown finance book.');
          if (!Number.isInteger(row.formSeq) || row.formSeq < 1) fail('Form number must be 1 or higher.');
          if (!row.treasurerName) fail('Treasurer name is required.');
          if (!row.formDate) fail('Form date is required.');
          if (row.amount !== null && (Number.isNaN(row.amount) || row.amount < 0)) fail('Invalid form total.');
        }
        if (table === 'FinReimburseLines') {
          const form = state.FinReimbursements.find(item => item.id === row.reimbursementId);
          if (!form) fail('Unknown reimbursement form.');
          if (!Number.isInteger(row.lineNo) || row.lineNo < 1 || row.lineNo > 11) fail('Each form allows line numbers 1 to 11.');
          if (!row.date) fail('Line date is required.');
          if (!row.particular) fail('Particular is required.');
          if (row.total === null || Number.isNaN(row.total) || row.total < 0) fail('Line total must be between 0 and 100000000.');
        }
        if (table === 'Catalog') {
          if (!['Exam', 'Award'].includes(row.kind) || !row.name || (row.kind === 'Award' && !categories.includes(row.category))) fail('Invalid catalogue entry.');
          if (row.code && !/^[A-Z0-9_]{1,80}$/.test(row.code)) fail('Invalid catalogue code.');
          const sortOrder = row.sortOrder == null || row.sortOrder === '' ? 0 : Number(row.sortOrder);
          const metric = row.eligibilityMetric || '';
          const threshold = row.eligibilityThreshold == null || row.eligibilityThreshold === '' ? null : Number(row.eligibilityThreshold);
          if (!Number.isInteger(sortOrder) || sortOrder < 0) fail('Catalogue order must be a non-negative integer.');
          if (!['', 'lifetimeDutyHours', 'efficientYears'].includes(metric)) fail('Invalid eligibility rule.');
          if (metric && (!Number.isFinite(threshold) || threshold <= 0)) fail('Eligibility threshold must be positive.');
        }
        if (table === 'DocPackages') {
          if (!docActivityTypes.includes(row.activityType)) fail('Unknown activity type.');
          if (!docPackageStatuses.includes(row.status)) fail('Invalid package status.');
          if (row.eventDate && !dateValid(row.eventDate)) fail('Event date must be YYYY-MM-DD.');
          ['ocEmail', 'osEmail', 'otEmail'].forEach(emailKey => {
            if (row[emailKey] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row[emailKey])) fail('Organizing role email is invalid.');
          });
        }
        if (table === 'DocItems') {
          if (!state.DocPackages.some(item => item.id === row.packageId)) fail('Unknown document package.');
          if (!docItemStatuses.includes(row.status)) fail('Invalid document status.');
          if (!Number.isInteger(row.sortOrder) || row.sortOrder < 0) fail('Document order must be a non-negative integer.');
          if (!Number.isInteger(row.dueOffsetDays) || row.dueOffsetDays < -365 || row.dueOffsetDays > 365) fail('Due offset must be between -365 and 365 days.');
          if (!taskStatuses.includes(str(row.taskStatus) || 'Open')) fail('Invalid task status.');
          if (!row.title) fail('Document title is required.');
          if (row.templateId && !state.DocTemplates.some(item => item.id === row.templateId)) fail('Unknown document template.');
          if (row.status === 'Submitted' && !row.fileId) fail('Submitted items need an uploaded file.');
        }
        if (table === 'DocTemplates') {
          if (!docActivityTypes.includes(row.activityType)) fail('Unknown activity type.');
          if (!row.title) fail('Template title is required.');
          if (row.fileId && !row.fileName) fail('Template file name is required.');
        }
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
    unique(state.Catalog, row => row.code, 'catalogue code');
    unique(state.Awards.filter(row => row.catalogId), row => row.memberId + ':' + row.catalogId, 'member award');
    unique(state.FinReimbursements, row => row.bookId + ':' + row.formSeq, 'finance form number');
    unique(state.FinReimburseLines, row => row.reimbursementId + ':' + row.lineNo, 'finance line number');
    unique(state.DocPackages.filter(row => !row.archived), row => row.activityType + ':' + row.year, 'document package');
    unique(state.DocItems, row => row.packageId + ':' + row.sortOrder, 'document order');
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
    if (table === 'Members') {
      if (row.form && !forms.includes(row.form) && (!previous || row.form !== previous.form)) fail('Choose a standard Tingkatan option.');
      if (row.race && !races.includes(row.race) && (!previous || row.race !== previous.race)) fail('Choose a standard Race option.');
    }
    if (table === 'Enrolments' && row.form && !forms.includes(row.form)) {
      const member = state.Members.find(item => item.id === row.memberId);
      if ((!previous || row.form !== previous.form) && (!member || row.form !== member.form)) fail('Choose a standard Tingkatan option.');
    }
    if (table === 'Awards' && row.catalogId) {
      const catalog = state.Catalog.find(item => item.id === row.catalogId && item.kind === 'Award');
      if (!catalog || (catalog.archived && (!previous || previous.catalogId !== catalog.id))) fail('Choose an available award from System Setup.');
      row.category = catalog.category; row.name = catalog.name; row.level = catalog.level;
    }
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
      if (table && table.startsWith('Doc')) fail('Use document package actions for Files.');
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
    } else if (request.action === 'saveFinanceBook') {
      saveFinanceBook(state, request, context);
    } else if (request.action === 'createDocPackage') {
      createDocPackage(state, request, context);
    } else if (request.action === 'saveDocPackageMeta') {
      saveDocPackageMeta(state, request, context);
    } else if (request.action === 'saveDocItemsMeta') {
      saveDocItemsMeta(state, request, context);
    } else if (request.action === 'docItemUpload') {
      docItemUpload(state, request, context);
    } else if (request.action === 'docItemSubmit') {
      docItemSubmit(state, request, context);
    } else if (request.action === 'docItemReview') {
      docItemReview(state, request, context);
    } else if (request.action === 'docItemReopen') {
      docItemReopen(state, request, context);
    } else if (request.action === 'docPackageArchive') {
      docPackageArchive(state, request, context);
    } else if (request.action === 'saveDocTemplate') {
      upsert(state, 'DocTemplates', request.row, context.uuid);
    } else if (request.action === 'submitFinBook') {
      submitFinBook(state, request, context);
    } else if (request.action === 'reviewFinBook') {
      reviewFinBook(state, request, context);
    } else if (request.action === 'reopenFinBook') {
      const book = state.FinBooks.find(row => row.id === request.bookId);
      if (!book) fail('Finance book not found.');
      if (book.status !== 'Approved' && book.status !== 'Rejected') fail('Only approved or rejected books can be reopened.');
      book.status = 'Draft';
      book.remarks = '';
      book.reviewedBy = '';
      book.reviewedAt = '';
      book.version++;
    } else if (request.action === 'setDocItemTaskStatus') {
      const item = findDocItem(state, request.itemId);
      const pkg = findDocPackage(state, item.packageId);
      openDocPackage(pkg);
      const taskStatus = str(request.taskStatus);
      if (!taskStatuses.includes(taskStatus)) fail('Use Open, Done or Cancelled.');
      item.taskStatus = taskStatus;
      item.version++;
      refreshDocPackageStatus(state, pkg.id, context.now);
    } else fail('Unsupported action.');
    return finish(state, context.actor, request.action + ':' + (table || request.activityType || request.itemId || request.packageId || request.action), context.now);
  }
  function defaultDocItems(activityType) {
    if (activityType !== 'AGM') return [];
    return [
      { sortOrder: 1, title: 'AGM Application Letter', role: 'Secretary', dueOffsetDays: -28, required: true, templateId: '' },
      { sortOrder: 2, title: 'Email to ASO', role: 'Secretary', dueOffsetDays: -28, required: true, templateId: '' },
      { sortOrder: 3, title: 'Venue Application Letter', role: 'Secretary', dueOffsetDays: -28, required: false, templateId: '' },
      { sortOrder: 4, title: 'Invitation - JDO', role: 'Secretary', dueOffsetDays: -21, required: true, templateId: '' },
      { sortOrder: 5, title: 'Invitation - Teacher Advisor / Speech', role: 'Secretary', dueOffsetDays: -21, required: true, templateId: '' },
      { sortOrder: 6, title: 'Invitation - Guest / Attendance', role: 'Secretary', dueOffsetDays: -21, required: false, templateId: '' },
      { sortOrder: 7, title: 'Agenda', role: 'Chairperson', dueOffsetDays: -7, required: true, templateId: '' },
      { sortOrder: 8, title: 'Action Plan', role: 'Chairperson', dueOffsetDays: -7, required: true, templateId: '' },
      { sortOrder: 9, title: 'Meeting Minutes', role: 'Secretary', dueOffsetDays: 5, required: true, templateId: '' },
      { sortOrder: 10, title: 'Committee Board', role: 'Secretary', dueOffsetDays: 7, required: true, templateId: '' },
      { sortOrder: 11, title: 'Photo Pack', role: 'Records', dueOffsetDays: 2, required: false, templateId: '' },
      { sortOrder: 12, title: 'Awards / NCO Promotion pack', role: 'Training', dueOffsetDays: -14, required: false, templateId: '' }
    ];
  }
  function findDocPackage(state, id) {
    const pkg = state.DocPackages.find(row => row.id === id);
    if (!pkg) fail('Document package not found.');
    return pkg;
  }
  function findDocItem(state, id) {
    const item = state.DocItems.find(row => row.id === id);
    if (!item) fail('Document item not found.');
    return item;
  }
  function openDocPackage(pkg) {
    if (pkg.archived || pkg.status === 'Archived') fail('This package is archived.');
  }
  function refreshDocPackageStatus(state, packageId, now) {
    const pkg = state.DocPackages.find(row => row.id === packageId);
    if (!pkg || pkg.archived || pkg.status === 'Archived') return;
    const required = state.DocItems.filter(row => row.packageId === packageId && !row.archived && row.required && row.status !== 'NotRequired');
    const complete = required.length > 0 && required.every(row => row.status === 'Approved');
    const next = complete ? 'Completed' : 'Open';
    if (pkg.status !== next) {
      pkg.status = next;
      pkg.version++;
      pkg.approvedAt = complete ? (pkg.approvedAt || now || '') : '';
    }
  }
  function createDocPackage(state, request, context) {
    const activityType = str(request.activityType);
    if (!docActivityTypes.includes(activityType)) fail('Unknown activity type.');
    const year = Number(request.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) fail('Choose a valid package year.');
    if (state.DocPackages.some(row => !row.archived && row.activityType === activityType && row.year === year)) fail('A package already exists for this activity and year.');
    const eventDate = str(request.eventDate);
    if (eventDate && !dateValid(eventDate)) fail('Event date must be YYYY-MM-DD.');
    let source = null;
    if (request.basePackageId) {
      source = state.DocPackages.find(row => row.id === request.basePackageId);
      if (!source) fail('Base package not found.');
      if (source.activityType !== activityType) fail('Base package must match the activity type.');
    }
    const pkg = upsert(state, 'DocPackages', {
      activityType, year, eventDate, status: 'Open',
      basePackageId: source ? source.id : '',
      ocEmail: str(request.ocEmail).toLowerCase(),
      osEmail: str(request.osEmail).toLowerCase(),
      otEmail: str(request.otEmail).toLowerCase(),
      createdBy: context.actor, createdAt: context.now, approvedAt: '', archived: false
    }, context.uuid);
    const templates = state.DocTemplates.filter(row => row.activityType === activityType && !row.archived);
    const rows = source
      ? state.DocItems.filter(row => row.packageId === source.id && !row.archived).sort((a, b) => a.sortOrder - b.sortOrder).map(row => ({ sortOrder: row.sortOrder, title: row.title, role: row.role, dueOffsetDays: row.dueOffsetDays, required: row.required, templateId: row.templateId }))
      : defaultDocItems(activityType);
    rows.forEach(row => {
      const byId = row.templateId && templates.find(item => item.id === row.templateId);
      const byTitle = templates.find(item => item.title === row.title);
      const template = byId || byTitle;
      upsert(state, 'DocItems', Object.assign({}, row, {
        packageId: pkg.id,
        templateId: template ? template.id : '',
        status: 'Pending', fileName: '', fileId: '',
        uploadedBy: '', uploadedAt: '', submittedBy: '', submittedAt: '',
        reviewedBy: '', reviewedAt: '', remarks: '', archived: false
      }), context.uuid);
    });
    return pkg;
  }
  function saveDocPackageMeta(state, request, context) {
    const pkg = findDocPackage(state, request.packageId);
    openDocPackage(pkg);
    const eventDate = str(request.eventDate === undefined ? pkg.eventDate : request.eventDate);
    if (eventDate && !dateValid(eventDate)) fail('Event date must be YYYY-MM-DD.');
    const ocEmail = str(request.ocEmail === undefined ? pkg.ocEmail : request.ocEmail).toLowerCase();
    const osEmail = str(request.osEmail === undefined ? pkg.osEmail : request.osEmail).toLowerCase();
    const otEmail = str(request.otEmail === undefined ? pkg.otEmail : request.otEmail).toLowerCase();
    [['ocEmail', ocEmail], ['osEmail', osEmail], ['otEmail', otEmail]].forEach(([key, value]) => {
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail('Organizing role email is invalid.');
    });
    const updated = upsert(state, 'DocPackages', Object.assign({}, pkg, { eventDate, ocEmail, osEmail, otEmail }), context.uuid);
    refreshDocPackageStatus(state, updated.id, context.now);
    return updated;
  }
  function validateDocItemMeta(next) {
    if (!Number.isInteger(next.sortOrder) || next.sortOrder < 0) fail('Document order must be a non-negative integer.');
    if (!Number.isInteger(next.dueOffsetDays) || next.dueOffsetDays < -365 || next.dueOffsetDays > 365) fail('Due offset must be between -365 and 365 days.');
    if (!str(next.title)) fail('Document title is required.');
  }
  function saveDocItemsMeta(state, request, context) {
    const rows = Array.isArray(request.items) ? request.items : (request.item ? [request.item] : []);
    const addRows = Array.isArray(request.addItems) ? request.addItems : [];
    const removeIds = Array.isArray(request.removeItemIds) ? request.removeItemIds.map(str).filter(Boolean) : [];
    const canStructure = request.canEditStructure !== false;
    const canEditDue = request.canEditDue !== false;
    const packageId = request.packageId || (rows[0] && rows[0].packageId) || (addRows[0] && addRows[0].packageId) || '';
    const pkg = findDocPackage(state, packageId);
    openDocPackage(pkg);
    if (pkg.status === 'Completed') fail('Reopen required items before editing a completed package.');
    if (!rows.length && !addRows.length && !removeIds.length) fail('No document items provided.');
    if (!canStructure && (addRows.length || removeIds.length)) fail('Only Owner or Secretary can add or remove documents.');
    rows.forEach(input => {
      const item = findDocItem(state, input.id);
      if (item.packageId !== packageId) fail('Document item belongs to another package.');
      const next = Object.assign({}, item, {
        title: str(input.title === undefined ? item.title : input.title) || item.title,
        role: str(input.role === undefined ? item.role : input.role),
        assignee: str(input.assignee === undefined ? item.assignee : input.assignee),
        dueOffsetDays: input.dueOffsetDays === undefined ? item.dueOffsetDays : Number(input.dueOffsetDays),
        sortOrder: input.sortOrder === undefined ? item.sortOrder : Number(input.sortOrder),
        required: input.required === undefined ? item.required : input.required
      });
      if (!canStructure) {
        next.title = item.title;
        next.role = item.role;
        next.required = item.required;
      }
      if (!canEditDue) {
        next.dueOffsetDays = item.dueOffsetDays;
      }
      validateDocItemMeta(next);
      upsert(state, 'DocItems', next, context.uuid);
    });
    removeIds.forEach(id => {
      const item = findDocItem(state, id);
      if (item.packageId !== packageId) fail('Document item belongs to another package.');
      if (item.fileId) fail('Remove the uploaded file before deleting this document row.');
      if (item.status === 'Approved' || item.status === 'Submitted') fail('Only pending or draft items can be removed.');
      state.DocItems = state.DocItems.filter(row => row.id !== id);
    });
    let order = state.DocItems.filter(row => row.packageId === packageId).map(row => Number(row.sortOrder) || 0);
    let nextOrder = (order.length ? Math.max.apply(null, order) : 0) + 1;
    addRows.forEach(input => {
      const next = {
        packageId,
        title: str(input.title),
        role: str(input.role),
        assignee: str(input.assignee),
        dueOffsetDays: str(input.dueOffsetDays) === '' ? 0 : Number(input.dueOffsetDays),
        sortOrder: str(input.sortOrder) === '' ? nextOrder++ : Number(input.sortOrder),
        required: input.required === undefined ? true : input.required,
        templateId: '',
        status: 'Pending',
        taskStatus: 'Open',
        fileName: '', fileId: '',
        uploadedBy: '', uploadedAt: '', submittedBy: '', submittedAt: '',
        reviewedBy: '', reviewedAt: '', remarks: '', archived: false
      };
      validateDocItemMeta(next);
      upsert(state, 'DocItems', next, context.uuid);
    });
    refreshDocPackageStatus(state, packageId, context.now);
  }
  function docItemUpload(state, request, context) {
    const item = findDocItem(state, request.itemId);
    const pkg = findDocPackage(state, item.packageId);
    openDocPackage(pkg);
    if (item.status === 'Approved') fail('Reopen this item before uploading a new file.');
    if (item.status === 'Submitted') fail('This item is waiting for review.');
    const fileName = str(request.fileName);
    const fileId = str(request.fileId);
    if (!fileName) fail('File name is required.');
    if (!fileId) fail('File upload failed.');
    const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    if (!docUploadMimes.includes(extension)) fail('Allowed files: docx, xlsx, pdf, pptx, jpg, png, zip.');
    item.fileName = fileName;
    item.fileId = fileId;
    item.uploadedBy = context.actor;
    item.uploadedAt = context.now;
    item.submittedBy = '';
    item.submittedAt = '';
    item.reviewedBy = '';
    item.reviewedAt = '';
    item.remarks = '';
    item.status = 'Draft';
    item.version++;
    refreshDocPackageStatus(state, pkg.id, context.now);
  }
  function docItemSubmit(state, request, context) {
    const item = findDocItem(state, request.itemId);
    const pkg = findDocPackage(state, item.packageId);
    openDocPackage(pkg);
    if (!['Draft', 'Rejected'].includes(item.status)) fail('Upload a file before submitting.');
    if (!item.fileId) fail('Upload a file before submitting.');
    item.status = 'Submitted';
    item.submittedBy = context.actor;
    item.submittedAt = context.now;
    item.version++;
    refreshDocPackageStatus(state, pkg.id, context.now);
  }
  function docItemReview(state, request, context) {
    const item = findDocItem(state, request.itemId);
    const pkg = findDocPackage(state, item.packageId);
    openDocPackage(pkg);
    if (item.status !== 'Submitted') fail('Only submitted items can be reviewed.');
    const approve = !!request.approve;
    const remarks = str(request.remarks);
    if (!approve && !remarks) fail('A reason is required when rejecting.');
    item.status = approve ? 'Approved' : 'Rejected';
    item.reviewedBy = context.actor;
    item.reviewedAt = context.now;
    item.remarks = approve ? '' : remarks;
    item.version++;
    refreshDocPackageStatus(state, pkg.id, context.now);
  }
  function docItemReopen(state, request, context) {
    const item = findDocItem(state, request.itemId);
    const pkg = findDocPackage(state, item.packageId);
    openDocPackage(pkg);
    if (item.status !== 'Approved') fail('Only approved items can be reopened.');
    item.status = 'Pending';
    item.reviewedBy = '';
    item.reviewedAt = '';
    item.remarks = '';
    item.version++;
    refreshDocPackageStatus(state, pkg.id, context.now);
  }
  function docPackageArchive(state, request, context) {
    const pkg = findDocPackage(state, request.packageId);
    const archive = request.archived === undefined ? !pkg.archived : !!request.archived;
    pkg.archived = archive;
    pkg.status = archive ? 'Archived' : 'Open';
    pkg.version++;
    if (!archive) refreshDocPackageStatus(state, pkg.id, context.now);
    return pkg;
  }

  function submitFinBook(state, request, context) {
    const book = state.FinBooks.find(row => row.id === request.bookId);
    if (!book) fail('Finance book not found.');
    if (book.archived) fail('Finance book is archived.');
    if (book.status === 'Approved') fail('This finance book is already approved.');
    if (book.status === 'Submitted') fail('This finance book is already waiting for review.');
    book.status = 'Submitted';
    book.remarks = str(request.remarks || '');
    book.submittedBy = context.actor;
    book.submittedAt = context.now;
    book.reviewedBy = '';
    book.reviewedAt = '';
    book.version++;
  }
  function reviewFinBook(state, request, context) {
    const book = state.FinBooks.find(row => row.id === request.bookId);
    if (!book) fail('Finance book not found.');
    if (book.status !== 'Submitted') fail('Only submitted finance books can be reviewed.');
    const approve = !!request.approve;
    const remarks = str(request.remarks);
    if (!approve && !remarks) fail('A reason is required when rejecting.');
    book.status = approve ? 'Approved' : 'Rejected';
    book.remarks = approve ? '' : remarks;
    book.reviewedBy = context.actor;
    book.reviewedAt = context.now;
    book.version++;
  }
  function saveFinanceBook(state, request, context) {
    const payload = request.book;
    if (!payload || typeof payload !== 'object') fail('Finance book payload is required.');
    const book = upsert(state, 'FinBooks', payload, context.uuid);
    const syncChildren = (table, rows, key) => {
      const keep = new Set();
      rows.forEach(input => {
        const row = upsert(state, table, Object.assign({}, input, { [key]: book.id }), context.uuid);
        keep.add(row.id);
      });
      state[table] = state[table].filter(row => !(row[key] === book.id && !keep.has(row.id)));
    };
    syncChildren('FinIncomes', payload.incomes || [], 'bookId');
    syncChildren('FinExpenses', payload.expenses || [], 'bookId');
    const keepForms = new Set();
    const keepLines = new Set();
    (payload.reimbursements || []).forEach(formInput => {
      const form = upsert(state, 'FinReimbursements', Object.assign({}, formInput, { bookId: book.id }), context.uuid);
      keepForms.add(form.id);
      (formInput.lines || []).forEach(lineInput => {
        const line = upsert(state, 'FinReimburseLines', Object.assign({}, lineInput, { reimbursementId: form.id }), context.uuid);
        keepLines.add(line.id);
      });
    });
    state.FinReimbursements = state.FinReimbursements.filter(row => !(row.bookId === book.id && !keepForms.has(row.id)));
    const formBooks = new Map(state.FinReimbursements.map(row => [row.id, row.bookId]));
    state.FinReimburseLines = state.FinReimburseLines.filter(row => {
      const formBook = formBooks.get(row.reimbursementId);
      if (!formBook) return false;
      if (formBook !== book.id) return true;
      return keepLines.has(row.id);
    });
    return book;
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
  function setupPreview(state) {
    const missing = recommendedCatalog.filter(recommended => !state.Catalog.some(row => row.code === recommended.code || (row.kind === recommended.kind && row.category === recommended.category && row.name === recommended.name && row.level === recommended.level)));
    const legacyExams = state.Catalog.filter(row => row.kind === 'Exam' && !row.archived && ['EFA', 'BFA'].includes(row.name));
    return { missing: copy(missing), legacyExams: legacyExams.map(row => ({ id: row.id, name: row.name })), ready: missing.length === 0 && legacyExams.length === 0 };
  }
  function applyRecommendedSetup(original, context) {
    const state = upgradeState(original);
    if (context.revision !== state.revision) fail('Conflict: newer data is available. Reload before applying setup.');
    recommendedCatalog.forEach(recommended => {
      let row = state.Catalog.find(item => item.code === recommended.code);
      if (!row) row = state.Catalog.find(item => item.kind === recommended.kind && item.category === recommended.category && item.name === recommended.name && item.level === recommended.level);
      if (row) {
        const changed = !row.code || row.sortOrder !== recommended.sortOrder || row.eligibilityMetric !== recommended.eligibilityMetric || row.eligibilityThreshold !== recommended.eligibilityThreshold;
        if (changed) Object.assign(row, recommended, { id: row.id, version: row.version + 1, archived: false });
      } else state.Catalog.push(Object.assign({ id: 'CAT-' + context.uuid(), version: 1 }, recommended));
    });
    state.Catalog.filter(row => row.kind === 'Exam' && ['EFA', 'BFA'].includes(row.name) && !row.code && !row.archived).forEach(row => { row.archived = true; row.version++; });
    state.Awards.forEach(row => {
      if (row.catalogId) return;
      const catalog = state.Catalog.find(item => item.kind === 'Award' && item.category === row.category && item.name === row.name && item.level === row.level);
      if (catalog) { row.catalogId = catalog.id; row.version++; }
    });
    return finish(state, context.actor, 'Apply recommended system setup', context.now);
  }
  function awardEligibility(state) {
    const years = new Set();
    state.Duty.forEach(row => years.add(row.year));
    state.Enrolments.forEach(row => years.add(row.year));
    state.Activities.forEach(row => years.add(yearOf(row.date)));
    state.Exams.forEach(row => years.add(yearOf(row.date)));
    const eligible = [];
    const members = state.Members.map(member => {
      const lifetimeDutyHours = state.Duty.filter(row => row.memberId === member.id && row.hours !== null).reduce((total, row) => total + row.hours, 0);
      const efficientYears = [...years].filter(year => year && summary(state, member.id, year).efficient === 'Efficient').length;
      const issued = new Set(state.Awards.filter(row => row.memberId === member.id).map(row => row.catalogId).filter(Boolean));
      state.Catalog.filter(row => row.kind === 'Award' && !row.archived && row.eligibilityMetric && !issued.has(row.id)).sort((first, second) => first.sortOrder - second.sortOrder).forEach(catalog => {
        const value = catalog.eligibilityMetric === 'lifetimeDutyHours' ? lifetimeDutyHours : efficientYears;
        if (value >= catalog.eligibilityThreshold) eligible.push({ memberId: member.id, catalogId: catalog.id, category: catalog.category, name: catalog.name, level: catalog.level, metric: catalog.eligibilityMetric, value, threshold: catalog.eligibilityThreshold });
      });
      return { memberId: member.id, lifetimeDutyHours, efficientYears };
    });
    return { eligible, members };
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
      const bookIds = selected.FinBooks;
      if (bookIds.size) {
        add('FinIncomes', state.FinIncomes.filter(row => bookIds.has(row.bookId)));
        add('FinExpenses', state.FinExpenses.filter(row => bookIds.has(row.bookId)));
        add('FinReimbursements', state.FinReimbursements.filter(row => bookIds.has(row.bookId)));
      }
      if (selected.FinReimbursements.size) add('FinReimburseLines', state.FinReimburseLines.filter(row => selected.FinReimbursements.has(row.reimbursementId)));
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
    const label = table === 'Members' ? root.name : table === 'Activities' ? root.name : table === 'Catalog' ? root.name : table === 'FinBooks' ? root.activityName : root.id;
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
  const api = { fields, tables, categories, statuses, results, forms, races, recommendedCatalog, docActivityTypes, docItemStatuses, docPackageStatuses, defaultDocItems, empty, upgradeState, normalize, validateState, mutate, summary, setupPreview, applyRecommendedSetup, awardEligibility, projectPublic, publicSearch, importRows, recycleBundle, recycleDelete, allMembersBundle, recycleDeleteAllMembers, restoreTrash, purgeTrash, copy, finish, norm, icKey, saveFinanceBook, money };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KPT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
