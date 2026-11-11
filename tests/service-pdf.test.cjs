const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Load pdf-lib UMD
global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
const pdfLibSrc = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'pdf-lib.min.js'), 'utf8');
const pdfLibModule = { exports: {} };
new Function('exports', 'module', 'self', 'window', 'global', pdfLibSrc)(
  pdfLibModule.exports, pdfLibModule, global, global, global
);
global.PDFLib = pdfLibModule.exports;

// Load templates and KPT
global.SERVICE_PDF_TEMPLATES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'service-pdf-templates.json'), 'utf8'));
Object.assign(global.SERVICE_PDF_TEMPLATES, require('../src/sss-pdf-templates.json'));
global.KPT = require('../src/domain.js');
const KPTServicePDF = require('../src/service-pdf.js');

// Helper: create a simple valid PDF with given text
async function makePdf(text) {
  const { PDFDocument, StandardFonts, rgb } = global.PDFLib;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.44, 841.68]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 50, y: 400, size: 12, font, color: rgb(0, 0, 0) });
  return doc.save();
}

test('SSS generators create clean one-page official documents', async () => {
  const app = { applicant: { name: 'TEST CADET', ic: '001122-33-4455', gender: 'Female' }, declaredTier: 500, confirmedTier: 200, confirmedDutyHours: 306, currentSSS: { tier: 100, certificate: 'TEST-001' } };
  const application = await KPTServicePDF.generateSSSApplication(app, { division: 'TEST DIVISION', memberNumber: '00123', signingDate: '2026-11-10' });
  const checklist = await KPTServicePDF.generateSSSChecklist({ checks: {} }, { date: '2026-11-10' });
  for (const bytes of [application, checklist]) {
    const doc = await global.PDFLib.PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 1);
    assert.ok(bytes.length > 1000);
  }
  for (const bytes of [application, checklist]) {
    const doc = await global.PDFLib.PDFDocument.load(bytes);
    const assets = doc.getPage(0).node.Resources().lookup(global.PDFLib.PDFName.of('XObject'));
    assert.ok(assets.has(global.PDFLib.PDFName.of('Im0')), 'original logo remains');
    assert.ok(!assets.has(global.PDFLib.PDFName.of('Fm0')), 'sample Fill & Sign layer is absent');
  }
});

test('SSS-02 writes applicant data above the original rules without masking them', async () => {
  const { PDFDocument, decodePDFRawStream } = global.PDFLib;
  const original = await PDFDocument.load(Buffer.from(global.SERVICE_PDF_TEMPLATES.sss02, 'base64'));
  const filled = await PDFDocument.load(await KPTServicePDF.generateSSSApplication({
    applicant: { name: 'TEST CADET', ic: '001122-33-4455', rank: 'Sergeant', phone: '011-12345678', email: 'cadet@example.test', occupation: 'Student', joined: '2020-11-02' },
    currentSSS: { tier: 100, certificate: 'CERT-001' }
  }, { memberNumber: '00123' }));
  const streams = doc => {
    const contents = doc.getPage(0).node.Contents();
    const entries = contents.asArray ? contents.asArray() : [contents];
    return entries.map(entry => Buffer.from(decodePDFRawStream(doc.context.lookup(entry)).decode()).toString('latin1'));
  };
  const originalStreams = streams(original);
  const filledStreams = streams(filled);
  assert.deepEqual(filledStreams.slice(1, 1 + originalStreams.length), originalStreams);
  const overlay = filledStreams.at(-1);
  assert.doesNotMatch(overlay, /\bre\s*$/m);
  assert.doesNotMatch(overlay, /341 277\.6 Tm/, 'a historical certificate does not replace a missing application reference');
  assert.match(overlay, /1 0 0 1 154 551\.5 Tm\s+<54455354204341444554> Tj/);
  assert.match(overlay, /1 0 0 1 451 450\.2 Tm\s+<3032> Tj/);
  assert.match(overlay, /1 0 0 1 483 450\.2 Tm\s+<3131> Tj/);
  assert.match(overlay, /1 0 0 1 515 450\.2 Tm\s+<32303230> Tj/);
});

test('SSS-02 fills the application reference without replacing the printed example', async () => {
  const { PDFDocument, decodePDFRawStream } = global.PDFLib;
  for (const [reference, config, expected] of [
    ['2026-G003', {}, '2026-G003'],
    ['', { reference: '2027-G002' }, '2027-G0002']
  ]) {
    const doc = await PDFDocument.load(await KPTServicePDF.generateSSSApplication({
      reference, currentSSS: { tier: 100, certificate: '2025-G001' }
    }, config));
    const overlayRef = doc.getPage(0).node.Contents().asArray().at(-1);
    const overlay = Buffer.from(decodePDFRawStream(doc.context.lookup(overlayRef)).decode()).toString('latin1');
    const hex = Buffer.from(expected).toString('hex').toUpperCase();
    assert.match(overlay, new RegExp('341 277\\.6 Tm\\s+<' + hex + '> Tj'));
    assert.doesNotMatch(overlay, /\bre\s*$/m);
    assert.doesNotMatch(overlay, /428\.1 277\.6 Tm/);
  }
});

