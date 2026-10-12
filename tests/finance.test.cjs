const test = require('node:test');
const assert = require('node:assert/strict');
const { inflateRawSync } = require('node:zlib');

global.KPT = require('../src/domain.js');
global.XLSX = require('../vendor/xlsx.full.min.js');
global.KPTFinanceTemplates = require('../src/finance-templates.js');
const Finance = require('../src/finance-workbook.js');
const FinancePdf = require('../src/finance-pdf.js');
const { fixture } = require('../src/demo-data.js');

// Node 18+ provides CompressionStream/DecompressionStream used by finance-workbook.

const context = () => ({ actor: 'owner@test', now: '2026-01-01T00:00:00Z', uuid: () => 'f' + Math.random().toString(36).slice(2, 10) });

function sampleBookRequest(revision) {
  return {
    action: 'saveFinanceBook',
    revision,
    book: {
      id: '',
      version: 0,
      activityName: 'Badminton Competition',
      incomes: [
        { id: '', version: 0, date: '2026-08-23', description: 'Registration Fee', amount: 1075.5 },
        { id: '', version: 0, date: '2026-08-24', description: 'Kedai Runcit Huat Hing', amount: 100 }
      ],
      expenses: [
        { id: '', version: 0, date: '2025-12-12', item: 'Shuttlecock', description: 'Sea Lion', quantity: '4', unitCost: '58/tubes', amount: 232 },
        { id: '', version: 0, date: '2026-01-10', item: 'Awards', description: 'Medal for Champion', quantity: '4', unitCost: '-', amount: 0 }
      ],
      reimbursements: [
        {
          id: '',
          version: 0,
          formSeq: 1,
          treasurerName: 'Lim Le Yee',
          formDate: '2025-08-12',
          purpose: 'Junior camp of Mengkuang',
          chequeNo: '',
          amount: 700.5,
          lines: [
            { id: '', version: 0, lineNo: 1, date: '2025-08-05', invoiceNo: '00043194', particular: 'Printing Fee', total: 18.2 },
            { id: '', version: 0, lineNo: 2, date: '2025-08-09', invoiceNo: '665407', particular: 'Lunch', total: 525 },
            { id: '', version: 0, lineNo: 3, date: '2025-08-09', invoiceNo: '06108', particular: 'Karipap', total: 100 }
          ]
        }
      ]
    }
  };
}

