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
      svcTitle: 'Service Awards 申请表',
      svcEyebrow: '服务奖励',
      svcIntro: '选择 Service Stripe & Star 或 Special Service Shield，再填写个人资料。秘书会对照 Efficient 年度或 Duty Record 核对，确认后才会正式提交。',
      legendDetails: '个人资料',
      hintBlock: '日后填写纸本请用正楷大写（BLOCK LETTERS）。姓名拼法请与学校记录一致。',
      fName: '姓名', fIc: '身份证号码', fGender: '性别', fRank: '军阶', fJoined: '加入日期', fPhone: '电话', fEmail: '电邮', fOccupation: '职业',
      hintGender: '例如 MALE 或 FEMALE。',
      hintPhone: '填可联系到你的号码，例如 012-345 6789。',
      hintEmail: '填写常用电邮，例如 cadet@example.com。',
      hintOccupation: '如果你是学生，填 STUDENT。',
      hintName: '填与会员记录一致的完整姓名，例如 TAN MEI LING。',
      hintIc: '填写自己的 MyKad 号码，保留开头的 0。格式示例：090101-00-0000（12 位数字，6-2-4）。',
      hintRank: '填写目前的 Rank，例如 SERGEANT。没有就留空。',
      hintJoined: '在日历选择实际加入 St. John 的日期，例如 2023 年 5 月 1 日。不知道可留空。',
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
      adminTitle: '查看 Service Awards 申请',
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
      viewCol: '查看',
      hideCol: '收起',
      allStatuses: '全部状态',
      statusFilterLabel: '状态筛选',
      tabApplications: '① 批准申请',
      tabBatches: '② 整合申请 + 提交',
      dirtyLeave: '有未保存的修改，确定放弃吗？',
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
      svcTitle: 'Service Awards application',
      svcEyebrow: 'Service award',
      svcIntro: 'Choose Service Stripe & Star or Special Service Shield, then enter your details. A Secretary will verify the Efficient years or Duty Record before anything is filed.',
      legendDetails: 'Your details',
      hintBlock: 'Use BLOCK LETTERS on paper copies. Keep the spelling you use in school records.',
      fName: 'Name', fIc: 'IC', fGender: 'Gender', fRank: 'Rank', fJoined: 'Joined', fPhone: 'Phone', fEmail: 'Email', fOccupation: 'Occupation',
      hintGender: 'For example, MALE or FEMALE.',
      hintPhone: 'Enter a number we can reach you at, e.g. 012-345 6789.',
      hintEmail: 'Enter an email you check, e.g. cadet@example.com.',
      hintOccupation: 'If you are a student, enter STUDENT.',
      hintName: 'Enter your full name as shown in your member record, e.g. TAN MEI LING.',
      hintIc: 'Enter your own MyKad number, keeping any leading zero. Format example: 090101-00-0000 (12 digits, grouped 6-2-4).',
      hintRank: 'Enter your current cadet rank, e.g. SERGEANT. Leave blank if you have no rank.',
      hintJoined: 'Select the date you joined St. John, e.g. 1 May 2023. Leave blank if unsure.',
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
      adminTitle: 'Service Awards applications',
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
      viewCol: 'View',
      hideCol: 'Hide',
      allStatuses: 'All statuses',
      statusFilterLabel: 'Status filter',
      tabApplications: '① Review applications',
      tabBatches: '② Consolidate + submit',
      dirtyLeave: 'You have unsaved changes. Discard them?',
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
      PendingSecretary: '待秘书处理', Preparing: '待定-文件缺失', AwaitingSignature: '待定-文件缺失', AwaitingOwner: '待定-文件齐全',
      Ready: '已符合资格', Submitted: '已提交', NeedsInfo: '待定-文件缺失', Approved: '已批准', Recorded: '已登记获奖'
    };
    const en = {
      PendingSecretary: 'Waiting for Secretary', Preparing: 'Pending - documents missing', AwaitingSignature: 'Pending - documents missing',
      AwaitingOwner: 'Pending - documents complete', Ready: 'Eligible', Submitted: 'Submitted',
      NeedsInfo: 'Pending - documents missing', Approved: 'Approved', Recorded: 'Award recorded'
    };
    return (lang === 'zh' ? zh : en)[status] || status;
  }
  function statusPill(status) {
    const display = ['Approved', 'Recorded'].includes(status) ? 'Submitted' : status;
    return '<span class="pill svc-status svc-status-' + escape(display) + '"' +
      (display !== status ? ' title="' + escape(statusLabel(status)) + '"' : '') + '>' + escape(statusLabel(display)) + '</span>';
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
  const formName = kind => kind === 'Star' ? 'SSTR-02' : kind === 'SSS' ? 'SSS-02' : 'SS-02';
  function attachKindOptions(targetKind, record) {
    const list = targetKind === 'batch' ? ATTACH_KINDS_BATCH : [
      ...(record.awardType === 'SpecialServiceShield' ? [['signedSSS', formName('SSS')]] : (YEAR_MAP[record.confirmedYear] || []).map(kind => ['signed' + kind, formName(kind)])),
      ['duty', 'Duty Record'],
      ['support', lang === 'zh' ? 'Supporting document（选交）' : 'Supporting document (optional)'],
      ...(record.status === 'NeedsInfo' && record.submittedAt ? [['reply', 'Reply']] : [])
    ];
    const placeholder = targetKind === 'application' ? '<option value="">' + escape(lang === 'zh' ? '选择要上传的文件类型' : 'Choose a file type') + '</option>' : '';
    return placeholder + list.map(([value, label]) => '<option value="' + escape(value) + '">' + escape(label) + '</option>').join('');
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
      : '<input id="svc-' + name + '" name="' + name + '" type="' + (o.type || 'text') + '" value="' + escape(value || '') + '"' + autocomplete + required + (o.readonly ? ' readonly' : '') + ' maxlength="' + (o.maxlength || 200) + '"' + (o.inputmode ? ' inputmode="' + escape(o.inputmode) + '"' : '') + '>';
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
    if (app && app.awardType === 'SpecialServiceShield') return memberNumber && app.confirmedTier ? ['SSS'] : [];
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
  // Uint8Array -> base64 for serviceUpload payloads built in-page (Duty Record PDF).
  function bytesToBase64(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let bin = '';
    for (let i = 0; i < arr.length; i += 0x8000) bin += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  // Collect the Officer-signed PDFs for one kind. 4th-year applications
  // legitimately appear in BOTH the Stripe and the Star merge.
  // Collect the Officer-signed PDFs for one kind. Batch-level combined uploads
  // (combinedSignedStripe / combinedSignedStar) win — when present they are the
  // single merged document and per-person files are NOT appended on top.
  // A failed download is an error, never a silent skip.
  function gatherSignedDocs(call, batch, applications, kind) {
    const isSSS = kind === 'SSS';
    const wantStripe = kind === 'Stripe';
    const combinedKind = isSSS ? 'combinedSignedSSS' : wantStripe ? 'combinedSignedStripe' : 'combinedSignedStar';
    const signedKind = isSSS ? 'signedSSS' : wantStripe ? 'signedStripe' : 'signedStar';
    const wantsKind = app => {
      if (isSSS) return app.awardType === 'SpecialServiceShield' && app.confirmedTier != null;
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
    const combined = (batch.attachments || []).filter(att => att.kind === combinedKind && att.id && att.active !== false).slice(-1);
    if (combined.length) {
      return Promise.all(combined.map(att => downloadOne({ id: att.id, fileName: att.fileName })));
    }
    // 2) Otherwise gather the per-application signed forms (only the needed kind).
    const sources = [];
    applications.forEach(app => {
      if (!(batch.applicationIds || []).includes(app.id) || !wantsKind(app)) return;
      const current = (app.attachments || []).filter(att => att.kind === signedKind && att.id && att.active !== false).at(-1);
      if (!current) throw new Error((app.applicant && app.applicant.name || app.id) + ': missing signed ' + kind + ' form.');
      sources.push(current);
    });
    return Promise.all(sources.map(downloadOne));
  }
  async function checklistSigningTemplate(call, applications, kind) {
    const app = applications.find(row => kind === 'SSS' ? row.awardType === 'SpecialServiceShield' : (YEAR_MAP[row.confirmedYear] || []).includes(kind));
    if (!app) throw new Error('No Service ' + kind + ' applications in this batch.');
    const result = await call({ action: 'serviceGetTemplates', applicationId: app.id, version: app.version });
    return result && result.templates && result.templates[kind];
  }
  async function gatherDutyDocuments(call, batch, applications, kind) {
    const apps = applications.filter(app => (batch.applicationIds || []).includes(app.id)
      && (kind === 'SSS' ? app.awardType === 'SpecialServiceShield' : (YEAR_MAP[app.confirmedYear] || []).includes(kind)));
    if (!apps.length) return [];
    const perApp = apps.map(app => {
      const active = (app.attachments || []).filter(att => att.kind === 'duty' && att.id && att.active !== false);
      // Older generated Duty Records were saved via serviceUpload, so identify
      // them by the stable filename used by both generation entry points.
      const prefix = 'duty-record-' + app.year + '-';
      const generated = active.findLast(att => {
        const name = String(att.fileName || '').toLowerCase();
        return name.startsWith(prefix) && name.endsWith('.pdf');
      });
      return generated || active.at(-1);
    });
    const combined = (batch.attachments || []).findLast(att => att.kind === 'combinedDuty' && att.active !== false);
    const missing = perApp.findIndex(att => !att);
    if (missing !== -1 && !combined) {
      const app = apps[missing];
      throw new Error((app.applicant && app.applicant.name || app.id) + ': missing Duty Record.');
    }
    const sources = missing === -1 ? perApp : [combined];
    return Promise.all(sources.map(async att => {
      const file = await call({ action: 'serviceDownload', attachmentId: att.id });
      if (!file || !file.base64) throw new Error('Attachment download failed: ' + att.fileName);
      return { bytes: toBytes(file.base64), filename: file.fileName || att.fileName };
    }));
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
        + '<fieldset><legend>' + escape(lang === 'zh' ? '申请类型' : 'Application type') + '</legend><div class="field"><label for="svc-award-type">' + escape(lang === 'zh' ? '选择奖励' : 'Choose award') + '</label><select id="svc-award-type" name="awardType"><option value="ServiceStripeStar">Service Stripe & Star</option><option value="SpecialServiceShield">Special Service Shield (SSS)</option></select></div></fieldset>'
        + '<fieldset><legend>' + escape(t('legendDetails')) + '</legend><p class="hint">' + escape(t('hintBlock')) + '</p>'
        + '<div class="form-grid">'
        + field(t('fName'), 'name', '', { required: true, autocomplete: 'name', hint: t('hintName') })
        + field(t('fIc'), 'ic', '', { required: true, autocomplete: 'off', hint: t('hintIc') })
        + field(t('fGender'), 'gender', '', { hint: t('hintGender') })
        + field(t('fRank'), 'rank', '', { hint: t('hintRank') })
        + field(t('fJoined'), 'joined', '', { type: 'date', hint: t('hintJoined') })
        + field(t('fPhone'), 'phone', '', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', hint: t('hintPhone') })
        + field(t('fEmail'), 'email', '', { type: 'email', autocomplete: 'email', hint: t('hintEmail') })
        + field(t('fOccupation'), 'occupation', '', { hint: t('hintOccupation') })
        + '</div></fieldset>'
        + '<fieldset class="svc-years" id="svc-years-fields"><legend>' + escape(t('legendYears')) + '</legend>'
        + '<p class="hint">' + escape(t('hintYears')) + '</p>'
        + '<div class="field"><label for="svc-declaredYear">' + escape(t('labelYears')) + '</label><select id="svc-declaredYear" name="declaredYear" aria-describedby="svc-year-map">' + yearChoices('') + '</select></div>'
        + '<div class="svc-year-map" id="svc-year-map" role="status" aria-live="polite"></div>'
        + '<p class="hint">' + escape(t('hintFourth')) + '</p>'
        + '</fieldset>'
        + '<fieldset id="svc-sss-fields" hidden><legend>Special Service Shield</legend><p class="hint">' + escape(lang === 'zh' ? '选择你预计申请的等级。秘书会按系统 Duty Record 的累计小时重新核对，并采用最高符合等级。' : 'Choose the tier you expect to apply for. The Secretary will verify the accumulated hours in the Duty Record and use the highest eligible tier.') + '</p><div class="field"><label for="svc-declared-tier">' + escape(lang === 'zh' ? '预计等级' : 'Expected tier') + '</label><select id="svc-declared-tier" name="declaredTier"><option value="100">100 Hours - Green</option><option value="200">200 Hours - Blue</option><option value="500">500 Hours - Purple</option><option value="750">750 Hours - Silver</option><option value="1000">1000 Hours - Emas</option></select></div></fieldset>'
        + '<div class="svc-actions">'
        + '<button class="button primary" type="submit" id="svc-submit">' + escape(t('submit')) + '</button>'
        + '<button class="button" type="reset" id="svc-reset">' + escape(t('clear')) + '</button>'
        + '</div></form>'
        + '<div id="svc-result" class="message" role="status" aria-live="polite" hidden></div>'
        + '</section>';
      const form = container.querySelector('#service-form');
      const select = container.querySelector('#svc-declaredYear');
      const awardType = container.querySelector('#svc-award-type');
      const yearFields = container.querySelector('#svc-years-fields');
      const sssFields = container.querySelector('#svc-sss-fields');
      const mapBox = container.querySelector('#svc-year-map');
      const refreshMap = () => {
        const value = select.value === '' ? null : Number(select.value);
        mapBox.innerHTML = '<p class="svc-year-map-lead">' + escape(t('yearMapLead')) + '</p>'
          + '<p class="svc-year-map-award"><span class="svc-year-map-name">' + escape(yearAwardText(value)) + '</span></p>';
      };
      select.addEventListener('change', refreshMap);
      const refreshAwardType = () => {
        const isSSS = awardType.value === 'SpecialServiceShield';
        yearFields.hidden = isSSS;
        sssFields.hidden = !isSSS;
      };
      awardType.addEventListener('change', refreshAwardType);
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
        const awardTypeValue = String(data.get('awardType') || 'ServiceStripeStar');
        const declaredTier = awardTypeValue === 'SpecialServiceShield' ? Number(data.get('declaredTier')) : null;
        if (!applicant.name || !applicant.ic) {
          result.hidden = false;
          result.className = 'message error';
          result.textContent = t('needNameIc');
          return;
        }
        const payload = { action: 'submitServiceApplication', applicant, awardType: awardTypeValue, declaredYear, declaredTier, clientRequestId: clientRequestId, website: '' };
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
      refreshAwardType();
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
    const awardType = options && options.awardType === 'SpecialServiceShield' ? 'SpecialServiceShield' : 'ServiceStripeStar';
    const isSSS = awardType === 'SpecialServiceShield';
    const awardLabel = isSSS ? 'Special Service Shield' : 'Service Stripe & Star';
    const matchesAward = row => (row.awardType || 'ServiceStripeStar') === awardType;
    if (!container || typeof call !== 'function') return null;
    const state = { applications: [], batches: [], unreadCount: 0, selectedId: null, filter: '', statusFilter: '', tab: 'applications', dirty: false };

    const cachedTemplates = {};
    let busy = false;
    let toastTimer;
    const tr = (zh, en) => lang === 'zh' ? zh : en;
    const todayMY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    function applyResponse(data) {
      state.applications = (data && data.applications) || state.applications;
      state.batches = (data && data.batches) || state.batches;
      state.unreadCount = state.applications.filter(app => matchesAward(app) && ['PendingSecretary', 'NeedsInfo'].includes(app.status)).length;
    }
    async function timed(label, work) {
      const start = performance.now();
      try { return await work(); }
      finally { console.info('[Service awards] ' + label + ': ' + Math.round(performance.now() - start) + 'ms'); }
    }
    async function operate(section, message, work) {
      if (busy) return;
      busy = true;
      const panel = container.querySelector('#svc-admin');
      if (panel) panel.inert = true;
      const progress = text => notice(text, false, section);
      progress(message);
      try {
        await work(progress);
      } catch (error) {
        notice(error && error.message ? error.message : tr('操作失败。', 'Action failed.'), true, section);
      } finally {
        if (panel) panel.inert = false;
        busy = false;
      }
    }
    function notice(message, isError, section) {
      const el = container.querySelector('#svc-admin-notice');
      if (el) { el.className = 'message' + (isError ? ' error' : ''); el.textContent = message || ''; }
      const local = section && container.querySelector('[data-svc-feedback="' + section + '"]');
      if (local) { local.textContent = message || ''; local.classList.toggle('error', !!isError); }
      const toast = container.querySelector('#svc-toast');
      if (toast && message) {
        clearTimeout(toastTimer);
        toast.textContent = message;
        toast.classList.toggle('error', !!isError);
        toast.hidden = false;
        toastTimer = setTimeout(() => { toast.hidden = true; }, 5500);
      }
    }
    function load() {
      return Promise.resolve(call({ action: 'serviceList' })).then(data => {
        applyResponse(data);
        render();
      }).catch(error => notice(error && error.message ? error.message : '加载失败。', true));
    }
    function saveApplication(app) {
      return operate('4', tr('保存中…', 'Saving…'), async () => {
        applyResponse(await timed('save', () => call({ action: 'serviceSave', application: app })));
        state.dirty = false;
        render();
        notice(t('saved'), false, '4');
      });
    }
    async function generateApplication(app, payload, signingDate, downloadKind) {
      return operate('2.1', tr('保存中…', 'Saving…'), async progress => {
        const selectedMember = memberById(members, payload.memberId);
        const memberNumber = selectedMember && String(selectedMember.sjamId || '').trim();
        const kinds = (payload.awardType === 'SpecialServiceShield' ? ['SSS'] : (YEAR_MAP[payload.confirmedYear] || [])).filter(kind => !downloadKind || kind === downloadKind);
        if (!memberNumber) throw new Error(t('pdfNeedMember'));
        if (!kinds.length) throw new Error(t('pdfNeedYear'));
        if (!signingDate) throw new Error(tr('请选择实际签署日期。', 'Select the signing date.'));
        if (!root.KPTServicePDF || typeof root.KPTServicePDF.generateSigned !== 'function') throw new Error(t('pdfUnavailable'));
        let current = app;
        const needsSave = state.dirty || !app.reference;
        if (needsSave) {
          applyResponse(await timed('save', () => call({ action: 'serviceSave', application: payload })));
          current = state.applications.find(row => row.id === app.id);
          state.dirty = false;
          const ref = container.querySelector('#svc-reference');
          const year = container.querySelector('#svc-year');
          const selection = container.querySelector('#svc-member-selection');
          if (ref) ref.value = current.reference || '';
          if (year && current.reference) year.readOnly = true;
          if (selection) selection.textContent = tr('已绑定：', 'Linked: ') + selectedMember.name + ' · ' + memberNumber;
        }
        if (!current || !current.reference) throw new Error(t('refMissing'));
        progress(tr('读取私人模板…', 'Loading private templates…'));
        if (kinds.some(kind => !cachedTemplates[kind])) {
          const result = await timed('template read', () => call({ action: 'serviceGetTemplates', applicationId: current.id, version: current.version }));
          Object.assign(cachedTemplates, (result && result.templates) || {});
        }
        progress(tr('生成 PDF…', 'Generating PDFs…'));
        const files = await timed('PDF generation', () => Promise.all(kinds.map(async kind => {
          if (!cachedTemplates[kind]) throw new Error(tr('无法读取私人签名模板，请让 Owner 检查 TCCD Admin 的模板设置和 Drive 权限：', 'Private signed template unavailable. Ask the Owner to check TCCD Admin template settings and Drive access: ') + kind);
          const bytes = await root.KPTServicePDF.generateSigned(current, kind, {
            division: (root.KPT_CONFIG && root.KPT_CONFIG.organization) || '',
            memberNumber, reference: current.reference, templateBase64: cachedTemplates[kind] || cachedTemplates.Stripe, signingDate
          });
          return { kind: 'signed' + kind, fileName: formName(kind) + '_' + current.reference.replace(/[^A-Za-z0-9_-]/g, '_') + '.pdf', bytes };
        })));
        if (downloadKind) {
          if (needsSave) {
            render();
            const signingDateInput = container.querySelector('#svc-signing-date');
            if (signingDateInput) signingDateInput.value = signingDate;
          }
          downloadFile(files[0].bytes, files[0].fileName, 'application/pdf');
          notice(tr('PDF 已开始下载。', 'PDF download started.'), false, '2.1');
          return;
        }
        progress(tr('上传申请表…', 'Uploading application forms…'));
        applyResponse(await timed('upload', () => call({ action: 'serviceAttachGenerated', applicationId: current.id, version: current.version, files: files.map(({ kind, fileName, bytes }) => ({ kind, fileName, mime: 'application/pdf', base64: bytesToBase64(bytes) })), signingDate })));
        render();
        notice(tr('已生成并附上 ', 'Generated and attached ') + files.length + tr(' 份申请表。', ' application form(s).'), false, '2.1');
      });
    }
    function transition(target, version, status, remarks, submittedAt) {
      const body = { version: version, status: status, remarks: remarks || '' };
      if (target.kind === 'application') body.applicationId = target.id;
      else body.batchId = target.id;
      if (submittedAt) body.submittedAt = submittedAt;
      const section = target.kind === 'batch' ? '5' : '4';
      return operate(section, tr('更新状态中…', 'Updating status…'), async () => {
        applyResponse(await call(Object.assign({ action: 'serviceTransition' }, body)));
        state.dirty = false;
        render();
        notice(tr('状态已更新。', 'Status updated.'), false, section);
      });
    }
    function upload(target, kind, file, draft) {
      const section = target.kind === 'batch' ? '4' : '3';
      return operate(section, tr('上传中…', 'Uploading…'), async () => {
        if (draft) {
          applyResponse(await call({ action: 'serviceSave', application: draft }));
          state.dirty = false;
          const current = state.applications.find(row => row.id === draft.id);
          const ref = container.querySelector('#svc-reference');
          const year = container.querySelector('#svc-year');
          if (ref) ref.value = current.reference || '';
          if (year && current.reference) year.readOnly = true;
        } else if (state.dirty) throw new Error(tr('请先保存资料，再上传附件。', 'Save your edits before uploading an attachment.'));
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
          reader.onerror = () => reject(new Error('Could not read the file.'));
          reader.readAsDataURL(file);
        });
        const body = { action: 'serviceUpload', kind, fileName: file.name, mime: file.type || 'application/octet-stream', base64 };
        if (target.kind === 'application') body.applicationId = target.id;
        else body.batchId = target.id;
        applyResponse(await timed('attachment upload', () => call(body)));
        render();
        notice(tr('附件已上传。', 'Attachment uploaded.'), false, section);
      });
    }
    function downloadFile(bytes, fileName, mime) {
      const url = URL.createObjectURL(new Blob([toBytes(bytes)], { type: mime || 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'attachment';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    async function downloadAttachment(attachmentId) {
      const file = await call({ action: 'serviceDownload', attachmentId });
      if (!file || !file.base64) throw new Error(tr('文件无法读取。', 'File unavailable.'));
      downloadFile(file.base64, file.fileName, file.mime);
    }
    function download(attachmentId, section) {
      return operate(section, tr('下载中…', 'Downloading…'), async () => {
        await downloadAttachment(attachmentId);
        notice(tr('文件已开始下载。', 'Download started.'), false, section);
      });
    }
    const latestAttachment = (app, kind) => (app.attachments || []).findLast(att => att.kind === kind && att.active !== false);
    const lockedApplication = app => ['Submitted', 'Approved', 'Recorded'].includes(app.status);
    function award(app, date, certificate) {
      return Promise.resolve(call({ action: 'serviceAward', applicationId: app.id, version: app.version, date: date, certificate: certificate })).then(data => {
        state.applications = (data && data.applications) || state.applications;
        state.batches = (data && data.batches) || state.batches;
        render();
      }).catch(error => notice(error && error.message ? error.message : '登记获奖失败。', true));
    }
    function saveBatch(batch) {
      return operate('2', tr('保存中…', 'Saving…'), async () => {
        applyResponse(await timed('batch save', () => call({ action: 'serviceSaveBatch', batch })));
        state.dirty = false;
        render();
        notice(t('saved'), false, '2');
      });
    }

    function appRow(app) {
      const label = app.applicant && app.applicant.name ? app.applicant.name : (lang === 'zh' ? '(没有姓名)' : '(no name)');
      const expanded = state.selectedId === app.id;
      return '<tr class="svc-row' + (expanded ? ' svc-row-selected' : '') + '">'
        + '<td data-label="' + escape(t('thApplicant')) + '">' + escape(label) + '</td>'
        + '<td data-label="' + escape(t('thYear')) + '" class="svc-num">' + escape(String(app.year || '—')) + '</td>'
        + '<td data-label="' + escape(t('thStatus')) + '">' + statusPill(app.status) + '</td>'
        + '<td data-label="' + escape(t('thFiles')) + '" class="svc-num">' + escape(String((app.attachments || []).length)) + '</td>'
        + '<td data-label="' + escape(t('viewCol')) + '"><button type="button" class="button small" data-svc-open="' + escape(app.id) + '" aria-expanded="' + (expanded ? 'true' : 'false') + '">' + escape(expanded ? t('hideCol') : t('viewCol')) + '</button></td>'
        + '</tr>';
    }
    function batchRow(b) {
      const expanded = selectedBatchId === b.id;
      return '<tr class="svc-row' + (expanded ? ' svc-row-selected' : '') + '">'
        + '<td data-label="' + escape(t('batchTitle')) + '">' + escape(b.title || '') + '</td>'
        + '<td data-label="' + escape(t('batchYear')) + '" class="svc-num">' + escape(String(b.year || '—')) + '</td>'
        + '<td data-label="' + escape(t('batchApps')) + '" class="svc-num">' + escape(String((b.applicationIds || []).length)) + '</td>'
        + '<td data-label="' + escape(t('thStatus')) + '">' + statusPill(b.status) + '</td>'
        + '<td data-label="' + escape(t('viewCol')) + '"><button type="button" class="button small" data-svc-batch-open="' + escape(b.id) + '" aria-expanded="' + (expanded ? 'true' : 'false') + '">' + escape(expanded ? t('hideCol') : t('viewCol')) + '</button></td>'
        + '</tr>';
    }
    function stepHeading(number, label, tag = 'h3') {
      return '<' + tag + ' class="svc-step-heading"><span class="svc-step-number">' + number + '.</span> ' + escape(label) + '</' + tag + '>';
    }
    function stepBlock(number, label, body) {
      return '<section class="svc-step">' + stepHeading(number, label) + body + '<p class="svc-feedback" data-svc-feedback="' + number + '" role="status"></p></section>';
    }
    function attachmentsBlock(target, app) {
      const list = (app && app.attachments) || [];
      const locked = ['Submitted', 'Approved', 'Recorded'];
      const removable = target.kind === 'application' && !locked.includes(app.status)
        && !state.batches.some(batch => (batch.applicationIds || []).includes(app.id) && locked.includes(batch.status));
      const rows = list.map(att => '<li><strong>' + escape(attachKindLabel(att.kind)) + '</strong> · ' + escape(att.fileName || '') + (att.active === false ? ' · ' + escape(tr('已过期', 'Superseded')) : '')
        + ' <button type="button" class="button small" data-svc-dl="' + escape(att.id) + '">' + escape(t('download')) + '</button>'
        + (removable ? ' <button type="button" class="button small danger" data-svc-remove-file="' + escape(att.id) + '">' + escape(tr('删除', 'Remove')) + '</button>' : '') + '</li>').join('');
      // Each target gets its own kind select + upload input; no shared first-match lookup.
      return '<ul class="svc-files">' + (rows || '<li class="muted">' + escape(target.kind === 'batch' ? tr('这批还没有手动上传的文件。', 'No files manually uploaded for this batch.') : t('noFiles')) + '</li>') + '</ul>'
        + (target.kind === 'application' && lockedApplication(app)
          ? ((app.status === 'Submitted') ? uploadFields(target, '<option value="reply">Reply</option>') : '')
          : uploadFields(target, attachKindOptions(target.kind, app)));
    }
    function uploadFields(target, options) {
      const token = escape(target.kind) + ':' + escape(target.id);
      const placeholder = target.kind === 'batch' ? '<option value="">' + escape(tr('选择文件类型', 'Choose a file type')) + '</option>' : '';
      return '<div class="toolbar"><label class="field"><span>' + escape(t('kindLabel')) + '</span>'
        + '<select data-svc-kind-for="' + token + '">' + placeholder + options + '</select></label>'
        + '<label class="field"><span>' + escape(tr('选择要上传的文件', 'Choose a file to upload')) + '</span><input type="file" class="svc-file-picker" data-svc-pick-file="' + token + '"></label>'
        + '<button type="button" class="button primary" data-svc-upload-picked="' + token + '">' + escape(t('upload')) + '</button></div>';
    }
    function requiredFiles(app, year) {
      const kinds = app.awardType === 'SpecialServiceShield' ? (app.confirmedTier ? ['SSS'] : []) : (YEAR_MAP[year] || []);
      return '<p class="hint">' + escape(tr('必交文件', 'Required files')) + '</p><ul class="svc-files">'
        + [...kinds.map(kind => ['signed' + kind, formName(kind)]), ['duty', 'Duty Record']].map(([kind, label]) =>
          '<li>' + escape(label) + ' · <strong>' + escape(latestAttachment(app, kind) ? tr('已附上', 'Attached') : tr('缺少', 'Missing')) + '</strong></li>').join('')
        + '</ul>' + (!kinds.length ? '<p class="hint">' + escape(app.awardType === 'SpecialServiceShield' ? tr('先绑定会员并确认 Previous，系统才会按累计 Duty Hours 确认等级。', 'Bind the member and confirm Previous so the system can determine the tier.') : tr('先确认 Efficient year，系统才会列出要交的申请表。', 'Confirm the Efficient year to see which application forms are required.')) + '</p>' : '')
        + '<p class="hint">Supporting document · ' + escape(tr('选交', 'Optional')) + '</p>';
    }
    function generationBlock(app) {
      const id = escape(app.id);
      const locked = lockedApplication(app);
      const feedback = key => '<p class="svc-feedback" data-svc-feedback="' + key + '" role="status"></p>';
      const button = (label, attrs, primary = false) => '<button type="button" class="button small' + (primary ? ' primary' : '') + '" ' + attrs + '>' + escape(label) + '</button>';
      const formKinds = app.awardType === 'SpecialServiceShield' ? ['SSS'] : ['Stripe', 'Star'];
      return '<h4>2.1 ' + escape(app.awardType === 'SpecialServiceShield' ? 'SSS-02' : 'SS-02／SSTR-02') + '</h4><div class="toolbar">'
        + (!locked ? '<label class="field"><span>' + escape(tr('实际签署日期', 'Signing date')) + '</span><input id="svc-signing-date" type="date" value="' + escape(todayMY()) + '"></label>' : '')
        + formKinds.map(kind => button(tr('下载 ', 'Download ') + formName(kind), 'data-svc-form-download="' + id + '" data-svc-form-kind="' + kind + '" hidden')).join('')
        + (!locked ? button(tr('生成并上传', 'Generate and upload'), 'data-svc-generate="' + id + '"', true) : '')
        + '</div><p class="hint" data-svc-year-help></p>' + feedback('2.1')
        + '<h4>2.2 Duty Record</h4><div class="toolbar">'
        + (!locked || latestAttachment(app, 'duty') ? button(tr('下载 PDF', 'Download PDF'), 'data-svc-duty-download="' + id + '"') : '')
        + (!locked ? button(tr('生成并上传', 'Generate and upload'), 'data-svc-duty-attach="' + id + '"', true) : '')
        + '</div><p class="hint">' + escape(tr('生成前先在 Duty Record 确认 Previous。没有结转时数就填 0。', 'Before generating, confirm Previous in Duty Record. Enter 0 if there are no carried-over hours.')) + '</p>' + feedback('2.2');
    }
    function memberPicker(app) {
      // Searchable select. Value is the internal id; label shows name, and
      // duplicates carry the actual member number.
      const current = memberById(members, app.memberId);
      const currentLabel = current ? tr('已绑定：', 'Linked: ') + current.name + (current.sjamId ? ' · ' + current.sjamId : '') : (app.memberId ? t('memberUnresolved') : '');
      const options = ['<option value="">' + escape(t('memberNone')) + '</option>']
        .concat(members.map(m => '<option value="' + escape(m.id) + '"' + (String(m.id) === String(app.memberId) ? ' selected' : '') + '>'
          + escape(memberOptionLabel(m, members)) + '</option>'));
      return '<div class="field svc-member-field"><label for="svc-member-pick">' + escape(t('memberLabel')) + '</label>'
        + '<input id="svc-member-search" type="search" placeholder="' + escape(t('memberSearch')) + '" autocomplete="off" aria-controls="svc-member-pick">'
        + '<select id="svc-member-pick" name="memberId" size="6">' + options.join('') + '</select>'
        + '<p class="hint">' + escape(t('memberHint')) + '</p>'
        + '<p id="svc-member-selection" class="hint" aria-live="polite">' + escape(currentLabel) + '</p>'
        + '</div>';
    }
    function statusButtons(app) {
      const flow = TRANSITIONS[app.status] || { next: [], back: [] };
      const canSave = ['PendingSecretary', 'Preparing', 'AwaitingSignature', 'AwaitingOwner', 'NeedsInfo'].includes(app.status);
      const next = canSave ? flow.next.filter(status => status === 'Ready' && app.status === 'AwaitingOwner') : flow.next;
      const back = canSave ? [] : flow.back;
      if (!canSave && !next.length && !back.length && app.status !== 'Approved') return '';
      let html = '<div class="toolbar">';
      if (canSave) {
        html += '<button type="button" class="button btn-return" data-svc-save="' + escape(app.id) + '" data-svc-document-status="Preparing">' + escape(lang === 'zh' ? '保存-待定（文件缺失）' : 'Save - documents missing') + '</button>'
          + '<button type="button" class="button primary" data-svc-save="' + escape(app.id) + '" data-svc-document-status="AwaitingOwner">' + escape(lang === 'zh' ? '保存-已完成' : 'Save - documents complete') + '</button>';
      }
      html += next.map(s => {
        if (s === 'Ready') return '<button type="button" class="button btn-check" data-svc-status="' + escape(app.id) + '" data-svc-to="Ready">' + escape(statusLabel('Ready')) + '</button>';
        return '<button type="button" class="button btn-submit" data-svc-status="' + escape(app.id) + '" data-svc-to="' + escape(s) + '">' + escape(statusLabel(s)) + '</button>';
      }).join('');
      html += back.map(s => '<button type="button" class="button btn-return" data-svc-status="' + escape(app.id) + '" data-svc-to="' + escape(s) + '">' + escape(t('backLabel')) + ' · ' + escape(s === 'NeedsInfo' ? (lang === 'zh' ? '需要补资料' : 'Needs more information') : statusLabel(s)) + '</button>').join('');
      html += '</div>';
      return html;
    }
    function detailBlock(app) {
      if (!app) return '<p class="muted">' + escape(t('pickDetail')) + '</p>';
      const a = app.applicant || {};
      const actions = statusButtons(app);
      return '<div class="svc-detail">'
        + '<h2>' + escape(a.name || (lang === 'zh' ? '(没有姓名)' : '(no name)')) + ' ' + statusPill(app.status) + '</h2>'
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
        + field(t('refLabel'), 'reference', app.reference != null ? app.reference : '', { readonly: true, hint: tr('首次保存时按申请年度自动分配。', 'Assigned from the application year on first save.') })
        + '<div class="field"><label for="svc-year">' + escape(t('yearLabel')) + '</label><input id="svc-year" name="year" type="number" min="2000" max="2100"' + (app.reference ? ' readonly' : '') + ' value="' + escape(app.year != null && app.year !== '' ? String(app.year) : '') + '"><p class="hint">' + escape(t('yearHint')) + '</p></div>'
        + (app.awardType === 'SpecialServiceShield'
          ? '<div class="field"><label>' + escape(tr('预计／确认 SSS 等级', 'Expected / confirmed SSS tier')) + '</label><input value="' + escape(String(app.declaredTier || '')) + ' / ' + escape(String(app.confirmedTier || 'Pending')) + '" readonly><p class="hint">' + escape(tr('累计 Duty Hours：', 'Accumulated Duty Hours: ')) + escape(String(app.confirmedDutyHours == null ? 'Pending' : app.confirmedDutyHours)) + '</p></div>'
          : '<div class="field"><label for="svc-confYear">' + escape(t('confYear')) + '</label><select id="svc-confYear">' + yearChoices(app.confirmedYear) + '</select></div>')
        + memberPicker(app)
        + field(t('remarks'), 'remarks', app.remarks, { type: 'textarea' })
        + '</form>'
        + '</section>'
        + stepBlock(2, tr('生成所需文件', 'Generate required files'), generationBlock(app))
        + stepBlock(3, tr('提交文件', 'Attach files'), '<div data-svc-required>' + requiredFiles(app, app.confirmedYear) + '</div>' + attachmentsBlock({ kind: 'application', id: app.id }, app))
        + (actions ? stepBlock(4, t('statusTitle'), actions) : '')
        + (canRecordAward && app.status === 'Approved' ? '<section class="svc-step">' + stepHeading(5, t('awardBtn')) + '<p class="hint">' + escape(t('awardHint')) + '</p>'
          + '<div class="toolbar"><label class="field"><span>' + escape(t('awardDate')) + '</span><input type="date" id="svc-award-date"></label><label class="field"><span>' + escape(t('awardCert')) + '</span><input type="text" id="svc-award-cert"></label>'
          + '<button type="button" class="button primary" data-svc-award="' + escape(app.id) + '">' + escape(t('awardBtn')) + '</button></div></section>' : '')
        + '</div>';
    }
    function batchActions(batch) {
      const id = escape(batch.id);
      const status = batch.status;
      const action = (next, label) => '<button type="button" class="button primary" data-svc-batch-status="' + id + '" data-svc-to="' + next + '">' + escape(label) + '</button>';
      if (['Preparing', 'AwaitingSignature', 'AwaitingOwner'].includes(status) || (status === 'Ready' && !batch.ownerApproved)) return action('Ready', t('ownerOk'));
      if (status === 'Ready') return action('Submitted', t('markSubmitted'));
      if (status === 'Submitted') return action('Approved', statusLabel('Approved'));
      return statusPill(status);
    }
    function batchDownloads(batch) {
      const id = escape(batch.id);
      const pdf = root.KPTServicePDF;
      const kinds = batch.awardType === 'SpecialServiceShield' ? ['SSS'] : ['Stripe', 'Star'].filter(kind => state.applications.some(app =>
        (batch.applicationIds || []).includes(app.id) && (YEAR_MAP[app.confirmedYear] || []).includes(kind)));
      const groups = pdf ? kinds.map(kind => '<section><h4>Service ' + kind + '</h4><div class="toolbar">' + [['pdf', 'checklist'], ['merge', 'application'], ['duty', 'duty']].map(([action, type]) => {
        const file = pdf.batchFileName(type, kind, batch.year).replace(/\.pdf$/, '');
        const formCode = (kind === 'SSS' ? 'SSS-' : kind === 'Star' ? 'SSTR-' : 'SS-') + (type === 'checklist' ? '01' : '02');
        const official = kind === 'Star' && type === 'checklist' ? file : 'SJAMKPT/CADET/' + formCode;
        const name = type === 'duty' ? 'Duty records of applicants (' + kind + ') (' + file + ')'
          : (type === 'checklist' ? 'Checklist' : tr('合并申请表', 'Combined application forms')) + ' (' + kind + ') - (' + official + ')';
        return '<button type="button" class="button small" data-svc-batch-' + action + '="' + id + '" data-svc-kind="' + kind + '">' + escape(name) + '</button>';
      }).join('') + '</div></section>').join('') : '';
      if (!groups) return '<p class="hint">' + escape(tr('先加入已确认 Efficient year 的申请，才能生成批次文件。', 'Add applications with a confirmed Efficient year to generate batch files.')) + '</p>';
      return '<div class="svc-downloads"><button type="button" class="button primary" data-svc-batch-zip="' + id + '">' + escape(t('zipBatch')) + '</button>'
        + '<details><summary>' + (lang === 'zh' ? '单独下载' : 'Individual downloads') + '</summary>' + groups + '</details></div>';
    }
    function batchChecksBlock(batch) {
      const checks = (batch && batch.checks) || {};
      const letter = Object.assign({ recipient: 'Mr Phang Kwok Kheun', recipientTitle: 'Area Staff Officer (Cadets)', organization: 'St. John Ambulans Malaysia', area: 'Kawasan Pahang Tengah', sender: 'JDO Wong Shan Kang', phone: '011-20836398', division: 'SMJK Triang Combined Cadet Division', subject: 'Applies Special Service Shield', intro: 'With the above Subject Matters, I would like to apply Special Service Shield for cadets who fulfill the requirements.', closing: 'Looking forward to hearing from you soon.' }, batch.coverLetter || {});
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
        + (batch.awardType === 'SpecialServiceShield' ? '<div class="form-grid"><label class="field"><span>Covering letter</span><select data-svc-cover-letter><option value="yes"' + (batch.includeCoverLetter !== false ? ' selected' : '') + '>' + escape(tr('默认包含', 'Include')) + '</option><option value="no"' + (batch.includeCoverLetter === false ? ' selected' : '') + '>' + escape(tr('不放入 ZIP（不影响提交）', 'Exclude from ZIP (does not block submission)')) + '</option></select></label>'
          + Object.entries(letter).map(([key, value]) => '<label class="field"><span>' + escape(key) + '</span>' + ((key === 'intro' || key === 'closing') ? '<textarea data-svc-cover-field="' + escape(key) + '" rows="2">' + escape(value) + '</textarea>' : '<input data-svc-cover-field="' + escape(key) + '" value="' + escape(value) + '">') + '</label>').join('') + '</div>' : '')
        + '<div class="form-grid svc-checks">' + rows + '</div>'
        + '<div class="toolbar"><button type="button" class="button primary" data-svc-save-checks="' + escape(batch.id) + '">' + escape(t('saveChecks')) + '</button></div>';
    }
    function batchDetailBlock(batch) {
      if (!batch) return '';
      const inIds = new Set(batch.applicationIds || []);
      const inBatch = state.applications.filter(app => inIds.has(app.id));
      const outBatch = state.applications.filter(app => !inIds.has(app.id) && (app.awardType || 'ServiceStripeStar') === (batch.awardType || 'ServiceStripeStar'));
      return '<section class="card svc-batch-detail"><h2>' + escape(batch.title || '') + ' · ' + escape(String(batch.year || '')) + '</h2>'
        + '<p>' + statusPill(batch.status) + '</p>'
        + '<section class="svc-step">' + stepHeading(1, lang === 'zh' ? '核对申请者' : 'Review applicants')
        + '<div class="svc-substep"><h4>① ' + escape(t('batchAppsTitle')) + '</h4>'
        + '<ul class="svc-files">' + (inBatch.map(app => '<li>' + escape(app.applicant && app.applicant.name || app.id)
          + ' <button type="button" class="button small btn-return" data-svc-batch-remove="' + escape(batch.id) + '" data-svc-app="' + escape(app.id) + '">' + escape(t('removeFromBatch')) + '</button></li>').join('') || '<li class="muted">—</li>') + '</ul>'
        + '</div><div class="svc-substep"><h4>② ' + escape(t('applicantsTitle')) + '</h4>'
        + '<ul class="svc-files">' + (outBatch.map(app => '<li>' + escape(app.applicant && app.applicant.name || app.id)
          + ' <button type="button" class="button small" data-svc-batch-add="' + escape(batch.id) + '" data-svc-app="' + escape(app.id) + '">' + escape(t('addToBatch')) + '</button></li>').join('') || '<li class="muted">—</li>') + '</ul>'
        + '</div></section>'
        + stepBlock(2, t('checksTitle'), batchChecksBlock(batch))
        + stepBlock(3, tr('下载批次文件', 'Download batch files'), '<p class="hint">'
          + escape(tr('系统会从这批申请生成 Checklist、合并申请表和 Duty Record。', 'The system prepares the checklist, combined application forms and Duty Record from this batch.')) + '</p>' + batchDownloads(batch))
        + stepBlock(4, tr('手动上传文件（如有）', 'Upload files manually (if needed)'), '<p class="hint">'
          + escape(tr('如果每位学员的申请已附齐文件，这里可以跳过。其他手动附件可在下方单独下载。', 'Skip this if each applicant already has the required files. Other manual attachments can be downloaded below.')) + '</p>' + attachmentsBlock({ kind: 'batch', id: batch.id }, batch))
        + stepBlock(5, t('statusTitle'), batchActions(batch))
        + '</section>';
    }

    let selectedBatchId = null;
    // Canonical status filter values (matches the five-colour legend).
    const STATUS_FILTERS = ['PendingSecretary', 'Preparing', 'AwaitingOwner', 'Ready', 'Submitted'];
    function filterMatchesStatus(app) {
      const f = state.statusFilter;
      if (!f) return true;
      // Submitted is the umbrella for Submitted / Approved / Recorded (same colour).
      if (f === 'Submitted') return ['Submitted', 'Approved', 'Recorded'].includes(app.status);
      if (f === 'Preparing') return ['Preparing', 'AwaitingSignature', 'NeedsInfo'].includes(app.status);
      return app.status === f;
    }
    function documentGuide() {
      const yearGroups = [[1, 2], [3, 5], [4]];
      return '<section class="svc-step svc-document-guide" aria-labelledby="svc-document-guide-title">'
        + '<h2 id="svc-document-guide-title" class="svc-step-heading">' + escape(tr('申请需要哪些文件？', 'What documents do I need?')) + '</h2>'
        + '<div class="svc-document-guide-grid"><div><h3>' + escape(tr('必交文件', 'Required documents')) + '</h3>'
        + (isSSS ? '<p>' + escape(tr('每批准备一份 SSS-01 Checklist；每位申请者准备一份 SSS-02 和 Duty Record。Covering letter 可选。', 'Prepare one SSS-01 checklist per batch and one SSS-02 and Duty Record per applicant. The covering letter is optional.')) + '</p>' :
          '<p>' + escape(tr('每位学员都要交 Duty Record，再按 Efficient year 准备以下申请表。', 'Every applicant needs a Duty Record and the application form(s) for their Efficient year.')) + '</p>'
        + '<dl>' + yearGroups.map(years => '<div><dt>' + years.map(year => year + (year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th')).join(' / ') + ' Efficient year</dt>'
          + '<dd>' + YEAR_MAP[years[0]].map(formName).join(' + ') + '</dd></div>').join('') + '</dl>') + '</div>'
        + '<div><h3>' + escape(tr('选交文件', 'Optional documents')) + '</h3><p><strong>Supporting document</strong></p>'
        + '<p>' + escape(tr('有额外的证明文件时才附上。', 'Attach any additional supporting documents if available.')) + '</p></div></div></section>';
    }
    function render() {
      const filter = (state.filter || '').toLowerCase();
      const list = state.applications.filter(app => {
        if (!matchesAward(app) || !filterMatchesStatus(app)) return false;
        if (!filter) return true;
        const a = app.applicant || {};
        return String(a.name || '').toLowerCase().includes(filter) || String(app.id).toLowerCase().includes(filter)
          || String(app.reference || '').toLowerCase().includes(filter) || String(app.memberId || '').toLowerCase().includes(filter);
      });
      const isApps = state.tab !== 'batches';
      const statusOpts = ['<option value="">' + escape(t('allStatuses')) + '</option>']
        .concat(STATUS_FILTERS.map(s => '<option value="' + escape(s) + '"' + (state.statusFilter === s ? ' selected' : '') + '>' + escape(statusLabel(s)) + '</option>')).join('');
      const listBlock = isApps ? (() => {
        const rows = list.map(app => appRow(app) + (state.selectedId === app.id
          ? '<tr class="svc-expand-row"><td colspan="5">' + detailBlock(app) + '</td></tr>' : '')).join('')
          || '<tr><td colspan="5" class="empty">' + escape(t('noMatch')) + '</td></tr>';
        return '<div class="table-wrap"><table class="svc-table"><thead><tr>'
          + '<th>' + escape(t('thApplicant')) + '</th><th>' + escape(t('thYear')) + '</th><th>' + escape(t('thStatus')) + '</th><th>' + escape(t('thFiles')) + '</th><th>' + escape(t('viewCol')) + '</th>'
          + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
      })() : (() => {
        const rows = state.batches.filter(matchesAward).map(batch => batchRow(batch) + (selectedBatchId === batch.id
          ? '<tr class="svc-expand-row"><td colspan="5">' + batchDetailBlock(batch) + '</td></tr>' : '')).join('')
          || '<tr><td colspan="5" class="empty">' + escape(t('noBatches')) + '</td></tr>';
        return '<div class="table-wrap"><table class="svc-table"><thead><tr>'
          + '<th>' + escape(t('batchTitle')) + '</th><th>' + escape(t('batchYear')) + '</th><th>' + escape(t('batchApps')) + '</th><th>' + escape(t('thStatus')) + '</th><th>' + escape(t('viewCol')) + '</th>'
          + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
      })();
      container.innerHTML =
        '<div class="svc-admin" id="svc-admin">'
        + documentGuide()
        + '<section class="svc-step"><div class="section-heading">' + stepHeading(1, tr('查看 ' + awardLabel + ' 申请', awardLabel + ' applications'), 'h2')
        + (state.unreadCount ? '<span class="hub-badge">' + state.unreadCount + ' ' + escape(t('newApps')) + '</span>' : '')
        + langToggleHtml() + '</div>'
        + '<div id="svc-toast" class="svc-toast" role="status" hidden></div>'
        + '<div id="svc-admin-notice" class="message" role="status" aria-live="polite"></div>'
        + '<div class="svc-tabs" role="group" aria-label="' + escape(lang === 'zh' ? '申请类型' : 'Application type') + '">'
        + '<button type="button" class="svc-tab' + (isApps ? ' svc-tab-active' : '') + '" data-svc-tab="applications" aria-pressed="' + (isApps ? 'true' : 'false') + '">' + escape(t('tabApplications')) + '</button>'
        + '<button type="button" class="svc-tab' + (!isApps ? ' svc-tab-active' : '') + '" data-svc-tab="batches" aria-pressed="' + (isApps ? 'false' : 'true') + '">' + escape(t('tabBatches')) + '</button>'
        + (!isApps ? ' <button type="button" class="button primary svc-new-batch" data-svc-new-batch="1">' + escape(t('newBatch')) + '</button>' : '')
        + '</div>'
        + '<div class="svc-toolbar-row">'
        + (isApps ? '<label class="field svc-grow"><span class="svc-sr">' + escape(t('filterLabel')) + '</span><input type="search" id="svc-filter" value="' + escape(state.filter) + '" placeholder="' + escape(t('filterHint')) + '"></label>'
        + '<label class="field"><span class="svc-sr">' + escape(t('statusFilterLabel')) + '</span><select id="svc-status-filter" aria-label="' + escape(t('statusFilterLabel')) + '">' + statusOpts + '</select></label>' : '')
        + '<button type="button" class="button" data-svc-reload="1">' + escape(t('reload')) + '</button>'
        + '</div>'
        + '<details class="svc-status-guide"><summary>' + escape(lang === 'zh' ? '查看全部状态' : 'View all statuses') + '</summary>'
        + '<ul>' + STATUS_FILTERS.map(status => '<li>' + statusPill(status) + '</li>').join('') + '</ul></details>'
        + listBlock
        + '</section>'
        + '</div>';

      container.querySelectorAll('[data-svc-open]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-svc-open');
        if (state.dirty && !window.confirm(t('dirtyLeave'))) return;
        // Only one record open at a time; clicking again collapses.
        state.selectedId = state.selectedId === id ? null : id;
        state.dirty = false;
        render();
      }));
      container.querySelectorAll('[data-svc-batch-open]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-svc-batch-open');
        if (state.dirty && !window.confirm(t('dirtyLeave'))) return;
        selectedBatchId = selectedBatchId === id ? null : id;
        state.dirty = false;
        render();
      }));
      container.querySelectorAll('[data-svc-tab]').forEach(btn => btn.addEventListener('click', () => {
        if (state.dirty && !window.confirm(t('dirtyLeave'))) return;
        state.tab = btn.getAttribute('data-svc-tab') === 'batches' ? 'batches' : 'applications';
        state.dirty = false;
        render();
      }));
      const statusFilterEl = container.querySelector('#svc-status-filter');
      if (statusFilterEl) statusFilterEl.addEventListener('change', () => {
        if (state.dirty && !window.confirm(t('dirtyLeave'))) { statusFilterEl.value = state.statusFilter; return; }
        state.statusFilter = String(statusFilterEl.value || '');
        state.dirty = false;
        render();
      });
      const filterEl = container.querySelector('#svc-filter');
      if (filterEl) filterEl.addEventListener('input', () => {
        if (state.dirty && !window.confirm(t('dirtyLeave'))) { filterEl.value = state.filter; return; }
        state.filter = filterEl.value;
        state.dirty = false;
        render();
        const f2 = container.querySelector('#svc-filter');
        if (f2) { f2.focus(); f2.setSelectionRange(f2.value.length, f2.value.length); }
      });
      const reload = container.querySelector('[data-svc-reload]');
      if (reload) reload.addEventListener('click', () => {
        if (state.dirty && !window.confirm(t('dirtyLeave'))) return;
        state.dirty = false;
        load();
      });
      // Member picker: filter the select live.
      const memberSearch = container.querySelector('#svc-member-search');
      const memberPick = container.querySelector('#svc-member-pick');
      if (memberSearch && memberPick) {
        memberPick.addEventListener('change', () => {
          const member = memberById(members, memberPick.value);
          const selection = container.querySelector('#svc-member-selection');
          selection.textContent = (member ? tr('已选：', 'Selected: ') + member.name + (member.sjamId ? ' · ' + member.sjamId : '') : t('memberNone')) + tr('（待保存）', ' (unsaved)');
        });
        memberSearch.addEventListener('input', () => {
          const q = memberSearch.value.toLowerCase();
          Array.from(memberPick.options).forEach(opt => {
            if (!opt.value) { opt.hidden = false; return; }
            opt.hidden = q ? !opt.textContent.toLowerCase().includes(q) : false;
          });
        });
      }
      function collectApplication(app, documentStatus) {
        const form = container.querySelector('#svc-detail-form');
        const get = n => { const el = form.querySelector('[name="' + n + '"]'); return el ? String(el.value || '').trim() : ''; };
        const confEl = container.querySelector('#svc-confYear');
        const memberEl = container.querySelector('#svc-member-pick');
        const payload = {
          id: app.id, version: app.version,
          documentStatus,
          applicant: { name: get('name'), ic: get('ic'), gender: get('gender'), rank: get('rank'), joined: get('joined'), phone: get('phone'), email: get('email'), occupation: get('occupation') },
          awardType: app.awardType || 'ServiceStripeStar',
          declaredTier: app.declaredTier,
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
          const alreadyVerified = app.memberId === payload.memberId && icKey(app.applicant && app.applicant.ic) === icKey(payload.applicant.ic);
          if (!alreadyVerified && !window.confirm(t('icMismatch'))) return;
          payload.confirmIcMismatch = true;
        }
        return payload;
      }
      const efficientYear = container.querySelector('#svc-confYear');
      function syncFileRequirements() {
        const app = state.applications.find(row => row.id === state.selectedId);
        if (!app || (app.awardType !== 'SpecialServiceShield' && !efficientYear)) return;
        const year = lockedApplication(app) ? app.confirmedYear : Number(efficientYear && efficientYear.value);
        const kinds = app.awardType === 'SpecialServiceShield' ? (app.confirmedTier ? ['SSS'] : []) : (YEAR_MAP[year] || []);
        container.querySelectorAll('[data-svc-form-download]').forEach(btn => {
          const kind = btn.dataset.svcFormKind;
          btn.hidden = !kinds.includes(kind) || (lockedApplication(app) && !latestAttachment(app, 'signed' + kind));
        });
        const generate = container.querySelector('[data-svc-generate]');
        if (generate) generate.disabled = !kinds.length;
        const hint = container.querySelector('[data-svc-year-help]');
        if (hint) hint.textContent = kinds.length
          ? kinds.map(formName).join(' + ')
          : tr('请先确认 Efficient year。', 'Confirm the Efficient year first.');
        const checklist = container.querySelector('[data-svc-required]');
        if (checklist) checklist.innerHTML = requiredFiles(app, year);
        const picker = container.querySelector('[data-svc-kind-for="application:' + app.id + '"]');
        if (picker && !lockedApplication(app)) {
          const selected = picker.value;
          picker.innerHTML = attachKindOptions('application', { ...app, confirmedYear: year });
          if (Array.from(picker.options).some(opt => opt.value === selected)) picker.value = selected;
        }
      }
      if (efficientYear) efficientYear.addEventListener('change', syncFileRequirements);
      syncFileRequirements();
      container.querySelectorAll('[data-svc-save], [data-svc-generate], [data-svc-form-download]').forEach(btn => btn.addEventListener('click', () => {
        if (busy) return;
        const app = state.applications.find(row => row.id === (btn.dataset.svcSave || btn.dataset.svcGenerate || btn.dataset.svcFormDownload));
        if (!app) return;
        const kind = btn.dataset.svcFormKind;
        const existing = kind && latestAttachment(app, 'signed' + kind);
        if (existing && (lockedApplication(app) || !state.dirty)) { download(existing.id, '2.1'); return; }
        if (lockedApplication(app) && kind) return;
        const payload = collectApplication(app, btn.dataset.svcDocumentStatus);
        if (!payload) return;
        if (btn.dataset.svcSave) saveApplication(payload);
        else generateApplication(app, payload, container.querySelector('#svc-signing-date').value, kind);
      }));
      container.querySelectorAll('[data-svc-upload-picked]').forEach(btn => btn.addEventListener('click', () => {
        if (busy) return;
        const token = btn.dataset.svcUploadPicked;
        const [targetKind, targetId] = token.split(':');
        const app = targetKind === 'application' ? state.applications.find(row => row.id === targetId) : null;
        const kind = container.querySelector('[data-svc-kind-for="' + token + '"]').value;
        const file = container.querySelector('[data-svc-pick-file="' + token + '"]').files[0];
        const section = targetKind === 'batch' ? '4' : '3';
        if (!kind || !file) { notice(tr('请先选择文件类型和文件。', 'Choose a file type and a file first.'), true, section); return; }
        const needsSave = app && state.dirty && !lockedApplication(app);
        const draft = needsSave ? collectApplication(app) : null;
        if (needsSave && !draft) return;
        upload({ kind: targetKind, id: targetId }, kind, file, draft);
      }));
      container.querySelectorAll('[data-svc-remove-file]').forEach(btn => btn.addEventListener('click', () => {
        const attachmentId = btn.dataset.svcRemoveFile;
        const app = state.applications.find(row => (row.attachments || []).some(att => att.id === attachmentId));
        if (!app || !root.confirm(tr('从这份申请移除该附件？', 'Remove this attachment from the application?'))) return;
        operate('3', tr('删除中…', 'Removing…'), async () => {
          if (state.dirty) throw new Error(tr('请先保存资料。', 'Save your edits first.'));
          applyResponse(await call({ action: 'serviceRemoveAttachment', applicationId: app.id, version: app.version, attachmentId }));
          render();
          notice(tr('附件已从申请移除。', 'Attachment removed from the application.'), false, '3');
        });
      }));
      container.querySelectorAll('[data-svc-dl]').forEach(btn => btn.addEventListener('click', () => download(btn.getAttribute('data-svc-dl'), btn.closest('.svc-batch-detail') ? '4' : '3')));
      container.querySelectorAll('[data-svc-duty-download], [data-svc-duty-attach]').forEach(btn => btn.addEventListener('click', () => {
        if (busy) return;
        const attach = Boolean(btn.dataset.svcDutyAttach);
        const app = state.applications.find(row => row.id === (btn.dataset.svcDutyAttach || btn.dataset.svcDutyDownload));
        if (!app) return;
        const existing = latestAttachment(app, 'duty');
        if (!attach && existing && (lockedApplication(app) || !state.dirty)) { download(existing.id, '2.2'); return; }
        if (lockedApplication(app)) return;
        const draft = state.dirty ? collectApplication(app) : null;
        if (state.dirty && !draft) return;
        const memberId = draft ? draft.memberId : app.memberId;
        const year = draft && draft.year != null ? draft.year : app.year;
        operate('2.2', tr('生成 Duty Record…', 'Building Duty Record…'), async progress => {
          if (!memberId || !year) throw new Error(tr('请先选择会员和申请年度。', 'Select a member and application year first.'));
          const bundle = await call({ action: 'dutyReportBundle', memberId, year });
          const report = bundle && bundle.report;
          if (!report) throw new Error(tr('找不到 Duty Record。', 'Duty Record not found.'));
          if (!report.confirmed) throw new Error(tr('请先确认 Previous。没有结转时数就填 0。', 'Confirm Previous first. Enter 0 if there are no carried-over hours.'));
          const bytes = await root.KPTDutyPDF.generateDutyRecord(report);
          const safe = String(report.member && report.member.name || 'member').replace(/[^A-Za-z0-9_-]/g, '_');
          const fileName = 'Duty-Record-' + report.year + '-' + safe + '.pdf';
          if (!attach) {
            downloadFile(bytes, fileName, 'application/pdf');
            notice(tr('PDF 已开始下载。', 'PDF download started.'), false, '2.2');
            return;
          }
          if (draft) {
            applyResponse(await call({ action: 'serviceSave', application: draft }));
            state.dirty = false;
            render();
          }
          progress(tr('上传 Duty Record…', 'Uploading Duty Record…'));
          applyResponse(await call({ action: 'serviceUpload', applicationId: app.id, kind: 'duty', fileName, mime: 'application/pdf', base64: bytesToBase64(bytes) }));
          render();
          notice(tr('Duty Record PDF 已附入。', 'Duty Record PDF attached.'), false, '2.2');
        });
      }));
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
        saveBatch({ id: b.id, version: b.version, year: b.year, title: b.title, awardType: b.awardType, includeCoverLetter: b.includeCoverLetter, coverLetter: b.coverLetter || {}, applicationIds: ids, remarks: b.remarks || '', checks: b.checks || {} });
      }));
      container.querySelectorAll('[data-svc-batch-remove]').forEach(btn => btn.addEventListener('click', () => {
        const b = state.batches.find(row => row.id === btn.getAttribute('data-svc-batch-remove'));
        const appId = btn.getAttribute('data-svc-app');
        if (!b) return;
        const ids = (b.applicationIds || []).filter(id => id !== appId);
        saveBatch({ id: b.id, version: b.version, year: b.year, title: b.title, awardType: b.awardType, includeCoverLetter: b.includeCoverLetter, coverLetter: b.coverLetter || {}, applicationIds: ids, remarks: b.remarks || '', checks: b.checks || {} });
      }));
      container.querySelectorAll('[data-svc-save-checks]').forEach(btn => btn.addEventListener('click', () => {
        const b = state.batches.find(row => row.id === btn.getAttribute('data-svc-save-checks'));
        if (!b) return;
        const checks = {};
        container.querySelectorAll('[data-svc-check]').forEach(sel => {
          checks[sel.getAttribute('data-svc-check')] = String(sel.value || '');
        });
        const cover = container.querySelector('[data-svc-cover-letter]');
        const coverLetter = {};
        container.querySelectorAll('[data-svc-cover-field]').forEach(input => { coverLetter[input.dataset.svcCoverField] = String(input.value || '').trim(); });
        saveBatch({ id: b.id, version: b.version, year: b.year, title: b.title, awardType: b.awardType, includeCoverLetter: cover ? cover.value !== 'no' : b.includeCoverLetter, coverLetter: Object.keys(coverLetter).length ? coverLetter : (b.coverLetter || {}), applicationIds: b.applicationIds || [], remarks: b.remarks || '', checks: checks });
      }));
      function onBatchDownload(selector, work) {
        container.querySelectorAll(selector).forEach(btn => btn.addEventListener('click', () => {
          if (busy) return;
          const label = btn.textContent;
          const loading = tr('下载中…', 'Downloading…');
          btn.textContent = loading;
          btn.disabled = true;
          operate('3', loading, async () => {
            await work(btn);
            notice(tr('文件已开始下载。', 'Download started.'), false, '3');
          }).finally(() => {
            btn.textContent = label;
            btn.disabled = false;
          });
        }));
      }
      onBatchDownload('[data-svc-batch-pdf]', async btn => {
        const b = state.batches.find(row => row.id === btn.getAttribute('data-svc-batch-pdf'));
        const kind = btn.getAttribute('data-svc-kind') || 'Stripe';
        if (!b) throw new Error(tr('找不到批次。', 'Batch not found.'));
        const apps = state.applications.filter(app => (b.applicationIds || []).includes(app.id));
        const pdf = root.KPTServicePDF;
        if (!pdf) throw new Error(t('pdfUnavailable'));
        const config = { division: (root.KPT_CONFIG && root.KPT_CONFIG.organization) || '', date: todayMY() };
        // Contract: downloadChecklist(batch, apps, kind, config) -> Promise<Uint8Array> + triggers download.
        const signingTemplateBase64 = await checklistSigningTemplate(call, apps, kind);
        await pdf.downloadChecklist(b, apps, kind, { ...config, signingTemplateBase64 });
      });
      // Merged Officer-signed PDF + full ZIP package per kind.
      onBatchDownload('[data-svc-batch-merge], [data-svc-batch-duty]', async btn => {
        const duty = Boolean(btn.dataset.svcBatchDuty);
        const b = state.batches.find(row => row.id === (btn.dataset.svcBatchDuty || btn.dataset.svcBatchMerge));
        const kind = btn.getAttribute('data-svc-kind') || 'Stripe';
        if (!b) throw new Error(tr('找不到批次。', 'Batch not found.'));
        const pdf = root.KPTServicePDF;
        if (!pdf || typeof pdf.mergeAndDownload !== 'function') throw new Error(t('pdfUnavailable'));
        const items = await (duty ? gatherDutyDocuments : gatherSignedDocs)(call, b, state.applications, kind);
        if (!items.length) throw new Error(t('pdfNoSigned'));
        const mergeName = pdf.batchFileName(duty ? 'duty' : 'application', kind, b.year);
        await pdf.mergeAndDownload(items, mergeName);
      });
      onBatchDownload('[data-svc-batch-zip]', async btn => {
        const b = state.batches.find(row => row.id === btn.getAttribute('data-svc-batch-zip'));
        if (!b) throw new Error(tr('找不到批次。', 'Batch not found.'));
        const pdf = root.KPTServicePDF;
        if (!pdf || typeof pdf.zipFiles !== 'function') throw new Error(t('pdfUnavailable'));
        const apps = state.applications.filter(app => (b.applicationIds || []).includes(app.id));
        // ZIP path must not fire extra single-file downloads — download:false.
        const zipConfig = { division: (root.KPT_CONFIG && root.KPT_CONFIG.organization) || '', download: false };
        const zipName = (b.title || 'service-batch') + '-' + (b.year || '') + '.zip';
        // Only the Stripe/Star kinds this batch actually needs.
        const kinds = b.awardType === 'SpecialServiceShield' ? ['SSS'] : ['Stripe', 'Star'].filter(kind => apps.some(app => (YEAR_MAP[app.confirmedYear] || []).includes(kind)));
        const map = {};
        async function buildAwardFiles(kind) {
          const [checklist, signed, duty] = await Promise.all([
            checklistSigningTemplate(call, apps, kind)
              .then(signingTemplateBase64 => pdf.downloadChecklist(b, apps, kind, { ...zipConfig, signingTemplateBase64 })),
            gatherSignedDocs(call, b, apps, kind),
            gatherDutyDocuments(call, b, apps, kind)
          ]);
          const folder = kind === 'SSS' ? 'Special Service Shield Applicants/' : 'Service ' + kind + ' Applicants/';
          map[folder + pdf.batchFileName('checklist', kind, b.year)] = toBytes(checklist);
          if (signed.length) map[folder + pdf.batchFileName('application', kind, b.year)] = toBytes(await pdf.mergeDocuments(signed));
          const tiers = [...new Set(apps.map(app => Number(app.confirmedTier)).filter(Boolean))].sort((a, b) => a - b);
          const dutyName = kind === 'SSS' && tiers.length ? 'Duty Records (Total-SSS-' + tiers.join('-') + ').pdf' : pdf.batchFileName('duty', kind, b.year);
          if (duty.length) map[folder + dutyName] = toBytes(await pdf.mergeDocuments(duty));
          if (kind === 'SSS' && b.includeCoverLetter !== false && typeof pdf.generateSSSCoverLetter === 'function') {
            map[folder + pdf.batchFileName('covering', kind, b.year)] = toBytes(await pdf.generateSSSCoverLetter(b, apps, zipConfig));
          }
        }
        await Promise.all(kinds.map(buildAwardFiles));
        if (!Object.keys(map).length) throw new Error(t('pdfNoSigned'));
        downloadFile(pdf.zipFiles(map), zipName, 'application/zip');
      });
      const newBatch = container.querySelector('[data-svc-new-batch]');
      if (newBatch) newBatch.addEventListener('click', () => {
        const title = window.prompt(t('batchTitlePrompt'), awardLabel + ' ' + new Date().getFullYear());
        if (!title) return;
        const year = Number(window.prompt(t('batchYearPrompt'), String(new Date().getFullYear())));
        if (!Number.isInteger(year)) return;
        saveBatch({ year: year, title: title, awardType, includeCoverLetter: true, applicationIds: [], remarks: '', checks: {} });
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
        if (state.dirty || busy) return;
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
