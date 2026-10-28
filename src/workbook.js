(function (root) {
  'use strict';
  function requireLibrary() { if (!root.XLSX) throw new Error('Excel library is unavailable. Reload the page.'); return root.XLSX; }
  const TYPED_TABLES = ['Members', 'Attendance', 'Exams', 'Duty', 'Awards', 'Activities', 'Enrolments'];
  const STANDARD_IGNORED = ['Instructions', 'Meta', 'Summary'];
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
  function parse(buffer, options) {
    const library = requireLibrary();
    const typedTable = resolveTypedTable(options);
    const book = library.read(buffer, { type: 'array', cellDates: false });
    const output = {};
    const errors = [];
    const ignoredSheets = [];
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
  // --- Members visual template: SheetJS comments + CFB OOXML style injection ---
  const MEMBERS_COL_STYLES = { id: 'system', version: 'system', name: 'required', ic: 'optional', sjamId: 'optional', race: 'optional', form: 'optional', joined: 'optional', status: 'optional' };
  const MEMBERS_COMMENTS = {
    id: 'Internal ID / 内部编号\nLeave blank for new members. / 新成员请留空。\nKeep existing ID when updating. / 更新时请保留原ID。\nExample (fictional): STU-000001 / 示例（虚构）：STU-000001',
    version: 'Record version / 记录版本\nLeave blank for new members. / 新成员请留空。\nKeep existing version when updating. / 更新时请保留原版本号。\nExample (fictional): 1 / 示例（虚构）：1',
    name: 'Full name / 姓名（必填）\nRequired. / 必填。\nEnter the official full name. / 请填写正式全名。\nExample (fictional): Ahmad bin Abu / 示例（虚构）：Ahmad bin Abu',
    ic: 'IC number / 身份证号（可选）\nOptional. Text format preserves leading zeros. / 可选。文本格式保留前导零。\nEnter actual official IC if needed; leave blank if unknown. / 如有需要请填写真实身份证号；不清楚可留空。\nDo not copy the fictional example below. / 请勿照抄下方虚构示例。\nExample (fictional): 000000-00-0000 / 示例（虚构）：000000-00-0000',
    sjamId: 'SJAM ID / 圣约翰编号（可选）\nOptional. Official SJAM number as text; preserve leading zeros. / 可选。官方圣约翰编号，文本格式；保留前导零。\nNo prescribed format. / 无固定格式。\nNot the same as IC or internal ID. / 与身份证号和内部编号不同。\nLeave blank if unknown. / 不清楚可留空。\nExample (fictional): 000001 / 示例（虚构）：000001',
    race: 'Race / 种族（可选）\nOptional. Choose from dropdown. / 可选。请从下拉选择。\nOptions: Melayu, India, Cina, Other / 选项：Melayu, India, Cina, Other',
    form: 'Form / 年级（可选）\nOptional. Choose from dropdown. / 可选。请从下拉选择。\nOptions: Peralihan, Form 1–5, Adult / 选项：Peralihan, Form 1–5, Adult',
    joined: 'Join date / 入会日期（可选）\nOptional. Format: YYYY-MM-DD / 可选。格式：YYYY-MM-DD\nLeave blank if unknown. / 不清楚可留空。\nExample (fictional): 2026-01-15 / 示例（虚构）：2026-01-15',
    status: 'Status / 状态\nActive = 在籍, Graduated = 毕业, Withdrawn = 退出\nNew members: leave blank (auto Active). / 新成员：留空（自动设为 Active）。\nExisting members: must keep or update; cannot leave blank. / 已有成员：须保留或修改，不可留空。'
  };
  const MEMBERS_VALIDATIONS = [
    { col: 'F', formula: '"Melayu,India,Cina,Other"' },
    { col: 'G', formula: '"Peralihan,Form 1,Form 2,Form 3,Form 4,Form 5,Adult"' },
    { col: 'I', formula: '"Active,Graduated,Withdrawn"' }
  ];
  // Browser-safe UTF-8 helpers (no Node Buffer dependency)
  const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
  function utf8Encode(str) {
    if (textEncoder) return textEncoder.encode(str);
    // Node fallback
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
  function patchStylesXml(existingXml) {
    const extraFonts =
      '<font><b/><sz val="12"/><color rgb="FF404040"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="12"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><sz val="12"/><color rgb="FF333333"/><name val="Calibri"/><family val="2"/></font>';
    const extraFills =
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD6E4F0"/><bgColor indexed="64"/></patternFill></fill>';
    // Dynamic counts: parse existing, append, update count attributes
    const fontCount = parseInt((existingXml.match(/<fonts count="(\d+)"/) || [0, 1])[1], 10);
    const fillCount = parseInt((existingXml.match(/<fills count="(\d+)"/) || [0, 2])[1], 10);
    const xfCount = parseInt((existingXml.match(/<cellXfs count="(\d+)"/) || [0, 1])[1], 10);
    // New font indexes: fontCount+0=system bold gray, fontCount+1=required bold black, fontCount+2=optional normal
    const sysFontId = fontCount;
    const reqFontId = fontCount + 1;
    const optFontId = fontCount + 2;
    // New fill indexes: fillCount+0=gray, fillCount+1=accent yellow, fillCount+2=light blue
    const sysFillId = fillCount;
    const reqFillId = fillCount + 1;
    const optFillId = fillCount + 2;
    // New cellXf indexes
    const sysXf = xfCount;
    const reqXf = xfCount + 1;
    const optXf = xfCount + 2;
    const extraXfs =
      '<xf numFmtId="0" fontId="' + sysFontId + '" fillId="' + sysFillId + '" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="0" fontId="' + reqFontId + '" fillId="' + reqFillId + '" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="0" fontId="' + optFontId + '" fillId="' + optFillId + '" borderId="0" xfId="0" applyFont="1" applyFill="1"/>';
    let xml = existingXml;
    xml = xml.replace(/<fonts count="(\d+)"/, '<fonts count="' + (fontCount + 3) + '"');
    xml = xml.replace(/<\/fonts>/, extraFonts + '</fonts>');
    xml = xml.replace(/<fills count="(\d+)"/, '<fills count="' + (fillCount + 3) + '"');
    xml = xml.replace(/<\/fills>/, extraFills + '</fills>');
    xml = xml.replace(/<cellXfs count="(\d+)"/, '<cellXfs count="' + (xfCount + 3) + '"');
    xml = xml.replace(/<\/cellXfs>/, extraXfs + '</cellXfs>');
    return { xml, sysXf, reqXf, optXf };
  }
  function patchSheetXml(existingXml, headers, xfMap) {
    let xml = existingXml;
    // Freeze header: inject pane into sheetView
    if (!xml.includes('state="frozen"')) {
      xml = xml.replace(/<sheetView([^>]*?)\/>/, '<sheetView$1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView>');
      if (!xml.includes('state="frozen"')) {
        xml = xml.replace(/<sheetView([^>]*?)><\/sheetView>/, '<sheetView$1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView>');
      }
    }
    // Header style refs: replace or add s attribute
    const styleMap = { system: xfMap.sysXf, required: xfMap.reqXf, optional: xfMap.optXf };
    headers.forEach((header, i) => {
      const kind = MEMBERS_COL_STYLES[header] || 'optional';
      const styleId = styleMap[kind];
      const ref = String.fromCharCode(65 + i) + '1';
      // Replace existing s="..." or add s="..."
      const re = new RegExp('(<c r="' + ref + '")([^>]*?)(/?>)');
      xml = xml.replace(re, (m, prefix, attrs, close) => {
        const cleaned = attrs.replace(/ s="[^"]*"/, '');
        return prefix + ' s="' + styleId + '"' + cleaned + close;
      });
    });
    // Data validations: OOXML schema order — after autoFilter/mergeCells, before ignoredErrors/drawing
    const validations = MEMBERS_VALIDATIONS.map(v =>
      '<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="' + v.col + '2:' + v.col + '1000">' +
      '<formula1>' + v.formula + '</formula1></dataValidation>'
    ).join('');
    const block = '<dataValidations count="' + MEMBERS_VALIDATIONS.length + '">' + validations + '</dataValidations>';
    if (xml.includes('</autoFilter>')) {
      xml = xml.replace('</autoFilter>', '</autoFilter>' + block);
    } else if (xml.includes('<ignoredErrors')) {
      xml = xml.replace('<ignoredErrors', block + '<ignoredErrors');
    } else if (xml.includes('<legacyDrawing')) {
      xml = xml.replace('<legacyDrawing', block + '<legacyDrawing');
    } else {
      xml = xml.replace('</sheetData>', '</sheetData>' + block);
    }
    return xml;
  }
  function buildMembersBook(state, template) {
    const library = requireLibrary();
    const headers = root.KPT.fields.Members;
    const records = template ? [] : state.Members;
    const rows = [headers, ...records.map(row => headers.map(header => Array.isArray(row[header]) ? row[header].join('|') : row[header] == null ? '' : row[header]))];
    const sheet = library.utils.aoa_to_sheet(rows);
    applyTextFormat(sheet, headers, rows.length, !!template);
    // Native SheetJS comments (writer handles rels/VML/Content_Types)
    if (template) {
      headers.forEach((header, i) => {
        const text = MEMBERS_COMMENTS[header];
        if (!text) return;
        const addr = library.utils.encode_cell({ r: 0, c: i });
        if (!sheet[addr]) sheet[addr] = { t: 's', v: header };
        sheet[addr].c = [{ a: 'TCCD', t: text }];
      });
    }
    const book = library.utils.book_new();
    library.utils.book_append_sheet(book, sheet, 'Members');
    return book;
  }
  function buildMembersTemplateBytes(state) {
    const library = requireLibrary();
    const book = buildMembersBook(state, true);
    const raw = library.write(book, { bookType: 'xlsx', type: 'array' });
    // Normalize to Uint8Array for CFB compatibility (type:'array' returns ArrayBuffer)
    const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    // CFB patch: styles + freeze + data validations
    const cfb = library.CFB.read(buf, { type: 'array' });
    const stylesXml = cfbGetXml(cfb, 'Root Entry/xl/styles.xml');
    const patched = patchStylesXml(stylesXml);
    cfbSetXml(cfb, 'Root Entry/xl/styles.xml', patched.xml);
    const sheetXml = cfbGetXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml');
    cfbSetXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml', patchSheetXml(sheetXml, root.KPT.fields.Members, patched));
    const out = library.CFB.write(cfb, { fileType: 'zip', type: 'array', compression: true });
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  }
  function create(state, template, summaryRows, options) {
    const library = requireLibrary();
    const typedTable = resolveTypedTable(options);
    const book = library.utils.book_new();
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
    if (typedTable === 'Members' && template) return buildMembersTemplateBytes(state);
    const book = create(state, template, summaryRows, options);
    return library.write(book, { bookType: 'xlsx', type: 'array' });
  }
  function triggerDownload(bytes, fileName) {
    // Browser: Blob + URL + temporary anchor. Node: writeFile fallback.
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
    // Node.js fallback: write file
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
    if (typedTable === 'Members' && template) {
      const bytes = buildMembersTemplateBytes(state);
      triggerDownload(bytes, fileName);
      return bytes;
    }
    // Non-Members or non-template: original writeFile(book, name) behavior
    const book = create(state, template, summaryRows, options);
    library.writeFile(book, fileName);
    return book;
  }
  root.KPTWorkbook = { parse, create, createStyledBytes, download, TYPED_TABLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTWorkbook;
})(typeof globalThis !== 'undefined' ? globalThis : this);
