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
  function base64ToBytes(data) {
    const text = typeof data === 'string' ? data : (data && data.base64) || '';
    const bin = atob(text);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
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
  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(tr('无法读取文件。', 'Could not read the file.')));
      reader.readAsDataURL(file);
    });
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
    const colOf = {};
    for (let c = 0; c <= range.e.c; c++) {
      const cell = sheet[library.utils.encode_cell({ r: 0, c })];
      const label = String(cell && cell.v != null ? cell.v : '').trim().toLowerCase();
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
    for (let r = 1; r <= range.e.r; r++) {
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
        out.activityId = resolve(activityText, 'Activities', failRow);
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
      members: [], activities: [], records: [], previous: [], proofs: [],
      services: [],
      editPrev: null, editRec: null, dirty: false,
      report: null, reportProofs: [], reportMemberId: '', reportYear: String(new Date().getFullYear()),
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
      state.proofs = data.proofs || [];
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
    function readRecForm() {
      const get = id => { const el = container.querySelector(id); return el ? String(el.value == null ? '' : el.value).trim() : ''; };
      return { memberId: get('#duty-rec-member'), activityId: get('#duty-rec-activity'), date: get('#duty-rec-date'), hours: get('#duty-rec-hours'), note: get('#duty-rec-note') };
    }
    function saveRec(btn) {
      return operate(btn, tr('保存中…', 'Saving…'), async () => {
        const values = readRecForm();
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

    // ----- section 3: private proofs -----
    function uploadProof(btn) {
      return operate(btn, tr('上传中…', 'Uploading…'), async () => {
        const activityEl = container.querySelector('#duty-proof-activity');
        const fileEl = container.querySelector('#duty-proof-file');
        const activityId = activityEl ? String(activityEl.value || '') : '';
        const file = fileEl && fileEl.files ? fileEl.files[0] : null;
        if (!activityId) throw new Error(tr('请先选择活动。', 'Choose an activity first.'));
        if (!file) throw new Error(tr('请先选择文件（PDF/JPG/PNG）。', 'Choose a file first (PDF/JPG/PNG).'));
        const mime = String(file.type || '').toLowerCase();
        const okType = mime === 'application/pdf' || mime === 'image/jpeg' || mime === 'image/png'
          || /\.(pdf|jpe?g|png)$/i.test(file.name || '');
        if (!okType) throw new Error(tr('只接受 PDF/JPG/PNG 文件。', 'Only PDF/JPG/PNG files are accepted.'));
        const dataUrl = await readAsDataUrl(file);
        const base64 = dataUrl.split(',')[1] || '';
        applyProjection(await call({
          action: 'dutyProofUpload',
          activityId, fileName: file.name, mime: mime || 'application/octet-stream',
          bytes: file.size || base64ToBytes(base64).length, base64
        }));
        render();
        notice(tr('证明已上传。同一活动仅一份证明，重新上传会替换。', 'Proof uploaded. One proof per activity — re-upload replaces it.'), false);
      });
    }
    function downloadProof(btn, proofId) {
      return operate(btn, tr('下载中…', 'Downloading…'), async () => {
        const file = await call({ action: 'dutyProofDownload', proofId: proofId });
        if (!file || !file.base64) throw new Error(tr('没有文件内容。', 'No file content returned.'));
        downloadBytes(base64ToBytes(file.base64), file.fileName || 'proof', file.mime || 'application/octet-stream');
        notice(tr('已开始下载。', 'Download started.'), false);
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
        state.reportProofs = (bundle && bundle.proofs) || [];
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
    function downloadZip(btn) {
      return operate(btn, tr('打包中…', 'Packing…'), async () => {
        const report = state.report;
        const bytes = await buildDutyPdf(report);
        const zip = root.KPTServicePDF;
        if (!zip || typeof zip.zipFiles !== 'function') throw new Error(tr('ZIP 模块尚未就绪，无法打包。请稍后再试。', 'The ZIP module is not ready yet. Please try again later.'));
        const map = {};
        map['Duty-Record-' + report.year + '-' + report.member.name + '.pdf'] = bytes;
        const seen = new Set();
        state.reportProofs.forEach(proof => {
          const key = String(proof && proof.activityId != null ? proof.activityId : '');
          if (!key || seen.has(key)) return;
          seen.add(key);
          map['proofs/' + key + '-' + (proof.fileName || 'proof')] = base64ToBytes(proof.base64);
        });
        const zipBytes = zip.zipFiles(map);
        downloadBytes(zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes), 'Duty-Record-' + report.year + '-' + report.member.name + '.zip', 'application/zip');
        notice(tr('ZIP 已开始下载。', 'ZIP download started.'), false);
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
        : { __excelRow: row.__excelRow, memberId: row.memberId, activityId: row.activityId, date: row.date, hours: row.hours, note: row.note });
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
        + '<p class="hint">' + escape(tr('条目按年度累加（60 + 10 = 70）；0 是已确认的零结余；没有任何条目 = 未确认，会禁止生成正式 PDF；年度之间不会自动结转。', 'Entries accumulate (60 + 10 = 70); 0 is a confirmed zero; no entries at all = not confirmed, which blocks formal PDF generation; nothing is ever carried over automatically between years.')) + '</p>'
        + tableWrap([tr('会员', 'Member'), tr('报表年度', 'Year'), tr('小时', 'Hours'), tr('备注', 'Note'), tr('操作', 'Actions')], rows, tr('还没有 Previous 结余。', 'No previous-balance entries yet.'))
        + '<div id="duty-prev-form">'
        + '<div class="toolbar">'
        + labelled(tr('会员', 'Member'), '<select id="duty-prev-member">' + memberOptions(f.memberId) + '</select>', true)
        + labelled(tr('报表年度', 'Year'), '<input id="duty-prev-year" type="number" min="2000" max="2100" step="1" value="' + escape(f.year) + '">', true)
        + labelled(tr('小时', 'Hours'), '<input id="duty-prev-hours" type="number" min="0" step="any" value="' + escape(f.hours) + '">', true)
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
      return '<section class="svc-step">' + stepHeading(2, tr('勤务明细', 'Duty records'))
        + tableWrap([tr('日期', 'Date'), tr('活动', 'Activity'), tr('会员', 'Member'), tr('小时', 'Hours'), tr('备注', 'Note'), tr('操作', 'Actions')], rows, tr('还没有勤务明细。', 'No duty records yet.'))
        + '<div id="duty-rec-form">'
        + '<div class="toolbar">'
        + labelled(tr('会员', 'Member'), '<select id="duty-rec-member">' + memberOptions(f.memberId) + '</select>', true)
        + labelled(tr('活动', 'Activity'), '<select id="duty-rec-activity">' + activityOptions(f.activityId) + '</select>', true)
        + labelled(tr('日期', 'Date'), '<input id="duty-rec-date" type="date" value="' + escape(f.date) + '">', true)
        + labelled(tr('小时', 'Hours'), '<input id="duty-rec-hours" type="number" min="0" max="24" step="any" value="' + escape(f.hours) + '">', true)
        + labelled(tr('备注', 'Note'), '<input id="duty-rec-note" type="text" maxlength="200" value="' + escape(f.note) + '">')
        + '</div>'
        + '<div class="toolbar">'
        + '<button type="button" class="button primary" data-duty-rec-save="1">' + escape(state.editRec ? tr('保存修改', 'Save changes') : tr('添加', 'Add')) + '</button>'
        + (state.editRec ? '<button type="button" class="button" data-duty-rec-cancel="1">' + escape(tr('取消编辑', 'Cancel edit')) + '</button>' : '')
        + '</div></div></section>';
    }
    function proofRowHtml(row) {
      return '<tr>'
        + '<td data-label="' + escape(tr('活动', 'Activity')) + '">' + escape(activityName(row.activityId)) + '</td>'
        + '<td data-label="' + escape(tr('文件', 'File')) + '">' + escape(row.fileName || '') + '</td>'
        + '<td data-label="' + escape(tr('上传时间', 'Uploaded')) + '">' + escape(String(row.uploadedAt || '').slice(0, 10)) + '</td>'
        + '<td data-label="' + escape(tr('下载', 'Download')) + '"><button type="button" class="button small" data-duty-proof-dl="' + escape(row.id) + '">' + escape(tr('下载', 'Download')) + '</button></td>'
        + '</tr>';
    }
    function proofSectionHtml() {
      const rows = state.proofs.map(proofRowHtml).join('');
      return '<section class="svc-step">' + stepHeading(3, tr('私人证明', 'Private proofs'))
        + '<p class="hint">' + escape(tr('同一活动仅一份证明，重新上传会替换。', 'One proof per activity, re-upload replaces.')) + '</p>'
        + tableWrap([tr('活动', 'Activity'), tr('文件', 'File'), tr('上传时间', 'Uploaded'), tr('下载', 'Download')], rows, tr('还没有证明。', 'No proofs yet.'))
        + '<div class="toolbar">'
        + labelled(tr('活动', 'Activity'), '<select id="duty-proof-activity">' + activityOptions('') + '</select>', true)
        + labelled(tr('文件（PDF/JPG/PNG）', 'File (PDF/JPG/PNG)'), '<input id="duty-proof-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png">', true)
        + '<button type="button" class="button primary" data-duty-proof-upload="1">' + escape(tr('上传证明', 'Upload proof')) + '</button>'
        + '</div></section>';
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
          summary += '<div class="message warning">' + escape(tr('Previous 未确认 — 不允许生成正式 PDF。', 'Not confirmed — generation blocked.')) + '</div>';
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
          + '<button type="button" class="button" data-duty-report-zip="1">' + escape(tr('下载 ZIP', 'Download ZIP')) + '</button>'
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
      return '<section class="svc-step">' + stepHeading(4, tr('报表', 'Report'))
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
    function importSectionHtml() {
      return '<section class="svc-step">' + stepHeading(5, tr('导入', 'Import'))
        + '<div class="toolbar">'
        + labelled(tr('模式', 'Mode'), '<select id="duty-import-mode">'
          + '<option value="records"' + (state.importMode === 'records' ? ' selected' : '') + '>' + escape(tr('勤务明细', 'Duty records')) + '</option>'
          + '<option value="previous"' + (state.importMode === 'previous' ? ' selected' : '') + '>' + escape(tr('Previous 结余', 'Previous balance')) + '</option>'
          + '</select>')
        + labelled(tr('Excel 文件（.xlsx）', 'Excel file (.xlsx)'), '<input id="duty-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">')
        + '</div>'
        + '<p class="hint">' + escape(tr('第 1 行为表头。勤务明细列：活动/Activity、会员/Member、日期/Date、小时/Hours、备注/Note；Previous 列：会员/Member、报表年度/Report Year、小时/Hours、备注/Note。会员/活动按姓名匹配。', 'Row 1 is the header row. Duty records columns: Activity, Member, Date, Hours, Note. Previous columns: Member, Report Year, Hours, Note. Members and activities are matched by name.')) + '</p>'
        + '<div id="duty-import-area">' + importAreaHtml() + '</div></section>';
    }

    // ----- render + bind -----
    function render() {
      container.innerHTML = '<div class="svc-admin duty-workspace" id="duty-workspace">'
        + '<section class="svc-step"><div class="section-heading">'
        + '<h2 class="svc-step-heading">' + escape(tr('勤务记录（Duty In Charge）', 'Duty In Charge / Duty record')) + '</h2>'
        + langToggleHtml() + '</div>'
        + '<div id="duty-notice" class="message" role="status" aria-live="polite"></div></section>'
        + prevSectionHtml()
        + recSectionHtml()
        + proofSectionHtml()
        + reportSectionHtml()
        + importSectionHtml()
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
      on('[data-duty-proof-upload]', btn => uploadProof(btn));
      on('[data-duty-proof-dl]', btn => downloadProof(btn, btn.getAttribute('data-duty-proof-dl')));
      on('[data-duty-report-load]', btn => loadReport(btn));
      on('[data-duty-report-preview]', btn => previewPdf(btn));
      on('[data-duty-report-zip]', btn => downloadZip(btn));
      on('[data-duty-report-attach]', btn => attachService(btn));
      const modeEl = container.querySelector('#duty-import-mode');
      if (modeEl) modeEl.addEventListener('change', () => {
        state.importMode = modeEl.value === 'previous' ? 'previous' : 'records';
        state.importRows = [];
        state.importPreviewOk = false;
        state.importGeneralErrors = [];
        renderImportPreview();
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
    renderDutyWorkspace: renderDutyWorkspace
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTDutyUI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
