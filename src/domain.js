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
    FinBooks: ['id', 'version', 'activityName', 'packageId', 'status', 'remarks', 'rejectStage', 'submittedBy', 'submittedAt', 'checkedBy', 'checkedAt', 'forwardedBy', 'forwardedAt', 'reviewedBy', 'reviewedAt'],
    FinIncomes: ['id', 'version', 'bookId', 'date', 'description', 'amount'],
    FinExpenses: ['id', 'version', 'bookId', 'date', 'item', 'description', 'quantity', 'unitCost', 'amount'],
    FinReimbursements: ['id', 'version', 'bookId', 'formSeq', 'treasurerName', 'formDate', 'purpose', 'chequeNo', 'amount'],
    FinReimburseLines: ['id', 'version', 'reimbursementId', 'lineNo', 'date', 'invoiceNo', 'particular', 'total'],
    DocPackages: ['id', 'version', 'activityType', 'year', 'eventDate', 'status', 'basePackageId', 'ocEmail', 'osEmail', 'otEmail', 'createdBy', 'createdAt', 'approvedAt', 'archived'],
    DocItems: ['id', 'version', 'packageId', 'sortOrder', 'title', 'role', 'assignee', 'dueOffsetDays', 'required', 'templateId', 'status', 'taskStatus', 'fileName', 'fileId', 'uploadedBy', 'uploadedAt', 'submittedBy', 'submittedAt', 'checkedBy', 'checkedAt', 'forwardedBy', 'forwardedAt', 'reviewedBy', 'reviewedAt', 'remarks', 'rejectStage', 'archived'],
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
  const docItemStatuses = ['Pending', 'Draft', 'AwaitingOC', 'OCChecked', 'Submitted', 'Approved', 'Rejected', 'NotRequired'];
  const docPackageStatuses = ['Open', 'Completed', 'Archived'];
  const docUploadMimes = ['.docx', '.xlsx', '.pdf', '.pptx', '.jpg', '.jpeg', '.png', '.zip'];
  const finStatuses = ['Draft', 'AwaitingOC', 'OCChecked', 'Submitted', 'Approved', 'Rejected'];
  const workflowLockedStatuses = ['AwaitingOC', 'OCChecked', 'Submitted', 'Approved'];
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
    const state = { schema: 1, revision: 0, sequence: 0, updatedAt: '', publishedRevision: -1, audit: [], trash: [], notificationEvents: [], finAttachments: [] };
    tables.forEach(table => { state[table] = []; });
    ['EFA', 'BFA', 'Home Nursing', 'AFA'].forEach((name, index) => state.Catalog.push({ id: 'CAT-' + (index + 1), version: 1, code: '', sortOrder: index + 1, kind: 'Exam', category: '', name, level: '', eligibilityMetric: '', eligibilityThreshold: null, archived: false }));
    return state;
  }
  function upgradeState(input) {
    const state = copy(input);
    state.trash = Array.isArray(state.trash) ? state.trash : [];
    state.notificationEvents = Array.isArray(state.notificationEvents) ? state.notificationEvents : [];
    state.finAttachments = Array.isArray(state.finAttachments) ? state.finAttachments : [];
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
    if (state.notificationEvents != null && !Array.isArray(state.notificationEvents)) fail('notificationEvents must be an array.');
    if (state.finAttachments != null && !Array.isArray(state.finAttachments)) fail('finAttachments must be an array.');
    if (Array.isArray(state.finAttachments)) {
      state.finAttachments.forEach(row => {
        if (!row || typeof row !== 'object') fail('Invalid finance attachment record.');
        if (!row.id || !row.bookId) fail('Finance attachment requires id and bookId.');
        if (!Number.isInteger(row.version) || row.version < 1) fail('Invalid finance attachment version.');
        if (row.bytes != null && (!Number.isFinite(row.bytes) || row.bytes < 0)) fail('Invalid finance attachment size.');
      });
    }
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
          if (row.packageId && !state.DocPackages.some(item => item.id === row.packageId)) fail('Unknown document package for finance book.');
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
          if (['AwaitingOC', 'OCChecked', 'Submitted'].includes(row.status) && !row.fileId) fail('Submitted items need an uploaded file.');
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
    } else if (request.action === 'docItemCheck') {
      docItemCheck(state, request, context);
    } else if (request.action === 'docItemForward') {
      docItemForward(state, request, context);
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
    } else if (request.action === 'checkFinBook') {
      checkFinBook(state, request, context);
    } else if (request.action === 'forwardFinBook') {
      forwardFinBook(state, request, context);
    } else if (request.action === 'reviewFinBook') {
      reviewFinBook(state, request, context);
    } else if (request.action === 'reopenFinBook') {
      const book = state.FinBooks.find(row => row.id === request.bookId);
      if (!book) fail('Finance book not found.');
      if (book.status !== 'Approved' && book.status !== 'Rejected') fail('Only approved or rejected books can be reopened.');
      book.status = 'Draft';
      book.remarks = '';
      book.rejectStage = '';
      book.submittedBy = '';
      book.submittedAt = '';
      book.checkedBy = '';
      book.checkedAt = '';
      book.forwardedBy = '';
      book.forwardedAt = '';
      book.reviewedBy = '';
      book.reviewedAt = '';
      book.version++;
    } else if (request.action === 'uploadFinanceAttachment') {
      uploadFinanceAttachment(state, request, context);
    } else if (request.action === 'removeFinanceAttachment') {
      removeFinanceAttachment(state, request, context);
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
      if (workflowLockedStatuses.includes(item.status) || item.status === 'Approved') fail('Only pending or draft items can be removed.');
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
  function clearWorkflowFields(item) {
    item.submittedBy = '';
    item.submittedAt = '';
    item.checkedBy = '';
    item.checkedAt = '';
    item.forwardedBy = '';
    item.forwardedAt = '';
    item.reviewedBy = '';
    item.reviewedAt = '';
    item.remarks = '';
    item.rejectStage = '';
  }
  function docItemUpload(state, request, context) {
    const item = findDocItem(state, request.itemId);
    const pkg = findDocPackage(state, item.packageId);
    openDocPackage(pkg);
    if (item.status === 'Approved') fail('Reopen this item before uploading a new file.');
    if (workflowLockedStatuses.includes(item.status)) fail('This item is waiting in the approval flow.');
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
    clearWorkflowFields(item);
    item.status = 'Draft';
    item.version++;
    refreshDocPackageStatus(state, pkg.id, context.now);
  }
  function docItemSubmit(state, request, context) {
    const item = findDocItem(state, request.itemId);
    const pkg = findDocPackage(state, item.packageId);
    openDocPackage(pkg);
    if (!['Draft', 'Rejected'].includes(item.status)) fail('Upload a file before submitting to OC.');
    if (!item.fileId) fail('Upload a file before submitting to OC.');
    clearWorkflowFields(item);
    item.status = 'AwaitingOC';
    item.submittedBy = context.actor;
    item.submittedAt = context.now;
    item.version++;
    refreshDocPackageStatus(state, pkg.id, context.now);
  }
  function docItemCheck(state, request, context) {
    const item = findDocItem(state, request.itemId);
    const pkg = findDocPackage(state, item.packageId);
    openDocPackage(pkg);
    if (item.status !== 'AwaitingOC') fail('Only items waiting for OC can be checked.');
    const approve = !!request.approve;
    const remarks = str(request.remarks);
    if (!approve && !remarks) fail('A reason is required when returning a document.');
    if (approve) {
      item.status = 'OCChecked';
      item.checkedBy = context.actor;
      item.checkedAt = context.now;
      item.remarks = '';
      item.rejectStage = '';
    } else {
      item.status = 'Rejected';
      item.rejectStage = 'OC';
      item.remarks = remarks;
      item.checkedBy = '';
      item.checkedAt = '';
    }
    item.version++;
    refreshDocPackageStatus(state, pkg.id, context.now);
  }
  function docItemForward(state, request, context) {
    const item = findDocItem(state, request.itemId);
    const pkg = findDocPackage(state, item.packageId);
    openDocPackage(pkg);
    if (item.status !== 'OCChecked') fail('Only OC-checked items can be forwarded for approval.');
    item.status = 'Submitted';
    item.forwardedBy = context.actor;
    item.forwardedAt = context.now;
    item.version++;
    refreshDocPackageStatus(state, pkg.id, context.now);
  }
  function docItemReview(state, request, context) {
    const item = findDocItem(state, request.itemId);
    const pkg = findDocPackage(state, item.packageId);
    openDocPackage(pkg);
    if (item.status !== 'Submitted') fail('Only forwarded items can receive final approval.');
    const approve = !!request.approve;
    const remarks = str(request.remarks);
    if (!approve && !remarks) fail('A reason is required when rejecting.');
    item.status = approve ? 'Approved' : 'Rejected';
    item.reviewedBy = context.actor;
    item.reviewedAt = context.now;
    item.remarks = approve ? '' : remarks;
    item.rejectStage = approve ? '' : 'Final';
    item.version++;
    refreshDocPackageStatus(state, pkg.id, context.now);
  }
  function docItemReopen(state, request, context) {
    const item = findDocItem(state, request.itemId);
    const pkg = findDocPackage(state, item.packageId);
    openDocPackage(pkg);
    if (item.status !== 'Approved') fail('Only approved items can be reopened.');
    clearWorkflowFields(item);
    item.status = 'Pending';
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
    if (workflowLockedStatuses.includes(book.status)) fail('This finance book is already in the approval flow.');
    book.status = 'AwaitingOC';
    book.remarks = str(request.remarks || '');
    book.rejectStage = '';
    book.submittedBy = context.actor;
    book.submittedAt = context.now;
    book.checkedBy = '';
    book.checkedAt = '';
    book.forwardedBy = '';
    book.forwardedAt = '';
    book.reviewedBy = '';
    book.reviewedAt = '';
    book.version++;
  }
  function checkFinBook(state, request, context) {
    const book = state.FinBooks.find(row => row.id === request.bookId);
    if (!book) fail('Finance book not found.');
    if (book.status !== 'AwaitingOC') fail('Only finance books waiting for OC can be checked.');
    const approve = !!request.approve;
    const remarks = str(request.remarks);
    if (!approve && !remarks) fail('A reason is required when returning a finance book.');
    if (approve) {
      book.status = 'OCChecked';
      book.checkedBy = context.actor;
      book.checkedAt = context.now;
      book.remarks = '';
      book.rejectStage = '';
    } else {
      book.status = 'Rejected';
      book.rejectStage = 'OC';
      book.remarks = remarks;
      book.checkedBy = '';
      book.checkedAt = '';
    }
    book.version++;
  }
  function forwardFinBook(state, request, context) {
    const book = state.FinBooks.find(row => row.id === request.bookId);
    if (!book) fail('Finance book not found.');
    if (book.status !== 'OCChecked') fail('Only OC-checked finance books can be forwarded for approval.');
    book.status = 'Submitted';
    book.forwardedBy = context.actor;
    book.forwardedAt = context.now;
    book.version++;
  }
  function reviewFinBook(state, request, context) {
    const book = state.FinBooks.find(row => row.id === request.bookId);
    if (!book) fail('Finance book not found.');
    if (book.status !== 'Submitted') fail('Only forwarded finance books can receive final approval.');
    const approve = !!request.approve;
    const remarks = str(request.remarks);
    if (!approve && !remarks) fail('A reason is required when rejecting.');
    book.status = approve ? 'Approved' : 'Rejected';
    book.remarks = approve ? '' : remarks;
    book.rejectStage = approve ? '' : 'Final';
    book.reviewedBy = context.actor;
    book.reviewedAt = context.now;
    book.version++;
  }
  const finWorkflowFields = ['status', 'remarks', 'rejectStage', 'submittedBy', 'submittedAt', 'checkedBy', 'checkedAt', 'forwardedBy', 'forwardedAt', 'reviewedBy', 'reviewedAt'];
  function assertChildOwned(state, table, input, key, expectedId, label) {
    const id = str(input && input.id);
    if (!id) return;
    const current = state[table].find(row => row.id === id);
    if (!current) fail('Unknown ' + label + ' record. Leave ID blank for a new row.');
    if (str(current[key]) !== str(expectedId)) fail(label + ' belongs to another record.');
  }
  function saveFinanceBook(state, request, context) {
    const payload = request.book;
    if (!payload || typeof payload !== 'object') fail('Finance book payload is required.');
    const existing = payload.id ? state.FinBooks.find(row => row.id === payload.id) : null;
    if (existing && workflowLockedStatuses.includes(existing.status)) fail('Unlock or reopen this finance book before editing.');
    const safe = Object.assign({}, payload);
    finWorkflowFields.forEach(key => { delete safe[key]; });
    if (existing) {
      safe.id = existing.id;
      safe.version = existing.version;
      // packageId is ownership — never retarget via generic save.
      safe.packageId = existing.packageId;
      safe.status = existing.status === 'Rejected' ? 'Draft' : existing.status;
    } else {
      safe.status = 'Draft';
      safe.packageId = str(payload.packageId || request.packageId || '');
    }
    safe.remarks = existing && existing.status === 'Rejected' ? existing.remarks : '';
    safe.rejectStage = existing && existing.status === 'Rejected' ? existing.rejectStage : '';
    safe.submittedBy = existing ? existing.submittedBy : '';
    safe.submittedAt = existing ? existing.submittedAt : '';
    safe.checkedBy = existing ? existing.checkedBy : '';
    safe.checkedAt = existing ? existing.checkedAt : '';
    safe.forwardedBy = existing ? existing.forwardedBy : '';
    safe.forwardedAt = existing ? existing.forwardedAt : '';
    safe.reviewedBy = existing ? existing.reviewedBy : '';
    safe.reviewedAt = existing ? existing.reviewedAt : '';
    const book = upsert(state, 'FinBooks', safe, context.uuid);
    const incomes = payload.incomes || [];
    const expenses = payload.expenses || [];
    const forms = payload.reimbursements || [];
    // Existing child ids must already belong to this book — never steal from another book/form.
    incomes.forEach(input => assertChildOwned(state, 'FinIncomes', input, 'bookId', book.id, 'Income'));
    expenses.forEach(input => assertChildOwned(state, 'FinExpenses', input, 'bookId', book.id, 'Expense'));
    forms.forEach(formInput => {
      assertChildOwned(state, 'FinReimbursements', formInput, 'bookId', book.id, 'Reimbursement form');
      const formId = str(formInput.id);
      (formInput.lines || []).forEach(lineInput => {
        const lineId = str(lineInput.id);
        if (!lineId) return;
        const currentLine = state.FinReimburseLines.find(row => row.id === lineId);
        if (!currentLine) fail('Unknown reimbursement line. Leave ID blank for a new row.');
        // Existing lines cannot move between forms, even inside one request.
        if (!formId || str(currentLine.reimbursementId) !== formId) fail('Reimbursement line belongs to another form.');
        const currentForm = state.FinReimbursements.find(row => row.id === currentLine.reimbursementId);
        if (!currentForm || str(currentForm.bookId) !== str(book.id)) fail('Reimbursement line belongs to another book.');
      });
    });
    const syncChildren = (table, rows, key) => {
      const keep = new Set();
      rows.forEach(input => {
        const row = upsert(state, table, Object.assign({}, input, { [key]: book.id }), context.uuid);
        keep.add(row.id);
      });
      state[table] = state[table].filter(row => !(row[key] === book.id && !keep.has(row.id)));
    };
    syncChildren('FinIncomes', incomes, 'bookId');
    syncChildren('FinExpenses', expenses, 'bookId');
    const keepForms = new Set();
    const keepLines = new Set();
    forms.forEach(formInput => {
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
  const finAttachmentAllowed = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf' };
  const finAttachmentMaxBytes = 5 * 1024 * 1024;
  const finAttachmentMaxCount = 30;
  const finAttachmentMaxTotalBytes = 50 * 1024 * 1024;
  function attachmentBookStatusEditable_(status) {
    return status === 'Draft' || status === 'Rejected';
  }
  function uploadFinanceAttachment(state, request, context) {
    const book = state.FinBooks.find(row => row.id === request.bookId);
    if (!book) fail('Finance book not found.');
    if (!attachmentBookStatusEditable_(book.status)) fail('Only draft or returned finance books can change attachments.');
    const fileName = str(request.fileName);
    const mime = str(request.mime);
    const fileId = str(request.fileId);
    const bytes = Number(request.bytes);
    if (!fileName) fail('File name is required.');
    if (!fileId) fail('Attachment storage failed.');
    if (!Number.isFinite(bytes) || bytes <= 0) fail('Attachment content is empty.');
    if (bytes > finAttachmentMaxBytes) fail('Attachment exceeds the 5 MiB limit.');
    const dot = fileName.lastIndexOf('.');
    const extension = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
    const expectedMime = finAttachmentAllowed[extension];
    if (!expectedMime) fail('Allowed attachments: JPG, PNG, PDF.');
    if (mime && mime !== expectedMime) fail('Declared type does not match the file extension.');
    if (!mime) request.mime = expectedMime;
    const active = (state.finAttachments || []).filter(row => row.bookId === book.id && row.active);
    if (active.length >= finAttachmentMaxCount) fail('A finance book allows at most 30 active attachments.');
    const total = active.reduce((sum, row) => sum + (Number(row.bytes) || 0), 0);
    if (total + bytes > finAttachmentMaxTotalBytes) fail('A finance book allows at most 50 MiB of attachments.');
    state.finAttachments = Array.isArray(state.finAttachments) ? state.finAttachments : [];
    const attachment = {
      id: 'FAT-' + context.uuid(),
      version: 1,
      bookId: book.id,
      fileName,
      fileId,
      mime: mime || expectedMime,
      bytes,
      uploadedBy: str(context.actor),
      uploadedAt: context.now,
      active: true
    };
    state.finAttachments.push(attachment);
    book.version++;
    return attachment;
  }
  function removeFinanceAttachment(state, request, context) {
    const attachmentId = str(request.attachmentId);
    const attachment = (state.finAttachments || []).find(row => row.id === attachmentId);
    if (!attachment) fail('Finance attachment not found.');
    if (!attachment.active) fail('Finance attachment is already removed.');
    const book = state.FinBooks.find(row => row.id === attachment.bookId);
    if (!book) fail('Finance book not found.');
    if (!attachmentBookStatusEditable_(book.status)) fail('Only draft or returned finance books can change attachments.');
    attachment.active = false;
    attachment.version++;
    book.version++;
    return attachment;
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
  // Response-only projection. Never persist this view or use it as the mutation source.
  function projectForActor(state, actor) {
    actor = actor || {};
    if (actor.owner) return copy(state);
    const email = str(actor.email).trim().toLowerCase();
    const assigned = (pkg, role) => !!email && str(pkg[role + 'Email']).trim().toLowerCase() === email;
    const packages = state.DocPackages || [];
    const docPackages = new Set(packages.filter(pkg => actor.admin || assigned(pkg, 'os') || assigned(pkg, 'oc')).map(pkg => pkg.id));
    const financePackages = new Set(packages.filter(pkg => assigned(pkg, 'ot') || assigned(pkg, 'oc')).map(pkg => pkg.id));
    const ownPackages = new Set(packages.filter(pkg => assigned(pkg, 'os') || assigned(pkg, 'ot') || assigned(pkg, 'oc')).map(pkg => pkg.id));
    const view = { schema: state.schema, revision: state.revision, sequence: actor.admin ? state.sequence : 0, updatedAt: state.updatedAt, publishedRevision: state.publishedRevision, audit: [], trash: [] };
    tables.forEach(table => { view[table] = []; });
    const rows = (table, predicate) => (state[table] || []).filter(predicate).map(row => {
      const safe = {};
      fields[table].forEach(key => { if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined) safe[key] = copy(row[key]); });
      return safe;
    });
    if (actor.admin) {
      ['Members', 'Activities', 'Attendance', 'Exams', 'Duty', 'Awards', 'Enrolments', 'Catalog'].forEach(table => { view[table] = rows(table, () => true); });
    }
    view.DocItems = rows('DocItems', row => docPackages.has(row.packageId));
    const types = new Set(packages.filter(pkg => docPackages.has(pkg.id)).map(pkg => pkg.activityType));
    const templateIds = new Set(view.DocItems.map(row => row.templateId).filter(Boolean));
    view.DocTemplates = rows('DocTemplates', row => types.has(row.activityType) || templateIds.has(row.id));
    view.FinBooks = rows('FinBooks', row => actor.treasurer || financePackages.has(row.packageId));
    const bookIds = new Set(view.FinBooks.map(row => row.id));
    ['FinIncomes', 'FinExpenses', 'FinReimbursements'].forEach(table => { view[table] = rows(table, row => bookIds.has(row.bookId)); });
    const formIds = new Set(view.FinReimbursements.map(row => row.id));
    view.FinReimburseLines = rows('FinReimburseLines', row => formIds.has(row.reimbursementId));
    const visiblePackages = new Set([...docPackages, ...ownPackages, ...view.FinBooks.map(row => row.packageId).filter(Boolean)]);
    view.DocPackages = rows('DocPackages', pkg => visiblePackages.has(pkg.id)).map(pkg => {
      if (actor.admin || ownPackages.has(pkg.id)) return pkg;
      // A finance reviewer needs activity context, not other officers' identities.
      const safe = {};
      ['id', 'version', 'activityType', 'year', 'eventDate', 'status', 'archived'].forEach(key => { if (Object.prototype.hasOwnProperty.call(pkg, key)) safe[key] = pkg[key]; });
      return safe;
    });
    view.finAttachments = (state.finAttachments || [])
      .filter(row => row && row.active && bookIds.has(row.bookId))
      .map(row => copy(row));
    return view;
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
  // --- Hub notifications (pure helpers) ---
  const hubKinds = ['DraftSaved', 'SubmittedToOC', 'OCChecked', 'ReturnedByOC', 'ForwardedForApproval', 'Approved', 'ReturnedByFinal'];
  function hubEmail_(value) { return str(value).toLowerCase(); }
  function hubAccessList_(value) {
    if (value == null) return [];
    return (Array.isArray(value) ? value : [value]).map(hubEmail_).filter(Boolean);
  }
  function hubPackageOf_(state, entityType, entityId) {
    if (entityType === 'document') {
      const item = (state.DocItems || []).find(row => row.id === entityId);
      return item ? (state.DocPackages || []).find(row => row.id === item.packageId) || null : null;
    }
    if (entityType === 'finance') {
      const book = (state.FinBooks || []).find(row => row.id === entityId);
      return book && book.packageId ? (state.DocPackages || []).find(row => row.id === book.packageId) || null : null;
    }
    return null;
  }
  function hubEntity_(state, entityType, entityId) {
    if (entityType === 'document') return (state.DocItems || []).find(row => row.id === entityId) || null;
    if (entityType === 'finance') return (state.FinBooks || []).find(row => row.id === entityId) || null;
    return null;
  }
  function hubEntityTitle_(entityType, entity) {
    if (!entity) return '';
    return entityType === 'document' ? str(entity.title) : str(entity.activityName);
  }
  function hubEntityVersion_(entityType, entity) {
    if (!entity) return 0;
    return Number(entity.version) || 0;
  }
  function hubRoleForEmail_(pkg, email, entityType, preferRole) {
    if (preferRole === 'owner' || preferRole === 'admin' || preferRole === 'treasurer') return preferRole;
    if (!pkg) return preferRole || '';
    const target = hubEmail_(email);
    if (hubEmail_(pkg.ocEmail) === target) return 'oc';
    if (entityType === 'document' && hubEmail_(pkg.osEmail) === target) return 'os';
    if (entityType === 'finance' && hubEmail_(pkg.otEmail) === target) return 'ot';
    if (hubEmail_(pkg.osEmail) === target) return 'os';
    if (hubEmail_(pkg.otEmail) === target) return 'ot';
    return preferRole || '';
  }
  function hubFinContentSignature_(state, bookId) {
    const book = (state.FinBooks || []).find(row => row.id === bookId);
    if (!book) return '';
    const pick = (rows, keys) => rows.map(row => keys.map(key => str(row[key]))).sort();
    const incomes = pick((state.FinIncomes || []).filter(row => row.bookId === bookId), ['date', 'description', 'amount']);
    const expenses = pick((state.FinExpenses || []).filter(row => row.bookId === bookId), ['date', 'item', 'description', 'quantity', 'unitCost', 'amount']);
    const forms = (state.FinReimbursements || []).filter(row => row.bookId === bookId).map(form => {
      const lines = pick((state.FinReimburseLines || []).filter(row => row.reimbursementId === form.id), ['lineNo', 'date', 'invoiceNo', 'particular', 'total']);
      return [String(str(form.formSeq)), str(form.treasurerName), str(form.formDate), str(form.purpose), str(form.chequeNo), str(form.amount), JSON.stringify(lines)];
    }).sort();
    return JSON.stringify({ name: str(book.activityName), remarks: str(book.remarks), incomes, expenses, forms });
  }
  function hubPushEvent_(events, draft, context) {
    const recipient = hubEmail_(draft.recipientEmail);
    if (!recipient) return;
    const existing = events.find(row =>
      hubEmail_(row.recipientEmail) === recipient &&
      row.kind === draft.kind &&
      row.entityId === draft.entityId &&
      row.destination === draft.destination
    );
    if (existing) {
      existing.entityVersion = draft.entityVersion;
      existing.createdAt = draft.createdAt;
      existing.entityTitle = draft.entityTitle;
      existing.actorEmail = draft.actorEmail;
      existing.packageId = draft.packageId;
      existing.entityType = draft.entityType;
      existing.role = draft.role;
      return;
    }
    events.push(Object.assign({ id: 'EVT-' + context.uuid() }, draft, { recipientEmail: recipient }));
  }
  function hubPruneEvents_(events, now) {
    const baseTime = Date.parse(now) || Date.now();
    const cutoff = baseTime - 90 * 24 * 60 * 60 * 1000;
    return events
      .filter(row => {
        const time = Date.parse(row.createdAt);
        return !Number.isFinite(time) || time >= cutoff;
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 2000);
  }
  function hubResolveSubmitter_(state, entityType, entity, pkg, actorEmail) {
    const submittedBy = hubEmail_(entity && entity.submittedBy);
    const assigned = pkg ? [pkg.osEmail, pkg.otEmail, pkg.ocEmail].map(hubEmail_).filter(Boolean) : [];
    if (submittedBy && (!pkg || assigned.includes(submittedBy))) return submittedBy;
    // Revoked or missing submitter: fall back to current OS/OT only, never a revoked email.
    if (!pkg) return hubEmail_(actorEmail);
    const fallbackKey = entityType === 'finance' ? 'otEmail' : 'osEmail';
    return hubEmail_(pkg[fallbackKey]) || hubEmail_(actorEmail) || '';
  }
  function appendHubEvents(before, after, request, actor, access, context) {
    if (!after || typeof after !== 'object') return after;
    if (!Array.isArray(after.notificationEvents)) after.notificationEvents = [];
    const action = str(request && request.action);
    const now = (context && context.now) || new Date().toISOString();
    const actorEmail = hubEmail_(typeof actor === 'string' ? actor : actor && actor.email);
    const accessMap = access || {};
    const ownerList = hubAccessList_(accessMap.owner);
    const adminList = hubAccessList_(accessMap.admins);
    const treasurerList = hubAccessList_(accessMap.treasurers);
    const plan = [];
    const detect = (actionName, entityType, idFromRequest) => {
      if (action !== actionName) return null;
      const entityId = str(idFromRequest);
      const entityAfter = hubEntity_(after, entityType, entityId);
      if (!entityAfter) return null;
      return { entityType, entityId, entityAfter, entityBefore: hubEntity_(before, entityType, entityId) };
    };
    let info = detect('docItemUpload', 'document', request.itemId);
    if (info) plan.push({ kind: 'DraftSaved', info });
    info = detect('uploadFinanceAttachment', 'finance', request.bookId);
    if (info) plan.push({ kind: 'DraftSaved', info });
    if (action === 'removeFinanceAttachment') {
      const attachment = (before.finAttachments || []).find(row => row.id === str(request.attachmentId));
      info = detect('removeFinanceAttachment', 'finance', request.bookId || (attachment && attachment.bookId));
      if (info) plan.push({ kind: 'DraftSaved', info });
    }
    if (action === 'saveFinanceBook') {
      const requestedId = str(request.book && request.book.id) || str(request.bookId);
      let bookId = requestedId;
      let entityAfter = bookId ? hubEntity_(after, 'finance', bookId) : null;
      if (!entityAfter) {
        const beforeIds = new Set((before.FinBooks || []).map(row => row.id));
        const created = (after.FinBooks || []).filter(row => !beforeIds.has(row.id));
        if (created.length) {
          entityAfter = created[created.length - 1];
          bookId = entityAfter.id;
        }
      }
      if (entityAfter && hubFinContentSignature_(before, bookId) !== hubFinContentSignature_(after, bookId)) {
        plan.push({ kind: 'DraftSaved', info: { entityType: 'finance', entityId: bookId, entityAfter, entityBefore: hubEntity_(before, 'finance', bookId) } });
      }
    }
    info = detect('docItemSubmit', 'document', request.itemId);
    if (info) plan.push({ kind: 'SubmittedToOC', info });
    info = detect('submitFinBook', 'finance', request.bookId);
    if (info) plan.push({ kind: 'SubmittedToOC', info });
    if (action === 'docItemCheck') {
      info = detect('docItemCheck', 'document', request.itemId);
      if (info) plan.push({ kind: request.approve ? 'OCChecked' : 'ReturnedByOC', info });
    }
    if (action === 'checkFinBook') {
      info = detect('checkFinBook', 'finance', request.bookId);
      if (info) plan.push({ kind: request.approve ? 'OCChecked' : 'ReturnedByOC', info });
    }
    info = detect('docItemForward', 'document', request.itemId);
    if (info) plan.push({ kind: 'ForwardedForApproval', info });
    info = detect('forwardFinBook', 'finance', request.bookId);
    if (info) plan.push({ kind: 'ForwardedForApproval', info });
    if (action === 'docItemReview') {
      info = detect('docItemReview', 'document', request.itemId);
      if (info) plan.push({ kind: request.approve ? 'Approved' : 'ReturnedByFinal', info });
    }
    if (action === 'reviewFinBook') {
      info = detect('reviewFinBook', 'finance', request.bookId);
      if (info) plan.push({ kind: request.approve ? 'Approved' : 'ReturnedByFinal', info });
    }
    plan.forEach(entry => {
      const kind = entry.kind;
      const detail = entry.info;
      const entityType = detail.entityType;
      const entityId = detail.entityId;
      const entityAfter = detail.entityAfter;
      const pkg = hubPackageOf_(after, entityType, entityId);
      const base = {
        kind,
        packageId: pkg ? pkg.id : str(entityAfter.packageId || ''),
        entityType,
        entityId,
        entityVersion: hubEntityVersion_(entityType, entityAfter),
        entityTitle: hubEntityTitle_(entityType, entityAfter),
        actorEmail,
        createdAt: now
      };
      const push = (email, destination, role) => {
        const recipientEmail = hubEmail_(email);
        if (!recipientEmail) return;
        hubPushEvent_(after.notificationEvents, Object.assign({}, base, {
          recipientEmail,
          destination,
          role: role || hubRoleForEmail_(pkg, recipientEmail, entityType, role)
        }), context);
      };
      const ocEmail = pkg ? hubEmail_(pkg.ocEmail) : '';
      const submitter = hubResolveSubmitter_(after, entityType, entityAfter, pkg, actorEmail);
      if (kind === 'DraftSaved') {
        if (actorEmail) push(actorEmail, 'hall', hubRoleForEmail_(pkg, actorEmail, entityType, entityType === 'finance' ? 'ot' : 'os'));
        if (ocEmail) push(ocEmail, 'studio', 'oc');
      } else if (kind === 'SubmittedToOC') {
        if (ocEmail) push(ocEmail, 'studio', 'oc');
      } else if (kind === 'OCChecked') {
        if (submitter) push(submitter, 'hall', hubRoleForEmail_(pkg, submitter, entityType, entityType === 'finance' ? 'ot' : 'os'));
        const ocSelf = actorEmail || ocEmail;
        if (ocSelf) push(ocSelf, 'hall', 'oc');
      } else if (kind === 'ReturnedByOC') {
        if (submitter) push(submitter, 'studio', hubRoleForEmail_(pkg, submitter, entityType, entityType === 'finance' ? 'ot' : 'os'));
      } else if (kind === 'ForwardedForApproval') {
        ownerList.forEach(email => push(email, 'hall', 'owner'));
        const extra = entityType === 'finance' ? treasurerList : adminList;
        extra.forEach(email => push(email, 'hall', entityType === 'finance' ? 'treasurer' : 'admin'));
      } else if (kind === 'Approved' || kind === 'ReturnedByFinal') {
        if (submitter) push(submitter, 'hall', hubRoleForEmail_(pkg, submitter, entityType, entityType === 'finance' ? 'ot' : 'os'));
        if (ocEmail) push(ocEmail, 'hall', 'oc');
      }
    });
    after.notificationEvents = hubPruneEvents_(after.notificationEvents, now);
    return after;
  }
  function hubRoleHeld_(state, actor, email, entityType, entityId, targetRole) {
    if (actor.owner) return true;
    if (!targetRole) return true;
    if (targetRole === 'owner') return !!actor.owner;
    if (targetRole === 'admin') return !!actor.admin;
    if (targetRole === 'treasurer') return !!actor.treasurer;
    const pkg = hubPackageOf_(state, entityType, entityId);
    if (!pkg) return false;
    const target = hubEmail_(email);
    if (targetRole === 'oc') return hubEmail_(pkg.ocEmail) === target;
    if (targetRole === 'os') return hubEmail_(pkg.osEmail) === target;
    if (targetRole === 'ot') return hubEmail_(pkg.otEmail) === target;
    return false;
  }
  function hubNotificationFeed(state, actor, readMap, now) {
    actor = actor || {};
    const email = hubEmail_(typeof actor === 'string' ? actor : actor.email);
    const map = readMap && typeof readMap === 'object' ? readMap : {};
    const events = Array.isArray(state.notificationEvents) ? state.notificationEvents : [];
    const isOwner = !!actor.owner;
    const isAdmin = !!actor.admin;
    const isTreasurer = !!actor.treasurer;
    const visible = events.filter(row => {
      if (hubEmail_(row.recipientEmail) !== email) return false;
      const pkg = hubPackageOf_(state, row.entityType, row.entityId);
      const entity = hubEntity_(state, row.entityType, row.entityId);
      if (!entity) return false;
      // Entity read scope must match projectForActor.
      if (row.entityType === 'document') {
        if (!pkg) return false;
        const inScope = isOwner || isAdmin || hubEmail_(pkg.osEmail) === email || hubEmail_(pkg.ocEmail) === email;
        if (!inScope) return false;
      } else if (row.entityType === 'finance') {
        const inScope = isOwner || isTreasurer || (!!pkg && (hubEmail_(pkg.otEmail) === email || hubEmail_(pkg.ocEmail) === email));
        if (!inScope) return false;
      } else {
        return false;
      }
      // Event target role must still be held; former OC turned OT loses OC-only notices.
      return hubRoleHeld_(state, actor, email, row.entityType, row.entityId, row.role);
    });
    const refTime = Date.parse(now || state.updatedAt) || 0;
    const cutoff = refTime ? refTime - 90 * 24 * 60 * 60 * 1000 : 0;
    const items = visible
      .filter(row => !cutoff || (Date.parse(row.createdAt) || 0) >= cutoff)
      .map(row => {
        const claimed = Number(map[row.id]);
        const entityVersion = Number(row.entityVersion) || 0;
        // Do not trust read marks that claim a version beyond the event.
        const seenVersion = Number.isFinite(claimed) && claimed >= 0 && claimed <= entityVersion ? claimed : -1;
        return {
          id: row.id,
          kind: row.kind,
          packageId: row.packageId,
          entityType: row.entityType,
          entityId: row.entityId,
          entityVersion,
          entityTitle: row.entityTitle,
          actorEmail: row.actorEmail,
          createdAt: row.createdAt,
          unread: entityVersion > seenVersion,
          destination: row.destination,
          role: row.role
        };
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id)));
    const recent = items.slice(0, 100);
    // Counts only cover the returned list so hidden events cannot leave unfixable red dots.
    const unreadItems = recent.filter(item => item.unread);
    const activityUnread = {};
    const studioUnread = {};
    unreadItems.forEach(item => {
      if (item.destination === 'hall') {
        const key = item.packageId || '';
        activityUnread[key] = (activityUnread[key] || 0) + 1;
      } else if (item.destination === 'studio') {
        const key = item.role || '';
        studioUnread[key] = (studioUnread[key] || 0) + 1;
      }
    });
    return Object.freeze({
      notifications: Object.freeze(recent.map(item => Object.freeze(item))),
      unreadCount: unreadItems.length,
      activityUnread: Object.freeze(activityUnread),
      studioUnread: Object.freeze(studioUnread)
    });
  }
  const api = { fields, tables, categories, statuses, results, forms, races, recommendedCatalog, docActivityTypes, docItemStatuses, docPackageStatuses, defaultDocItems, empty, upgradeState, normalize, validateState, mutate, summary, setupPreview, applyRecommendedSetup, awardEligibility, projectPublic, projectForActor, publicSearch, importRows, recycleBundle, recycleDelete, allMembersBundle, recycleDeleteAllMembers, restoreTrash, purgeTrash, copy, finish, norm, icKey, saveFinanceBook, money, appendHubEvents, hubNotificationFeed, hubKinds, uploadFinanceAttachment, removeFinanceAttachment };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KPT = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
