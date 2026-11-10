(function (root) {
  'use strict';
  // Service Stripe & Star PDF generator using original official form templates.
  // Coordinates measured via pdfplumber from actual forms (top-based baseline).
  // pdf-lib uses bottom-left origin: y_lib = A4_H - y_top_baseline.

  let templates = null;
  try { templates = root.SERVICE_PDF_TEMPLATES; } catch (e) {}
  if (!templates && typeof require !== 'undefined') {
    try { templates = { ...require('./service-pdf-templates.json'), ...require('./sss-pdf-templates.json') }; } catch (e) {}
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
    certRef:    { x: 412, yTop: 426.07, maxWidth: 55 }, // Reference space after the printed prefix
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
    certRef:    { x: 403, yTop: 424.87, maxWidth: 55 },
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

    const date = (config && config.date) || new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const dateStr = safeText(date).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
    page.drawText(dateStr, { x: CHECK_POS.date.x, y: yLib(CHECK_POS.date.yTop), size: 8, font, color: rgb(0, 0, 0) });

    const privateTemplate = config && config.signingTemplateBase64;
    if (!privateTemplate) throw new Error('Private signed application template is unavailable for Service ' + kind + '.');
    const source = (await PDFDocument.load(b64ToBytes(privateTemplate))).getPage(0);
    // Crop the signed area of the matching SS-02/SSTR-02. Keep applicant fields
    // and the application's date widget outside the embedded regions.
    const signature = { left: 59, bottom: isStar ? 141 : 139, right: 235, top: 196 };
    const identity = { left: 134, bottom: 80, right: 397, top: 111 };
    const copyRegion = async (box, x, y) => {
      const region = await doc.embedPage(source, box);
      page.drawPage(region, { x, y });
    };
    await copyRegion(signature, 72, 273);
    await copyRegion(identity, CHECK_POS.officerName.x, isStar ? 208 : 210);

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

    page.drawText(dateStr, { x: CHECK_POS.officerDate.x, y: yLib(CHECK_POS.officerDate.yTop), size: 8, font, color: rgb(0, 0, 0) });

    return doc.save();
  }

  async function copyPrivateOfficer(doc, page, templateBase64, signatureTarget, identityTarget) {
    if (!templateBase64) return;
    const sourceDoc = await getLib().PDFDocument.load(b64ToBytes(templateBase64));
    const source = sourceDoc.getPage(0);
    const signature = await doc.embedPage(source, { left: 59, bottom: 139, right: 235, top: 196 });
    const identity = await doc.embedPage(source, { left: 134, bottom: 80, right: 397, top: 111 });
    page.drawPage(signature, signatureTarget);
    page.drawPage(identity, identityTarget);
  }

  async function loadSssForm(key) {
    const { PDFDocument, StandardFonts, rgb } = getLib();
    if (!templates || !templates[key]) throw new Error('Original SSS template is unavailable. Reload the page.');
    const doc = await PDFDocument.load(b64ToBytes(templates[key]));
    const page = doc.getPage(0);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const write = (value, x, y, width, size = 9) => {
      const text = safeText(value);
      if (!text) return;
      const measured = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x, y, size: measured > width ? size * width / measured : size, font, color: rgb(0, 0, 0) });
    };
    return { doc, page, write };
  }

  function sssDate(value) {
    const date = String(value || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : date;
  }

  function sssCertificateReference(year, sequence) {
    return year + '-G' + String(sequence).replace(/^0+(?=\d)/, '').padStart(Number(year) >= 2027 ? 4 : 3, '0');
  }

  async function generateSSSApplication(application, config = {}) {
    const { rgb } = getLib();
    const { doc, page, write } = await loadSssForm('sss02');
    const app = application || {};
    const applicant = app.applicant || {};
    const existing = config.currentSSS || app.currentSSS || {};
    const fill = (value, left, right, baseline) => write(value, left + 4, baseline + 7, right - left - 7);
    const mark = (x, y) => write('X', x, y, 9, 11);
    [[100, 181, 612], [200, 250, 612], [500, 321, 612], [750, 395, 612], [1000, 463, 611]]
      .forEach(([tier, x, y]) => { if (Number(app.confirmedTier) === tier) mark(x, y); });
    fill(blockLetters(applicant.name), 150, 540, 544.5);
    fill(applicant.ic, 144.5, 287, 519.2);
    fill(config.memberNumber, 340, 396, 519.2);
    if (/^M(ALE)?$/i.test(applicant.gender || '')) mark(447, 524);
    if (/^F(EMALE)?$/i.test(applicant.gender || '')) mark(490, 524);
    fill(config.division || 'SMJK Triang Combined Cadet Division', 144.5, 540, 493.9);
    fill(applicant.rank, 144.5, 358, 443.2);
    const joined = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(applicant.joined || ''));
    if (joined) {
      write(joined[3], 451, 450.2, 18);
      write(joined[2], 483, 450.2, 18);
      write(joined[1], 515, 450.2, 27);
    } else {
      fill(applicant.joined, 442, 545, 443.2);
    }
    fill(safeText(applicant.phone).replace(/^\+60/, '').replace(/^0/, ''), 174.5, 336, 417.9);
    fill(applicant.email, 371, 545, 417.9);
    fill(applicant.occupation, 147, 540, 392.7);
    write(app.confirmedDutyHours ?? '', 346, 359, 63, 10);
    [[100, 176, 321], [200, 262, 321], [500, 344, 320], [750, 437, 321]]
      .forEach(([tier, x, y]) => { if (Number(existing.tier) === tier) mark(x, y); });
    const certificate = safeText(existing.certificate || '').replace(/^SJAMKPT\/CADET\/\(SSS\)\/04\s*\(?\s*/i, '').replace(/\)$/, '').trim();
    const certificateParts = /^(\d{4})-G(\d+)$/i.exec(certificate);
    write(certificateParts ? sssCertificateReference(certificateParts[1], certificateParts[2]) : certificate, 341, 277.6, 62, 8);
    const exampleYear = /^\d{4}$/.test(String(app.year)) ? String(app.year) : String(config.signingDate || '').slice(0, 4);
    if (/^\d{4}$/.test(exampleYear)) {
      page.drawRectangle({ x: 427.8, y: 275.5, width: 62, height: 12, color: rgb(1, 1, 1) });
      write(sssCertificateReference(exampleYear, 1), 428.1, 277.6, 60, 9);
    }
    page.drawRectangle({ x: 58, y: 161, width: 127, height: 5, color: rgb(1, 1, 1) });
    await copyPrivateOfficer(doc, page, config.templateBase64,
      { x: 58, y: 171, width: 176, height: 57 }, { x: 135, y: 106, width: 263, height: 28 });
    write(sssDate(config.signingDate), 135, 98.2, 150, 8);
    return doc.save();
  }

  async function generateSSSChecklist(batch, config = {}) {
    const { doc, page, write } = await loadSssForm('sss01');
    const date = sssDate(config.date);
    write(date, 445, 600, 84);
    const checks = (batch && batch.checks) || {};
    [['covering', 535], ['support', 512], ['applicationForms', 490], ['dutyBook', 467], ['dutyDetails', 446], ['typeHours', 425], ['approvedSigned', 403], ['totalHours', 381]]
      .forEach(([key, y]) => {
        if (checks[key] === 'Y') write('X', 368, y, 12, 11);
        if (checks[key] === 'N') write('X', 403, y, 12, 11);
      });
    await copyPrivateOfficer(doc, page, config.signingTemplateBase64,
      { x: 72, y: 280, width: 176, height: 57 }, { x: 150, y: 210, width: 263, height: 31 });
    write(date, 150, 201.9, 150, 8);
    return doc.save();
  }

  async function generateSSSCoverLetter(batch, applications, config) {
    const { PDFDocument, rgb, StandardFonts } = getLib();
    const doc = await PDFDocument.create(); const page = doc.addPage([595.44, A4_H]);
    const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold); const black = rgb(0,0,0);
    const letter = Object.assign({ recipient: 'Mr Phang Kwok Kheun', recipientTitle: 'Area Staff Officer (Cadets)', organization: 'St. John Ambulans Malaysia', area: 'Kawasan Pahang Tengah', sender: 'JDO Wong Shan Kang', phone: '011-20836398', division: 'SMJK Triang Combined Cadet Division', subject: 'Applies Special Service Shield', intro: 'With the above Subject Matters, I would like to apply Special Service Shield for cadets who fulfill the requirements.', closing: 'Looking forward to hearing from you soon.' }, batch && batch.coverLetter || {});
    const text = (v,x,y,size,f) => page.drawText(safeText(v), { x,y,size:size||10,font:f||font,color:black });
    let y=780; [letter.recipient,letter.recipientTitle,letter.organization,letter.area,'','Dear Sir,','', 'RE: ' + letter.subject + ' (' + (batch.title || batch.year || '') + ')'].forEach((v,i)=>{ if(v) text(v,58,y,10,i===7?bold:font); y-=17; });
    y-=8; [letter.intro,'','Attachment for your review:','- Checklist (SJAMKPT/CADET/SSS-01)','- ' + applications.length + ' application letters (SJAMKPT/CADET/SSS-02)','- Duty records of applicants'].forEach(v=>{ if(v) text(v,58,y,9); y-=17; });
    y-=8; text('And below are the details:',58,y,9); y-=20;
    [100,200,500,750,1000].forEach(tier=>{ const count=applications.filter(a=>Number(a.confirmedTier)===tier).length; if(count){ text('- ' + tier + ' Duty Hours (Special Service Shield) - ' + count + ' cadet' + (count===1?'':'s'),58,y,9); y-=17; } });
    y-=10; [letter.closing,'','For any further information, please do not hesitate to contact me at ' + letter.phone + '. Thank you.','',letter.sender,letter.organization,letter.area,letter.division].forEach(v=>{ if(v) text(v,58,y,9); y-=17; });
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
    if (kind === 'SSS') return generateSSSApplication(application, config || {});
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

  function batchFileName(type, kind, year) {
    if (kind === 'SSS') {
      if (type === 'duty') return 'Duty Records (Total-SSS).pdf';
      if (type === 'covering') return 'Covering Letter - SSS ' + year + '.pdf';
      return 'SJAMKPT CADET SSS-' + (type === 'checklist' ? '01' : '02') + '.pdf';
    }
    const star = kind === 'Star';
    if (type === 'duty') return (star ? 'Duty Record ' : 'Duty Records ') + year + ' (Service ' + kind + ').pdf';
    const code = (star ? 'SSTR' : 'SS') + (type === 'checklist' ? '-01' : '-02');
    return 'SJAMKPT CADET ' + code + '.pdf';
  }

  async function downloadChecklist(batch, applications, kind, config) {
    const bytes = kind === 'SSS' ? await generateSSSChecklist(batch, config || {}) : await fillChecklist(batch, applications, kind, config);
    const fileName = batchFileName('checklist', kind, batch.year);
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

  root.KPTServicePDF = { generateSigned, generateSSSApplication, generateSSSChecklist, generateSSSCoverLetter, download, downloadChecklist, batchFileName, mergeDocuments, mergeAndDownload, zipFiles };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTServicePDF;
})(typeof globalThis !== 'undefined' ? globalThis : this);
