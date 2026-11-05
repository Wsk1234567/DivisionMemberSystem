(function (root) {
  'use strict';
  // Service Stripe & Star application UI — public form + Admin/Owner panel.
  // Talks only to the frozen KPTTransport contract. No business rules live here.
  // Default language is Chinese (口语化); a toggle switches to English.

  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  // Agent2 state graph — only these transitions are offered in the UI.
  // Approved -> Recorded happens through serviceAward only, never a button.
  const TRANSITIONS = {
    PendingSecretary: { next: ['Preparing', 'NeedsInfo'], back: [] },
    Preparing: { next: ['AwaitingSignature'], back: ['NeedsInfo', 'PendingSecretary'] },
    AwaitingSignature: { next: ['Ready'], back: ['Preparing', 'NeedsInfo'] },
    AwaitingOwner: { next: ['Ready'], back: ['Preparing', 'NeedsInfo'] },
    Ready: { next: ['Submitted'], back: ['Preparing', 'NeedsInfo'] },
    Submitted: { next: ['Approved'], back: ['NeedsInfo'] },
    NeedsInfo: { next: ['PendingSecretary', 'Preparing'], back: [] },
    Approved: { next: [], back: [] },
    Recorded: { next: [], back: [] }
  };

  // 1/2=Stripe, 3=Star, 4=Stripe+Star, 5=Star. NULL = unsure.
  const YEAR_MAP = { 1: ['Stripe'], 2: ['Stripe'], 3: ['Star'], 4: ['Stripe', 'Star'], 5: ['Star'] };

  let lang = 'zh';
  const DICT = {
    zh: {
      svcTitle: 'Service Stripe & Star 申请表',
      svcEyebrow: '服务奖励',
      svcIntro: '填上你自己的资料，再告诉我们你认为一共有几年达到 Efficient。这里的年数是达到 Efficient 标准的总年数，不是入会年数。秘书会逐年对照原始记录核对，然后才会正式提交。',
      legendDetails: '个人资料',
      hintBlock: '日后填写纸本请用正楷大写（BLOCK LETTERS）。姓名拼法请与学校记录一致。',
      fName: '姓名', fIc: '身份证号码', fGender: '性别', fRank: '军阶', fJoined: '加入日期', fPhone: '电话', fEmail: '电邮', fOccupation: '职业',
      hintName: '完整姓名，与记录一致。',
      hintIc: '身份证号码。秘书需要这个才能找到你的记录。',
      hintRank: '目前的军阶（如有）。',
      hintJoined: '加入日期（如知道）。',
      legendYears: 'Efficient 年数',
      hintYears: '你认为一共有几年达到 Efficient 标准？不确定就选「还不确定」，秘书会和你一起核对。',
      labelYears: '申报年数',
      notSure: '还不确定',
      yearMapLead: '按你的选择：',
      hintFourth: '申报 4th 年会同时涵盖两种奖励。填一份就够了——办公室会分别准备两份正式表格。',
      submit: '递交申请',
      clear: '清空表单',
      needNameIc: '请先填姓名和身份证号码再递交。',
      sending: '递交中…',
      received: '已收到你的申请。你的编号是',
      receivedTail: '请妥善保管——联系办公室时出示这个编号。秘书会核对你的年数，若缺资料会联系你。',
      notSent: '申请未能送出：',
      notSentTail: '你填的内容都还在。',
      toggleEn: 'EN',
      toggleZh: '中文',
      // Admin
      adminTitle: '查看 Service Stripe & Star 申请',
      filterLabel: '筛选',
      filterHint: '姓名、编号或会员姓名',
      reload: '重新载入',
      newApps: '条新申请',
      thApplicant: '申请人', thYear: '年度', thYears: '年数', thMember: '会员', thStatus: '状态', thFiles: '附件',
      noMatch: '没有符合条件的申请。',
      pickDetail: '在左边点一个申请查看详情。',
      refLabel: '申请编号（Reference）',
      refHint: '对外编号。秘书可修改；填进正式表格的就是这个，不是系统内部编号。',
      refMissing: '请先在上方填写「申请编号」，再生成正式表格。系统内部编号不会填进证书。',
      yearLabel: '申请年度',
      yearHint: '申请所属年度（如 2025 或 2026）。这和 Efficient 年数不是一回事。',
      saved: '已保存。',
      save: '保存',
      confYear: '已确认 Efficient 年数',
      memberLabel: '绑定会员',
      memberHint: '从名字里选人。重名的选项会带上实际会员编号以便区分。',
      memberSearch: '输入姓名搜索…',
      memberNone: '（不绑定）',
      memberUnresolved: '未找到会员',
      remarks: '备注',
      files: '附件',
      noFiles: '还没有附件。',
      kindLabel: '类型',
      upload: '上传文件',
      download: '下载',
      statusTitle: '下一步',
      ownerOk: '文件准备完成',
      awardDate: '获奖日期',
      awardCert: '证书编号',
      awardBtn: '登记获奖',
      awardHint: '登记获奖会把状态变为 Recorded，并写入 Awards。',
      batches: '一次过申请',
      noBatches: '还没有批次。',
      batchTitle: '标题', batchYear: '年度', batchApps: '申请数',
      markSubmitted: '标为已提交',
      checklistStripe: 'Stripe checklist', checklistStar: 'Star checklist',
      mergeStripe: 'Merge signed Stripe forms', mergeStar: 'Merge signed Star forms',
      zipBatch: '打包下载 ZIP',
      newBatch: '新建一次过申请',
      checksTitle: '批次清单核对',
      checksHint: '按办公室清单逐项核对，选 Y、N 或留空。Covering letter 和 Supporting documents可以是 N，不影响提交。Duty 相关项请人工确认，系统不会自动填 Yes。',
      checkBlank: '（留空）',
      saveChecks: '保存清单',
      batchTitlePrompt: '批次标题：',
      batchYearPrompt: '批次年度：',
      batchYearLabel: '批次年度',
      batchAppsTitle: '符合资格的申请者列表',
      applicantsTitle: '申请者', addToBatch: '符合资格',
      removeFromBatch: '移出批次',
      batchPickPrompt: '把哪些申请加入批次？输入编号或姓名关键词：',
      needRemarks: '还需要什么资料？',
      submittedDate: '提交日期（YYYY-MM-DD）：',
      backLabel: '退回',
      icMismatch: 'IC 与绑定的会员记录不一致。确认要保存吗？',
      // PDF
      pdfStripe: 'Stripe application form PDF',
      pdfStar: 'Star application form PDF',
      pdfNeedMember: '先绑定会员记录并填好会员编号，才能生成正式表格。',
      pdfNeedYear: '先确认 Efficient 年数，才能生成正式表格。',
      pdfUnavailable: 'PDF 模块尚未就绪，无法生成文件。请稍后再试。',
      pdfFailed: '生成 PDF 失败：',
      pdfNoSigned: '没有可合并的已签名表格。请先上传已签名的正式表格。',
      pdf4th: '4th 年：同一份资料分别生成两份正式表格。',
      languages: '语言',
      batchUpload: '上传批次文件',
      dutyKind: 'Duty detail PDF'
    },
    en: {
      svcTitle: 'Service Stripe & Star application',
      svcEyebrow: 'Service award',
      svcIntro: 'Fill in your own details and tell us how many Efficient years you believe you have. This count is the total number of years you met the Efficient standard — not the number of years you joined. A Secretary will check every year against the records before anything is filed.',
      legendDetails: 'Your details',
      hintBlock: 'Use BLOCK LETTERS on paper copies. Keep the spelling you use in school records.',
      fName: 'Name', fIc: 'IC', fGender: 'Gender', fRank: 'Rank', fJoined: 'Joined', fPhone: 'Phone', fEmail: 'Email', fOccupation: 'Occupation',
      hintName: 'Full name, exactly as on your records.',
      hintIc: 'Identity card number. Required so the Secretary can find your record.',
      hintRank: 'Your current cadet rank, if any.',
      hintJoined: 'Date you joined, if you know it.',
      legendYears: 'Efficient years',
      hintYears: 'How many years in total do you think you met the Efficient standard? If you are not sure, choose "Not sure yet" — a Secretary will work it out with you.',
      labelYears: 'Declared years',
      notSure: 'Not sure yet',
      yearMapLead: 'Based on what you pick:',
      hintFourth: 'A 4th-year application covers both awards. One form is enough — the office prepares the two separate final files.',
      submit: 'Send my application',
      clear: 'Clear form',
      needNameIc: 'Please fill in your name and IC before sending.',
      sending: 'Sending…',
      received: 'Application received. Your reference is',
      receivedTail: 'Keep it safe — quote it if you contact the office. A Secretary will check your years and contact you if anything is missing.',
      notSent: 'Your application was not sent:',
      notSentTail: 'Nothing you typed was lost.',
      toggleEn: 'EN',
      toggleZh: '中文',
      adminTitle: 'Service Stripe & Star applications',
      filterLabel: 'Filter',
      filterHint: 'Name, reference or member',
      reload: 'Reload',
      newApps: 'new',
      thApplicant: 'Applicant', thYear: 'Year', thYears: 'Years', thMember: 'Member', thStatus: 'Status', thFiles: 'Files',
      noMatch: 'No applications match.',
      pickDetail: 'Choose an application on the left to see its details.',
      refLabel: 'Reference',
      refHint: 'External reference. The Secretary can edit it; this is what goes on the official form, not the internal id.',
      refMissing: 'Fill in the Reference above before generating the official form. The internal id is never used as a certificate number.',
      yearLabel: 'Application year',
      yearHint: 'The year of the application (e.g. 2025 or 2026). This is not the Efficient-year count.',
      saved: 'Saved.',
      save: 'Save',
      confYear: 'Confirmed Efficient years',
      memberLabel: 'Linked member',
      memberHint: 'Pick the person by name. Duplicate names show the actual member number so you can tell them apart.',
      memberSearch: 'Type a name to search…',
      memberNone: '(not linked)',
      memberUnresolved: 'Member not found',
      remarks: 'Remarks',
      files: 'Files',
      noFiles: 'No files yet.',
      kindLabel: 'Kind',
      upload: 'Upload file',
      download: 'Download',
      statusTitle: 'Next step',
      ownerOk: 'Mark documents ready',
      awardDate: 'Award date',
      awardCert: 'Certificate',
      awardBtn: 'Record award',
      awardHint: 'Recording the award moves the application to Recorded and writes it into Awards.',
      batches: 'Batches',
      noBatches: 'No batches yet.',
      batchTitle: 'Title', batchYear: 'Year', batchApps: 'Applications',
      markSubmitted: 'Mark submitted',
      checklistStripe: 'Stripe checklist', checklistStar: 'Star checklist',
      mergeStripe: 'Merge Stripe signed forms', mergeStar: 'Merge Star signed forms',
      zipBatch: 'Download batch ZIP',
      newBatch: 'New batch',
      checksTitle: 'Batch checklist',
      checksHint: 'Confirm each office checklist item as Y, N, or leave it blank. Covering letter and supporting documents may be N without blocking submission. Duty items are confirmed by hand — nothing is auto-filled to Yes.',
      checkBlank: '(blank)',
      saveChecks: 'Save checklist',
      batchTitlePrompt: 'Batch title:',
      batchYearPrompt: 'Batch year:',
      batchYearLabel: 'Batch year',
      batchAppsTitle: 'Applications in this batch',
      applicantsTitle: 'Applicants', addToBatch: 'Mark eligible',
      removeFromBatch: 'Remove from batch',
      batchPickPrompt: 'Which applications join this batch? Type a reference or name:',
      needRemarks: 'What is still needed?',
      submittedDate: 'Submitted date (YYYY-MM-DD):',
      backLabel: 'Return',
      icMismatch: 'The IC does not match the linked member record. Save anyway?',
      pdfStripe: 'Stripe PDF',
      pdfStar: 'Star PDF',
      pdfNeedMember: 'Bind a member record and fill the member number before the official form can be generated.',
      pdfNeedYear: 'Confirm the Efficient years before the official form can be generated.',
      pdfUnavailable: 'The PDF module is not ready yet. Please try again later.',
      pdfFailed: 'Could not produce the PDF:',
      pdfNoSigned: 'There are no signed forms to merge. Upload the signed official forms first.',
      pdf4th: '4th year: the same data produces two separate official forms.',
      languages: 'Language',
      batchUpload: 'Upload batch file',
      dutyKind: 'Duty detail PDF'
    }
  };
  const t = key => (DICT[lang] && DICT[lang][key] != null ? DICT[lang][key] : (DICT.en[key] != null ? DICT.en[key] : key));
  function langToggleHtml() {
    return '<button type="button" class="button small svc-lang" data-svc-lang="1" aria-label="' + escape(t('languages')) + '">'
      + escape(lang === 'zh' ? t('toggleEn') : t('toggleZh')) + '</button>';
  }
  function bindLangToggles(scope, rerender) {
    scope.querySelectorAll('[data-svc-lang]').forEach(btn => btn.addEventListener('click', () => {
      lang = lang === 'zh' ? 'en' : 'zh';
      if (typeof rerender === 'function') rerender();
    }));
  }
  function statusLabel(status) {
    const zh = {
      PendingSecretary: '等秘书处理', Preparing: '准备文件中', AwaitingSignature: '等签名', AwaitingOwner: '待标记准备完成',
      Ready: '可提交', Submitted: '已提交', NeedsInfo: '需要补资料', Approved: '已批准', Recorded: '已登记获奖'
    };
    const en = {
      PendingSecretary: 'Waiting for Secretary', Preparing: 'Preparing files', AwaitingSignature: 'Waiting for signature',
      AwaitingOwner: 'Waiting to mark ready', Ready: 'Ready to submit', Submitted: 'Submitted',
      NeedsInfo: 'Needs more information', Approved: 'Approved', Recorded: 'Award recorded'
    };
    return (lang === 'zh' ? zh : en)[status] || status;
  }
  // Per-application attachments — never includes combined batch files.
  const ATTACH_KINDS = [
    ['duty', 'Duty detail PDF'],
    ['signedStripe', 'Signed Stripe form'],
    ['signedStar', 'Signed Star form'],
    ['covering', 'Covering letter'],
    ['support', 'Supporting document'],
    ['reply', 'Reply']
  ];
  // Batch-level combined uploads — kept separate from the per-person files.
  const ATTACH_KINDS_BATCH = [
    ['combinedDuty', 'Combined duty book'],
    ['combinedSignedStripe', 'Combined signed Stripe forms'],
    ['combinedSignedStar', 'Combined signed Star forms'],
    ['covering', 'Covering letter'],
    ['support', 'Supporting document'],
    ['reply', 'Reply']
  ];
  // Original checklist items for the batch cover sheet — Y / N / blank.
  // Covering and Support may be N without blocking; duty items are confirmed
  // by the Secretary by hand (never auto-filled to Yes).
  const BATCH_CHECK_ITEMS = [
    ['covering', 'Covering letter'],
    ['support', 'Supporting documents'],
    ['applicationForms', 'Application forms'],
    ['dutyBook', 'Duty book'],
    ['dutyDetails', 'Duty details'],
    ['typeHours', 'Type & hours sheet'],
    ['approvedSigned', 'Approved signed forms'],
    ['totalHours', 'Total hours sheet']
  ];
  function attachKindLabel(value) {
    const row = ATTACH_KINDS.concat(ATTACH_KINDS_BATCH).find(([key]) => key === value);
    return row ? row[1] : value;
  }
  function attachKindOptions(targetKind) {
    const list = targetKind === 'batch' ? ATTACH_KINDS_BATCH : ATTACH_KINDS;
    return list.map(([value, label]) => '<option value="' + escape(value) + '">' + escape(label) + '</option>').join('');
  }

  function yearAwardText(year) {
    const key = year == null ? null : Number(year);
    if (!key || !YEAR_MAP[key]) return t('notSure') + (lang === 'zh' ? ' —— 秘书会帮你确认。' : ' — a Secretary will confirm.');
    return YEAR_MAP[key].join(' + ');
  }
  function yearChoices(selected) {
    const opts = [['', t('notSure')]];
    for (let i = 1; i <= 5; i++) opts.push([String(i), i + (i === 1 ? 'st' : i === 2 ? 'nd' : i === 3 ? 'rd' : 'th') + ' Efficient year']);
    return opts.map(([value, label]) => '<option value="' + escape(value) + '"' + (String(selected == null ? '' : selected) === value ? ' selected' : '') + '>' + escape(label) + '</option>').join('');
  }
  function field(label, name, value, opts) {
    const o = opts || {};
    const required = o.required ? ' required' : '';
    const autocomplete = o.autocomplete ? ' autocomplete="' + escape(o.autocomplete) + '"' : ' autocomplete="off"';
    const input = o.type === 'textarea'
      ? '<textarea id="svc-' + name + '" name="' + name + '" rows="' + (o.rows || 3) + '"' + autocomplete + required + ' maxlength="' + (o.maxlength || 500) + '">' + escape(value || '') + '</textarea>'
      : '<input id="svc-' + name + '" name="' + name + '" type="' + (o.type || 'text') + '" value="' + escape(value || '') + '"' + autocomplete + required + ' maxlength="' + (o.maxlength || 200) + '"' + (o.inputmode ? ' inputmode="' + escape(o.inputmode) + '"' : '') + '>';
    return '<div class="field"><label for="svc-' + name + '">' + escape(label) + (o.required ? ' *' : '') + '</label>' + input + (o.hint ? '<p class="hint">' + escape(o.hint) + '</p>' : '') + '</div>';
  }
  function newClientRequestId() {
    try {
      const bytes = new Uint8Array(12);
      (root.crypto || root.msCrypto).getRandomValues(bytes);
      let hex = '';
      for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
      return 'svc-' + hex;
    } catch (error) {
      return 'svc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
  }
  // Official member number (SJAM ID) — never the internal STU id.
  function memberNumberFor(app, members) {
    if (app && app.resolvedMemberNumber) return String(app.resolvedMemberNumber);
    const memberId = app && app.memberId ? String(app.memberId) : '';
    if (!memberId || !Array.isArray(members)) return '';
    const row = members.find(m => m && String(m.id) === memberId);
    return row && row.sjamId ? String(row.sjamId) : '';
  }
  function memberById(members, id) {
    return (members || []).find(m => m && String(m.id) === String(id)) || null;
  }
  // Duplicate names get the actual member number in the label so the picker can tell them apart.
  function memberOptionLabel(member, all) {
    const name = member.name || '';
    const dupes = (all || []).filter(m => m && m.name === name);
    if (dupes.length > 1) {
      const number = member.sjamId ? String(member.sjamId) : t('memberUnresolved');
      return name + ' · ' + number;
    }
    return name;
  }
  function pdfKindsFor(app, memberNumber) {
    const year = app && app.confirmedYear != null ? Number(app.confirmedYear) : null;
    if (!year || !YEAR_MAP[year]) return [];
    if (!memberNumber) return [];
    return YEAR_MAP[year];
  }
  // serviceDownload returns base64; the PDF merge API wants {bytes, filename}.
  function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (typeof data === 'string') {
      const bin = atob(data);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    }
    if (data && data.base64) return toBytes(data.base64);
    return new Uint8Array(0);
  }
  // Collect the Officer-signed PDFs for one kind. 4th-year applications
  // legitimately appear in BOTH the Stripe and the Star merge.
  // Collect the Officer-signed PDFs for one kind. Batch-level combined uploads
  // (combinedSignedStripe / combinedSignedStar) win — when present they are the
  // single merged document and per-person files are NOT appended on top.
  // A failed download is an error, never a silent skip.
  function gatherSignedDocs(call, batch, applications, kind) {
    const wantStripe = kind === 'Stripe';
    const combinedKind = wantStripe ? 'combinedSignedStripe' : 'combinedSignedStar';
    const signedKind = wantStripe ? 'signedStripe' : 'signedStar';
    const wantsKind = app => {
      const year = app.confirmedYear != null ? Number(app.confirmedYear) : null;
      if (!year || !YEAR_MAP[year]) return false;
      return YEAR_MAP[year].indexOf(kind) >= 0;
    };
    const downloadOne = src => Promise.resolve(call({ action: 'serviceDownload', attachmentId: src.id }))
      .then(file => {
        if (!file || !file.base64) throw new Error('Attachment download failed: ' + (src.fileName || src.id));
        return { bytes: toBytes(file.base64), filename: file.fileName || src.fileName || 'signed.pdf' };
      });
    // 1) Batch combined file takes priority.
    const combined = (batch.attachments || []).filter(att => att.kind === combinedKind && att.id);
    if (combined.length) {
      return Promise.all(combined.map(att => downloadOne({ id: att.id, fileName: att.fileName })));
    }
    // 2) Otherwise gather the per-application signed forms (only the needed kind).
    const sources = [];
    applications.forEach(app => {
      if (!wantsKind(app)) return;
      (app.attachments || []).forEach(att => {
        if (att.kind === signedKind && att.id) sources.push({ id: att.id, fileName: att.fileName });
      });
    });
    return Promise.all(sources.map(downloadOne));
  }
  // All real attachments for the ZIP package (duty, covering, support, reply,
  // combined files) — not just the checklists and signed merges.
  function gatherExtraAttachments(call, batch, applications) {
    const extraKinds = ['duty', 'covering', 'support', 'reply', 'combinedDuty', 'combinedSignedStripe', 'combinedSignedStar'];
    const sources = [];
    (batch.attachments || []).forEach(att => {
      if (extraKinds.includes(att.kind) && att.id) sources.push({ id: att.id, fileName: att.fileName, prefix: 'batch' });
    });
    applications.forEach(app => {
      (app.attachments || []).forEach(att => {
        if (extraKinds.includes(att.kind) && att.id) {
          const name = (app.applicant && app.applicant.name) || app.id;
          sources.push({ id: att.id, fileName: att.fileName, prefix: name });
        }
      });
    });
    return Promise.all(sources.map(src => Promise.resolve(call({ action: 'serviceDownload', attachmentId: src.id }))
      .then(file => {
        if (!file || !file.base64) throw new Error('Attachment download failed: ' + (src.fileName || src.id));
        const bytes = toBytes(file.base64);
        const base = (file.fileName || src.fileName || 'attachment').replace(/[\\/:*?"<>|]/g, '_');
        const folder = String(src.prefix || '').replace(/[\\/:*?"<>|]/g, '_');
        return { bytes: bytes, filename: folder ? folder + '/' + base : base };
      })));
  }

  // ---------- Lightweight summary polling (sidebar badges) ----------
  // Agent2 contract: KPTTransport.call({action:'serviceSummary'}) ->
  //   {unreadCount, ownerReviewCount, changeKey} — nothing else.
  // 5s cadence, paused when hidden, single-flight. Never bootstraps the state.
  // Only the open applications list refreshes on changeKey, and never over an
  // unsaved edit; failures keep the current counts and the editor intact.
  let summaryTimer = null;
  let summaryInFlight = false;
  let summaryLastKey = null;
  let summaryDeps = null;

  function summaryTick() {
    const deps = summaryDeps;
    if (!deps || typeof deps.call !== 'function') return;
    if (summaryInFlight) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    summaryInFlight = true;
    Promise.resolve(deps.call({ action: 'serviceSummary' })).then(data => {
      const unreadCount = Number((data && data.unreadCount) || 0);
      const ownerReviewCount = Number((data && data.ownerReviewCount) || 0);
      const changeKey = data && data.changeKey != null ? String(data.changeKey) : null;
      if (typeof deps.onCounts === 'function') deps.onCounts({ unreadCount: unreadCount, ownerReviewCount: ownerReviewCount });
      // Sidebar badge is a pure count update; no re-render of the page.
      if (typeof deps.onBadge === 'function') deps.onBadge({ unreadCount: unreadCount, ownerReviewCount: ownerReviewCount });
      const keyChanged = changeKey != null && summaryLastKey != null && changeKey !== summaryLastKey;
      const first = summaryLastKey == null;
      summaryLastKey = changeKey;
      if (first) return;
      if (!keyChanged) return;
      // Refresh the list only when the applications view is actually open.
      if (typeof deps.isListViewOpen === 'function' && !deps.isListViewOpen()) return;
      if (typeof deps.isDirty === 'function' && deps.isDirty()) {
        // Never clobber unsaved edits — just tell the user there is news.
        if (typeof deps.onStale === 'function') deps.onStale();
        return;
      }
      if (typeof deps.refreshList === 'function') deps.refreshList();
    }).catch(() => {
      // Keep the editor and the last known counts; a quiet hint is enough.
      if (typeof deps.onPollError === 'function') deps.onPollError();
    }).then(() => {
      summaryInFlight = false;
    });
  }

  function startSummaryPolling(deps) {
    stopSummaryPolling();
    summaryDeps = deps || null;
    summaryLastKey = null;
    summaryInFlight = false;
    if (!summaryDeps || typeof summaryDeps.call !== 'function') return;
    summaryTimer = setInterval(summaryTick, 5000);
    summaryTick();
  }
  function stopSummaryPolling() {
    if (summaryTimer) clearInterval(summaryTimer);
    summaryTimer = null;
    summaryDeps = null;
    summaryLastKey = null;
    summaryInFlight = false;
  }

  // ---------- Public form ----------
  function renderPublicForm(container, api) {
    const call = (api && api.call) || (root.KPTTransport && root.KPTTransport.call);
    if (!container || typeof call !== 'function') return;
    let clientRequestId = newClientRequestId();
    function draw() {
      container.innerHTML =
        '<section class="card service-apply" id="service-apply-form" aria-labelledby="svc-title">'
        + '<div class="section-heading" style="margin-top:0"><div><div class="eyebrow">' + escape(t('svcEyebrow')) + '</div>'
        + '<h2 id="svc-title" style="margin:0">' + escape(t('svcTitle')) + '</h2></div>' + langToggleHtml() + '</div>'
        + '<p class="muted">' + escape(t('svcIntro')) + '</p>'
        + '<form id="service-form" class="service-form" novalidate>'
        + '<fieldset><legend>' + escape(t('legendDetails')) + '</legend><p class="hint">' + escape(t('hintBlock')) + '</p>'
        + '<div class="form-grid">'
        + field(t('fName'), 'name', '', { required: true, autocomplete: 'name', hint: t('hintName') })
        + field(t('fIc'), 'ic', '', { required: true, autocomplete: 'off', hint: t('hintIc') })
        + field(t('fGender'), 'gender', '', {})
        + field(t('fRank'), 'rank', '', { hint: t('hintRank') })
        + field(t('fJoined'), 'joined', '', { type: 'date', hint: t('hintJoined') })
        + field(t('fPhone'), 'phone', '', { type: 'tel', inputmode: 'tel', autocomplete: 'tel' })
        + field(t('fEmail'), 'email', '', { type: 'email', autocomplete: 'email' })
        + field(t('fOccupation'), 'occupation', '', {})
        + '</div></fieldset>'
        + '<fieldset class="svc-years"><legend>' + escape(t('legendYears')) + '</legend>'
        + '<p class="hint">' + escape(t('hintYears')) + '</p>'
        + '<div class="field"><label for="svc-declaredYear">' + escape(t('labelYears')) + '</label><select id="svc-declaredYear" name="declaredYear" aria-describedby="svc-year-map">' + yearChoices('') + '</select></div>'
        + '<div class="svc-year-map" id="svc-year-map" role="status" aria-live="polite"></div>'
        + '<p class="hint">' + escape(t('hintFourth')) + '</p>'
        + '</fieldset>'
        + '<div class="svc-actions">'
        + '<button class="button primary" type="submit" id="svc-submit">' + escape(t('submit')) + '</button>'
        + '<button class="button" type="reset" id="svc-reset">' + escape(t('clear')) + '</button>'
        + '</div></form>'
        + '<div id="svc-result" class="message" role="status" aria-live="polite" hidden></div>'
        + '</section>';
      const form = container.querySelector('#service-form');
      const select = container.querySelector('#svc-declaredYear');
      const mapBox = container.querySelector('#svc-year-map');
      const refreshMap = () => {
        const value = select.value === '' ? null : Number(select.value);
        mapBox.innerHTML = '<p class="svc-year-map-lead">' + escape(t('yearMapLead')) + '</p>'
          + '<p class="svc-year-map-award"><span class="svc-year-map-name">' + escape(yearAwardText(value)) + '</span></p>';
      };
      select.addEventListener('change', refreshMap);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const result = container.querySelector('#svc-result');
        const data = new FormData(form);
        const applicant = {
          name: String(data.get('name') || '').trim(),
          ic: String(data.get('ic') || '').trim(),
          gender: String(data.get('gender') || '').trim(),
          rank: String(data.get('rank') || '').trim(),
          joined: String(data.get('joined') || '').trim(),
          phone: String(data.get('phone') || '').trim(),
          email: String(data.get('email') || '').trim(),
          occupation: String(data.get('occupation') || '').trim()
        };
        const declaredRaw = String(data.get('declaredYear') || '').trim();
        const declaredYear = declaredRaw === '' ? null : Number(declaredRaw);
        if (!applicant.name || !applicant.ic) {
          result.hidden = false;
          result.className = 'message error';
          result.textContent = t('needNameIc');
          return;
        }
        const payload = { action: 'submitServiceApplication', applicant, declaredYear, clientRequestId: clientRequestId, website: '' };
        result.hidden = false;
        result.className = 'message working';
        result.textContent = t('sending');
        Promise.resolve(call(payload)).then(response => {
          const reference = response && response.reference ? response.reference : '';
          result.className = 'message';
          result.innerHTML = '<strong>' + escape(t('received')) + ' <strong>' + escape(reference) + '</strong>. ' + escape(t('receivedTail')) + '</strong>';
          form.querySelector('#svc-submit').disabled = true;
          clientRequestId = newClientRequestId();
        }).catch(error => {
          result.className = 'message error';
          result.textContent = t('notSent') + ' ' + (error && error.message ? error.message : '') + ' ' + t('notSentTail');
        });
      });
      form.addEventListener('reset', () => {
        const result = container.querySelector('#svc-result');
        result.hidden = true;
        result.textContent = '';
        form.querySelector('#svc-submit').disabled = false;
        clientRequestId = newClientRequestId();
        setTimeout(refreshMap, 0);
      });
      refreshMap();
      bindLangToggles(container, draw);
    }
    draw();
  }

  // ---------- Admin / Owner panel ----------
  // Returns a controller so the host page can drive summary polling safely.
  function renderAdminPanel(container, api, options) {
    const call = (api && api.call) || (root.KPTTransport && root.KPTTransport.call);
    // Secretary (admin) manages Awards too — the award action stays visible for
    // Owner and Secretary after the one-time Owner check.
    const canRecordAward = !!(options && (options.owner || options.admin));
    const members = (options && options.members) || [];
    if (!container || typeof call !== 'function') return null;
    const state = { applications: [], batches: [], unreadCount: 0, selectedId: null, filter: '', dirty: false };

    function notice(message, isError) {
      const el = container.querySelector('#svc-admin-notice');
      if (el) { el.className = 'message' + (isError ? ' error' : ''); el.textContent = message || ''; }
    }
    function load() {
      return Promise.resolve(call({ action: 'serviceList' })).then(data => {
        state.applications = (data && data.applications) || [];
        state.batches = (data && data.batches) || [];
        state.unreadCount = Number((data && data.unreadCount) || 0);
        render();
      }).catch(error => notice(error && error.message ? error.message : '加载失败。', true));
    }
    function saveApplication(app) {
      return Promise.resolve(call({ action: 'serviceSave', application: app })).then(data => {
        state.applications = (data && data.applications) || state.applications;
        state.batches = (data && data.batches) || state.batches;
        state.unreadCount = Number((data && data.unreadCount) || 0);
        state.dirty = false;
        render();
        // Notice AFTER render — a re-render clears the notice area.
        notice(t('saved'));
      }).catch(error => notice(error && error.message ? error.message : '保存失败。', true));
    }
    function transition(target, version, status, remarks, submittedAt) {
      const body = { version: version, status: status, remarks: remarks || '' };
      if (target.kind === 'application') body.applicationId = target.id;
      else body.batchId = target.id;
      if (submittedAt) body.submittedAt = submittedAt;
      return Promise.resolve(call(Object.assign({ action: 'serviceTransition' }, body))).then(data => {
        state.applications = (data && data.applications) || state.applications;
        state.batches = (data && data.batches) || state.batches;
        state.unreadCount = Number((data && data.unreadCount) || 0);
        state.dirty = false;
        render();
      }).catch(error => notice(error && error.message ? error.message : '状态更新失败。', true));
    }
    // target: {kind:'application'|'batch', id} — kind select must be scoped to that target.
    function upload(target, kind, file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
        reader.onerror = () => reject(new Error('Could not read the file.'));
        reader.readAsDataURL(file);
      }).then(base64 => {
        const body = { action: 'serviceUpload', kind: kind, fileName: file.name, mime: file.type || 'application/octet-stream', base64: base64 };
        if (target.kind === 'application') body.applicationId = target.id;
        else body.batchId = target.id;
        return call(body);
      }).then(data => {
        state.applications = (data && data.applications) || state.applications;
        state.batches = (data && data.batches) || state.batches;
        render();
      }).catch(error => notice(error && error.message ? error.message : '上传失败。', true));
    }
    function download(attachmentId) {
      return Promise.resolve(call({ action: 'serviceDownload', attachmentId: attachmentId })).then(file => {
        if (!file || !file.base64) throw new Error('No file returned.');
        const binary = atob(file.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: file.mime || 'application/octet-stream' }));
        const a = document.createElement('a');
        a.href = url; a.download = file.fileName || 'attachment';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }).catch(error => notice(error && error.message ? error.message : '下载失败。', true));
    }
    function award(app, date, certificate) {
      return Promise.resolve(call({ action: 'serviceAward', applicationId: app.id, version: app.version, date: date, certificate: certificate })).then(data => {
        state.applications = (data && data.applications) || state.applications;
        state.batches = (data && data.batches) || state.batches;
        render();
      }).catch(error => notice(error && error.message ? error.message : '登记获奖失败。', true));
    }
    function saveBatch(batch) {
      return Promise.resolve(call({ action: 'serviceSaveBatch', batch: batch })).then(data => {
        state.applications = (data && data.applications) || state.applications;
        state.batches = (data && data.batches) || state.batches;
        render();
        // Notice AFTER render — a re-render clears the notice area.
        notice(t('saved'));
      }).catch(error => notice(error && error.message ? error.message : '批次保存失败。', true));
    }

    function appRow(app) {
      const label = app.applicant && app.applicant.name ? app.applicant.name : (lang === 'zh' ? '(没有姓名)' : '(no name)');
      const years = app.confirmedYear != null ? app.confirmedYear : (app.declaredYear != null ? '≈' + app.declaredYear : '—');
      const member = memberById(members, app.memberId);
      const memberLabel = member ? (member.name + (member.sjamId ? ' · ' + member.sjamId : '')) : (app.memberId || '—');
      return '<tr class="' + (state.selectedId === app.id ? 'svc-row-selected' : '') + '">'
        + '<td><button type="button" class="button small" data-svc-open="' + escape(app.id) + '">' + escape(label) + '</button></td>'
        + '<td>' + escape(String(app.year || '')) + '</td>'
        + '<td>' + escape(String(years)) + '</td>'
        + '<td>' + escape(memberLabel) + '</td>'
        + '<td><span class="pill svc-status svc-status-' + escape(app.status) + '">' + escape(statusLabel(app.status)) + '</span></td>'
        + '<td>' + escape(String((app.attachments || []).length)) + '</td>'
        + '</tr>';
    }
    function stepHeading(number, label, tag = 'h3') {
      return '<' + tag + ' class="svc-step-heading"><span class="svc-step-number">' + number + '.</span> ' + escape(label) + '</' + tag + '>';
    }
    function stepBlock(number, label, body) {
      return '<section class="svc-step">' + stepHeading(number, label) + body + '</section>';
    }
    function attachmentsBlock(target, app) {
      const list = (app && app.attachments) || [];
      const rows = list.map(att => '<li><strong>' + escape(attachKindLabel(att.kind)) + '</strong> · ' + escape(att.fileName || '')
        + ' <button type="button" class="button small" data-svc-dl="' + escape(att.id) + '">' + escape(t('download')) + '</button></li>').join('');
      // Each target gets its own kind select + upload input; no shared first-match lookup.
      return '<ul class="svc-files">' + (rows || '<li class="muted">' + escape(t('noFiles')) + '</li>') + '</ul>'
        + '<div class="toolbar"><label class="field"><span>' + escape(t('kindLabel')) + '</span>'
        + '<select data-svc-kind-for="' + escape(target.kind) + ':' + escape(target.id) + '">' + attachKindOptions(target.kind) + '</select></label>'
        + '<label class="button small">' + escape(t('upload')) + '<input type="file" data-svc-upload-for="' + escape(target.kind) + ':' + escape(target.id) + '" hidden></label></div>';
    }
    function pdfButtons(app) {
      const memberNumber = memberNumberFor(app, members);
      const kinds = pdfKindsFor(app, memberNumber);
      if (!app.confirmedYear) return '<p class="hint">' + escape(t('pdfNeedYear')) + '</p>';
      if (!memberNumber) return '<p class="hint">' + escape(t('pdfNeedMember')) + '</p>';
      const hint = Number(app.confirmedYear) === 4 ? '<p class="hint">' + escape(t('pdf4th')) + '</p>' : '';
      return '<div class="toolbar">'
        + kinds.map(kind => '<button type="button" class="button" data-svc-pdf="' + escape(app.id) + '" data-svc-pdf-kind="' + escape(kind) + '">'
          + escape(kind === 'Stripe' ? t('pdfStripe') : t('pdfStar')) + '</button>').join('')
        + '</div>' + hint;
    }
    function memberPicker(app) {
      // Searchable select. Value is the internal id; label shows name, and
      // duplicates carry the actual member number.
      const current = memberById(members, app.memberId);
      const currentLabel = current ? memberOptionLabel(current, members) : (app.memberId ? t('memberUnresolved') : '');
      const options = ['<option value="">' + escape(t('memberNone')) + '</option>']
        .concat(members.map(m => '<option value="' + escape(m.id) + '"' + (String(m.id) === String(app.memberId) ? ' selected' : '') + '>'
          + escape(memberOptionLabel(m, members)) + '</option>'));
      return '<div class="field svc-member-field"><label for="svc-member-pick">' + escape(t('memberLabel')) + '</label>'
        + '<input id="svc-member-search" type="search" placeholder="' + escape(t('memberSearch')) + '" autocomplete="off" aria-controls="svc-member-pick">'
        + '<select id="svc-member-pick" name="memberId" size="6">' + options.join('') + '</select>'
        + '<p class="hint">' + escape(t('memberHint')) + '</p>'
        + (currentLabel ? '<p class="hint">' + escape(currentLabel) + '</p>' : '')
        + '</div>';
    }
    function statusButtons(app) {
      const flow = TRANSITIONS[app.status] || { next: [], back: [] };
      const next = flow.next;
      const back = flow.back;
      if (!next.length && !back.length && app.status !== 'Approved') return '';
      let html = '<div class="toolbar">';
      html += next.map(s => {
        if (s === 'Ready') return '<button type="button" class="button btn-check" data-svc-status="' + escape(app.id) + '" data-svc-to="Ready">' + escape(t('ownerOk')) + '</button>';
        return '<button type="button" class="button btn-submit" data-svc-status="' + escape(app.id) + '" data-svc-to="' + escape(s) + '">' + escape(statusLabel(s)) + '</button>';
      }).join('');
      html += back.map(s => '<button type="button" class="button btn-return" data-svc-status="' + escape(app.id) + '" data-svc-to="' + escape(s) + '">' + escape(t('backLabel')) + ' · ' + escape(statusLabel(s)) + '</button>').join('');
      html += '</div>';
      return html;
    }
    function detailBlock(app) {
      if (!app) return '<p class="muted">' + escape(t('pickDetail')) + '</p>';
      const a = app.applicant || {};
      const actions = statusButtons(app);
      return '<div class="svc-detail">'
        + '<h2>' + escape(a.name || (lang === 'zh' ? '(没有姓名)' : '(no name)')) + ' <span class="pill svc-status svc-status-' + escape(app.status) + '">' + escape(statusLabel(app.status)) + '</span></h2>'
        + '<p class="muted">' + escape(String(app.createdAt || '').slice(0, 10)) + '</p>'
        + '<section class="svc-step">' + stepHeading(1, lang === 'zh' ? '核对申请资料' : 'Verify application details')
        + '<form id="svc-detail-form" class="form-grid">'
        + field(t('fName'), 'name', a.name, { required: true })
        + field(t('fIc'), 'ic', a.ic, { required: true })
        + field(t('fGender'), 'gender', a.gender)
        + field(t('fRank'), 'rank', a.rank)
        + field(t('fJoined'), 'joined', a.joined, { type: 'date' })
        + field(t('fPhone'), 'phone', a.phone, { type: 'tel' })
        + field(t('fEmail'), 'email', a.email, { type: 'email' })
        + field(t('fOccupation'), 'occupation', a.occupation)
        + field(t('refLabel'), 'reference', app.reference != null ? app.reference : '', { hint: t('refHint') })
        + '<div class="field"><label for="svc-year">' + escape(t('yearLabel')) + '</label><input id="svc-year" name="year" type="number" min="2000" max="2100" value="' + escape(app.year != null && app.year !== '' ? String(app.year) : '') + '"><p class="hint">' + escape(t('yearHint')) + '</p></div>'
        + '<div class="field"><label for="svc-confYear">' + escape(t('confYear')) + '</label><select id="svc-confYear">' + yearChoices(app.confirmedYear) + '</select></div>'
        + memberPicker(app)
        + field(t('remarks'), 'remarks', app.remarks, { type: 'textarea' })
        + '</form>'
        + '<div class="toolbar"><button type="button" class="button primary" data-svc-save="' + escape(app.id) + '">' + escape(t('save')) + '</button></div>'
        + '</section>'
        + stepBlock(2, lang === 'zh' ? '下载申请表' : 'Download application forms', pdfButtons(app))
        + stepBlock(3, t('files'), attachmentsBlock({ kind: 'application', id: app.id }, app))
        + (actions ? stepBlock(4, t('statusTitle'), actions) : '')
        + (canRecordAward && app.status === 'Approved' ? '<section class="svc-step">' + stepHeading(5, t('awardBtn')) + '<p class="hint">' + escape(t('awardHint')) + '</p>'
          + '<div class="toolbar"><label class="field"><span>' + escape(t('awardDate')) + '</span><input type="date" id="svc-award-date"></label><label class="field"><span>' + escape(t('awardCert')) + '</span><input type="text" id="svc-award-cert"></label>'
          + '<button type="button" class="button primary" data-svc-award="' + escape(app.id) + '">' + escape(t('awardBtn')) + '</button></div></section>' : '')
        + '</div>';
    }
    function batchBlock() {
      const rows = state.batches.map(b => {
        const names = (b.applicationIds || []).length;
        return '<tr><td><button type="button" class="button small" data-svc-batch-open="' + escape(b.id) + '">' + escape(b.title || '') + '</button></td>'
          + '<td>' + escape(String(b.year || '')) + '</td><td>' + escape(String(names)) + '</td>'
          + '<td><span class="pill svc-status svc-status-' + escape(b.status) + '">' + escape(statusLabel(b.status)) + '</span></td>'
          + '<td><div class="row-tools">'
          + (['Preparing', 'AwaitingSignature', 'AwaitingOwner'].includes(b.status) || (b.status === 'Ready' && !b.ownerApproved)
            ? '<button type="button" class="button small btn-check" data-svc-batch-status="' + escape(b.id) + '" data-svc-to="Ready">' + escape(t('ownerOk')) + '</button>' : '')
          + (b.status === 'Ready' && b.ownerApproved
            ? '<button type="button" class="button small" data-svc-batch-status="' + escape(b.id) + '" data-svc-to="Submitted">' + escape(t('markSubmitted')) + '</button>' : '')
          + (b.status === 'Submitted'
            ? '<button type="button" class="button small" data-svc-batch-status="' + escape(b.id) + '" data-svc-to="Approved">' + escape(statusLabel('Approved')) + '</button>' : '')
          + '<button type="button" class="button small" data-svc-batch-pdf="' + escape(b.id) + '" data-svc-kind="Stripe">' + escape(t('checklistStripe')) + '</button>'
          + '<button type="button" class="button small" data-svc-batch-pdf="' + escape(b.id) + '" data-svc-kind="Star">' + escape(t('checklistStar')) + '</button>'
          + '<button type="button" class="button small" data-svc-batch-merge="' + escape(b.id) + '" data-svc-kind="Stripe">' + escape(t('mergeStripe')) + '</button>'
          + '<button type="button" class="button small" data-svc-batch-merge="' + escape(b.id) + '" data-svc-kind="Star">' + escape(t('mergeStar')) + '</button>'
          + '<button type="button" class="button small btn-download" data-svc-batch-zip="' + escape(b.id) + '">' + escape(t('zipBatch')) + '</button>'
          + '</div></td></tr>';
      }).join('');
      return '<section class="svc-step">' + stepHeading(2, t('batches'), 'h2') + (rows
        ? '<div class="table-wrap"><table><thead><tr><th>' + escape(t('batchTitle')) + '</th><th>' + escape(t('batchYear')) + '</th><th>' + escape(t('batchApps')) + '</th><th>' + escape(t('thStatus')) + '</th><th>' + escape(t('thFiles')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="muted">' + escape(t('noBatches')) + '</p>')
        + '<div class="toolbar"><button type="button" class="button" data-svc-new-batch="1">' + escape(t('newBatch')) + '</button></div></section>';
    }
    function batchChecksBlock(batch) {
      const checks = (batch && batch.checks) || {};
      const rows = BATCH_CHECK_ITEMS.map(([key, label]) => {
        const value = checks[key] != null ? String(checks[key]) : '';
        return '<div class="field svc-check-row"><label for="svc-check-' + key + '">' + escape(label) + '</label>'
          + '<select id="svc-check-' + key + '" data-svc-check="' + escape(key) + '">'
          + '<option value=""' + (value === '' ? ' selected' : '') + '>' + escape(t('checkBlank')) + '</option>'
          + '<option value="Y"' + (value === 'Y' ? ' selected' : '') + '>Y</option>'
          + '<option value="N"' + (value === 'N' ? ' selected' : '') + '>N</option>'
          + '</select></div>';
      }).join('');
      return '<p class="hint">' + escape(t('checksHint')) + '</p>'
        + '<div class="form-grid svc-checks">' + rows + '</div>'
        + '<div class="toolbar"><button type="button" class="button primary" data-svc-save-checks="' + escape(batch.id) + '">' + escape(t('saveChecks')) + '</button></div>';
    }
    function batchDetailBlock(batch) {
      if (!batch) return '';
      const inIds = new Set(batch.applicationIds || []);
      const inBatch = state.applications.filter(app => inIds.has(app.id));
      const outBatch = state.applications.filter(app => !inIds.has(app.id));
      return '<section class="card svc-batch-detail"><h2>' + escape(batch.title || '') + ' · ' + escape(String(batch.year || '')) + '</h2>'
        + '<p class="muted">' + escape(statusLabel(batch.status)) + '</p>'
        + '<section class="svc-step">' + stepHeading(1, lang === 'zh' ? '核对申请者' : 'Review applicants')
        + '<div class="svc-substep"><h4>① ' + escape(t('batchAppsTitle')) + '</h4>'
        + '<ul class="svc-files">' + (inBatch.map(app => '<li>' + escape(app.applicant && app.applicant.name || app.id)
          + ' <button type="button" class="button small btn-return" data-svc-batch-remove="' + escape(batch.id) + '" data-svc-app="' + escape(app.id) + '">' + escape(t('removeFromBatch')) + '</button></li>').join('') || '<li class="muted">—</li>') + '</ul>'
        + '</div><div class="svc-substep"><h4>② ' + escape(t('applicantsTitle')) + '</h4>'
        + '<ul class="svc-files">' + (outBatch.map(app => '<li>' + escape(app.applicant && app.applicant.name || app.id)
          + ' <button type="button" class="button small" data-svc-batch-add="' + escape(batch.id) + '" data-svc-app="' + escape(app.id) + '">' + escape(t('addToBatch')) + '</button></li>').join('') || '<li class="muted">—</li>') + '</ul>'
        + '</div></section>'
        + stepBlock(2, t('checksTitle'), batchChecksBlock(batch))
        + stepBlock(3, t('files'), attachmentsBlock({ kind: 'batch', id: batch.id }, batch))
        + '</section>';
    }

    let selectedBatchId = null;
    function render() {
      const filter = (state.filter || '').toLowerCase();
      const list = state.applications.filter(app => {
        if (!filter) return true;
        const a = app.applicant || {};
        return String(a.name || '').toLowerCase().includes(filter) || String(app.id).toLowerCase().includes(filter)
          || String(app.reference || '').toLowerCase().includes(filter) || String(app.memberId || '').toLowerCase().includes(filter);
      });
      const selected = state.applications.find(app => app.id === state.selectedId) || null;
      const selectedBatch = state.batches.find(b => b.id === selectedBatchId) || null;
      container.innerHTML =
        '<div class="svc-admin" id="svc-admin">'
        + '<section class="svc-step"><div class="section-heading">' + stepHeading(1, t('adminTitle'), 'h2')
        + (state.unreadCount ? '<span class="hub-badge">' + state.unreadCount + ' ' + escape(t('newApps')) + '</span>' : '')
        + langToggleHtml() + '</div>'
        + '<div id="svc-admin-notice" class="message" role="status" aria-live="polite"></div>'
        + '<div class="toolbar"><label class="field"><span>' + escape(t('filterLabel')) + '</span><input type="search" id="svc-filter" value="' + escape(state.filter) + '" placeholder="' + escape(t('filterHint')) + '"></label>'
        + '<button type="button" class="button" data-svc-reload="1">' + escape(t('reload')) + '</button></div>'
        + '<details class="svc-status-guide"><summary>' + escape(lang === 'zh' ? '查看全部状态' : 'View all statuses') + '</summary>'
        + '<ul>' + Object.keys(TRANSITIONS).map(status => '<li><span class="pill svc-status svc-status-' + status + '">' + escape(statusLabel(status)) + '</span>'
          + (status === 'AwaitingOwner' ? '<small>' + escape(lang === 'zh' ? '旧流程记录，无需 Owner 批准' : 'Legacy records · no Owner approval required') + '</small>' : '') + '</li>').join('') + '</ul></details>'
        + '<div class="svc-admin-layout">'
        + '<div class="svc-admin-list"><div class="table-wrap"><table><thead><tr><th>' + escape(t('thApplicant')) + '</th><th>' + escape(t('thYear')) + '</th><th>' + escape(t('thYears')) + '</th><th>' + escape(t('thMember')) + '</th><th>' + escape(t('thStatus')) + '</th><th>' + escape(t('thFiles')) + '</th></tr></thead><tbody>'
        + (list.map(appRow).join('') || '<tr><td colspan="6" class="empty">' + escape(t('noMatch')) + '</td></tr>')
        + '</tbody></table></div></div>'
        + '<div class="svc-admin-detail">' + detailBlock(selected) + '</div>'
        + '</div>'
        + '</section>'
        + batchBlock()
        + batchDetailBlock(selectedBatch)
        + '</div>';

      container.querySelectorAll('[data-svc-open]').forEach(btn => btn.addEventListener('click', () => { state.selectedId = btn.getAttribute('data-svc-open'); render(); }));
      const filterEl = container.querySelector('#svc-filter');
      if (filterEl) filterEl.addEventListener('input', () => {
        state.filter = filterEl.value;
        render();
        const f2 = container.querySelector('#svc-filter');
        if (f2) { f2.focus(); f2.setSelectionRange(f2.value.length, f2.value.length); }
      });
      const reload = container.querySelector('[data-svc-reload]');
      if (reload) reload.addEventListener('click', load);
      // Member picker: filter the select live.
      const memberSearch = container.querySelector('#svc-member-search');
      const memberPick = container.querySelector('#svc-member-pick');
      if (memberSearch && memberPick) {
        memberSearch.addEventListener('input', () => {
          const q = memberSearch.value.toLowerCase();
          Array.from(memberPick.options).forEach(opt => {
            if (!opt.value) { opt.hidden = false; return; }
            opt.hidden = q ? !opt.textContent.toLowerCase().includes(q) : false;
          });
        });
      }
      const saveBtn = container.querySelector('[data-svc-save]');
      if (saveBtn) saveBtn.addEventListener('click', () => {
        const app = state.applications.find(row => row.id === saveBtn.getAttribute('data-svc-save'));
        if (!app) return;
        const form = container.querySelector('#svc-detail-form');
        const get = n => { const el = form.querySelector('[name="' + n + '"]'); return el ? String(el.value || '').trim() : ''; };
        const confEl = container.querySelector('#svc-confYear');
        const memberEl = container.querySelector('#svc-member-pick');
        const payload = {
          id: app.id, version: app.version,
          reference: get('reference'),
          applicant: { name: get('name'), ic: get('ic'), gender: get('gender'), rank: get('rank'), joined: get('joined'), phone: get('phone'), email: get('email'), occupation: get('occupation') },
          declaredYear: app.declaredYear,
          confirmedYear: confEl && confEl.value !== '' ? Number(confEl.value) : null,
          memberId: memberEl ? String(memberEl.value || '').trim() : '',
          remarks: get('remarks')
        };
        // Application year (e.g. 2025/2026) — distinct from the Efficient-year count.
        const yearEl = container.querySelector('#svc-year');
        const yearVal = yearEl ? String(yearEl.value || '').trim() : '';
        if (yearVal !== '') payload.year = Number(yearVal);
        // Any bound member whose normalised IC differs from the form IC —
        // including a first-time bind — needs an explicit confirmation.
        const linked = memberById(members, payload.memberId);
        const icKey = (root.KPT && typeof root.KPT.icKey === 'function') ? root.KPT.icKey : (v => String(v || '').trim());
        const icMismatch = linked && linked.ic && icKey(linked.ic) !== icKey(payload.applicant.ic);
        if (icMismatch) {
          if (!window.confirm(t('icMismatch'))) return;
          payload.confirmIcMismatch = true;
        }
        saveApplication(payload);
      });
      container.querySelectorAll('[data-svc-pdf]').forEach(btn => btn.addEventListener('click', () => {
        const app = state.applications.find(row => row.id === btn.getAttribute('data-svc-pdf'));
        const kind = btn.getAttribute('data-svc-pdf-kind') || 'Stripe';
        if (!app) return;
        const memberNumber = memberNumberFor(app, members);
        if (!memberNumber || !app.confirmedYear) { notice(t('pdfNeedMember'), true); return; }
        // Never fall back to the internal id — the certificate must carry the
        // Secretary-entered reference, or stay blank until it is filled in.
        const reference = app.reference != null && String(app.reference).trim() ? String(app.reference).trim() : '';
        if (!reference) { notice(t('refMissing'), true); return; }
        if (!root.KPTServicePDF || typeof root.KPTServicePDF.download !== 'function') {
          notice(t('pdfUnavailable'), true);
          return;
        }
        // PDF module is async — never leave an unhandled rejection.
        Promise.resolve(root.KPTServicePDF.download(app, kind, {
          division: (root.KPT_CONFIG && root.KPT_CONFIG.organization) || '',
          memberNumber: memberNumber,
          reference: reference
        })).catch(error => notice(t('pdfFailed') + ' ' + (error && error.message ? error.message : ''), true));
      }));
      // Uploads are scoped per target (application vs batch) with their own kind select.
      container.querySelectorAll('[data-svc-upload-for]').forEach(input => input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const token = input.getAttribute('data-svc-upload-for');
        const [targetKind, targetId] = token.split(':');
        const kindEl = container.querySelector('[data-svc-kind-for="' + token + '"]');
        upload({ kind: targetKind, id: targetId }, kindEl ? kindEl.value : 'support', file);
      }));
      container.querySelectorAll('[data-svc-dl]').forEach(btn => btn.addEventListener('click', () => download(btn.getAttribute('data-svc-dl'))));
      container.querySelectorAll('[data-svc-status]').forEach(btn => btn.addEventListener('click', () => {
        const app = state.applications.find(row => row.id === btn.getAttribute('data-svc-status'));
        const to = btn.getAttribute('data-svc-to');
        const remarks = to === 'NeedsInfo' ? (window.prompt(t('needRemarks')) || '') : '';
        if (to === 'NeedsInfo' && !remarks) return;
        if (to === 'Submitted') {
          const date = window.prompt(t('submittedDate'), new Date().toISOString().slice(0, 10));
          if (!date) return;
          transition({ kind: 'application', id: app.id }, app.version, to, remarks, date);
        } else {
          transition({ kind: 'application', id: app.id }, app.version, to, remarks);
        }
      }));
      const awardBtn = container.querySelector('[data-svc-award]');
      if (awardBtn) awardBtn.addEventListener('click', () => {
        const app = state.applications.find(row => row.id === awardBtn.getAttribute('data-svc-award'));
        const dateEl = container.querySelector('#svc-award-date');
        const certEl = container.querySelector('#svc-award-cert');
        if (app && dateEl && dateEl.value) award(app, dateEl.value, certEl ? String(certEl.value || '').trim() : '');
      });
      container.querySelectorAll('[data-svc-batch-open]').forEach(btn => btn.addEventListener('click', () => {
        selectedBatchId = btn.getAttribute('data-svc-batch-open');
        render();
      }));
      container.querySelectorAll('[data-svc-batch-status]').forEach(btn => btn.addEventListener('click', () => {
        const b = state.batches.find(row => row.id === btn.getAttribute('data-svc-batch-status'));
        const to = btn.getAttribute('data-svc-to');
        const date = to === 'Submitted' ? (window.prompt(t('submittedDate'), new Date().toISOString().slice(0, 10)) || '') : '';
        if (to === 'Submitted' && !date) return;
        if (b) transition({ kind: 'batch', id: b.id }, b.version, to, '', to === 'Submitted' ? date : undefined);
      }));
      container.querySelectorAll('[data-svc-batch-add]').forEach(btn => btn.addEventListener('click', () => {
        const b = state.batches.find(row => row.id === btn.getAttribute('data-svc-batch-add'));
        const appId = btn.getAttribute('data-svc-app');
        if (!b) return;
        const ids = (b.applicationIds || []).slice();
        if (!ids.includes(appId)) ids.push(appId);
        saveBatch({ id: b.id, version: b.version, year: b.year, title: b.title, applicationIds: ids, remarks: b.remarks || '', checks: b.checks || {} });
      }));
      container.querySelectorAll('[data-svc-batch-remove]').forEach(btn => btn.addEventListener('click', () => {
        const b = state.batches.find(row => row.id === btn.getAttribute('data-svc-batch-remove'));
        const appId = btn.getAttribute('data-svc-app');
        if (!b) return;
        const ids = (b.applicationIds || []).filter(id => id !== appId);
        saveBatch({ id: b.id, version: b.version, year: b.year, title: b.title, applicationIds: ids, remarks: b.remarks || '', checks: b.checks || {} });
      }));
      container.querySelectorAll('[data-svc-save-checks]').forEach(btn => btn.addEventListener('click', () => {
        const b = state.batches.find(row => row.id === btn.getAttribute('data-svc-save-checks'));
        if (!b) return;
        const checks = {};
        container.querySelectorAll('[data-svc-check]').forEach(sel => {
          checks[sel.getAttribute('data-svc-check')] = String(sel.value || '');
        });
        saveBatch({ id: b.id, version: b.version, year: b.year, title: b.title, applicationIds: b.applicationIds || [], remarks: b.remarks || '', checks: checks });
      }));
      container.querySelectorAll('[data-svc-batch-pdf]').forEach(btn => btn.addEventListener('click', () => {
        const b = state.batches.find(row => row.id === btn.getAttribute('data-svc-batch-pdf'));
        const kind = btn.getAttribute('data-svc-kind') || 'Stripe';
        const apps = state.applications.filter(app => (b.applicationIds || []).includes(app.id));
        if (!b) return;
        const pdf = root.KPTServicePDF;
        if (!pdf) { notice(t('pdfUnavailable'), true); return; }
        const config = { division: (root.KPT_CONFIG && root.KPT_CONFIG.organization) || '' };
        // Contract: downloadChecklist(batch, apps, kind, config) -> Promise<Uint8Array> + triggers download.
        Promise.resolve(pdf.downloadChecklist(b, apps, kind, config))
          .catch(error => notice(t('pdfFailed') + ' ' + (error && error.message ? error.message : ''), true));
      }));
      // Merged Officer-signed PDF + full ZIP package per kind.
      container.querySelectorAll('[data-svc-batch-merge]').forEach(btn => btn.addEventListener('click', () => {
        const b = state.batches.find(row => row.id === btn.getAttribute('data-svc-batch-merge'));
        const kind = btn.getAttribute('data-svc-kind') || 'Stripe';
        if (!b) return;
        const pdf = root.KPTServicePDF;
        if (!pdf || typeof pdf.mergeAndDownload !== 'function') { notice(t('pdfUnavailable'), true); return; }
        gatherSignedDocs(call, b, state.applications, kind).then(items => {
          if (!items.length) throw new Error(t('pdfNoSigned'));
          // Contract: mergeAndDownload(items, fileName) -> Promise + downloads the merged PDF.
          const mergeName = (kind === 'Stripe' ? 'Signed-Stripe-' : 'Signed-Star-') + (b.title || b.year || 'batch') + '.pdf';
          return pdf.mergeAndDownload(items, mergeName);
        }).catch(error => notice(t('pdfFailed') + ' ' + (error && error.message ? error.message : ''), true));
      }));
      container.querySelectorAll('[data-svc-batch-zip]').forEach(btn => btn.addEventListener('click', () => {
        const b = state.batches.find(row => row.id === btn.getAttribute('data-svc-batch-zip'));
        if (!b) return;
        const pdf = root.KPTServicePDF;
        if (!pdf || typeof pdf.zipFiles !== 'function') { notice(t('pdfUnavailable'), true); return; }
        const apps = state.applications.filter(app => (b.applicationIds || []).includes(app.id));
        // ZIP path must not fire extra single-file downloads — download:false.
        const zipConfig = { division: (root.KPT_CONFIG && root.KPT_CONFIG.organization) || '', download: false };
        const zipName = (b.title || 'service-batch') + '-' + (b.year || '') + '.zip';
        // Only the Stripe/Star kinds this batch actually needs.
        const needsStripe = apps.some(a => (YEAR_MAP[Number(a.confirmedYear)] || []).indexOf('Stripe') >= 0);
        const needsStar = apps.some(a => (YEAR_MAP[Number(a.confirmedYear)] || []).indexOf('Star') >= 0);
        const map = {};
        const addChecklist = (needed, kind, name) => {
          if (!needed) return Promise.resolve();
          return Promise.resolve(pdf.downloadChecklist(b, apps, kind, zipConfig))
            .then(bytes => { map[name] = toBytes(bytes); });
        };
        addChecklist(needsStripe, 'Stripe', 'SS-01_Service_Checklist.pdf')
          .then(() => addChecklist(needsStar, 'Star', 'SSTR-01_Service_Checklist.pdf'))
          .then(() => Promise.all([
            needsStripe ? gatherSignedDocs(call, b, apps, 'Stripe') : [],
            needsStar ? gatherSignedDocs(call, b, apps, 'Star') : [],
            gatherExtraAttachments(call, b, apps)
          ]))
          .then(([stripeSigned, starSigned, extras]) => {
            const merges = [];
            if (needsStripe && stripeSigned.length) merges.push(Promise.resolve(pdf.mergeDocuments(stripeSigned, 'Signed-Stripe.pdf')).then(bytes => { map['Signed-Stripe.pdf'] = toBytes(bytes); }));
            if (needsStar && starSigned.length) merges.push(Promise.resolve(pdf.mergeDocuments(starSigned, 'Signed-Star.pdf')).then(bytes => { map['Signed-Star.pdf'] = toBytes(bytes); }));
            return Promise.all(merges).then(() => extras);
          })
          .then(extras => {
            extras.forEach((file, index) => {
              map[file.filename || ('attachment-' + (index + 1))] = file.bytes;
            });
            if (!Object.keys(map).length) throw new Error(t('pdfNoSigned'));
            // Contract: zipFiles({name: bytes}) -> Uint8Array; the UI triggers the ZIP download.
            const zipBytes = pdf.zipFiles(map);
            const url = URL.createObjectURL(new Blob([toBytes(zipBytes)], { type: 'application/zip' }));
            const a = document.createElement('a');
            a.href = url; a.download = zipName;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          })
          .catch(error => notice(t('pdfFailed') + ' ' + (error && error.message ? error.message : ''), true));
      }));
      const newBatch = container.querySelector('[data-svc-new-batch]');
      if (newBatch) newBatch.addEventListener('click', () => {
        const title = window.prompt(t('batchTitlePrompt'), 'Service awards ' + new Date().getFullYear());
        if (!title) return;
        const year = Number(window.prompt(t('batchYearPrompt'), String(new Date().getFullYear())));
        if (!Number.isInteger(year)) return;
        saveBatch({ year: year, title: title, applicationIds: [], remarks: '', checks: {} });
      });
      bindLangToggles(container, render);
      // Unsaved-edit tracking: any input in the detail form marks the list dirty
      // so summary polling will not clobber it.
      const detailForm = container.querySelector('#svc-detail-form');
      if (detailForm) {
        detailForm.addEventListener('input', () => { state.dirty = true; });
        detailForm.addEventListener('change', () => { state.dirty = true; });
      }
    }

    load();
    return {
      isDirty: () => state.dirty,
      isListViewOpen: () => true,
      refreshList: () => {
        // Re-read the list without touching the open editor's values:
        // only re-render when nothing is being edited.
        if (state.dirty) return;
        load();
      },
      clearDirty: () => { state.dirty = false; }
    };
  }

  root.KPTServiceUI = {
    renderPublicForm: renderPublicForm,
    renderAdminPanel: renderAdminPanel,
    startSummaryPolling: startSummaryPolling,
    stopSummaryPolling: stopSummaryPolling,
    yearAwardText: yearAwardText,
    memberNumberFor: memberNumberFor,
    memberOptionLabel: memberOptionLabel,
    pdfKindsFor: pdfKindsFor,
    statusLabel: statusLabel,
    TRANSITIONS: TRANSITIONS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTServiceUI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
