(function (root) {
  'use strict';
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 36;

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function dataUrlToBytes(dataUrl) {
    const match = /^data:image\/(jpeg|jpg|png);base64,(.+)$/i.exec(String(dataUrl || ''));
    if (!match) throw new Error('Receipt images must be JPEG or PNG.');
    return { mime: match[1].toLowerCase() === 'png' ? 'png' : 'jpeg', bytes: base64ToBytes(match[2]) };
  }

  function jpegSize(bytes) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Receipt file is not a JPEG.');
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] };
      }
      if (!length) break;
      offset += 2 + length;
    }
    throw new Error('Could not read JPEG size.');
  }

  function concat(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let cursor = 0;
    chunks.forEach(chunk => { output.set(chunk, cursor); cursor += chunk.length; });
    return output;
  }

  function ascii(text) {
    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index) & 0xff;
    return bytes;
  }

  function buildPdf(pages) {
    if (!pages.length) throw new Error('No receipt images to place in the PDF.');
    const offsets = [];
    const chunks = [];
    const push = value => chunks.push(typeof value === 'string' ? ascii(value) : value);
    const beginObject = (id, body) => {
      offsets[id] = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      push(id + ' 0 obj\n');
      push(body);
      push('\nendobj\n');
    };

    push('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    const catalogId = 1;
    const pagesId = 2;
    let nextId = 3;
    const pageRefs = [];
    const imageBodies = [];
    const contentBodies = [];
    pages.forEach(page => {
      const imageId = nextId++;
      const contentId = nextId++;
      const pageId = nextId++;
      const printableW = PAGE_W - MARGIN * 2;
      const printableH = PAGE_H - MARGIN * 2;
      const scale = Math.min(printableW / page.width, printableH / page.height, 1);
      const drawW = page.width * scale;
      const drawH = page.height * scale;
      const x = (PAGE_W - drawW) / 2;
      const y = (PAGE_H - drawH) / 2;
      const stream = 'q\n' + drawW.toFixed(2) + ' 0 0 ' + drawH.toFixed(2) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' cm\n/Im0 Do\nQ\n';
      imageBodies.push([imageId, page]);
      contentBodies.push([contentId, stream]);
      pageRefs.push([pageId, imageId, contentId]);
    });

    beginObject(catalogId, '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');
    beginObject(pagesId, '<< /Type /Pages /Kids [' + pageRefs.map(row => row[0] + ' 0 R').join(' ') + '] /Count ' + pageRefs.length + ' >>');
    pageRefs.forEach(([pageId, imageId, contentId]) => {
      beginObject(pageId, '<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + '] /Resources << /XObject << /Im0 ' + imageId + ' 0 R >> >> /Contents ' + contentId + ' 0 R >>');
    });
    contentBodies.forEach(([contentId, stream]) => {
      beginObject(contentId, '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream');
    });
    imageBodies.forEach(([imageId, page]) => {
      offsets[imageId] = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      push(imageId + ' 0 obj\n');
      push('<< /Type /XObject /Subtype /Image /Width ' + page.width + ' /Height ' + page.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + page.bytes.length + ' >>\nstream\n');
      push(page.bytes);
      push('\nendstream\nendobj\n');
    });

    const xrefStart = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const size = nextId;
    const xref = ['xref\n0 ' + size + '\n', '0000000000 65535 f \n'];
    for (let id = 1; id < size; id++) xref.push(String(offsets[id] || 0).padStart(10, '0') + ' 00000 n \n');
    push(xref.join(''));
    push('trailer\n<< /Size ' + size + ' /Root ' + catalogId + ' 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF\n');
    return concat(chunks);
  }

  async function fileToPage(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read ' + (file.name || 'image') + '.'));
      reader.readAsDataURL(file);
    });
    const parsed = dataUrlToBytes(dataUrl);
    if (parsed.mime === 'png') {
      const blob = new Blob([parsed.bytes], { type: 'image/png' });
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
      const match = /^data:image\/jpeg;base64,(.+)$/.exec(canvas.toDataURL('image/jpeg', 0.9));
      const bytes = base64ToBytes(match[1]);
      const size = jpegSize(bytes);
      return { bytes, mime: 'jpeg', width: size.width, height: size.height };
    }
    const size = jpegSize(parsed.bytes);
    return { bytes: parsed.bytes, mime: 'jpeg', width: size.width, height: size.height };
  }

  async function createReceiptPdf(files) {
    if (!files || !files.length) throw new Error('Choose receipt images first.');
    const pages = [];
    for (const file of files) pages.push(await fileToPage(file));
    return buildPdf(pages);
  }

  function downloadReceiptPdf(files, activityName) {
    return createReceiptPdf(files).then(bytes => {
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const cleaned = String(activityName || 'Receipts').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'Receipts';
      anchor.href = url;
      anchor.download = cleaned + '-Receipts.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return bytes.length;
    });
  }

  root.KPTFinancePdf = { createReceiptPdf, downloadReceiptPdf, jpegSize, buildPdf, dataUrlToBytes, base64ToBytes };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTFinancePdf;
})(typeof globalThis !== 'undefined' ? globalThis : this);
