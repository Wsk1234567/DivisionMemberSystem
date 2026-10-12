(function (root) {
  'use strict';
  // Fill owner Excel templates by patching worksheet XML inside the original zip.
  // Keeps logo, styles, merges, printer settings — everything SheetJS CE would drop.

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  }
  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  function utf8Encode(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    const encoded = unescape(encodeURIComponent(text));
    const bytes = new Uint8Array(encoded.length);
    for (let index = 0; index < encoded.length; index++) bytes[index] = encoded.charCodeAt(index);
    return bytes;
  }
  function utf8Decode(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
    let binary = '';
    for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index]);
    return decodeURIComponent(escape(binary));
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open Excel templates.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function deflateRaw(bytes) {
    if (typeof CompressionStream === 'undefined') throw new Error('This browser cannot package Excel files.');
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function u16(view, offset) { return view.getUint16(offset, true); }
  function u32(view, offset) { return view.getUint32(offset, true); }

  async function readZip(arrayBuffer) {
    const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let index = bytes.length - 22; index >= 0; index--) {
      if (u32(view, index) === 0x06054b50) { end = index; break; }
    }
    if (end < 0) throw new Error('Template package is damaged.');
    const count = u16(view, end + 10);
    let offset = u32(view, end + 16);
    const files = new Map();
    for (let index = 0; index < count; index++) {
      if (u32(view, offset) !== 0x02014b50) throw new Error('Template package index is damaged.');
      const method = u16(view, offset + 10);
      const compressedSize = u32(view, offset + 20);
      const nameLength = u16(view, offset + 28);
      const extraLength = u16(view, offset + 30);
      const commentLength = u16(view, offset + 32);
      const localOffset = u32(view, offset + 42);
      const name = utf8Decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      const localNameLength = u16(view, localOffset + 26);
      const localExtraLength = u16(view, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const raw = bytes.subarray(dataStart, dataStart + compressedSize);
      files.set(name, { method, raw: raw.slice() });
      offset += 46 + nameLength + extraLength + commentLength;
    }
    const out = new Map();
    for (const [name, entry] of files) {
      out.set(name, entry.method === 0 ? entry.raw : await inflateRaw(entry.raw));
    }
    return out;
  }

  async function writeZip(fileMap) {
    const chunks = [];
    const central = [];
    let offset = 0;
    const push = bytes => { chunks.push(bytes); offset += bytes.length; };
    for (const [name, data] of fileMap) {
      const nameBytes = utf8Encode(name);
      const compressed = await deflateRaw(data);
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0, true);
      localView.setUint16(8, 8, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, compressed.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      const localOffset = offset;
      push(local);
      push(compressed);
      const centralEntry = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralEntry.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0, true);
      centralView.setUint16(10, 8, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, compressed.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint32(42, localOffset, true);
      centralEntry.set(nameBytes, 46);
      central.push(centralEntry);
    }
    const centralStart = offset;
    central.forEach(entry => push(entry));
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, fileMap.size, true);
    endView.setUint16(10, fileMap.size, true);
    endView.setUint32(12, central.reduce((sum, entry) => sum + entry.length, 0), true);
    endView.setUint32(16, centralStart, true);
    push(end);
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let cursor = 0;
    chunks.forEach(chunk => { output.set(chunk, cursor); cursor += chunk.length; });
    return output;
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[index]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function escapeXml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\t/g, '&#9;')
      .replace(/\n/g, '&#10;')
      .replace(/\r/g, '&#13;');
  }

  function styleAttr(attrs) {
    const match = /\bs="(\d+)"/.exec(attrs || '');
    return match ? ' s="' + match[1] + '"' : '';
  }

  function setSheetCell(xml, address, payload) {
    // payload: { type: 'inlineStr'|'n'|'empty', value }
    const selfClose = new RegExp('<c\\s+r="' + address + '"([^>]*)/>');
    const openClose = new RegExp('<c\\s+r="' + address + '"([^>]*)>([\\s\\S]*?)</c>');
    let style = '';
    const selfMatch = selfClose.exec(xml);
    const openMatch = openClose.exec(xml);
    if (selfMatch) style = styleAttr(selfMatch[1]);
    else if (openMatch) style = styleAttr(openMatch[1]);
    let replacement;
    if (payload.type === 'empty') replacement = '<c r="' + address + '"' + style + '/>';
    else if (payload.type === 'inlineStr') replacement = '<c r="' + address + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + escapeXml(payload.value) + '</t></is></c>';
    else replacement = '<c r="' + address + '"' + style + '><v>' + escapeXml(payload.value) + '</v></c>';
    if (selfMatch) return xml.replace(selfClose, replacement);
    if (openMatch) return xml.replace(openClose, replacement);
    // Cell missing — insert into its row if possible
    const rowMatch = new RegExp('(<row\\s+r="' + Number(address.match(/\d+/)[0]) + '"[^>]*>)').exec(xml);
    if (rowMatch) {
      return xml.replace(rowMatch[1], rowMatch[1] + replacement);
    }
    throw new Error('Cannot locate cell ' + address + ' in template.');
  }

  function setFormulaCachedValue(xml, address, value) {
    const re = new RegExp('(<c\\s+r="' + address + '"[^>]*>)([\\s\\S]*?)(</c>)');
    const match = re.exec(xml);
    if (!match) return xml;
    let body = match[2];
    const replacement = '<v>' + escapeXml(value) + '</v>';
    if (/<v\s*\/>/.test(body)) body = body.replace(/<v\s*\/>/, replacement);
    else if (/<v>[\s\S]*?<\/v>/.test(body)) body = body.replace(/<v>[\s\S]*?<\/v>/, replacement);
    else if (/<f[\s>]/.test(body)) body = body.replace(/<\/f>/, '</f>' + replacement);
    return xml.replace(re, match[1] + body + match[3]);
  }

  function setFormulaCell(xml, address, formula, value) {
    const re = new RegExp('<c\\s+r="' + address + '"([^>]*)(?:/>|>[\\s\\S]*?</c>)');
    const match = re.exec(xml);
    const style = match ? styleAttr(match[1]) : '';
    const replacement = '<c r="' + address + '"' + style + '><f>' + escapeXml(formula) + '</f><v>' + escapeXml(value) + '</v></c>';
    if (match) return xml.replace(re, replacement);
    return setSheetCell(xml, address, { type: 'n', value });
  }

  function pad(value) { return String(value).padStart(2, '0'); }
  function formatDate(value) {
    if (value === '' || value == null) return '';
    const textValue = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(textValue)) {
      const [y, m, d] = textValue.split('-');
      return pad(d) + '-' + pad(m) + '-' + y;
    }
    const parsed = new Date(textValue);
    if (Number.isNaN(parsed.getTime())) return textValue;
    return pad(parsed.getDate()) + '-' + pad(parsed.getMonth() + 1) + '-' + parsed.getFullYear();
  }
  function money(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
  }
  function hasMoney(value) {
    return value !== '' && value != null && Number.isFinite(Number(value));
  }
  function text(value) { return String(value == null ? '' : value); }

  function requireTemplates() {
    if (!root.KPTFinanceTemplates) throw new Error('Finance Excel templates are unavailable. Reload the page.');
    return root.KPTFinanceTemplates;
  }

  function findSheetPath(files) {
    const rels = utf8Decode(files.get('xl/_rels/workbook.xml.rels') || new Uint8Array());
    const match = /Target="([^"]*worksheets\/sheet1\.xml)"/.exec(rels) || /Target="([^"]*sheet1\.xml)"/.exec(rels);
    if (match) {
      const target = match[1].replace(/\\/g, '/');
      if (target.startsWith('worksheets/')) return 'xl/' + target;
      if (target.startsWith('xl/')) return target.replace(/^xl\//, 'xl/').replace(/\/\.\//g, '/');
      const name = target.split('/').pop();
      return 'xl/worksheets/' + name;
    }
    return 'xl/worksheets/sheet1.xml';
  }

  function prepareFiles(files) {
    // Leave package structure alone (calcChain, rels) so Excel does not need to repair.
  }

  async function loadTemplateFiles(key) {
    const templates = requireTemplates();
    return readZip(base64ToBytes(templates[key]));
  }

  async function createReimbursementForm(form) {
    const files = await loadTemplateFiles('reimbursement');
    prepareFiles(files);
    const sheetPath = findSheetPath(files);
    let xml = utf8Decode(files.get(sheetPath));
    xml = setSheetCell(xml, 'B9', { type: 'inlineStr', value: text(form.treasurerName) });
    xml = setSheetCell(xml, 'G9', { type: 'inlineStr', value: ' ' + formatDate(form.formDate) });
    xml = setSheetCell(xml, 'C11', { type: 'inlineStr', value: text(form.purpose) });
    for (let index = 0; index < 11; index++) {
      const excelRow = 15 + index;
      const line = (form.lines || [])[index] || {};
      xml = setSheetCell(xml, 'A' + excelRow, { type: 'n', value: index + 1 });
      xml = setSheetCell(xml, 'B' + excelRow, line.date ? { type: 'inlineStr', value: formatDate(line.date) } : { type: 'empty' });
      xml = setSheetCell(xml, 'D' + excelRow, line.invoiceNo ? { type: 'inlineStr', value: text(line.invoiceNo) } : { type: 'empty' });
      xml = setSheetCell(xml, 'E' + excelRow, line.particular ? { type: 'inlineStr', value: text(line.particular) } : { type: 'empty' });
      xml = setSheetCell(xml, 'G' + excelRow, hasMoney(line.total) ? { type: 'n', value: money(line.total) } : { type: 'empty' });
    }
    const total = (form.lines || []).reduce((sum, line) => sum + money(line.total), 0);
    xml = setFormulaCachedValue(xml, 'G26', total);
    xml = setSheetCell(xml, 'B29', form.chequeNo ? { type: 'inlineStr', value: text(form.chequeNo) } : { type: 'empty' });
    // Owner asked not to auto-fill the Amount cell under Cheque No.
    xml = setSheetCell(xml, 'B30', { type: 'empty' });
    xml = setFormulaCachedValue(xml, 'A37', text(form.treasurerName));
    files.set(sheetPath, utf8Encode(xml));
    return writeZip(files);
  }

  function clearIeDataCells(xml) {
    // Only replace values in data rows 4-21. Keep total/balance formulas in 22-23.
    for (let row = 4; row <= 21; row++) {
      for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
        const address = col + row;
        if (xml.indexOf('r="' + address + '"') >= 0) {
          try { xml = setSheetCell(xml, address, { type: 'empty' }); } catch (error) { /* optional */ }
        }
      }
    }
    return xml;
  }

  async function createIncomeExpenses(payload) {
    const files = await loadTemplateFiles('incomeExpenses');
    prepareFiles(files);
    const sheetPath = findSheetPath(files);
    let xml = utf8Decode(files.get(sheetPath));
    xml = clearIeDataCells(xml);
    xml = setSheetCell(xml, 'A1', { type: 'inlineStr', value: 'Income and Expenses of ' + text(payload.activityName) });

    const incomes = (payload.incomes || []).filter(row => row && (row.date || row.description || hasMoney(row.amount)));
    const expenses = (payload.expenses || []).filter(row => row && (row.date || row.item || row.description || hasMoney(row.amount)));
    const maxRows = 18; // template body rows 4-21
    const height = Math.min(Math.max(incomes.length, expenses.length), maxRows);
    let previousItem = '';
    for (let index = 0; index < height; index++) {
      const row = 4 + index;
      const income = incomes[index] || {};
      const expense = expenses[index] || {};
      xml = setSheetCell(xml, 'A' + row, income.date ? { type: 'inlineStr', value: formatDate(income.date) } : { type: 'empty' });
      xml = setSheetCell(xml, 'B' + row, income.item ? { type: 'inlineStr', value: text(income.item) } : { type: 'empty' });
      xml = setSheetCell(xml, 'C' + row, income.description ? { type: 'inlineStr', value: text(income.description) } : { type: 'empty' });
      xml = setSheetCell(xml, 'D' + row, hasMoney(income.amount) ? { type: 'n', value: money(income.amount) } : { type: 'empty' });
      xml = setSheetCell(xml, 'E' + row, expense.date ? { type: 'inlineStr', value: formatDate(expense.date) } : { type: 'empty' });
      const item = text(expense.item);
      const itemValue = item || (previousItem && (expense.date || expense.description || hasMoney(expense.amount)) ? previousItem : '');
      if (item) previousItem = item;
      xml = setSheetCell(xml, 'F' + row, itemValue ? { type: 'inlineStr', value: itemValue } : { type: 'empty' });
      xml = setSheetCell(xml, 'G' + row, expense.description ? { type: 'inlineStr', value: text(expense.description) } : { type: 'empty' });
      xml = setSheetCell(xml, 'H' + row, text(expense.quantity) ? { type: 'inlineStr', value: text(expense.quantity) } : { type: 'empty' });
      xml = setSheetCell(xml, 'I' + row, text(expense.unitCost) ? { type: 'inlineStr', value: text(expense.unitCost) } : { type: 'empty' });
      xml = setSheetCell(xml, 'J' + row, hasMoney(expense.amount) ? { type: 'n', value: money(expense.amount) } : { type: 'empty' });
    }

    const incomeTotal = incomes.slice(0, maxRows).reduce((sum, row) => sum + money(row.amount), 0);
    const expenseTotal = expenses.slice(0, maxRows).reduce((sum, row) => sum + money(row.amount), 0);
    const balance = Math.round((incomeTotal - expenseTotal) * 100) / 100;
    // Labels/Total/Balance stay as in the owner template; only refresh cached formula values.
    xml = setFormulaCachedValue(xml, 'D22', incomeTotal);
    xml = setSheetCell(xml, 'J22', { type: 'n', value: expenseTotal });
    xml = setFormulaCachedValue(xml, 'D23', balance);
    files.set(sheetPath, utf8Encode(xml));
    return writeZip(files);
  }

  function downloadBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function safeName(value, fallback) {
    const cleaned = text(value).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60);
    return cleaned || fallback;
  }

  async function downloadReimbursement(form, activityName) {
    const bytes = await createReimbursementForm(form);
    downloadBytes(bytes, safeName((form.purpose || activityName) + '-Reimbursement-Form-' + (form.formSeq || 1), 'Reimbursement') + '.xlsx');
  }

  async function downloadIncomeExpenses(payload) {
    const bytes = await createIncomeExpenses(payload);
    downloadBytes(bytes, safeName(payload.activityName, 'Activity') + '-Income-and-Expenses.xlsx');
  }

  root.KPTFinanceWorkbook = {
    createReimbursementForm,
    createIncomeExpenses,
    downloadReimbursement,
    downloadIncomeExpenses,
    formatDate,
    money,
    readZip,
    writeZip
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTFinanceWorkbook;
})(typeof globalThis !== 'undefined' ? globalThis : this);
