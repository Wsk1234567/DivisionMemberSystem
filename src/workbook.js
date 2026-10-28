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
  // --- V2 Members import contract ---
  const V2_TITLE = 'TCCD 会员资料导入表 · 新会员';
  const V2_HEADERS = ['姓名 *', 'SJAM 会员编号', '身份证号码', '种族', '年级', '加入日期', '会员状态'];
  const V2_FIELD_MAP = ['name', 'sjamId', 'ic', 'race', 'form', 'joined', 'status'];
  const V2_STATUS_MAP = { '在籍': 'Active', '已毕业': 'Graduated', '已退出': 'Withdrawn', 'Active': 'Active', 'Graduated': 'Graduated', 'Withdrawn': 'Withdrawn' };
  const V2_DATA_START = 13; // row index 12 (0-based), Excel row 13
  const V2_PREFORMAT_END = 212; // Excel row 212 (0-based 211)
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
      // V2 detection: exact A1 title + row 12 exact headers
      if (name === 'Members') {
        const a1 = sheet[library.utils.encode_cell({ r: 0, c: 0 })];
        const a1v = a1 ? String(a1.v || '').trim() : '';
        if (a1v === V2_TITLE) {
          // Verify row 12 headers
          const row12 = [];
          for (let col = 0; col < V2_HEADERS.length; col++) {
            const cell = sheet[library.utils.encode_cell({ r: 11, c: col })];
            row12.push(String(cell && cell.v || '').trim());
          }
          const headersMatch = V2_HEADERS.every((h, i) => row12[i] === h && !sheet[library.utils.encode_cell({ r: 11, c: i })]?.f)
            && !Array.from({ length: Math.max(0, range.e.c - 6) }, (_, i) => sheet[library.utils.encode_cell({ r: 11, c: i + 7 })]).some(cell => cell && (cell.f || (cell.v !== '' && cell.v != null)));
          if (!headersMatch) {
            errors.push({ sheet: 'Members', row: 12, message: 'Column headers in row 12 must match the template exactly. Do not modify row 12 headers.' });
            return;
          }
          // V2 parse: rows 13+ only
          output.Members = [];
          for (let rowIndex = 12; rowIndex <= range.e.r; rowIndex++) {
            const row = {};
            let hasValue = false;
            let extraCols = false;
            for (let col = 0; col < V2_FIELD_MAP.length; col++) {
              const cell = sheet[library.utils.encode_cell({ r: rowIndex, c: col })];
              let value = cell ? cell.v : '';
              if (value !== '' && value != null) hasValue = true;
              if (cell && cell.f) errors.push({ sheet: 'Members', row: rowIndex + 1, message: V2_HEADERS[col] + ': formulas are not accepted; paste values.' });
              if (['ic', 'sjamId'].includes(V2_FIELD_MAP[col]) && typeof value === 'number') errors.push({ sheet: 'Members', row: rowIndex + 1, message: V2_HEADERS[col] + ': must be text to preserve leading zeros.' });
              if (V2_FIELD_MAP[col] === 'joined' && typeof value === 'number') {
                const parsed = library.SSF.parse_date_code(value);
                value = parsed ? parsed.y + '-' + String(parsed.m).padStart(2, '0') + '-' + String(parsed.d).padStart(2, '0') : '';
              }
              // Status Chinese conversion
              if (V2_FIELD_MAP[col] === 'status' && value) {
                const sv = String(value).trim();
                value = Object.prototype.hasOwnProperty.call(V2_STATUS_MAP, sv) ? V2_STATUS_MAP[sv] : sv;
              }
              row[V2_FIELD_MAP[col]] = value == null ? '' : value;
            }
            // Reject extra populated columns beyond G
            for (let col = V2_FIELD_MAP.length; col <= range.e.c; col++) {
              const cell = sheet[library.utils.encode_cell({ r: rowIndex, c: col })];
              if (cell && (cell.f || (cell.v !== '' && cell.v != null))) extraCols = true;
            }
            if (extraCols) {
              errors.push({ sheet: 'Members', row: rowIndex + 1, message: 'Extra columns beyond G are not allowed. Only fill columns A to G.' });
              continue;
            }
            if (hasValue) {
              row.id = '';
              row.version = '';
              if (!row.status) row.status = ''; // domain default Active applied at importRows
              row.__excelRow = rowIndex + 1;
              output.Members.push(row);
              count++;
            }
          }
          if (!output.Members.length) {
            errors.push({ sheet: 'Members', row: V2_DATA_START, message: 'No data rows found. Enter member data starting from row 13.' });
          }
          return;
        }
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
  function buildV2SheetAoa() {
    // Each guide row must have all 7 cells (A:G) so merge styling works on the full bar
    const full = (...cells) => {
      const row = cells.slice(0, 7);
      while (row.length < 7) row.push('');
      return row;
    };
    const rows = [];
    rows[0] = full(V2_TITLE); // row 1
    rows[1] = full('填写指南 · 新会员导入只需填写正式填写区，示范区仅供参考'); // row 2
    rows[2] = full('1. 姓名必填，请填写正式全名。SJAM 会员编号、身份证号码等为选填。'); // row 3
    rows[3] = full('2. SJAM 会员编号和身份证号码请设为文本格式，保留前导零。加入日期格式：YYYY-MM-DD。'); // row 4
    rows[4] = full('3. 种族、年级、会员状态请从下拉列表选择。新会员状态可留空，系统自动设为在籍。'); // row 5
    rows[5] = full('4. 请勿修改第 12 行表头。示范区（第 7-9 行）仅供参考，不会被导入。正式数据从第 13 行开始填写。'); // row 6
    rows[6] = full('示范区 · 仅供参考，不会导入'); // row 7
    rows[7] = full(...V2_HEADERS); // row 8 example headers
    rows[8] = full('示例学员甲', '00001234', '', 'Cina', 'Form 1', '2026-01-15', '在籍'); // row 9
    rows[9] = full(''); // row 10 spacer
    rows[10] = full('正式填写区 · 从第 13 行开始，每人一行'); // row 11
    rows[11] = full(...V2_HEADERS); // row 12 formal headers
    for (let i = 12; i < V2_PREFORMAT_END; i++) rows[i] = full('', '', '', '', '', '', '');
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
      '<xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 5 example header
      '<xf numFmtId="0" fontId="6" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' + // 6 example data
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + // 7 spacer
      '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' + // 8 formal section
      '<xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 9 required header A
      '<xf numFmtId="0" fontId="5" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 10 optional header B-G
      '<xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' + // 11 data white
      '<xf numFmtId="0" fontId="6" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' + // 12 data pale blue
      '<xf numFmtId="49" fontId="6" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' + // 13 text even
      '<xf numFmtId="49" fontId="6" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>'; // 14 text odd
    let xml = existingXml;
    xml = xml.replace(/<fonts count="\d+">[\s\S]*?<\/fonts>/, '<fonts count="7">' + fonts + '</fonts>');
    xml = xml.replace(/<fills count="\d+">[\s\S]*?<\/fills>/, '<fills count="8">' + fills + '</fills>');
    xml = xml.replace(/<borders count="\d+">[\s\S]*?<\/borders>/, '<borders count="2">' + borders + '</borders>');
    xml = xml.replace(/<cellXfs count="\d+">[\s\S]*?<\/cellXfs>/, '<cellXfs count="15">' + xfs + '</cellXfs>');
    return xml;
  }
  function buildV2SheetXml(existingXml) {
    let xml = existingXml;
    // Gridlines off
    xml = xml.replace(/<sheetView([^>]*?)\/>/, '<sheetView$1 showGridLines="0"><pane ySplit="12" topLeftCell="A13" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A13" sqref="A13"/></sheetView>');
    if (!xml.includes('state="frozen"')) {
      xml = xml.replace(/<sheetView([^>]*?)><\/sheetView>/, '<sheetView$1 showGridLines="0"><pane ySplit="12" topLeftCell="A13" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A13" sqref="A13"/></sheetView>');
    }
    // Merges for title (A1:G1), subtitle (A2:G2), instructions (A3:G3..A6:G6), example label (A7:G7), spacer (A10:G10), formal section (A11:G11)
    const merges = '<mergeCells count="8">' +
      '<mergeCell ref="A1:G1"/>' +
      '<mergeCell ref="A2:G2"/>' +
      '<mergeCell ref="A3:G3"/>' +
      '<mergeCell ref="A4:G4"/>' +
      '<mergeCell ref="A5:G5"/>' +
      '<mergeCell ref="A6:G6"/>' +
      '<mergeCell ref="A7:G7"/>' +
      '<mergeCell ref="A11:G11"/>' +
      '</mergeCells>';
    if (!xml.includes('<mergeCells')) {
      if (/<autoFilter\b[^>]*\/>/.test(xml)) xml = xml.replace(/<autoFilter\b[^>]*\/>/, match => match + merges);
      else if (xml.includes('</autoFilter>')) xml = xml.replace('</autoFilter>', '</autoFilter>' + merges);
      else xml = xml.replace('</sheetData>', '</sheetData>' + merges);
    }
    // Data validations: D=col3 (race), E=col4 (form), G=col6 (status Chinese)
    const validations =
      '<dataValidations count="3">' +
      '<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="D13:D212"><formula1>"Melayu,India,Cina,Other"</formula1></dataValidation>' +
      '<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="E13:E212"><formula1>"Peralihan,Form 1,Form 2,Form 3,Form 4,Form 5,Adult"</formula1></dataValidation>' +
      '<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="G13:G212"><formula1>"在籍,已毕业,已退出"</formula1></dataValidation>' +
      '</dataValidations>';
    if (!xml.includes('<dataValidations')) {
      if (xml.includes('</mergeCells>')) {
        xml = xml.replace('</mergeCells>', '</mergeCells>' + validations);
      } else if (xml.includes('</autoFilter>')) {
        xml = xml.replace('</autoFilter>', '</autoFilter>' + validations);
      } else if (xml.includes('<ignoredErrors')) {
        xml = xml.replace('<ignoredErrors', validations + '<ignoredErrors');
      } else if (xml.includes('<legacyDrawing')) {
        xml = xml.replace('<legacyDrawing', validations + '<legacyDrawing');
      } else {
        xml = xml.replace('</mergeCells>', '</mergeCells>' + validations);
      }
    }
    return xml;
  }
  function buildV2TemplateBytes() {
    const library = requireLibrary();
    const aoa = buildV2SheetAoa();
    const sheet = library.utils.aoa_to_sheet(aoa);
    // Column widths
    sheet['!cols'] = [
      { wch: 18 }, // A name
      { wch: 16 }, // B sjamId
      { wch: 16 }, // C ic
      { wch: 10 }, // D race
      { wch: 10 }, // E form
      { wch: 12 }, // F joined
      { wch: 10 }  // G status
    ];
    // Emit all cells so merged panels and blank entry cells have full fills/borders.
    for (let r = 0; r < V2_PREFORMAT_END; r++) {
      for (let c = 0; c < 7; c++) {
        const address = library.utils.encode_cell({ r, c });
        if (!sheet[address]) sheet[address] = { t: 's', v: '' };
      }
    }
    // Row heights
    const rows = [];
    rows[0] = { hpt: 36 }; // title
    rows[1] = { hpt: 22 }; // subtitle
    for (let i = 2; i <= 5; i++) rows[i] = { hpt: 30 }; // instructions
    rows[6] = { hpt: 22 }; // example label
    rows[7] = { hpt: 20 }; // example headers
    rows[8] = { hpt: 18 }; // example data
    rows[9] = { hpt: 10 }; // spacer
    rows[10] = { hpt: 24 }; // formal section
    rows[11] = { hpt: 22 }; // formal headers
    for (let i = 12; i < V2_PREFORMAT_END; i++) rows[i] = { hpt: 18 };
    sheet['!rows'] = rows;
    // Autofilter on formal headers (row 12) through preformatted end
    sheet['!autofilter'] = { ref: 'A12:G212' };
    // Ref range
    sheet['!ref'] = library.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: V2_PREFORMAT_END - 1, c: 6 } });
    // Text format for SJAM (B) and IC (C) data rows
    for (let r = 12; r < V2_PREFORMAT_END; r++) {
      ['B', 'C'].forEach(col => {
        const addr = col + (r + 1);
        if (!sheet[addr]) sheet[addr] = { t: 's', v: '', z: '@' };
        else sheet[addr].z = '@';
      });
    }
    const book = library.utils.book_new();
    library.utils.book_append_sheet(book, sheet, 'Members');
    return book;
  }
  function buildV2StyledBytes() {
    const library = requireLibrary();
    const book = buildV2TemplateBytes();
    const raw = library.write(book, { bookType: 'xlsx', type: 'array' });
    const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const cfb = library.CFB.read(buf, { type: 'array' });
    // Patch styles
    const stylesXml = cfbGetXml(cfb, 'Root Entry/xl/styles.xml');
    cfbSetXml(cfb, 'Root Entry/xl/styles.xml', buildV2StylesXml(stylesXml));
    // Patch sheet: merges, validations, freeze, gridlines
    const sheetXml = cfbGetXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml');
    cfbSetXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml', buildV2SheetXml(sheetXml));
    // Every emitted cell receives one style reference, replacing SheetJS's text style.
    const finalSheet = cfbGetXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml').replace(/<c\b([^>]*)>/g, (tag, attrs) => {
      const match = attrs.match(/\br="([A-G])(\d+)"/);
      if (!match) return tag;
      const col = match[1];
      const row = Number(match[2]);
      let style = 0;
      if (row === 1) style = 1;
      else if (row === 2) style = 2;
      else if (row <= 6) style = 3;
      else if (row === 7) style = 4;
      else if (row === 8) style = 5;
      else if (row === 9) style = 6;
      else if (row === 11) style = 8;
      else if (row === 12) style = col === 'A' ? 9 : 10;
      else if (row >= 13) style = ['B', 'C'].includes(col) ? ((row - 13) % 2 ? 14 : 13) : ((row - 13) % 2 ? 12 : 11);
      return '<c' + attrs.replace(/\s+s="[^"]*"/g, '').replace(/\/$/, '') + ' s="' + style + '"' + (attrs.endsWith('/') ? '/>' : '>');
    });
    cfbSetXml(cfb, 'Root Entry/xl/worksheets/sheet1.xml', finalSheet);
    const out = library.CFB.write(cfb, { fileType: 'zip', type: 'array', compression: true });
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  }
  function create(state, template, summaryRows, options) {
    const library = requireLibrary();
    const typedTable = resolveTypedTable(options);
    const book = library.utils.book_new();
    if (typedTable === 'Members' && template) {
      // V2 template
      return buildV2TemplateBytes();
    }
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
    if (typedTable === 'Members' && template) return buildV2StyledBytes();
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
    if (typedTable === 'Members' && template) {
      const bytes = buildV2StyledBytes();
      triggerDownload(bytes, fileName);
      return bytes;
    }
    const book = create(state, template, summaryRows, options);
    library.writeFile(book, fileName);
    return book;
  }
  root.KPTWorkbook = { parse, create, createStyledBytes, download, TYPED_TABLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTWorkbook;
})(typeof globalThis !== 'undefined' ? globalThis : this);
