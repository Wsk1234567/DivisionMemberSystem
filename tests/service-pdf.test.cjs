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
