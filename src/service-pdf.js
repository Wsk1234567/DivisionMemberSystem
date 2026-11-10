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

  function sssColour(tier) {
    return ({ 100: 'Green', 200: 'Blue', 500: 'Purple', 750: 'Silver', 1000: 'Emas' })[Number(tier)] || '';
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

  async function generateSSSApplication(application, config) {
    const { PDFDocument, rgb, StandardFonts } = getLib();
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.44, A4_H]);
    const font = await doc.embedFont(StandardFonts.TimesRoman);
    const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    const black = rgb(0, 0, 0);
    const app = application || {};
    const applicant = app.applicant || {};
    const tier = Number(app.confirmedTier || app.declaredTier);
    const division = safeText((config && config.division) || 'SMJK Triang Combined Cadet Division');
    const memberNumber = safeText((config && config.memberNumber) || '');
    const existing = (config && config.currentSSS) || app.currentSSS || {};
    const line = (x1, y1, x2, y2, width) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: width || 0.7, color: black });
    const text = (value, x, y, size, fnt) => page.drawText(safeText(value), { x, y, size: size || 10, font: fnt || font, color: black });
    const center = (value, y, size, fnt) => { const v = safeText(value); const use = fnt || bold; page.drawText(v, { x: (595.44 - use.widthOfTextAtSize(v, size)) / 2, y, size, font: use, color: black }); };
    const box = (x, y, checked) => { page.drawRectangle({ x, y, width: 21, height: 21, borderColor: black, borderWidth: 0.8 }); if (checked) text('X', x + 5, y + 4, 13, bold); };
    center('ST. JOHN AMBULANS MALAYSIA', 748, 11, bold);
    center('KAWASAN PAHANG TENGAH', 731, 11, bold);
    text('SJAMKPT/CADET/SSS-02', 422, 780, 9, helv);
    line(58, 712, 537, 712);
    center('SPECIAL SERVICE SHIELD', 683, 13, bold);
    center('APPLICATION FORM', 667, 13, bold);
    text('Please fill in BLOCK LETTERS', 58, 630, 10, font);
    text('Application For', 58, 601, 10, font);
    text('Special Service Shield :', 58, 584, 10, font);
    [100, 200, 500, 750, 1000].forEach((value, index) => { const x = 171 + index * 72; box(x, 579, tier === value); text(value + 'hrs', x + 25, 584, 9, font); });
    text('A.  Applicant Details', 58, 545, 11, bold);
    text('Name (as in NRIC) :', 58, 515, 10, font); line(143, 512, 535, 512);
    text(blockLetters(applicant.name), 148, 516, 9, helv);
    text('N.R.I.C No.          :', 58, 487, 10, font); line(142, 484, 283, 484); text(safeText(applicant.ic), 145, 488, 8, helv);
    text('SJAM ID :', 290, 487, 10, font); line(341, 484, 394, 484); text(memberNumber, 342, 488, 8, helv);
    text('Gender:', 405, 487, 10, font); box(449, 478, /^M(ALE)?$/i.test(applicant.gender || '')); text('Male', 473, 486, 9, font); box(510, 478, /^F(EMALE)?$/i.test(applicant.gender || '')); text('Female', 534, 486, 9, font);
    text('Division Name       :', 58, 458, 10, font); line(143, 455, 535, 455); text(division, 147, 460, 8, helv);
    text('Rank/Position       :', 58, 410, 10, font); line(143, 407, 350, 407); text(safeText(applicant.rank), 147, 411, 8, helv);
    text('Date Join SJAM :', 360, 410, 10, font); text(safeText(applicant.joined), 447, 410, 8, helv);
    text('Contact No.          : (+60)', 58, 382, 10, font); line(177, 379, 327, 379); text(safeText(applicant.phone).replace(/^\+60/, '').replace(/^0/, ''), 180, 383, 8, helv);
    text('Email:', 338, 382, 10, font); line(373, 379, 535, 379); text(safeText(applicant.email), 375, 383, 7, helv);
    text('Occupation           :', 58, 354, 10, font); line(143, 351, 535, 351); text(safeText(applicant.occupation), 147, 355, 8, helv);
    text('Total Duty Hours Accumulated On The Date of Application:', 58, 312, 10, font);
    page.drawRectangle({ x: 338, y: 302, width: 78, height: 23, borderColor: black, borderWidth: 0.8 });
    text(String(app.confirmedDutyHours == null ? '' : app.confirmedDutyHours), 348, 309, 10, helv); text('Hours.', 425, 312, 10, font);
    text('Current SSS Achieved:', 58, 270, 10, font);
    [100, 200, 500, 750].forEach((value, index) => { const x = 171 + index * 85; box(x, 261, Number(existing.tier) === value); text(value + 'hrs/' + sssColour(value), x + 24, 269, 8, font); });
    text('Certificate Number/Reference:', 58, 228, 10, font); text(safeText(existing.certificate || ''), 205, 228, 9, helv);
    text('(OIC/Teacher Signature)', 59, 92, 10, bold);
    text('Name', 58, 64, 9, bold); text('Division', 58, 50, 9, bold); text('Date', 58, 36, 9, bold);
    await copyPrivateOfficer(doc, page, config && config.templateBase64, { x: 59, y: 82, width: 176, height: 57 }, { x: 126, y: 28, width: 263, height: 31 });
    if (config && config.signingDate) text(String(config.signingDate).split('-').reverse().join('/'), 132, 36, 8, helv);
    return doc.save();
  }

  async function generateSSSChecklist(batch, config) {
    const { PDFDocument, rgb, StandardFonts } = getLib();
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.44, A4_H]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const black = rgb(0, 0, 0);
    const text = (v, x, y, size, f) => page.drawText(safeText(v), { x, y, size: size || 9, font: f || font, color: black });
    const center = (v, y, size) => page.drawText(v, { x: (595.44 - bold.widthOfTextAtSize(v, size)) / 2, y, size, font: bold, color: black });
    const line = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.7, color: black });
    text('SJAMKPT/CADET/SSS-01', 412, 785, 9);
    center('ST. JOHN AMBULANS MALAYSIA', 720, 12); center('KAWASAN PAHANG TENGAH', 703, 12);
    center('APPLICATION FOR CADET SPECIAL SERVICE SHIELD', 640, 12); center('CHECKLIST', 608, 12);
    text('Date:', 405, 570, 10, bold); page.drawRectangle({ x: 438, y: 559, width: 98, height: 24, borderColor: black, borderWidth: 0.8 });
    text(safeText((config && config.date) || ''), 444, 567, 8);
    const rows = [['covering','Division Covering Letter'],['support','Support Document / Letter'],['applicationForms','Application Form (SJAMKPT/CADET/SSS-02)'],['dutyBook','Duty Book : (Completed)'],['dutyDetails','    - Applicant Details (Front Page)'],['typeHours','    - Type of Duty & Duty Hours'],['approvedSigned','    - Duty Hours approved/signed'],['totalHours','    - State Total Duty Hours Completed']];
    const left = 72, top = 540, rowH = 24, cols = [72,108,356,392,428,537];
    for (let i = 0; i <= rows.length + 1; i++) line(left, top - i * rowH, 537, top - i * rowH);
    cols.forEach(x => line(x, top, x, top - (rows.length + 1) * rowH));
    text('No.', 80, top - 17, 9, bold); text('ITEM', 220, top - 17, 9, bold); text('YES', 362, top - 17, 9, bold); text('NO', 400, top - 17, 9, bold); text('COMMENT', 454, top - 17, 9, bold);
    const checks = (batch && batch.checks) || {};
    rows.forEach(([key,label], index) => { const y = top - (index + 2) * rowH + 8; if (index < 4) text(String(index + 1) + '.', 84, y, 9); text(label, 113, y, 8); if (checks[key] === 'Y') text('X', 369, y, 11, bold); if (checks[key] === 'N') text('X', 404, y, 11, bold); });
    text('(OIC/Teacher Signature)', 72, 190, 10, bold); text('Name       :', 72, 154, 9, bold); text('Division   :', 72, 140, 9, bold); text('Date         :', 72, 126, 9, bold);
    await copyPrivateOfficer(doc, page, config && config.signingTemplateBase64, { x: 72, y: 180, width: 176, height: 57 }, { x: 140, y: 118, width: 263, height: 31 });
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
