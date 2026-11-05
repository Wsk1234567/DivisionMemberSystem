(function (root) {
  'use strict';
  // Service Stripe & Star PDF generator using original official form templates.
  // Coordinates measured via pdfplumber from actual forms (top-based baseline).
  // pdf-lib uses bottom-left origin: y_lib = A4_H - y_top_baseline.

  let templates = null;
  try { templates = root.SERVICE_PDF_TEMPLATES; } catch (e) {}
  if (!templates && typeof require !== 'undefined') {
    try { templates = require('./service-pdf-templates.json'); } catch (e) {}
  }

  function getLib() {
    if (root.PDFLib) return root.PDFLib;
    throw new Error('pdf-lib is not loaded.');
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function safeText(str) {
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) > 127) throw new Error('Non-Latin character「' + s[i] + '」not supported in official forms. Please use Roman letters.');
    }
    return s;
  }

  function blockLetters(str) {
    return safeText(str).toUpperCase();
  }

  const A4_H = 841.68;

  // Star form field positions (top-based baseline from pdfplumber, text moved up 3pt to clear dashed lines)
  const STAR_POS = {
    name:       { x: 147, yTop: 231 },
    nric:       { x: 145, yTop: 256 },
    sjamId:     { x: 337, yTop: 256, maxWidth: 62 },
    division:   { x: 147, yTop: 282, maxWidth: 392, yTop2: 307 },
    rank:       { x: 147, yTop: 332 },
    joinedDay:  { x: 444, yTop: 332 },
    joinedMon:  { x: 479, yTop: 332 },
    joinedYear: { x: 514, yTop: 332 },
    phone:      { x: 176, yTop: 358, maxWidth: 150 },
    email:      { x: 371, yTop: 358, maxWidth: 171 },
    occupation: { x: 147, yTop: 383 },
    certRef:    { x: 396, yTop: 424, maxWidth: 65 }, // no dashed line, keep
    genderMale:   { x: 448, yTop: 252 },
    genderFemale: { x: 491, yTop: 252 },
    officerName:  { x: 132, yTop: 739 },
    officerDiv:   { x: 132, yTop: 752 },
    officerDate:  { x: 132, yTop: 765 }
  };

  // Stripe form positions (same layout as Star, text moved up 3pt)
  const STRIPE_POS = {
    name:       { x: 147, yTop: 231 },
    nric:       { x: 145, yTop: 256 },
    sjamId:     { x: 337, yTop: 256, maxWidth: 62 },
    division:   { x: 147, yTop: 282, maxWidth: 392, yTop2: 307 },
    rank:       { x: 147, yTop: 332 },
    joinedDay:  { x: 444, yTop: 332 },
    joinedMon:  { x: 479, yTop: 332 },
    joinedYear: { x: 514, yTop: 332 },
    phone:      { x: 176, yTop: 358, maxWidth: 150 },
    email:      { x: 371, yTop: 358, maxWidth: 171 },
    occupation: { x: 147, yTop: 383 },
    certRef:    { x: 396, yTop: 424, maxWidth: 65 },
    genderMale:   { x: 448, yTop: 252 },
    genderFemale: { x: 491, yTop: 252 },
    officerName:  { x: 132, yTop: 739 },
    officerDiv:   { x: 132, yTop: 752 },
    officerDate:  { x: 132, yTop: 765 }
  };

  // Checklist positions (top-based baseline from pdfplumber)
  // Bottom officer area: original printed Name top602.9, Division616.8, Date630.6 → fill baseline ~612/626/640 at x147
  const CHECK_POS = {
    date:     { x: 440, yTop: 245 },
    yes:      { x: 368 },
    no:       { x: 402 },
    comment:  { x: 439, maxWidth: 97 },
    rows: [
      { yTop: 306, label: 'Covering Letter' },
      { yTop: 329, label: 'Support Document' },
      { yTop: 351, label: 'Application Forms' },
      { yTop: 374, label: 'Duty Book' },
      { yTop: 396, label: 'Duty Details (Front)' },
      { yTop: 416, label: 'Type & Hours' },
      { yTop: 438, label: 'Approved/Signed' },
      { yTop: 460, label: 'Total Hours' }
    ],
    // Bottom officer: next to printed Name/Division/Date labels
    officerName:  { x: 147, yTop: 612 },
    officerDiv:   { x: 147, yTop: 626 },
    officerDate:  { x: 147, yTop: 640 }
  };

  function yLib(yTop) { return A4_H - yTop; }

  // Parse joined date into day/month/year parts
  function parseJoined(joined) {
    const s = safeText(joined);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return { day: m[3], month: m[2], year: m[1] };
    return { day: '', month: '', year: '' };
  }

  async function fillForm(application, kind, config) {
    const PDFLib = getLib();
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const isStar = kind === 'Star';
    const key = isStar ? 'star' : 'stripe';
    const templateBase64 = config && config.templateBase64;
    const tmpl = templates && templates[key];
    if (!templateBase64 && (!tmpl || !tmpl.base64)) throw new Error('Template for ' + kind + ' not available.');
    const doc = await PDFDocument.load(b64ToBytes(templateBase64 || tmpl.base64));
    const page = doc.getPages()[0];
    if (templateBase64) {
      if (doc.getPageCount() !== 1 || Math.abs(page.getHeight() - A4_H) > 2 || Math.abs(page.getWidth() - 595.44) > 2) {
        throw new Error(kind + ' signed template must be the original single-page A4 form.');
      }
      const date = String(config.signingDate || '');
      const parsed = new Date(date + 'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
        throw new Error('Enter a valid signing date.');
      }
      const form = doc.getForm();
      form.getTextField('SigningDate').setText(date.split('-').reverse().join('/'));
      form.flatten();
    }
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const pos = isStar ? STAR_POS : STRIPE_POS;
    const app = application || {};
    const applicant = app.applicant || {};
    const division = safeText((config && config.division) || 'KAWASAN PAHANG TENGAH');
    const memberNumber = safeText((config && config.memberNumber) || '');
    const certRef = safeText((config && config.reference) || (config && config.certificateRef) || '');
    const name = blockLetters(applicant.name);
    const joined = parseJoined(applicant.joined);

    // Helper: draw text at top-based baseline position
    const draw = (p, text, fnt, size) => {
      if (!text) return;
      page.drawText(text, { x: p.x, y: yLib(p.yTop), size: size || 9, font: fnt || font, color: rgb(0, 0, 0) });
    };

    // Name (BLOCKLETTERS)
    draw(pos.name, name, bold, 9);
    // NRIC
    draw(pos.nric, safeText(applicant.ic), font, 8);
    // SJAM ID
    draw(pos.sjamId, memberNumber, font, 8);
    // Gender checkbox (Male/Female boxes)
    const gender = safeText(applicant.gender).toUpperCase();
    if (gender === 'MALE' || gender === 'M') {
      page.drawText('X', { x: pos.genderMale.x, y: yLib(pos.genderMale.yTop), size: 10, font: bold, color: rgb(0, 0, 0) });
    } else if (gender === 'FEMALE' || gender === 'F') {
      page.drawText('X', { x: pos.genderFemale.x, y: yLib(pos.genderFemale.yTop), size: 10, font: bold, color: rgb(0, 0, 0) });
    }
    // Division (allow 2 lines)
    if (division.length > 50 && pos.division.yTop2) {
      draw(pos.division, division.slice(0, 50), font, 8);
      draw({ x: pos.division.x, yTop: pos.division.yTop2 }, division.slice(50), font, 8);
    } else {
      draw(pos.division, division, font, 8);
    }
    // Rank
    draw(pos.rank, safeText(applicant.rank), font, 8);
    // Joined date split into day/month/year
    draw(pos.joinedDay, joined.day, font, 8);
    draw(pos.joinedMon, joined.month, font, 8);
    draw(pos.joinedYear, joined.year, font, 8);
    // Phone (strip leading +60 / leading 0 per form convention)
    let phone = safeText(applicant.phone).replace(/^\+60/, '').replace(/^0/, '');
    draw(pos.phone, phone, font, 8);
    // Email
    draw(pos.email, safeText(applicant.email), font, 7);
    // Occupation
    draw(pos.occupation, safeText(applicant.occupation), font, 8);
    // Certificate Reference
    draw(pos.certRef, certRef, font, 8);
    // Officer area: only fill if explicitly provided, signature stays BLANK
    draw(pos.officerName, safeText(config && config.officerName), font, 8);
    draw(pos.officerDiv, safeText(config && config.officerDivision), font, 8);
    draw(pos.officerDate, safeText(config && config.officerDate), font, 8);

    return doc.save();
  }

  async function fillChecklist(batch, applications, kind, config) {
    const PDFLib = getLib();
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const isStar = kind === 'Star';
    const key = isStar ? 'sstr01' : 'ss01';
    const tmpl = templates && templates[key];
    if (!tmpl || !tmpl.base64) throw new Error('Checklist template for ' + kind + ' not available.');
    const bytes = b64ToBytes(tmpl.base64);
    const doc = await PDFDocument.load(bytes);
    const page = doc.getPages()[0];
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    // Date
    const dateStr = safeText((config && config.date) || new Date().toISOString().slice(0, 10));
    page.drawText(dateStr, { x: CHECK_POS.date.x, y: yLib(CHECK_POS.date.yTop), size: 8, font, color: rgb(0, 0, 0) });

    // Batch-level checks (NOT per-person). Default: blank unless batch.checks provided.
    // batch.checks = { covering: 'Y'|'N'|'', support: ..., applicationForms: ..., dutyBook: ...,
    //                  dutyDetails: ..., typeHours: ..., approvedSigned: ..., totalHours: ... }
    const checks = (batch && batch.checks) || {};
    const checkKeys = ['covering', 'support', 'applicationForms', 'dutyBook', 'dutyDetails', 'typeHours', 'approvedSigned', 'totalHours'];

    CHECK_POS.rows.forEach((row, i) => {
      const key2 = checkKeys[i];
      const val = checks[key2] || '';
      const mark = val === 'Y' ? 'X' : val === 'N' ? 'X' : '';
      if (val === 'Y') {
        page.drawText('X', { x: CHECK_POS.yes.x, y: yLib(row.yTop), size: 10, font: bold, color: rgb(0, 0, 0) });
      } else if (val === 'N') {
        page.drawText('X', { x: CHECK_POS.no.x, y: yLib(row.yTop), size: 10, font: bold, color: rgb(0, 0, 0) });
      }
    });

    // Officer area
    const draw = (p, text, fnt, size) => {
      if (!text) return;
      page.drawText(text, { x: p.x, y: yLib(p.yTop), size: size || 8, font: fnt || font, color: rgb(0, 0, 0) });
    };
    // Officer area: only fill if explicitly provided, signature stays BLANK
    draw(CHECK_POS.officerName, safeText(config && config.officerName), font);
    draw(CHECK_POS.officerDiv, safeText(config && config.officerDivision), font);
    draw(CHECK_POS.officerDate, safeText(config && config.officerDate), font);

    return doc.save();
  }

  async function mergeDocuments(items) {
    const PDFLib = getLib();
    const { PDFDocument } = PDFLib;
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('mergeDocuments: at least one PDF is required. Received empty list.');
    }
    const merged = await PDFDocument.create();
    for (const item of items) {
      const label = (item && item.filename) || (item && item.fileName) || 'unknown file';
      if (!item || !item.bytes) {
        throw new Error('mergeDocuments: missing PDF bytes for「' + label + '」.');
      }
      let src;
      try {
        src = await PDFDocument.load(item.bytes);
      } catch (e) {
        throw new Error('mergeDocuments: cannot open PDF「' + label + '」. File may be corrupted: ' + (e && e.message || e));
      }
      const pageCount = src.getPageCount();
      if (pageCount === 0) {
        throw new Error('mergeDocuments: PDF「' + label + '」has zero pages.');
      }
      try {
        const pages = await merged.copyPages(src, src.getPageIndices());
        for (const p of pages) merged.addPage(p);
      } catch (e) {
        throw new Error('mergeDocuments: failed to copy pages from「' + label + '」: ' + (e && e.message || e));
      }
    }
    return merged.save();
  }

  async function generateSigned(application, kind, config) {
    if (!['Stripe', 'Star'].includes(kind) || !config || !config.templateBase64) {
      throw new Error('Private signed application template is missing.');
    }
    return fillForm(application, kind, config);
  }

  async function download(application, kind, config) {
    const bytes = await fillForm(application, kind, config);
    const formCode = kind === 'Star' ? 'SSTR-02' : 'SS-02';
    const fileName = formCode + '_Service_Application.pdf';
    if (typeof Blob !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    return bytes;
  }

  async function downloadChecklist(batch, applications, kind, config) {
    const bytes = await fillChecklist(batch, applications, kind, config);
    const formCode = kind === 'Star' ? 'SSTR-01' : 'SS-01';
    const fileName = formCode + '_Service_Checklist.pdf';
    if (config && config.download === false) return bytes;
    if (typeof Blob !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    return bytes;
  }

  async function mergeAndDownload(items, fileName) {
    const bytes = await mergeDocuments(items);
    if (typeof Blob !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName || 'Merged_Service_Documents.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    return bytes;
  }

  function zipFiles(fileMap) {
    const XLSX = root.XLSX;
    if (!XLSX || !XLSX.CFB) throw new Error('XLSX.CFB not available for ZIP packaging.');
    const cfb = XLSX.CFB.utils.cfb_new();
    for (const [name, bytes] of Object.entries(fileMap)) {
      XLSX.CFB.utils.cfb_add(cfb, name, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    }
    // Must use fileType:'zip' to produce valid ZIP (PK magic), not OLE/CFB
    const out = XLSX.CFB.write(cfb, { fileType: 'zip', type: 'array', compression: true });
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  }

  root.KPTServicePDF = { generateSigned, download, downloadChecklist, mergeDocuments, mergeAndDownload, zipFiles };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTServicePDF;
})(typeof globalThis !== 'undefined' ? globalThis : this);
