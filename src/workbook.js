(function (root) {
  'use strict';
  function requireLibrary() { if (!root.XLSX) throw new Error('Excel library is unavailable. Reload the page.'); return root.XLSX; }
  function parse(buffer) {
    const library = requireLibrary();
    const book = library.read(buffer, { type: 'array', cellDates: false });
    const output = {};
    const errors = [];
    let count = 0;
    book.SheetNames.forEach(name => {
      if (['Instructions', 'Meta', 'Summary'].includes(name)) return;
      const allowed = root.KPT.fields[name];
      if (!allowed) { errors.push({ sheet: name, row: 1, message: 'Unknown sheet. Use the downloaded template.' }); return; }
      const sheet = book.Sheets[name];
      if (!sheet['!ref']) return;
      const range = library.utils.decode_range(sheet['!ref']);
      if (range.e.r > 100000 || range.e.c > 30) { errors.push({ sheet: name, row: 1, message: 'Sheet is too large.' }); return; }
      const headers = [];
      for (let column = 0; column <= range.e.c; column++) {
        const cell = sheet[library.utils.encode_cell({ r: 0, c: column })];
        headers.push(String(cell && cell.v || '').trim());
      }
      if (headers.length !== allowed.length || new Set(headers).size !== headers.length || headers.some(header => !allowed.includes(header))) { errors.push({ sheet: name, row: 1, message: 'Headers must match the template; their order may change.' }); return; }
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
    });
    if (!count && !errors.length) errors.push({ sheet: 'Workbook', row: 1, message: 'No records found.' });
    if (count > 100000) errors.push({ sheet: 'Workbook', row: 1, message: 'Use smaller imports (maximum 100,000 records).' });
    return { workbook: output, errors };
  }
  function create(state, template, summaryRows) {
    const library = requireLibrary();
    const book = library.utils.book_new();
    const instructions = [['TCCD Excel import template'], ['Use exact sheet names and column headers. Header order may change.'], ['Phase 1 member import: enter name and SJAM ID only. SJAM ID may be blank.'], ['For new members, leave id, version and status blank. The system creates IDs and uses Active status.'], ['Keep id and version unchanged when editing exported records.'], ['IC, SJAM ID and certificate numbers must be text.'], ['Dates: YYYY-MM-DD. Activity tags: DIM|Inspection|Exam|Other.'], ['TRUE/FALSE fields: present, attended, archived.'], ['Other sheets may remain empty. Missing rows are never deleted.'], ['Import preview is required. A stale version must be re-exported.'], ['New students receive an internal ID after saving. Export them before adding related records.'], ['Linked examinations must match the activity date, type and attendance.'], ['An activity tagged Exam creates Pending/Absent exam records when attendance is saved.']];
    library.utils.book_append_sheet(book, library.utils.aoa_to_sheet(instructions), 'Instructions');
    root.KPT.tables.forEach(table => {
      const headers = root.KPT.fields[table];
      const records = template ? table === 'Catalog' ? root.KPT.empty().Catalog : [] : state[table];
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
  function download(state, template, summaryRows) {
    const library = requireLibrary();
    library.writeFile(create(state, template, summaryRows), template ? 'TCCD_Import_Template.xlsx' : 'TCCD_Export_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }
  root.KPTWorkbook = { parse, create, download };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTWorkbook;
})(typeof globalThis !== 'undefined' ? globalThis : this);