async function unzipWithZlib(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let index = bytes.length - 22; index >= 0; index--) {
    if (view.getUint32(index, true) === 0x06054b50) { end = index; break; }
  }
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const files = new Map();
  for (let index = 0; index < count; index++) {
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = Buffer.from(bytes.subarray(offset + 46, offset + 46 + nameLength)).toString('utf8');
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = Buffer.from(bytes.subarray(dataStart, dataStart + compressedSize));
    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

test('empty state includes finance tables', () => {
  const state = KPT.empty();
  KPT.validateState(state);
  assert.deepEqual(state.FinBooks, []);
});

test('upgradeState adds missing finance tables to older state', () => {
  const state = fixture(1, 2026, 2026);
  delete state.FinBooks;
  delete state.FinIncomes;
  delete state.FinExpenses;
  delete state.FinReimbursements;
  delete state.FinReimburseLines;
  const upgraded = KPT.upgradeState(state);
  KPT.validateState(upgraded);
  assert.deepEqual(upgraded.FinBooks, []);
});

test('saveFinanceBook stores related finance rows', () => {
  let state = KPT.empty();
  state = KPT.mutate(state, sampleBookRequest(0), context());
  assert.equal(state.FinBooks.length, 1);
  assert.equal(state.FinIncomes.length, 2);
  assert.equal(state.FinExpenses.length, 2);
  assert.equal(state.FinReimbursements.length, 1);
  assert.equal(state.FinReimburseLines.length, 3);
  assert.equal(state.FinReimburseLines[0].invoiceNo, '00043194');
});

test('recycle delete FinBooks cascades finance children', () => {
  let state = KPT.mutate(KPT.empty(), sampleBookRequest(0), context());
  const bookId = state.FinBooks[0].id;
  state = KPT.recycleDelete(state, 'FinBooks', bookId, { actor: 'owner', now: '2026-01-01T00:00:00Z', uuid: () => 'trash1', revision: state.revision });
  assert.equal(state.FinBooks.length, 0);
  assert.equal(state.FinReimburseLines.length, 0);
});

test('reimbursement export keeps logo and official template parts', async () => {
  const state = KPT.mutate(KPT.empty(), sampleBookRequest(0), context());
  const form = state.FinReimbursements[0];
  const lines = state.FinReimburseLines.filter(row => row.reimbursementId === form.id);
  const bytes = await Finance.createReimbursementForm(Object.assign({}, form, { lines }));
  const files = await unzipWithZlib(Buffer.from(bytes));
  assert.ok(files.has('xl/media/image1.jpeg'), 'logo image must remain in package');
  assert.ok(files.has('xl/drawings/drawing1.xml'), 'drawing part must remain');
  assert.ok(files.has('xl/styles.xml'));
  assert.ok(files.has('xl/worksheets/sheet1.xml'));
  assert.ok(files.has('xl/calcChain.xml'), 'package structure stays intact');

  const xml = files.get('xl/worksheets/sheet1.xml').toString('utf8');
  assert.match(xml, /r="B9"[^>]*t="inlineStr"/);
  assert.match(xml, /Lim Le Yee/);
  assert.match(xml, /00043194/);
  assert.match(xml, /Printing Fee/);
  assert.match(xml, /Junior camp of Mengkuang/);
  assert.match(xml, /SUM\(G15:G25\)/);
  // No duplicate <v> nodes under formula cells (this broke Excel)
  const a37 = /<c r="A37"[\s\S]*?<\/c>/.exec(xml)[0];
  assert.equal((a37.match(/<v/g) || []).length, 1);
  assert.equal(files.has('xl/calcChain.xml'), true);

  // Round-trip through Excel parser: values still land in template cells
  const book = XLSX.read(bytes, { type: 'array', cellStyles: true });
  const sheet = book.Sheets.ReimbursementForm;
  assert.equal(sheet.A1.v, 'St. John Ambulans Malaysia Negeri Pahang');
  assert.equal(sheet.B9.v, 'Lim Le Yee');
  assert.equal(sheet.C11.v, 'Junior camp of Mengkuang');
  assert.equal(sheet.D15.v, '00043194');
  assert.equal(sheet.E15.v, 'Printing Fee');
  assert.equal(sheet.G15.v, 18.2);
  assert.equal(sheet.G26.f, 'SUM(G15:G25)');
  assert.equal(sheet.G37.v, 'Area Honorary Treasurer');
  // Amount under Cheque No stays blank on purpose
  assert.equal(sheet.B30.v == null || sheet.B30.v === '', true);
  assert.equal(sheet['!merges'].length >= 30, true);
});

test('income and expense export matches the latest no-merge Badminton layout', async () => {
  const state = KPT.mutate(KPT.empty(), sampleBookRequest(0), context());
  const bytes = await Finance.createIncomeExpenses({
    activityName: state.FinBooks[0].activityName,
    incomes: state.FinIncomes,
    expenses: state.FinExpenses
  });
  const files = await unzipWithZlib(Buffer.from(bytes));
  assert.ok(files.has('xl/worksheets/sheet1.xml'));
  const book = XLSX.read(bytes, { type: 'array', cellStyles: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  assert.equal(sheet.A1.v, 'Income and Expenses of Badminton Competition');
  assert.match(String(sheet.A2.v || ''), /Income/);
  assert.match(String(sheet.H2.v || ''), /Expenditure/);
  assert.equal(sheet.A3.v, 'Date');
  assert.equal(sheet.C3.v, 'Description');
  assert.equal(sheet.D3.v, 'Amount(RM)');
  assert.equal(sheet.E3.v, 'Date');
  assert.equal(sheet.F3.v, 'Item');
  assert.equal(sheet.I3.v, 'Cost per unit (RM)');
  assert.equal(sheet.J3.v, 'Amount(RM)');
  assert.equal(sheet.A4.v, '23-08-2026');
  assert.equal(sheet.C4.v, 'Registration Fee');
  assert.equal(sheet.D4.v, 1075.5);
  assert.equal(sheet.F4.v, 'Shuttlecock');
  assert.equal(sheet.J4.v, 232);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  // Keep official template totals; only refresh values
  assert.equal(sheet.C12 == null || sheet.C12.v == null || sheet.C12.v === '', true);
  assert.equal(sheet.C22.v, 'Total');
  assert.equal(sheet.D22.v, 1175.5);
  assert.match(String(sheet.D22.f || ''), /SUM\(D4:D21\)/);
  assert.equal(sheet.I22.v, 'Total');
  assert.equal(sheet.J22.v, 232);
  assert.equal(sheet.C23.v, 'Balance');
  assert.equal(sheet.D23.v, 943.5);
  assert.match(String(sheet.D23.f || ''), /D22-J22/);
});

test('receipt PDF builder creates multi-page PDF from JPEG pages', async () => {
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z', 'base64');
  const size = FinancePdf.jpegSize(jpeg);
  assert.equal(size.width, 1);
  const pdf = FinancePdf.buildPdf([
    { bytes: new Uint8Array(jpeg), mime: 'jpeg', width: 1, height: 1 },
    { bytes: new Uint8Array(jpeg), mime: 'jpeg', width: 1, height: 1 }
  ]);
  const text = Buffer.from(pdf).toString('latin1');
  assert.equal(text.slice(0, 5), '%PDF-');
  assert.match(text, /\/Count 2/);
  assert.match(text, /DCTDecode/);
});
