(function (root) {
  'use strict';
  function requireLibrary() { if (!root.XLSX) throw new Error('Excel library is unavailable. Reload the page.'); return root.XLSX; }
  const TYPED_TABLES = ['Members', 'Attendance', 'Exams', 'Duty', 'Awards', 'Activities', 'Enrolments'];
  const STANDARD_IGNORED = ['Instructions', 'Meta', 'Summary', '_TCCD_Choices'];
  function resolveTypedTable(options) {
    if (options == null) return null;
    if (typeof options !== 'object') throw new Error('Options must be an object with a table field.');
    const table = options.table;
    if (table === undefined) return null;
    if (typeof table !== 'string' || !TYPED_TABLES.includes(table)) {
      throw new Error('Unknown import type. Choose Members, Attendance, Exams, Duty, Awards, Activities or Enrolments.');
    }
    return table;
  }
  // Retain the original Members title/status mapping for previously downloaded forms.
  const V2_TITLE = 'TCCD 会员资料导入表 · 新会员';
  const V2_STATUS_MAP = { '在籍': 'Active', '已毕业': 'Graduated', '已退出': 'Withdrawn', 'Active': 'Active', 'Graduated': 'Graduated', 'Withdrawn': 'Withdrawn' };
  const V2_PREFORMAT_END = 212; // Excel row 212 (0-based 211)
  function templateInfo(table) {
    const field = (field, label, required, help, example, options) => ({ field, label, required, help, example, ...(options ? { options: options.slice() } : {}) });
    const member = () => field('memberId', '会员姓名 *', true, '从下拉名单选择，也可以输入完整姓名。系统会在预览时核对；同名请选带 SJAM ID 等识别资料的选项。找不到或有多个匹配时不会自动配对。', '示例学员甲');
    const activity = required => field('activityId', '活动名称' + (required ? ' *' : ''), required, '从下拉选择活动名称和日期，也可输入完整活动名称。重名活动必须选含日期的选项。考试如关联活动，类别、日期和出席情况须一致。', required ? '示例活动 · 2030-01-15' : '');
    const year = () => field('year', '年份 *', true, '填四位数字，范围 1900–2200。例如 2030；不要填「2030年」。', 2030);
    const date = () => field('date', '日期 *', true, '填写实际日期，格式 YYYY-MM-DD，例如 2030-01-15。', '2030-01-15');
    const archived = () => field('archived', 'Archived（归档）', false, '新记录通常留空或选 FALSE。TRUE 表示归档；这不是删除记录。', 'FALSE', ['TRUE', 'FALSE']);
    const certificate = () => field('certificate', '证书编号', false, '按正式证书编号填写，使用文本格式保留开头的 0。没有或不知道就留空。示范值不是正式号码。', '0000-EXAMPLE');
    const status = required => field('status', '会员状态' + (required ? ' *' : ''), required, '保留英文：Active＝在籍，Graduated＝已毕业，Withdrawn＝已退出。' + (required ? '此表必须选择状态，不要留空。' : '新会员可留空，系统默认 Active。'), 'Active', root.KPT.statuses);
    const form = () => field('form', '年级', false, '请选择英文选项：Peralihan、Form 1 至 Form 5、Adult。不要自行缩写成 F1；不清楚可留空。', 'Form 1', root.KPT.forms);
    const configs = {
      Members: {
        title: V2_TITLE,
        columns: [field('name', '姓名 *', true, '填写正式全名。每人一行；姓名相同不代表是同一个人。', '示例学员甲'), field('sjamId', 'SJAM 会员编号', false, '按正式会员编号原样填写，不规定固定长度。使用文本格式保留开头的 0；还没有编号就留空。不是 IC 或系统内部 id。', '00001234'), field('ic', '身份证号码', false, '有需要才填写真实官方号码；不知道就留空。使用文本格式并妥善保密，不要照抄示范号码。', ''), field('race', '种族', false, '从英文选项选择：Melayu、India、Cina、Other。不清楚可留空。', 'Cina', root.KPT.races), form(), field('joined', '加入日期', false, '填写实际加入日期，格式 YYYY-MM-DD。不知道就留空。', '2030-01-15'), status(false)],
        instructions: ['姓名必填，其他栏位可选。新会员不用填写 id/version，系统会自动生成。', 'SJAM 会员编号、身份证号码请用文本格式，保留开头的 0；不知道就留空。', '状态选 Active / Graduated / Withdrawn；新会员留空默认 Active。日期：YYYY-MM-DD。', '只新增会员；修改已有会员请下载已有记录，保留 id/version。第 9 行示范不会导入。']
      },
      Attendance: {
        title: 'TCCD 出席记录导入表 · 新记录',
        columns: [activity(true), member(), field('present', '出席（TRUE/FALSE） *', true, 'TRUE＝有出席，FALSE＝没有出席。请明确选择，不要填写 Yes、No 或中文。', 'TRUE', ['TRUE', 'FALSE'])],
        instructions: ['先建立会员和活动，再从下拉选择名字。也可输入完整名称，上传预览时系统会核对名单。', '每行对应一位会员在一个活动的出席情况。TRUE＝出席，FALSE＝未出席。', '同一会员在同一活动只能有一条出席记录；修改原记录请用已有记录导出文件。', '同名会员请选有 SJAM ID 的选项；同名活动请按日期选择。正式资料从第 13 行开始。']
      },
      Activities: {
        title: 'TCCD 活动资料导入表 · 新记录',
        columns: [field('name', '活动名称 *', true, '填写实际活动名称。新记录的内部 id 会在导入后自动生成。', '示例活动'), date(), field('tags', '活动类别（Tags） *', true, '英文类别：DIM、Inspection、Exam、Other。多个类别用 | 连接，例如 DIM|Inspection，不用逗号。', 'DIM|Inspection'), field('examType', '考试类别（Exam Type）', false, '只有 Tags 包含 Exam 时必填。照 System Setup 的考试名称原样填写，例如 BFA (New)；其他活动留空。', ''), archived()],
        instructions: ['活动名称、日期和 Tags 必填。日期格式：YYYY-MM-DD。', 'Tags 保留英文：DIM、Inspection、Exam、Other；多个类别用 | 连接。', 'Tags 包含 Exam 时，Exam Type 必须对应 System Setup 的正式考试名称。', 'Archived 新记录通常留空或 FALSE。新增后可导出活动 id，再填写出席记录。']
      },
      Exams: {
        title: 'TCCD 考试记录导入表 · 新记录',
        columns: [member(), activity(false), field('type', '考试类别（Exam Type） *', true, '从 System Setup 复制正式考试名称，英文名称和括号保留原样。示范 BFA (New) 也须在你的目录里存在。', 'BFA (New)'), date(), field('result', '考试结果（Result） *', true, '保留英文：Pass＝及格，Fail＝不及格，Pending＝待确认，Absent＝缺席。', 'Pass', root.KPT.results), field('attended', '参与考试（TRUE/FALSE） *', true, 'Pass/Fail 必须选 TRUE；Absent 必须选 FALSE；Pending 按实际参与情况填写。', 'TRUE', ['TRUE', 'FALSE']), certificate(), archived()],
        instructions: ['会员须已存在，请选择或输入完整姓名。考试类别须在 System Setup 中存在。', 'Result 使用 Pass / Fail / Pending / Absent；参与考试使用 TRUE / FALSE。', 'Pass、Fail 对应 TRUE，Absent 对应 FALSE。证书编号可留空，填写时用文本格式。', '活动名称可留空；若选择活动，必须与该活动的日期、类别及出席记录一致。']
      },
      Duty: {
        title: 'TCCD 年度勤务导入表 · 新记录',
        columns: [member(), year(), field('hours', 'Duty Hours（小时）', false, '只填 0–8784 的数字，可有小数，例如 60.5。0 表示已知为零；留空表示未知，不要加「小时」。', 60.5)],
        instructions: ['从下拉选择会员，或输入完整姓名。年份填写四位数字，例如 2030。', '每位会员每年只能有一条年度 Duty 记录；这里填写该年度总小时数。', 'Hours 只填数字，范围 0–8784，可有小数；留空＝未知，0＝确认没有时数。', '修改已有年度记录，请下载已有记录，保留 id/version；不要重新新增同一年。']
      },
      Awards: {
        title: 'TCCD 奖项记录导入表 · 新记录',
        columns: [member(), field('catalogId', '奖项目录编号（Catalog ID）', false, '从 Export all records 导出的 Catalog 表复制 id（可先在 System Setup 查名称）。填有效 Catalog ID 时，系统自动采用目录的类别、名称和等级；不填则后三项必须精确匹配目录。', ''), field('category', '奖项类别（Category）', false, '没有 Catalog ID 时必须填写。保留英文：Probadge、Promotion、Special Service Shield、Service Stripe & Star。', 'Probadge', root.KPT.categories), field('name', '奖项名称（Award Name）', false, '没有 Catalog ID 时必须照目录填写正式名称，不要翻译或自行缩写。示范名称仅供参考。', 'Knowledge of the Order of St. John'), date(), field('level', '奖项等级（Level）', false, '没有 Catalog ID 时必须与目录中该奖项的 Level 一致；目录没有等级则留空。保持英文原文。', 'Category 0'), certificate(), field('notes', '备注', false, '可填写补充说明；没有就留空。', '示例备注'), archived()],
        instructions: ['会员姓名和获奖日期必填。会员必须先存在，日期使用 YYYY-MM-DD。', '选择一种方式：填有效 Catalog ID；或完整填写与目录一致的 Category、Award Name、Level。', 'Probadge、Service Stripe & Star 等正式名称保留英文。同一会员已有的同一奖项请用导出文件更新。', 'System Setup 可查看目录；Catalog ID 可在 Export all records 的 Catalog 表查找。示范不会导入。']
      },
      Enrolments: {
        title: 'TCCD 年度会员资料导入表 · 新记录',
        columns: [member(), year(), form(), status(true)],
        instructions: ['从下拉选择会员，或输入完整姓名；年份填写四位数字，例如 2030。', '每位会员每年只能有一条年度会员资料。年级选 Peralihan / Form 1–5 / Adult。', 'Status 必填：Active＝在籍，Graduated＝已毕业，Withdrawn＝已退出；此表不要留空。', '修改已有年度资料，请下载已有记录并保留 id/version，避免重复新增同一年。']
      }
    };
    if (!Object.prototype.hasOwnProperty.call(configs, table)) return null;
    const info = JSON.parse(JSON.stringify({ table, dataStartRow: 13, ...configs[table] }));
    info.columns.forEach(column => {
      if (column.field === 'memberId') { column.reference = 'Members'; column.legacyLabel = '会员内部编号 *'; }
      if (column.field === 'activityId') { column.reference = 'Activities'; column.legacyLabel = '活动内部编号' + (column.required ? ' *' : ''); }
    });
    return info;
  }
  const matchKey = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  function referenceChoices(table, state) {
    const rows = Array.isArray(state?.[table]) ? state[table] : [];
    return rows.filter(row => row.id && row.name && (table !== 'Activities' || !row.archived)).map(row => ({
      id: row.id, name: String(row.name), label: table === 'Activities'
        ? row.name + ' · ' + (row.date || '日期未填')
        : row.name + (row.sjamId ? ' · SJAM ' + row.sjamId : ' · ' + (row.form || '年级未填') + ' · ' + (row.joined || '加入日期未填'))
    }));
  }
  function resolveName(value, table, state, indexes) {
    if (!state || !Array.isArray(state[table])) throw new Error('名单未加载，请回到网页重新载入资料，再预览导入。');
    if (!indexes.has(table)) {
      const index = new Map();
      referenceChoices(table, state).forEach(row => [row.label, row.name].forEach(value => {
        const key = matchKey(value);
        if (!index.has(key)) index.set(key, new Set());
        index.get(key).add(row.id);
      }));
      indexes.set(table, index);
    }
    const matches = indexes.get(table).get(matchKey(value));
    if (!matches?.size) throw new Error('找不到「' + String(value) + '」。请检查完整名称，或先在系统建立这条资料。');
    if (matches.size > 1) throw new Error('「' + String(value) + '」有多个匹配。会员请选择带 SJAM ID 等识别资料的选项；活动请选择含日期的选项。如仍同名，请先补全资料。');
    return matches.values().next().value;
  }

  function parse(buffer, options) {
    const library = requireLibrary();
    const typedTable = resolveTypedTable(options);
    const book = library.read(buffer, { type: 'array', cellDates: false });
    const output = {};
    const errors = [];
    const ignoredSheets = [];
    const referenceIndexes = new Map();
    let count = 0;
    book.SheetNames.forEach(name => {
      if (typedTable) {
        if (name !== typedTable) {
          if (!STANDARD_IGNORED.includes(name)) ignoredSheets.push(name);
          return;
        }
      } else {
        if (STANDARD_IGNORED.includes(name)) return;
      }
      const allowed = root.KPT.fields[name];
      if (!allowed) {
        if (typedTable) { errors.push({ sheet: name, row: 1, message: 'Selected sheet not found. Use the downloaded template for ' + typedTable + '.' }); return; }
        errors.push({ sheet: name, row: 1, message: 'Unknown sheet. Use the downloaded template.' });
        return;
      }
      const sheet = book.Sheets[name];
      if (!sheet || !sheet['!ref']) {
        if (typedTable) { errors.push({ sheet: typedTable, row: 1, message: 'Selected sheet has no data. Use the downloaded template and add at least one row.' }); return; }
        return;
      }
      const range = library.utils.decode_range(sheet['!ref']);
      if (range.e.r > 100000 || range.e.c > 30) { errors.push({ sheet: name, row: 1, message: 'Sheet is too large.' }); return; }
      // Guided forms use a fixed instructional area; only row 13 onward is data.
      const info = templateInfo(name);
      if (info && String(sheet.A1?.v || '').trim() === info.title) {
        const columns = info.columns;
        const legacyReferences = new Set();
        const validHeaders = columns.every((column, c) => {
          const cell = sheet[library.utils.encode_cell({ r: 11, c })];
          const label = String(cell?.v || '').trim();
          if (column.reference && label === column.legacyLabel) legacyReferences.add(column.field);
          return !cell?.f && (label === column.label || (column.reference && label === column.legacyLabel));
        }) && !Array.from({ length: Math.max(0, range.e.c + 1 - columns.length) }, (_, i) => sheet[library.utils.encode_cell({ r: 11, c: i + columns.length })]).some(cell => cell && (cell.f || (cell.v !== '' && cell.v != null)));
        if (!validHeaders) { errors.push({ sheet: name, row: 12, message: 'Column headers in row 12 must match the template exactly. Download a fresh template; do not rename or add columns.' }); return; }
        output[name] = [];
        for (let rowIndex = 12; rowIndex <= range.e.r; rowIndex++) {
          const row = { id: '', version: '' };
          let hasValue = false;
          const rowErrors = [];
          columns.forEach((column, c) => {
            const cell = sheet[library.utils.encode_cell({ r: rowIndex, c })];
            let value = cell ? cell.v : '';
            if (value !== '' && value != null) hasValue = true;
            if (cell?.f) rowErrors.push(column.label + ': formulas are not accepted; paste values.');
            if (['memberId', 'activityId', 'catalogId', 'ic', 'sjamId', 'certificate'].includes(column.field) && typeof value === 'number') rowErrors.push(column.label + ': must be text to preserve leading zeros.');
            if (['date', 'joined'].includes(column.field) && typeof value === 'number') {
              const date = library.SSF.parse_date_code(value);
              value = date ? date.y + '-' + String(date.m).padStart(2, '0') + '-' + String(date.d).padStart(2, '0') : '';
            }
            // Compatibility with the previously released Chinese Members form.
            if (name === 'Members' && column.field === 'status' && value) {
              const status = String(value).trim();
              value = Object.prototype.hasOwnProperty.call(V2_STATUS_MAP, status) ? V2_STATUS_MAP[status] : status;
            }
            if (column.reference && !legacyReferences.has(column.field) && value !== '' && value != null && !cell?.f) {
              try { value = resolveName(value, column.reference, options?.references, referenceIndexes); }
              catch (error) { rowErrors.push(column.label + ': ' + error.message); }
            }
            row[column.field] = value == null ? '' : value;
          });
          for (let c = columns.length; c <= range.e.c; c++) {
            const cell = sheet[library.utils.encode_cell({ r: rowIndex, c })];
            if (cell && (cell.f || (cell.v !== '' && cell.v != null))) rowErrors.push('Extra columns are not allowed. Fill only the downloaded template columns.');
          }
          if (hasValue) columns.forEach(column => {
            if (column.required && String(row[column.field] ?? '').trim() === '') rowErrors.push(column.label + ': this field is required.');
          });
          rowErrors.forEach(message => errors.push({ sheet: name, row: rowIndex + 1, message }));
          if (hasValue && !rowErrors.length) { row.__excelRow = rowIndex + 1; output[name].push(row); count++; }
        }
        if (!output[name].length && !errors.some(error => error.sheet === name)) errors.push({ sheet: name, row: 13, message: 'No data rows found. Enter records starting from row 13; the example is not imported.' });
        return;
      }
      // Legacy parse (row 1 machine headers)
      const headers = [];
      for (let column = 0; column <= range.e.c; column++) {
        const cell = sheet[library.utils.encode_cell({ r: 0, c: column })];
        headers.push(String(cell && cell.v || '').trim());
      }
      const newOptional = new Set(['catalogId', 'code', 'sortOrder', 'eligibilityMetric', 'eligibilityThreshold']);
      const requiredHeaders = allowed.filter(header => !newOptional.has(header));
      if (new Set(headers).size !== headers.length || headers.some(header => !allowed.includes(header)) || requiredHeaders.some(header => !headers.includes(header))) {
        errors.push({ sheet: name, row: 1, message: 'Headers must match the template; their order may change. Older files may omit the newer setup columns.' });
        return;
      }
      output[name] = [];
      for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex++) {
        const row = {};
        let hasValue = false;
        headers.forEach((header, column) => {
          const cell = sheet[library.utils.encode_cell({ r: rowIndex, c: column })];
          let value = cell ? cell.v : '';
          if (value !== '' && value != null) hasValue = true;
          if (cell && cell.f) errors.push({ sheet: name, row: rowIndex + 1, message: header + ': formulas are not accepted; paste values.' });
          if (['id', 'memberId', 'activityId', 'ic', 'sjamId', 'certificate'].includes(header) && typeof value === 'number') errors.push({ sheet: name, row: rowIndex + 1, message: header + ': must be text to preserve leading zeros.' });
          if (['date', 'joined'].includes(header) && typeof value === 'number') {
            const parsed = library.SSF.parse_date_code(value);
            value = parsed ? parsed.y + '-' + String(parsed.m).padStart(2, '0') + '-' + String(parsed.d).padStart(2, '0') : '';
          }
          row[header] = value == null ? '' : value;
        });
        if (hasValue) { row.__excelRow = rowIndex + 1; output[name].push(row); count++; }
      }
      if (typedTable && !output[name].length) {
        errors.push({ sheet: typedTable, row: 1, message: 'Selected sheet has no data. Use the downloaded template and add at least one row.' });
      }
    });
    if (typedTable && !output[typedTable] && !errors.some(e => e.sheet === typedTable)) {
      errors.push({ sheet: typedTable, row: 1, message: 'Selected sheet not found. Use the downloaded template for ' + typedTable + '.' });
    }
    if (!count && !errors.length) errors.push({ sheet: 'Workbook', row: 1, message: 'No records found.' });
    if (count > 100000) errors.push({ sheet: 'Workbook', row: 1, message: 'Use smaller imports (maximum 100,000 records).' });
    return { workbook: output, errors, ignoredSheets };
  }
  function applyTextFormat(sheet, headers, rowCount, isTemplate) {
    const textColumns = headers.map((header, index) => ['id', 'memberId', 'activityId', 'ic', 'sjamId', 'certificate'].includes(header) ? index : -1).filter(index => index >= 0);
    if (isTemplate) {
      textColumns.forEach(column => {
        for (let rowIndex = 1; rowIndex <= 1000; rowIndex++) {
          const address = root.XLSX.utils.encode_cell({ r: rowIndex, c: column });
          if (!sheet[address]) sheet[address] = { t: 's', v: '', z: '@' };
          else sheet[address].z = '@';
        }
      });
      if (textColumns.length) sheet['!ref'] = root.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1000, c: headers.length - 1 } });
    } else {
      textColumns.forEach(column => {
        for (let rowIndex = 1; rowIndex < rowCount; rowIndex++) {
          const address = root.XLSX.utils.encode_cell({ r: rowIndex, c: column });
          if (sheet[address]) sheet[address].z = '@';
        }
      });
    }
    sheet['!cols'] = headers.map(header => ({ wch: ['name', 'notes', 'category'].includes(header) ? 32 : 20 }));
    Object.keys(sheet).filter(key => !key.startsWith('!')).forEach(address => { if (sheet[address].t === 's') sheet[address].z = '@'; });
    sheet['!autofilter'] = { ref: root.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rowCount - 1, 1), c: headers.length - 1 } }) };
  }
  // Browser-safe UTF-8 helpers
  const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
  function utf8Encode(str) {
    if (textEncoder) return textEncoder.encode(str);
    const B = typeof Buffer !== 'undefined' ? Buffer : null;
    if (B) return new Uint8Array(B.from(str, 'utf8'));
    throw new Error('TextEncoder unavailable.');
  }
  function utf8Decode(bytes) {
    if (textDecoder) return textDecoder.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const B = typeof Buffer !== 'undefined' ? Buffer : null;
    if (B) return B.from(bytes).toString('utf8');
    throw new Error('TextDecoder unavailable.');
  }
  function cfbGetXml(cfb, path) {
    const i = cfb.FullPaths.indexOf(path);
    if (i < 0) return null;
    const c = cfb.FileIndex[i].content;
    if (!c) return null;
    return utf8Decode(c);
  }
  function cfbSetXml(cfb, path, xmlStr) {
    const bytes = utf8Encode(xmlStr);
    const i = cfb.FullPaths.indexOf(path);
    if (i >= 0) { cfb.FileIndex[i].content = bytes; cfb.FileIndex[i].size = bytes.length; return; }
    cfb.utils.cfb_add(cfb, path, bytes);
  }
  // --- V2 Members template build ---
  function buildGuidedAoa(info) {
    const n = info.columns.length;
    const line = text => [text, ...Array(n - 1).fill('')];
    const rows = [line(info.title), line('填写指南 · 本模板用于新增记录；更新已有资料请使用导出的记录文件')];
    info.instructions.forEach((text, i) => rows[i + 2] = line((i + 1) + '. ' + text));
    rows[6] = line('示范区 · 仅供参考，不会导入');
    rows[7] = info.columns.map(column => column.label);
    rows[8] = info.columns.map(column => column.example ?? '');
    rows[9] = line('');
    rows[10] = line('正式填写区 · 从第 13 行开始，每行一条记录');
    rows[11] = info.columns.map(column => column.label);
    for (let r = 12; r < V2_PREFORMAT_END; r++) rows[r] = Array(n).fill('');
    return rows;
  }
  function buildV2StylesXml(existingXml) {
    // Fonts: 0=normal, 1=title white bold 14, 2=guide dark text, 3=section bold white, 4=example header dark bold, 5=formal header bold, 6=data normal
    const fonts =
      '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><sz val="11"/><color rgb="FF1A1A2E"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF333333"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>';
    // Fills: 0=none, 1=gray125, 2=burgundy title, 3=pale blue guide, 4=yellow example, 5=required accent (A12 name), 6=pale blue alt row, 7=formal header
    const fills =
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF8B1A3A"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE8B4B8"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF3FA"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFB0C4DE"/><bgColor indexed="64"/></patternFill></fill>';
    // Borders: 0=none, 1=thin all
    const borders =
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFB0B0B0"/></left><right style="thin"><color rgb="FFB0B0B0"/></right><top style="thin"><color rgb="FFB0B0B0"/></top><bottom style="thin"><color rgb="FFB0B0B0"/></bottom><diagonal/></border>';
    // cellXfs:
    // 0=normal, 1=title(burgundy white bold), 2=subtitle(pale blue dark), 3=instruction(pale blue dark wrap),
    // 4=example label(yellow bold), 5=example header(yellow bold border), 6=example data(yellow border),
    // 7=spacer, 8=formal section(burgundy white bold), 9=formal header required A(burgundy accent bold),
    // 10=formal header optional(blue accent bold), 11=data even(white border), 12=data odd(pale blue border),
    // 13=text even, 14=text odd
    const xfs =
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + // 0
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' + // 1 title
      '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' + // 2 subtitle
      '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>' + // 3 instruction
      '<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 4 example label
      '<xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 5 example header
      '<xf numFmtId="0" fontId="6" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' + // 6 example data
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + // 7 spacer
      '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' + // 8 formal section
      '<xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 9 required header A
      '<xf numFmtId="0" fontId="5" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 10 optional header B-G
      '<xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' + // 11 data white
      '<xf numFmtId="0" fontId="6" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' + // 12 data pale blue
      '<xf numFmtId="49" fontId="6" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' + // 13 text even
      '<xf numFmtId="49" fontId="6" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'; // 14 text odd
    let xml = existingXml;
    xml = xml.replace(/<fonts count="\d+">[\s\S]*?<\/fonts>/, '<fonts count="7">' + fonts + '</fonts>');
    xml = xml.replace(/<fills count="\d+">[\s\S]*?<\/fills>/, '<fills count="8">' + fills + '</fills>');
    xml = xml.replace(/<borders count="\d+">[\s\S]*?<\/borders>/, '<borders count="2">' + borders + '</borders>');
    xml = xml.replace(/<cellXfs count="\d+">[\s\S]*?<\/cellXfs>/, '<cellXfs count="15">' + xfs + '</cellXfs>');
    return xml;
  }
  function patchGuidedSheetXml(xml, info, state) {
    xml = xml.replace(/<sheetView([^>]*?)\/>/, '<sheetView$1 showGridLines="0"><pane ySplit="12" topLeftCell="A13" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A13" sqref="A13"/></sheetView>');
    const validations = info.columns.flatMap((column, c) => {
      if (column.reference && !referenceChoices(column.reference, state).length) return [];
      if (!column.reference && !column.options?.length) return [];
      const formula = column.reference ? 'TCCD_' + column.reference + 'Choices' : '"' + column.options.join(',') + '"';
      if (formula.length > 255) return [];
      const col = requireLibrary().utils.encode_col(c);
      const escaped = formula.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return ['<dataValidation type="list" allowBlank="1" showErrorMessage="' + (column.reference ? '0' : '1') + '" errorTitle="请选择列表中的值" error="请使用原有英文选项；填写说明在表格上方。" sqref="' + col + '13:' + col + '212"><formula1>' + escaped + '</formula1></dataValidation>'];
    });
    if (validations.length) xml = xml.replace('</mergeCells>', '</mergeCells><dataValidations count="' + validations.length + '">' + validations.join('') + '</dataValidations>');
    return xml;
  }
  function buildGuidedBook(table, state) {
    const library = requireLibrary();
    const info = templateInfo(table);
    const sheet = library.utils.aoa_to_sheet(buildGuidedAoa(info));
    const widths = { memberId: 32, activityId: 36, catalogId: 22, date: 16, year: 14, hours: 22, status: 22, form: 16, name: 32, type: 26, examType: 26, tags: 26, category: 26, level: 24, certificate: 22, notes: 28, archived: 22, present: 26, attended: 26 };
    const membersWidths = [18, 16, 16, 10, 10, 12, 14];
    const sizes = info.columns.map((column, i) => table === 'Members' ? membersWidths[i] : (widths[column.field] || 20));
    const extra = Math.max(0, 94 - sizes.reduce((sum, width) => sum + width, 0)) / sizes.length;
    sheet['!cols'] = sizes.map(width => ({ wch: width + extra }));
    sheet['!rows'] = Array.from({ length: V2_PREFORMAT_END }, (_, r) => ({ hpt: r === 0 ? 36 : r === 1 ? 26 : r >= 2 && r <= 5 ? 34 : r === 9 ? 10 : r === 7 || r === 11 ? 34 : r === 8 ? 40 : r === 6 || r === 10 ? 26 : info.columns.some(column => column.reference) ? 34 : 22 }));
    sheet['!merges'] = [0, 1, 2, 3, 4, 5, 6, 10].map(r => ({ s: { r, c: 0 }, e: { r, c: info.columns.length - 1 } }));
    const last = library.utils.encode_col(info.columns.length - 1);
    sheet['!autofilter'] = { ref: 'A12:' + last + '212' };
    sheet['!ref'] = 'A1:' + last + '212';
    info.columns.forEach((column, c) => {
      if (!['memberId', 'activityId', 'catalogId', 'sjamId', 'ic', 'certificate'].includes(column.field)) return;
      for (let r = 12; r < V2_PREFORMAT_END; r++) sheet[library.utils.encode_cell({ r, c })].z = '@';
    });
    const book = library.utils.book_new();
    library.utils.book_append_sheet(book, sheet, table);
    const referenceTables = [...new Set(info.columns.map(column => column.reference).filter(Boolean))];
    const lists = referenceTables.map(name => ({ name, labels: [...new Set(referenceChoices(name, state).map(row => row.label))] })).filter(list => list.labels.length);
    if (lists.length) {
      const rows = Array.from({ length: Math.max(...lists.map(list => list.labels.length)) }, (_, r) => lists.map(list => list.labels[r] || ''));
      library.utils.book_append_sheet(book, library.utils.aoa_to_sheet(rows), '_TCCD_Choices');
      book.Workbook = {
        Sheets: [{ name: table, Hidden: 0 }, { name: '_TCCD_Choices', Hidden: 2 }],
        Names: lists.map((list, c) => ({ Name: 'TCCD_' + list.name + 'Choices', Ref: "'_TCCD_Choices'!$" + library.utils.encode_col(c) + '$1:$' + library.utils.encode_col(c) + '$' + list.labels.length }))
      };
    }
    return book;
  }
  function buildGuidedStyledBytes(table, state) {
    const library = requireLibrary();
    const info = templateInfo(table);
    const raw = library.write(buildGuidedBook(table, state), { bookType: 'xlsx', type: 'array' });
    const cfb = library.CFB.read(new Uint8Array(raw), { type: 'array' });
    cfbSetXml(cfb, 'Root Entry/xl/styles.xml', buildV2StylesXml(cfbGetXml(cfb, 'Root Entry/xl/styles.xml')));
    const xml = patchGuidedSheetXml(cfbGetXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml'), info, state).replace(/<c\b([^>]*)>/g, (tag, attrs) => {
      const match = attrs.match(/\br="([A-Z]+)(\d+)"/);
      if (!match) return tag;
      const c = library.utils.decode_col(match[1]);
      const row = Number(match[2]);
      let style = 0;
      if (row === 1) style = 1;
      else if (row === 2) style = 2;
      else if (row <= 6) style = 3;
      else if (row === 7) style = 4;
      else if (row === 8) style = 5;
      else if (row === 9) style = 6;
      else if (row === 11) style = 8;
      else if (row === 12) style = info.columns[c]?.required ? 9 : 10;
      else if (row >= 13) style = ['memberId', 'activityId', 'catalogId', 'sjamId', 'ic', 'certificate'].includes(info.columns[c]?.field) ? ((row - 13) % 2 ? 14 : 13) : ((row - 13) % 2 ? 12 : 11);
      return '<c' + attrs.replace(/\s+s="[^"]*"/g, '').replace(/\/$/, '') + ' s="' + style + '"' + (attrs.endsWith('/') ? '/>' : '>');
    });
    cfbSetXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml', xml);
    const out = library.CFB.write(cfb, { fileType: 'zip', type: 'array', compression: true });
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  }
  function create(state, template, summaryRows, options) {
    const library = requireLibrary();
    const typedTable = resolveTypedTable(options);
    const book = library.utils.book_new();
    if (typedTable && template) return buildGuidedBook(typedTable, state);
    if (typedTable) {
      const headers = root.KPT.fields[typedTable];
      const records = template ? [] : state[typedTable];
      const rows = [headers, ...records.map(row => headers.map(header => Array.isArray(row[header]) ? row[header].join('|') : row[header] == null ? '' : row[header]))];
      const sheet = library.utils.aoa_to_sheet(rows);
      applyTextFormat(sheet, headers, rows.length, !!template);
      library.utils.book_append_sheet(book, sheet, typedTable);
      return book;
    }
    const instructions = [['TCCD Excel import template'], ['Use exact sheet names and column headers. Header order may change.'], ['Phase 1 member import: enter name and SJAM ID only. SJAM ID may be blank.'], ['For new members, leave id, version and status blank. The system creates IDs and uses Active status.'], ['Keep id and version unchanged when editing exported records.'], ['IC, SJAM ID and certificate numbers must be text.'], ['Dates: YYYY-MM-DD. Activity tags: DIM|Inspection|Exam|Other.'], ['TRUE/FALSE fields: present, attended, archived.'], ['Other sheets may remain empty. Missing rows are never deleted.'], ['Import preview is required. A stale version must be re-exported.'], ['New students receive an internal ID after saving. Export them before adding related records.'], ['Linked examinations must match the activity date, type and attendance.'], ['An activity tagged Exam creates Pending/Absent exam records when attendance is saved.'], ['Use System Setup to maintain Exam and Award options. Do not change catalogue codes or eligibility fields in Excel.']];
    library.utils.book_append_sheet(book, library.utils.aoa_to_sheet(instructions), 'Instructions');
    root.KPT.tables.filter(table => !table.startsWith('Doc')).forEach(table => {
      const headers = root.KPT.fields[table];
      const records = template ? [] : state[table];
      const rows = [headers, ...records.map(row => headers.map(header => Array.isArray(row[header]) ? row[header].join('|') : row[header] == null ? '' : row[header]))];
      const sheet = library.utils.aoa_to_sheet(rows);
      if (template) {
        const textColumns = headers.map((header, index) => ['id', 'memberId', 'activityId', 'ic', 'sjamId', 'certificate'].includes(header) ? index : -1).filter(index => index >= 0);
        textColumns.forEach(column => {
          for (let rowIndex = 1; rowIndex <= 1000; rowIndex++) {
            const address = library.utils.encode_cell({ r: rowIndex, c: column });
            if (!sheet[address]) sheet[address] = { t: 's', v: '', z: '@' };
            else sheet[address].z = '@';
          }
        });
        if (textColumns.length) sheet['!ref'] = library.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1000, c: headers.length - 1 } });
      }
      sheet['!cols'] = headers.map(header => ({ wch: ['name', 'notes', 'category'].includes(header) ? 32 : 20 }));
      Object.keys(sheet).filter(key => !key.startsWith('!')).forEach(address => { if (sheet[address].t === 's') sheet[address].z = '@'; });
      sheet['!autofilter'] = { ref: library.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length - 1, 1), c: headers.length - 1 } }) };
      library.utils.book_append_sheet(book, sheet, table);
    });
    if (summaryRows) library.utils.book_append_sheet(book, library.utils.json_to_sheet(summaryRows), 'Summary');
    return book;
  }
  function createStyledBytes(state, template, summaryRows, options) {
    const library = requireLibrary();
    const typedTable = resolveTypedTable(options);
    if (typedTable && template) return buildGuidedStyledBytes(typedTable, state);
    const book = create(state, template, summaryRows, options);
    return library.write(book, { bookType: 'xlsx', type: 'array' });
  }
  function triggerDownload(bytes, fileName) {
    const library = requireLibrary();
    if (typeof Blob !== 'undefined' && typeof document !== 'undefined' && document.createElement) {
      const blob = new Blob([bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (typeof URL.revokeObjectURL !== 'undefined') setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
    const fs = typeof require === 'function' ? require('fs') : null;
    if (fs) { fs.writeFileSync(fileName, Buffer.from(bytes)); return; }
    library.writeFile(bytes, fileName);
  }
  function download(state, template, summaryRows, options) {
    const library = requireLibrary();
    const typedTable = resolveTypedTable(options);
    let fileName;
    if (typedTable) {
      fileName = template ? 'TCCD_' + typedTable + '_Import_Template.xlsx' : 'TCCD_' + typedTable + '_Export_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    } else {
      fileName = template ? 'TCCD_Import_Template.xlsx' : 'TCCD_Export_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    }
    if (typedTable && template) {
      const bytes = buildGuidedStyledBytes(typedTable, state);
      triggerDownload(bytes, fileName);
      return bytes;
    }
    const book = create(state, template, summaryRows, options);
    library.writeFile(book, fileName);
    return book;
  }
  root.KPTWorkbook = { parse, create, createStyledBytes, download, templateInfo, TYPED_TABLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTWorkbook;
})(typeof globalThis !== 'undefined' ? globalThis : this);
