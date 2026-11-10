(function (root) {
  'use strict';
  // Duty In Charge / Duty Record workspace UI — Previous balance, duty records,
  // private proofs, report bundle and Excel import. Talks only to the frozen
  // KPTTransport contract. No business rules live here: display what the backend
  // returns. Default language is Chinese (口语化); a toggle switches to English.

  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  let lang = 'zh';
  const tr = (zh, en) => lang === 'zh' ? zh : en;

  // Local base64 helpers (atob/btoa + Uint8Array) — service-ui has toBytes for the other direction.
  function bytesToBase64(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < arr.length; i += chunk) binary += String.fromCharCode.apply(null, arr.subarray(i, i + chunk));
    return btoa(binary);
  }
  // Integers as-is, everything else at most 2 decimals.
  function formatHours(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value == null ? '' : value);
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  }
  // Real calendar date in YYYY-MM-DD form (2025-02-30 is invalid).
  function isRealDate(value) {
    const text = String(value == null ? '' : value);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text;
  }
  function readAsBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(tr('无法读取文件。', 'Could not read the file.')));
      reader.readAsArrayBuffer(file);
    });
  }
  function downloadBytes(bytes, fileName, mime) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ---------- Excel import parsing ----------
  // Header row = spreadsheet row 1; accepted header names are case-insensitive
  // Chinese or English. Note is optional; the rest are required.
  const IMPORT_COLUMNS = {
    records: [
      { field: 'activity', names: ['活动', 'activity'], required: true },
      { field: 'member', names: ['会员', 'member'], required: true },
      { field: 'date', names: ['日期', 'date'], required: true },
      { field: 'hours', names: ['小时', 'hours'], required: true },
      { field: 'note', names: ['备注', 'note'], required: false }
    ],
    previous: [
      { field: 'member', names: ['会员', 'member'], required: true },
      { field: 'year', names: ['报表年度', 'report year', '年度', 'year'], required: true },
      { field: 'hours', names: ['小时', 'hours'], required: true },
      { field: 'note', names: ['备注', 'note'], required: false }
    ]
  };
  // Client-side row errors carry a category: 'ok' | 'ambiguous' (重名) |
  // 'dup' (重复, from the server) | 'invalid' (无效行).
  function parseDutySheet(buffer, mode, pseudoState) {
    const library = root.XLSX;
    if (!library || !library.utils) throw new Error(tr('表格解析模块尚未就绪（XLSX）。请稍后再试。', 'The spreadsheet module (XLSX) is not ready yet. Please try again later.'));
    const defs = IMPORT_COLUMNS[mode] || IMPORT_COLUMNS.records;
    const book = library.read(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer), { type: 'array', cellDates: false });
    const sheetName = book.SheetNames && book.SheetNames[0];
    const sheet = sheetName ? book.Sheets[sheetName] : null;
    if (!sheet || !sheet['!ref']) throw new Error(tr('工作表没有资料。', 'The sheet has no data.'));
    const range = library.utils.decode_range(sheet['!ref']);
    const guided = mode === 'records' && sheet.A1
      && sheet.A1.v === root.KPTWorkbook.templateInfo('Duty Records').title;
    const headerRow = guided ? 11 : 0;
    const colOf = {};
    for (let c = 0; c <= range.e.c; c++) {
      const cell = sheet[library.utils.encode_cell({ r: headerRow, c })];
      const label = String(cell && cell.v != null ? cell.v : '').trim().replace(/\s*\*$/, '').toLowerCase();
      if (!label) continue;
      const def = defs.find(item => item.names.indexOf(label) >= 0);
      if (def && colOf[def.field] == null) colOf[def.field] = c;
    }
    const missing = defs.filter(item => item.required && colOf[item.field] == null).map(item => item.names.join('/'));
    if (missing.length) throw new Error(tr('缺少必需的列：', 'Missing required columns: ') + missing.join(tr('、', ', ')));
    const indexes = new Map();
    const resolve = (value, table, failRow) => {
      const text = String(value == null ? '' : value).trim();
      if (!text) { failRow('invalid', tr('姓名不能为空。', 'Name must not be blank.')); return ''; }
      const wb = root.KPTWorkbook;
      if (!wb || typeof wb.resolveName !== 'function') throw new Error(tr('姓名匹配模块尚未就绪。请稍后再试。', 'The name-matching module is not ready yet. Please try again later.'));
      try {
        return wb.resolveName(text, table, pseudoState, indexes);
      } catch (error) {
        const message = error && error.message ? error.message : tr('姓名无效。', 'Invalid name.');
        failRow(message.indexOf('多个匹配') >= 0 ? 'ambiguous' : 'invalid', message);
        return '';
      }
    };
    const rows = [];
    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const cellValue = field => {
        const c = colOf[field];
        if (c == null) return '';
        const cell = sheet[library.utils.encode_cell({ r, c })];
        return cell && cell.v != null ? cell.v : '';
      };
      const anyValue = defs.some(item => { const v = cellValue(item.field); return v !== '' && v != null; });
      if (!anyValue) continue;
      const out = {
        __excelRow: r + 1,
        memberId: '', activityId: '', date: '', year: '', hours: '', note: '',
        display: {}, status: 'ok', message: ''
      };
      const failRow = (status, message) => { if (out.status === 'ok') { out.status = status; out.message = message; } };
      out.note = String(cellValue('note')).trim();
      out.display.note = out.note;
      // Hours: records 0 < h <= 24; previous 0 <= h <= 99999 (0 = confirmed zero).
      const hoursText = String(cellValue('hours')).trim();
      out.display.hours = hoursText;
      const hoursNum = hoursText === '' ? NaN : Number(hoursText);
      const hoursOk = mode === 'previous'
        ? (Number.isFinite(hoursNum) && hoursNum >= 0 && hoursNum <= 99999)
        : (Number.isFinite(hoursNum) && hoursNum > 0 && hoursNum <= 24);
      if (hoursOk) out.hours = hoursNum;
      else failRow('invalid', mode === 'previous'
        ? tr('小时数无效：请输入 0 或更大的数字（0 = 已确认的零结余）：', 'Invalid hours — enter 0 or more (0 = confirmed zero): ') + hoursText
        : tr('小时数无效：必须大于 0 且不超过 24：', 'Invalid hours — must be above 0 and at most 24: ') + hoursText);
      const memberText = String(cellValue('member')).trim();
      out.display.member = memberText;
      out.memberId = resolve(memberText, 'Members', failRow);
      if (mode === 'previous') {
        const yearText = String(cellValue('year')).trim();
        out.display.year = yearText;
        const yearNum = Number(yearText);
        if (yearText === '' || !Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
          failRow('invalid', tr('报表年度无效：必须是 2000–2100 之间的整数：', 'Invalid report year — use an integer between 2000 and 2100: ') + yearText);
        } else {
          out.year = yearNum;
        }
      } else {
        const activityText = String(cellValue('activity')).trim();
        out.display.activity = activityText;
        const legacy = pseudoState.Activities.filter(activity => activity.date && !activity.archived
          && root.KPTWorkbook.matchKey(activity.name + ' · ' + activity.date) === root.KPTWorkbook.matchKey(activityText));
        if (legacy.length === 1) out.activityId = legacy[0].id;
        else if (legacy.length > 1) failRow('ambiguous', tr('有多个同名活动，请核对活动名称。', 'Multiple activities match. Check the activity name.'));
        else if (!activityText || activityText.length > 200) failRow('invalid', tr('活动名称须为 1 至 200 个字符。', 'Activity name must be 1–200 characters.'));
        else out.activityName = activityText;
        let dateVal = cellValue('date');
        let dateText = String(dateVal).trim();
        if (typeof dateVal === 'number' && Number.isFinite(dateVal)) {
          // Excel serial date — same conversion as workbook.js.
          const parsed = library.SSF && typeof library.SSF.parse_date_code === 'function' ? library.SSF.parse_date_code(dateVal) : null;
          dateText = parsed ? parsed.y + '-' + String(parsed.m).padStart(2, '0') + '-' + String(parsed.d).padStart(2, '0') : '';
        }
        out.date = dateText;
        out.display.date = dateText || String(cellValue('date')).trim();
        if (!isRealDate(dateText)) failRow('invalid', tr('日期无效：需要真实存在的 YYYY-MM-DD 日期：', 'Invalid date — use a real YYYY-MM-DD date: ') + out.display.date);
      }
      rows.push(out);
    }
    return rows;
  }

  // ---------- Workspace ----------
  function renderDutyWorkspace(container, api, options) {
    const call = (api && api.call) || (root.KPTTransport && root.KPTTransport.call);
    if (!container || typeof call !== 'function') return null;
    const canAttachService = !!((options && options.owner) || (options && options.admin));
    const state = {
      revision: 0,
      members: [], activities: [], records: [], previous: [],
      services: [],
      editPrev: null, editRec: null, dirty: false,
      report: null, reportMemberId: '', reportYear: String(new Date().getFullYear()),
      tab: 'dashboard', rankingYear: String(new Date().getFullYear()),
      importMode: 'records', importRows: [], importPreviewOk: false, importGeneralErrors: []
    };
    let busy = false;

    function notice(message, isError) {
      const el = container.querySelector('#duty-notice');
      if (el) { el.className = 'message' + (isError ? ' error' : ''); el.textContent = message || ''; }
    }
    // Local button feedback: the clicked button gets is-busy + disabled + a '…'
    // suffix, restored on completion. Errors land in #duty-notice.
    function operate(btn, message, work) {
      if (busy) return Promise.resolve();
      busy = true;
      const original = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.classList.add('is-busy'); btn.textContent = original + '…'; }
      notice(message, false);
      return Promise.resolve()
        .then(work)
        .catch(error => notice(error && error.message ? error.message : tr('操作失败。', 'Action failed.'), true))
        .then(() => {
          if (btn) { btn.disabled = false; btn.classList.remove('is-busy'); btn.textContent = original; }
          busy = false;
        });
    }
    function applyProjection(data) {
      if (!data) return;
      if (data.revision != null) state.revision = data.revision;
      state.members = data.members || [];
      state.activities = data.activities || [];
      state.records = data.records || [];
      state.previous = data.previous || [];
    }
    function load() {
      const jobs = [Promise.resolve(call({ action: 'dutyBootstrap' })).then(data => { applyProjection(data); })];
      if (canAttachService) {
        jobs.push(Promise.resolve(call({ action: 'serviceList' })).then(data => { state.services = (data && data.applications) || []; }));
      }
      return Promise.all(jobs).then(() => {
        render();
      }).catch(error => {
        notice(error && error.message ? error.message : tr('载入失败。', 'Load failed.'), true);
      });
    }

    // ----- lookups -----
    function memberById(id) {
      return state.members.find(m => String(m.id) === String(id)) || null;
    }
    function memberName(id) {
      const m = memberById(id);
      return m && m.name ? m.name : '—';
    }
    function activityById(id) {
      return state.activities.find(a => String(a.id) === String(id)) || null;
    }
    function activityName(id) {
      const a = activityById(id);
      return a && a.name ? a.name : '—';
    }
    // Duplicate names get the SJAM ID in the label so the picker can tell them apart.
    function memberOptionLabel(member) {
      const dupes = state.members.filter(m => m && m.name === member.name);
      return dupes.length > 1 ? member.name + ' · ' + (member.sjamId || '') : member.name;
    }
    function optionList(items, selected, placeholder) {
      const opts = placeholder ? ['<option value="">' + escape(placeholder) + '</option>'] : [];
      return opts.concat(items.map(item => '<option value="' + escape(item.value) + '"'
        + (String(item.value) === String(selected == null ? '' : selected) ? ' selected' : '') + '>'
        + escape(item.label) + '</option>')).join('');
    }
    function memberOptions(selected) {
      return optionList(state.members.map(m => ({ value: m.id, label: memberOptionLabel(m) })), selected, tr('（选择会员）', '(choose a member)'));
    }
    // Activities that already appear in duty records come first.
    function orderedActivities() {
      const used = new Set(state.records.map(row => String(row.activityId)));
      const list = state.activities.slice();
      list.sort((a, b) => (used.has(String(b.id)) ? 1 : 0) - (used.has(String(a.id)) ? 1 : 0));
      return list;
    }
    function activityOptions(selected) {
      return optionList(orderedActivities().map(a => ({
        value: a.id,
        label: a.name + (a.date ? ' · ' + a.date : '')
      })), selected, tr('（选择活动）', '(choose an activity)'));
    }
    function reportYearOptions() {
      const years = new Set([String(new Date().getFullYear())]);
      state.records.forEach(row => { if (row.year) years.add(String(row.year)); });
      state.previous.forEach(row => { if (row.year) years.add(String(row.year)); });
      return Array.from(years).sort((a, b) => Number(b) - Number(a));
    }
    function labelled(label, inner, required) {
      return '<label class="field"><span>' + escape(label) + (required ? ' *' : '') + '</span>' + inner + '</label>';
    }
    function stepHeading(number, label) {
      return '<h3 class="svc-step-heading"><span class="svc-step-number">' + number + '.</span> ' + escape(label) + '</h3>';
    }
    function tableWrap(headers, bodyRows, emptyText) {
      return '<div class="table-wrap"><table class="svc-table"><thead><tr>'
        + headers.map(h => '<th>' + escape(h) + '</th>').join('')
        + '</tr></thead><tbody>'
        + (bodyRows || '<tr><td colspan="' + headers.length + '" class="empty">' + escape(emptyText) + '</td></tr>')
        + '</tbody></table></div>';
    }

    // ----- section 1: previous balance -----
    function readPrevForm() {
      const get = id => { const el = container.querySelector(id); return el ? String(el.value == null ? '' : el.value).trim() : ''; };
      return { memberId: get('#duty-prev-member'), year: get('#duty-prev-year'), hours: get('#duty-prev-hours'), note: get('#duty-prev-note') };
    }
    function savePrev(btn) {
      return operate(btn, tr('保存中…', 'Saving…'), async () => {
        const values = readPrevForm();
        if (!values.memberId) throw new Error(tr('请先选择会员。', 'Choose a member first.'));
        const year = Number(values.year);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error(tr('报表年度必须是 2000–2100 之间的整数。', 'The report year must be an integer between 2000 and 2100.'));
        const hours = Number(values.hours);
        if (values.hours === '' || !Number.isFinite(hours) || hours < 0) throw new Error(tr('小时数无效：请输入 0 或更大的数字（0 = 已确认的零结余）。', 'Invalid hours: enter 0 or more (0 = a confirmed zero).'));
        const payload = { action: 'dutyPreviousSave', memberId: values.memberId, year, hours, note: values.note };
        if (state.editPrev) { payload.id = state.editPrev.id; payload.version = state.editPrev.version; }
        applyProjection(await call(payload));
        state.editPrev = null;
        state.dirty = false;
        render();
        notice(tr('已保存 Previous 结余。', 'Previous balance saved.'), false);
      });
    }
    function removePrev(btn, row) {
      if (!window.confirm(tr('确定删除这条 Previous 结余吗？', 'Delete this previous-balance entry?'))) return Promise.resolve();
      return operate(btn, tr('删除中…', 'Removing…'), async () => {
        applyProjection(await call({ action: 'dutyPreviousRemove', id: row.id, version: row.version }));
        state.editPrev = null;
        state.dirty = false;
        render();
        notice(tr('已删除 Previous 结余。', 'Previous balance removed.'), false);
      });
    }

    // ----- section 2: duty records -----
    function readRecRow(row) {
      const get = key => row.querySelector('[data-duty-field="' + key + '"]').value.trim();
      return { memberId: get('member'), activityName: get('activity'), date: get('date'), hours: get('hours'), note: get('note') };
    }
    function dutyEntryRow() {
      return '<div class="toolbar" data-duty-entry>'
        + labelled(tr('学员', 'Cadet'), '<select data-duty-field="member">' + memberOptions('') + '</select>', true)
        + labelled(tr('活动名称', 'Activity name'), '<input data-duty-field="activity" maxlength="200" placeholder="' + escape(tr('例如：外校运动会', 'e.g. Inter-school Sports Day')) + '">', true)
        + labelled(tr('值勤日期', 'Duty date'), '<input data-duty-field="date" type="date">', true)
        + labelled(tr('时数', 'Hours'), '<input data-duty-field="hours" type="number" min="0" max="24" step="any" placeholder="3.5">', true)
        + labelled(tr('备注', 'Note'), '<input data-duty-field="note" maxlength="200">')
        + '</div>';
    }
    function saveRec(btn) {
      return operate(btn, tr('保存中…', 'Saving…'), async () => {
        if (!state.editRec) {
          const rows = Array.from(container.querySelectorAll('[data-duty-entry]'), readRecRow)
            .map((row, index) => ({ ...row, __excelRow: index + 1 }))
            .filter(row => row.memberId || row.activityName || row.date || row.hours || row.note);
          if (!rows.length) throw new Error(tr('请先填写一行。', 'Fill in at least one row.'));
          applyProjection(await call({ action: 'dutyImportCommit', mode: 'records', rows }));
          state.dirty = false;
          render();
          notice(tr('已保存 ', 'Saved ') + rows.length + tr(' 条 Duty 记录。', ' duty records.'));
          return;
        }
        const get = key => container.querySelector('#duty-rec-' + key).value.trim();
        const values = { memberId: get('member'), activityId: get('activity'), date: get('date'), hours: get('hours'), note: get('note') };
        if (!values.memberId) throw new Error(tr('请先选择会员。', 'Choose a member first.'));
        if (!values.activityId) throw new Error(tr('请先选择活动。', 'Choose an activity first.'));
        if (!isRealDate(values.date)) throw new Error(tr('请输入真实存在的 YYYY-MM-DD 日期。', 'Enter a real YYYY-MM-DD date.'));
        const hours = Number(values.hours);
        if (values.hours === '' || !Number.isFinite(hours) || hours <= 0 || hours > 24) throw new Error(tr('小时数必须大于 0 且不超过 24。', 'Hours must be above 0 and at most 24.'));
        const payload = { action: 'dutyRecordSave', memberId: values.memberId, activityId: values.activityId, date: values.date, hours, note: values.note };
        if (state.editRec) { payload.id = state.editRec.id; payload.version = state.editRec.version; }
        applyProjection(await call(payload));
        state.editRec = null;
        state.dirty = false;
        render();
        notice(tr('已保存勤务明细。', 'Duty record saved.'), false);
      });
    }
    function removeRec(btn, row) {
      if (!window.confirm(tr('确定删除这条勤务明细吗？', 'Delete this duty record?'))) return Promise.resolve();
      return operate(btn, tr('删除中…', 'Removing…'), async () => {
        applyProjection(await call({ action: 'dutyRecordRemove', id: row.id, version: row.version }));
        state.editRec = null;
        state.dirty = false;
        render();
        notice(tr('已删除勤务明细。', 'Duty record removed.'), false);
      });
    }

    // ----- section 4: report -----
    function loadReport(btn) {
      return operate(btn, tr('载入中…', 'Loading…'), async () => {
        const memberEl = container.querySelector('#duty-report-member');
        const yearEl = container.querySelector('#duty-report-year');
        const memberId = memberEl ? String(memberEl.value || '') : '';
        const year = yearEl ? Number(yearEl.value) : NaN;
        if (!memberId) throw new Error(tr('请先选择会员。', 'Choose a member first.'));
        if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error(tr('请先选择报表年度。', 'Choose a report year first.'));
        state.reportMemberId = memberId;
        state.reportYear = String(year);
        const bundle = await call({ action: 'dutyReportBundle', memberId, year });
        state.report = bundle && bundle.report ? bundle.report : null;
        render();
        notice(tr('报表已载入。', 'Report loaded.'), false);
      });
    }
    // Formal PDF only when Previous is confirmed — the helpers throw otherwise.
    function buildDutyPdf(report) {
      if (!report) throw new Error(tr('请先载入报表。', 'Load the report first.'));
      if (!report.confirmed) throw new Error(tr('未确认 Previous 不允许生成正式 PDF。', 'Unconfirmed Previous — generating the formal PDF is not allowed.'));
      const pdf = root.KPTDutyPDF;
      if (!pdf || typeof pdf.generateDutyRecord !== 'function') throw new Error(tr('PDF 模块尚未就绪，无法生成文件。请稍后再试。', 'The PDF module is not ready yet. Please try again later.'));
      return Promise.resolve(pdf.generateDutyRecord(report)).catch(error => {
        throw new Error(error && error.message ? error.message : tr('生成 PDF 失败。', 'Could not produce the PDF.'));
      });
    }
    function previewPdf(btn) {
      return operate(btn, tr('生成中…', 'Generating…'), async () => {
        const report = state.report;
        const bytes = await buildDutyPdf(report);
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        const tab = typeof window !== 'undefined' && window.open ? window.open(url, '_blank') : null;
        if (!tab) downloadBytes(bytes, 'Duty-Record-' + report.year + '-' + report.member.name + '.pdf', 'application/pdf');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        notice(tr('PDF 已生成。', 'PDF generated.'), false);
      });
    }
    function downloadPdf(btn) {
      return operate(btn, tr('生成中…', 'Generating…'), async () => {
        const report = state.report;
        const bytes = await buildDutyPdf(report);
        downloadBytes(bytes, 'Duty-Record-' + report.year + '-' + report.member.name + '.pdf', 'application/pdf');
        notice(tr('PDF 已开始下载。', 'PDF download started.'), false);
      });
    }
    function attachService(btn) {
      return operate(btn, tr('处理中…', 'Working…'), async () => {
        const report = state.report;
        const appEl = container.querySelector('#duty-report-attach-app');
        const applicationId = appEl ? String(appEl.value || '') : '';
        if (!report) throw new Error(tr('请先载入报表。', 'Load the report first.'));
        if (!applicationId) throw new Error(tr('请先选择 Service 申请。', 'Choose a Service application first.'));
        const bytes = await buildDutyPdf(report);
        const response = await call({
          action: 'serviceUpload', applicationId: applicationId, kind: 'duty',
          fileName: 'Duty-Record-' + report.year + '-' + report.member.name + '.pdf',
          mime: 'application/pdf', base64: bytesToBase64(bytes)
        });
        if (response && Array.isArray(response.applications)) state.services = response.applications;
        render();
        notice(tr('已附入 Service 申请。手工上传的旧附件仍会保留。', 'Attached to the Service application. Old manually uploaded attachments are kept.'), false);
      });
    }

    // ----- section 5: import -----
    function importPayloadRows() {
      return state.importRows.map(row => state.importMode === 'previous'
        ? { __excelRow: row.__excelRow, memberId: row.memberId, year: row.year, hours: row.hours, note: row.note }
        : { __excelRow: row.__excelRow, memberId: row.memberId, activityId: row.activityId, activityName: row.activityName, date: row.date, hours: row.hours, note: row.note });
    }
    // Server errors merge into rows by __excelRow; 重复 messages surface as 'dup'.
    function mergePreviewErrors(preview) {
      const general = [];
      ((preview && preview.errors) || []).forEach(item => {
        const message = item && item.message ? item.message : '';
        if (!message) return;
        if (item.row == null) { general.push(message); return; }
        const row = state.importRows.find(entry => entry.__excelRow === Number(item.row));
        if (!row || row.status !== 'ok') return;
        row.status = message.indexOf('重复') >= 0 ? 'dup' : 'invalid';
        row.message = message;
      });
      state.importGeneralErrors = general;
    }
    function parseImport(file) {
      return operate(null, tr('解析中…', 'Reading…'), async () => {
        const buffer = await readAsBuffer(file);
        const parsed = parseDutySheet(buffer, state.importMode, { Members: state.members, Activities: state.activities });
        state.importRows = parsed;
        state.importPreviewOk = false;
        state.importGeneralErrors = [];
        renderImportPreview();
        const preview = await call({ action: 'dutyImportPreview', mode: state.importMode, rows: importPayloadRows() });
        mergePreviewErrors(preview);
        state.importPreviewOk = true;
        renderImportPreview();
        const bad = state.importRows.filter(row => row.status !== 'ok').length;
        notice(bad
          ? tr('预览完成：', 'Preview complete: ') + bad + tr(' 行有问题，请修正后再导入。', ' row(s) with problems — fix them before importing.')
          : tr('预览完成：全部行都有效。', 'Preview complete: all rows look good.'), false);
      });
    }
    function commitImport(btn) {
      return operate(btn, tr('导入中…', 'Importing…'), async () => {
        const rows = state.importRows;
        if (!rows.length) throw new Error(tr('没有可导入的资料。', 'Nothing to import.'));
        if (rows.some(row => row.status !== 'ok')) throw new Error(tr('仍有错误的行，无法导入。', 'There are still rows with errors — fix them before importing.'));
        const count = rows.length;
        applyProjection(await call({ action: 'dutyImportCommit', mode: state.importMode, rows: importPayloadRows() }));
        state.importRows = [];
        state.importPreviewOk = false;
        state.importGeneralErrors = [];
        render();
        notice(tr('已成功导入 ', 'Imported ') + count + tr(' 条。', ' row(s).'), false);
      });
    }

    // ----- section templates -----
    function langToggleHtml() {
      return '<button type="button" class="button small" data-duty-lang="1" aria-label="' + escape(tr('语言', 'Language')) + '">'
        + escape(lang === 'zh' ? 'EN' : '中文') + '</button>';
    }
    function prevRowHtml(row) {
      return '<tr>'
        + '<td data-label="' + escape(tr('会员', 'Member')) + '">' + escape(memberName(row.memberId)) + '</td>'
        + '<td data-label="' + escape(tr('报表年度', 'Year')) + '" class="svc-num">' + escape(String(row.year)) + '</td>'
        + '<td data-label="' + escape(tr('小时', 'Hours')) + '" class="svc-num">' + escape(formatHours(row.hours)) + '</td>'
        + '<td data-label="' + escape(tr('备注', 'Note')) + '">' + escape(row.note || '') + '</td>'
        + '<td data-label="' + escape(tr('操作', 'Actions')) + '">'
        + '<button type="button" class="button small" data-duty-prev-edit="' + escape(row.id) + '">' + escape(tr('编辑', 'Edit')) + '</button> '
        + '<button type="button" class="button small btn-return" data-duty-prev-del="' + escape(row.id) + '">' + escape(tr('删除', 'Delete')) + '</button>'
        + '</td></tr>';
    }
    function prevSectionHtml() {
      const f = state.editPrev || { memberId: '', year: '', hours: '', note: '' };
      const rows = state.previous.map(prevRowHtml).join('');
      return '<section class="svc-step">' + stepHeading(1, tr('Previous 结余', 'Previous balance'))
        + '<p class="hint">' + escape(tr('Previous 是从上一年带进来的时数。没有带过来就填 0，再按「添加」。留空代表还没确认，暂时不能生成个人 Duty Record。', 'Previous means hours carried over from the prior year. If there are none, enter 0 and click Add. A blank entry is unconfirmed and prevents PDF generation.')) + '</p>'
        + tableWrap([tr('会员', 'Member'), tr('报表年度', 'Year'), tr('小时', 'Hours'), tr('备注', 'Note'), tr('操作', 'Actions')], rows, tr('还没有 Previous 结余。', 'No previous-balance entries yet.'))
        + '<div id="duty-prev-form">'
        + '<div class="toolbar">'
        + labelled(tr('会员', 'Member'), '<select id="duty-prev-member">' + memberOptions(f.memberId) + '</select>', true)
        + labelled(tr('报表年度', 'Year'), '<input id="duty-prev-year" type="number" min="2000" max="2100" step="1" value="' + escape(f.year) + '">', true)
        + labelled(tr('小时', 'Hours'), '<input id="duty-prev-hours" placeholder="0" type="number" min="0" step="any" value="' + escape(f.hours) + '">', true)
        + labelled(tr('备注', 'Note'), '<input id="duty-prev-note" type="text" maxlength="200" value="' + escape(f.note) + '">')
        + '</div>'
        + '<div class="toolbar">'
        + '<button type="button" class="button primary" data-duty-prev-save="1">' + escape(state.editPrev ? tr('保存修改', 'Save changes') : tr('添加', 'Add')) + '</button>'
        + (state.editPrev ? '<button type="button" class="button" data-duty-prev-cancel="1">' + escape(tr('取消编辑', 'Cancel edit')) + '</button>' : '')
        + '</div></div></section>';
    }
    function recRowHtml(row) {
      return '<tr>'
        + '<td data-label="' + escape(tr('日期', 'Date')) + '">' + escape(row.date || '') + '</td>'
        + '<td data-label="' + escape(tr('活动', 'Activity')) + '">' + escape(activityName(row.activityId)) + '</td>'
        + '<td data-label="' + escape(tr('会员', 'Member')) + '">' + escape(memberName(row.memberId)) + '</td>'
        + '<td data-label="' + escape(tr('小时', 'Hours')) + '" class="svc-num">' + escape(formatHours(row.hours)) + '</td>'
        + '<td data-label="' + escape(tr('备注', 'Note')) + '">' + escape(row.note || '') + '</td>'
        + '<td data-label="' + escape(tr('操作', 'Actions')) + '">'
        + '<button type="button" class="button small" data-duty-rec-edit="' + escape(row.id) + '">' + escape(tr('编辑', 'Edit')) + '</button> '
        + '<button type="button" class="button small btn-return" data-duty-rec-del="' + escape(row.id) + '">' + escape(tr('删除', 'Delete')) + '</button>'
        + '</td></tr>';
    }
    function recSectionHtml() {
      const f = state.editRec || { memberId: '', activityId: '', date: '', hours: '', note: '' };
      const rows = state.records.map(recRowHtml).join('');
      return '<section class="svc-step">' + stepHeading(2, tr('手动登记 Duty Hours', 'Log Duty Hours manually'))
        + '<p class="hint">' + escape(tr('记录谁在哪一天参加哪一场 Duty、做了几小时。例如：陈美玲在校运会值勤 3.5 小时。已经用 Excel 导入的记录会显示在这里，无需再填。', 'Record who did duty, at which event, on what date, and for how many hours. For example: Tan Mei Ling worked 3.5 hours at Sports Day. Imported Excel entries appear here too.')) + '</p>'
        + tableWrap([tr('日期', 'Date'), tr('活动', 'Activity'), tr('会员', 'Member'), tr('小时', 'Hours'), tr('备注', 'Note'), tr('操作', 'Actions')], rows, tr('还没有登记任何 Duty Hours。', 'No duty records yet.'))
        + '<div id="duty-rec-form">'
        + (!state.editRec ? '<div id="duty-entry-list">' + dutyEntryRow() + '</div><div class="toolbar">'
          + '<button type="button" class="button" data-duty-add-row>' + escape(tr('加一行', 'Add row')) + '</button>'
          + '<button type="button" class="button primary" data-duty-rec-save>' + escape(tr('一次提交', 'Submit all rows')) + '</button>'
          + '</div>' : '<div class="toolbar">'
        + labelled(tr('会员', 'Member'), '<select id="duty-rec-member">' + memberOptions(f.memberId) + '</select>', true)
        + labelled(tr('活动', 'Activity'), '<select id="duty-rec-activity">' + activityOptions(f.activityId) + '</select>', true)
        + labelled(tr('日期', 'Date'), '<input id="duty-rec-date" type="date" value="' + escape(f.date) + '">', true)
        + labelled(tr('小时', 'Hours'), '<input id="duty-rec-hours" type="number" min="0" max="24" step="any" value="' + escape(f.hours) + '">', true)
        + labelled(tr('备注', 'Note'), '<input id="duty-rec-note" type="text" maxlength="200" value="' + escape(f.note) + '">')
        + '</div>'
        + '<div class="toolbar">'
        + '<button type="button" class="button primary" data-duty-rec-save="1">' + escape(state.editRec ? tr('保存修改', 'Save changes') : tr('添加', 'Add')) + '</button>'
        + (state.editRec ? '<button type="button" class="button" data-duty-rec-cancel="1">' + escape(tr('取消编辑', 'Cancel edit')) + '</button>' : '')
        + '</div>') + '</div></section>';
    }
    function reportSectionHtml() {
      const report = state.report;
      let summary = '';
      if (report) {
        const entries = (report.previousEntries || []).map(entry =>
          '<li>' + escape(formatHours(entry.hours)) + tr(' 小时', ' h') + (entry.note ? ' · ' + escape(entry.note) : '') + '</li>').join('');
        summary += '<p><strong>' + escape(report.member ? report.member.name : '') + '</strong>'
          + (report.member && report.member.sjamId ? ' · ' + escape(report.member.sjamId) : '')
          + ' · ' + escape(String(report.year)) + '</p>';
        if (report.confirmed) {
          summary += '<ul class="svc-files">' + (entries || '<li class="muted">—</li>') + '</ul>'
            + '<p>' + escape(tr('Previous 合计：', 'Previous total: ')) + '<strong>' + escape(formatHours(report.previousTotal)) + '</strong></p>';
        } else {
          summary += '<div class="message warning">' + escape(tr('请先填写带进这个年度的 Previous 时数。没有带进来的时数就填 0，再生成 PDF。', 'Not confirmed — generation blocked.')) + '</div>';
        }
        const lines = (report.lines || []).map(line => '<tr>'
          + '<td data-label="' + escape(tr('日期', 'Date')) + '">' + escape(line.date || '') + '</td>'
          + '<td data-label="' + escape(tr('活动', 'Activity')) + '">' + escape(line.activityName || '') + '</td>'
          + '<td data-label="' + escape(tr('小时', 'Hours')) + '" class="svc-num">' + escape(formatHours(line.hours)) + '</td>'
          + '</tr>').join('');
        summary += tableWrap([tr('日期', 'Date'), tr('活动', 'Activity'), tr('小时', 'Hours')], lines, tr('本年度没有勤务明细。', 'No duty lines in this year.'))
          + '<p>' + escape(tr('小计 ', 'Subtotal ')) + escape(String(report.year)) + '：<strong>' + escape(formatHours(report.subtotal)) + '</strong>'
          + ' · ' + escape(tr('累计', 'Cumulative')) + '：<strong>' + escape(formatHours(report.cumulative)) + '</strong></p>';
        summary += '<div class="toolbar">'
          + '<button type="button" class="button primary" data-duty-report-preview="1">' + escape(tr('预览 PDF', 'Preview PDF')) + '</button>'
          + '<button type="button" class="button" data-duty-report-download="1">' + escape(tr('下载 PDF', 'Download PDF')) + '</button>'
          + '</div>';
        if (canAttachService) {
          const apps = state.services.filter(app => app && String(app.memberId) === String(report.member ? report.member.id : ''));
          const appItems = apps.map(app => ({
            value: app.id,
            label: [app.reference || app.id, app.applicant && app.applicant.name ? app.applicant.name : '', app.year]
              .map(part => String(part == null ? '' : part)).filter(part => part !== '').join(' · ')
          }));
          summary += '<div class="toolbar">'
            + labelled(tr('Service 申请', 'Service application'), '<select id="duty-report-attach-app">' + optionList(appItems, '', tr('（选择申请）', '(choose an application)')) + '</select>')
            + '<button type="button" class="button primary" data-duty-report-attach="1">' + escape(tr('附入 Service 申请', 'Attach to Service application')) + '</button>'
            + '</div>'
            + '<p class="hint">' + escape(tr('生成的 Duty PDF 会附入选中的 Service 申请；手工上传的旧附件仍会保留。', 'The generated Duty PDF is attached to the chosen Service application; old manually uploaded attachments are kept.')) + '</p>';
        }
      } else {
        summary = '<p class="muted">' + escape(tr('选择会员和年度后载入报表。', 'Pick a member and a year, then load the report.')) + '</p>';
      }
      return '<section class="svc-step">' + stepHeading(3, tr('生成个人 Duty Record', 'Generate a personal Duty Record'))
        + '<p class="hint">' + escape(tr('选学员和年份，查看当年的值勤记录和 Previous。可预览 PDF，或下载申请用的文件。', 'Choose a cadet and year to review duty entries and Previous hours, preview the PDF, or download the application files.')) + '</p>'
        + '<div class="toolbar">'
        + labelled(tr('会员', 'Member'), '<select id="duty-report-member">' + memberOptions(state.reportMemberId) + '</select>', true)
        + labelled(tr('报表年度', 'Year'), '<select id="duty-report-year">' + optionList(reportYearOptions().map(y => ({ value: y, label: y })), state.reportYear, tr('（选择年度）', '(choose a year)')) + '</select>', true)
        + '<button type="button" class="button primary" data-duty-report-load="1">' + escape(tr('载入', 'Load')) + '</button>'
        + '</div>'
        + summary + '</section>';
    }
    function importAreaHtml() {
      const general = state.importGeneralErrors.map(message => '<div class="message error">' + escape(message) + '</div>').join('');
      if (!state.importRows.length) {
        return general + '<p class="muted">' + escape(tr('选择 .xlsx 文件后会先显示预览，确认无误再导入。', 'Pick an .xlsx file to see a preview first — import only when everything looks right.')) + '</p>'
          + '<div class="toolbar"><button type="button" class="button primary" data-duty-import-commit="1" disabled>' + escape(tr('确认导入', 'Import')) + '</button></div>';
      }
      const rows = state.importRows.map(row => {
        const statusText = row.status === 'ok' ? '✓' : row.status === 'ambiguous' ? '重名' : row.status === 'dup' ? '重复' : '无效行';
        const parts = state.importMode === 'previous'
          ? [row.display.member, row.display.year, row.display.hours, row.display.note]
          : [row.display.member, row.display.activity, row.display.date, row.display.hours, row.display.note];
        const values = parts.map(part => String(part == null ? '' : part)).filter(part => part !== '').join(' · ');
        return '<tr><td data-label="' + escape(tr('行', 'Row')) + '" class="svc-num">' + escape(String(row.__excelRow)) + '</td>'
          + '<td data-label="' + escape(tr('内容', 'Values')) + '">' + escape(values) + '</td>'
          + '<td data-label="' + escape(tr('状态', 'Status')) + '">' + escape(statusText) + (row.message ? ' — ' + escape(row.message) : '') + '</td></tr>';
      }).join('');
      const ready = state.importPreviewOk && state.importRows.every(row => row.status === 'ok');
      return general + tableWrap([tr('行', 'Row'), tr('内容', 'Values'), tr('状态', 'Status')], rows, '—')
        + '<div class="toolbar">'
        + '<button type="button" class="button primary" data-duty-import-commit="1"' + (ready ? '' : ' disabled') + '>' + escape(tr('确认导入', 'Import')) + '</button>'
        + '<span class="hint">' + escape(tr('状态：✓ 可导入 / 重名 / 重复 / 无效行。有错误的行不能导入。', 'Status: ✓ ready / duplicate name / duplicate row / invalid row. Rows with errors cannot be imported.')) + '</span>'
        + '</div>';
    }
    function rankingRows() {
      const totals = new Map();
      state.records.filter(row => String(row.year) === state.rankingYear).forEach(row => {
        const current = totals.get(row.memberId) || { memberId: row.memberId, hours: 0, count: 0 };
        current.hours += Number(row.hours);
        current.count++;
        totals.set(row.memberId, current);
      });
      const rows = [...totals.values()].map(row => ({ ...row, hours: Number(formatHours(row.hours)) })).sort((a, b) => b.hours - a.hours || memberName(a.memberId).localeCompare(memberName(b.memberId)));
      return rows.map((row, index) => {
        row.rank = index && row.hours === rows[index - 1].hours ? rows[index - 1].rank : index + 1;
        return row;
      });
    }
    function dashboardHtml() {
      const rows = rankingRows();
      const sum = rows.reduce((total, row) => total + row.hours, 0);
      return '<section class="svc-step"><h3>' + escape(tr('勤务时数排名', 'Duty Hours Ranking')) + '</h3>'
        + '<div class="toolbar">' + labelled(tr('年度', 'Year'), '<select id="duty-ranking-year">' + optionList(reportYearOptions().map(value => ({ value, label: value })), state.rankingYear) + '</select>') + '</div>'
        + '<p class="hint">' + escape(tr('按本年度已录入的勤务时数排名。Previous 和秘书填写的年度时数另计。', 'Ranked by logged hours for the selected year. Previous and Secretary-entered annual totals are separate.')) + '</p>'
        + '<p><strong>' + rows.length + '</strong> ' + escape(tr('位学员 · 合计', 'cadets · total')) + ' <strong>' + formatHours(sum) + ' h</strong></p>'
        + (rows.length ? '<div class="table-wrap"><table><thead><tr>' + [tr('排名', 'Rank'), tr('学员', 'Cadet'), tr('勤务次数', 'Duty entries'), tr('时数', 'Hours')].map(label => '<th scope="col">' + escape(label) + '</th>').join('')
          + '</tr></thead><tbody>' + rows.map(row => '<tr><td>' + row.rank + '</td><td>' + escape(memberName(row.memberId)) + '</td><td>' + row.count + '</td><td><strong>' + formatHours(row.hours) + '</strong></td></tr>').join('')
          + '</tbody></table></div>' : '<p class="muted">' + escape(tr('这个年度还没有勤务记录。可先到「导入导出」上传 Excel。', 'No duty records for this year. Upload an Excel file under Import & export.')) + '</p>') + '</section>';
    }
    function exportDutyWorkbook(template) {
      if (template) return root.KPTWorkbook.downloadDutyRecordTemplate({ Members: state.members, Activities: state.activities });
      const xlsx = root.XLSX;
      const data = [['Activity', 'Member', 'Date', 'Hours', 'Note']];
      state.records.filter(row => String(row.year) === state.rankingYear).forEach(row => {
        const member = memberById(row.memberId);
        data.push([activityName(row.activityId),
          member ? memberOptionLabel(member) : memberName(row.memberId), row.date, Number(row.hours), row.note || '']);
      });
      const sheet = xlsx.utils.aoa_to_sheet(data);
      sheet['!cols'] = [34, 28, 15, 12, 36].map(wch => ({ wch }));
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, sheet, 'Duty Records');
      xlsx.writeFile(workbook, 'TCCD-Duty-Records-' + state.rankingYear + '.xlsx');
    }

    function importSectionHtml() {
      return '<section class="svc-step"><h3>' + escape(tr('导入导出 · Duty Record', 'Import & export · Duty Record')) + '</h3>'
        + '<div class="toolbar">'
        + '<button type="button" class="button" data-duty-export="template">' + escape(tr('下载 Excel 模板', 'Download Excel template')) + '</button>'
        + labelled(tr('导出年度', 'Export year'), '<select id="duty-ranking-year">' + optionList(reportYearOptions().map(value => ({ value, label: value })), state.rankingYear) + '</select>')
        + '<button type="button" class="button" data-duty-export="records">' + escape(tr('导出该年度明细', 'Export duty records')) + '</button>'
        + '</div><p class="hint">' + escape(tr('每位学员每次 Duty 填一行。Activity 直接填活动名称，校外活动也可以。日期另填 Date，例如 2026-03-14。', 'Enter one cadet per duty entry. Type the activity name, including external activities. Enter the date separately, e.g. 2026-03-14.')) + '</p>'
        + (canAttachService ? labelled(tr('导入类型', 'Import type'), '<select id="duty-import-mode">' + optionList([
          { value: 'records', label: 'Duty Record' }, { value: 'previous', label: 'Previous' }
        ], state.importMode) + '</select>') : '')
        + (state.importMode === 'previous' ? '<p class="hint">Member, Report Year, Hours, Note</p>' : '')
        + labelled(tr('Excel 文件（.xlsx）', 'Excel file (.xlsx)'), '<input id="duty-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">')
        + '<div id="duty-import-area">' + importAreaHtml() + '</div></section>';
    }

    // ----- render + bind -----
    function render() {
      container.innerHTML = '<div class="svc-admin duty-workspace" id="duty-workspace">'
        + '<section class="svc-step"><div class="section-heading">'
        + '<h2 class="svc-step-heading">' + escape(tr('勤务记录（Duty In Charge）', 'Duty In Charge / Duty record')) + '</h2>'
        + langToggleHtml() + '</div>'
        + '<div id="duty-notice" class="message" role="status" aria-live="polite"></div></section>'
        + '<div class="toolbar" aria-label="Duty Record">'
        + [['dashboard', tr('总览', 'Dashboard')], ['records', tr('记录与报表', 'Records & reports')], ['import', tr('导入导出', 'Import & export')]].map(([key, label]) =>
          '<button type="button" class="button' + (state.tab === key ? ' primary' : '') + '" aria-pressed="' + (state.tab === key) + '" data-duty-tab="' + key + '">' + escape(label) + '</button>').join('')
        + '</div>'
        + (state.tab === 'dashboard' ? dashboardHtml() : state.tab === 'import' ? importSectionHtml()
          : prevSectionHtml() + recSectionHtml() + reportSectionHtml())
        + '</div>';
      bind();
    }
    function renderImportPreview() {
      const host = container.querySelector('#duty-import-area');
      if (host) host.innerHTML = importAreaHtml();
      bindImportArea();
    }
    function bindImportArea() {
      const commit = container.querySelector('[data-duty-import-commit]');
      if (commit) commit.addEventListener('click', () => commitImport(commit));
    }
    function bind() {
      container.querySelectorAll('[data-duty-lang]').forEach(btn => btn.addEventListener('click', () => {
        lang = lang === 'zh' ? 'en' : 'zh';
        render();
      }));
      const on = (selector, handler) => container.querySelectorAll(selector).forEach(btn => btn.addEventListener('click', () => handler(btn)));
      on('[data-duty-tab]', btn => {
        if (busy || state.tab === btn.dataset.dutyTab) return;
        if (state.dirty && !root.confirm(tr('离开后会失去未保存的修改。继续？', 'Discard unsaved changes and switch tabs?'))) return;
        state.dirty = false;
        state.tab = btn.dataset.dutyTab;
        render();
      });
      const rankingYear = container.querySelector('#duty-ranking-year');
      if (rankingYear) rankingYear.addEventListener('change', () => { state.rankingYear = rankingYear.value; render(); });
      on('[data-duty-export]', btn => operate(btn, '', () => exportDutyWorkbook(btn.dataset.dutyExport === 'template')));
      on('[data-duty-prev-save]', btn => savePrev(btn));
      on('[data-duty-prev-cancel]', () => { state.editPrev = null; state.dirty = false; render(); });
      on('[data-duty-prev-edit]', btn => {
        const row = state.previous.find(item => String(item.id) === btn.getAttribute('data-duty-prev-edit'));
        if (!row) return;
        state.editPrev = { id: row.id, version: row.version, memberId: row.memberId, year: row.year, hours: row.hours, note: row.note || '' };
        state.dirty = false;
        render();
      });
      on('[data-duty-prev-del]', btn => {
        const row = state.previous.find(item => String(item.id) === btn.getAttribute('data-duty-prev-del'));
        if (row) removePrev(btn, row);
      });
      on('[data-duty-add-row]', () => {
        if (busy) return;
        const list = container.querySelector('#duty-entry-list');
        list.insertAdjacentHTML('beforeend', dutyEntryRow());
        list.lastElementChild.querySelector('select').focus();
      });
      on('[data-duty-rec-save]', btn => saveRec(btn));
      on('[data-duty-rec-cancel]', () => { state.editRec = null; state.dirty = false; render(); });
      on('[data-duty-rec-edit]', btn => {
        const row = state.records.find(item => String(item.id) === btn.getAttribute('data-duty-rec-edit'));
        if (!row) return;
        state.editRec = { id: row.id, version: row.version, memberId: row.memberId, activityId: row.activityId, date: row.date, hours: row.hours, note: row.note || '' };
        state.dirty = false;
        render();
      });
      on('[data-duty-rec-del]', btn => {
        const row = state.records.find(item => String(item.id) === btn.getAttribute('data-duty-rec-del'));
        if (row) removeRec(btn, row);
      });
      on('[data-duty-report-load]', btn => loadReport(btn));
      on('[data-duty-report-preview]', btn => previewPdf(btn));
      on('[data-duty-report-download]', btn => downloadPdf(btn));
      on('[data-duty-report-attach]', btn => attachService(btn));
      const modeEl = container.querySelector('#duty-import-mode');
      if (modeEl) modeEl.addEventListener('change', () => {
        if (busy) { modeEl.value = state.importMode; return; }
        state.importMode = modeEl.value;
        state.importRows = [];
        state.importPreviewOk = false;
        state.importGeneralErrors = [];
        render();
      });
      const fileEl = container.querySelector('#duty-import-file');
      if (fileEl) fileEl.addEventListener('change', () => {
        const file = fileEl.files && fileEl.files[0];
        fileEl.value = '';
        if (file) parseImport(file);
      });
      bindImportArea();
    }
    // Unsaved-edit tracking for the two add/edit forms (polling safety).
    container.addEventListener('input', event => {
      const target = event.target;
      if (target && typeof target.closest === 'function' && target.closest('#duty-prev-form, #duty-rec-form')) state.dirty = true;
    });

    render();
    load();
    return {
      isDirty: () => state.dirty,
      refresh: () => load()
    };
  }

  root.KPTDutyUI = {
    renderDutyWorkspace: renderDutyWorkspace,
    parseDutySheet: parseDutySheet
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTDutyUI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