test('mergeDocuments: empty array throws clear error', async () => {
  await assert.rejects(
    () => KPTServicePDF.mergeDocuments([]),
    /at least one PDF is required/
  );
  await assert.rejects(
    () => KPTServicePDF.mergeDocuments(null),
    /at least one PDF is required/
  );
  await assert.rejects(
    () => KPTServicePDF.mergeDocuments(undefined),
    /at least one PDF is required/
  );
});

test('mergeDocuments: corrupt PDF throws with filename, no silent skip', async () => {
  const goodPdf = await makePdf('Page One Content');
  const badBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // truncated PDF
  await assert.rejects(
    () => KPTServicePDF.mergeDocuments([
      { bytes: goodPdf, filename: 'good.pdf' },
      { bytes: badBytes, filename: 'corrupt.pdf' }
    ]),
    /corrupt\.pdf/
  );
  // Also: missing bytes
  await assert.rejects(
    () => KPTServicePDF.mergeDocuments([
      { bytes: goodPdf, filename: 'good.pdf' },
      { filename: 'missing.pdf' }
    ]),
    /missing\.pdf/
  );
});

test('mergeDocuments: merges two valid PDFs into complete 2-page document', async () => {
  const pdf1 = await makePdf('First Document - UNIQUE_MARKER_1');
  const pdf2 = await makePdf('Second Document - UNIQUE_MARKER_2');
  const merged = await KPTServicePDF.mergeDocuments([
    { bytes: pdf1, filename: 'first.pdf' },
    { bytes: pdf2, filename: 'second.pdf' }
  ]);
  // Verify page count
  const PDFLib = global.PDFLib;
  const doc = await PDFLib.PDFDocument.load(merged);
  assert.equal(doc.getPageCount(), 2, 'merged PDF should have 2 pages');
});

test('mergeDocuments: zero-page PDF throws with filename', async () => {
  const { PDFDocument } = global.PDFLib;
  const emptyDoc = await PDFDocument.create();
  // pdf-lib's create() makes 0 pages; save and verify
  const emptyBytes = await emptyDoc.save();
  // Load back to confirm page count
  const reloaded = await PDFDocument.load(emptyBytes);
  if (reloaded.getPageCount() === 0) {
    await assert.rejects(
      () => KPTServicePDF.mergeDocuments([
        { bytes: emptyBytes, filename: 'empty.pdf' }
      ]),
      /empty\.pdf/
    );
  } else {
    // If pdf-lib silently adds a page, the merge should still succeed with 1 page
    const merged = await KPTServicePDF.mergeDocuments([
      { bytes: emptyBytes, filename: 'empty.pdf' }
    ]);
    const doc = await PDFDocument.load(merged);
    assert.equal(doc.getPageCount(), reloaded.getPageCount());
  }
});

test('zipFiles: produces valid ZIP with PK magic and correct entries', () => {
  // Load XLSX.CFB from vendor
  global.XLSX = require('../vendor/xlsx.full.min.js');
  const pdf1 = Buffer.from('%PDF-1.4 fake pdf 1');
  const pdf2 = Buffer.from('%PDF-1.4 fake pdf 2');
  const zipBytes = KPTServicePDF.zipFiles({
    'application_ss02.pdf': pdf1,
    'checklist_ss01.pdf': pdf2
  });
  // PK magic check
  assert.equal(zipBytes[0], 0x50, 'PK byte 0');
  assert.equal(zipBytes[1], 0x4B, 'PK byte 1');
  // Read back with CFB
  const cfb = global.XLSX.CFB.read(zipBytes, { type: 'array' });
  const names = cfb.FullPaths.map(p => p.replace('Root Entry/', ''));
  assert.ok(names.some(n => n.includes('application_ss02.pdf')), 'entry 1 present');
  assert.ok(names.some(n => n.includes('checklist_ss01.pdf')), 'entry 2 present');
  // Verify content
  for (let i = 0; i < cfb.FullPaths.length; i++) {
    const name = cfb.FullPaths[i];
    if (name.includes('application_ss02.pdf')) {
      const content = cfb.FileIndex[i].content;
      const text = new TextDecoder().decode(content);
      assert.ok(text.includes('fake pdf 1'), 'entry 1 content intact');
    }
    if (name.includes('checklist_ss01.pdf')) {
      const content = cfb.FileIndex[i].content;
      const text = new TextDecoder().decode(content);
      assert.ok(text.includes('fake pdf 2'), 'entry 2 content intact');
    }
  }
});

test('zipFiles: empty map produces valid ZIP (no crash)', () => {
  global.XLSX = require('../vendor/xlsx.full.min.js');
  const zipBytes = KPTServicePDF.zipFiles({});
  assert.equal(zipBytes[0], 0x50, 'PK magic on empty zip');
  assert.equal(zipBytes[1], 0x4B);
});

test('mergeDocuments: 3 PDFs merge into 3 pages', async () => {
  const pdfs = [];
  for (let i = 1; i <= 3; i++) {
    pdfs.push({ bytes: await makePdf('Doc ' + i), filename: 'doc' + i + '.pdf' });
  }
  const merged = await KPTServicePDF.mergeDocuments(pdfs);
  const PDFLib = global.PDFLib;
  const doc = await PDFLib.PDFDocument.load(merged);
  assert.equal(doc.getPageCount(), 3);
});
