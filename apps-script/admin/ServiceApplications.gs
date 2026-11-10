// ServiceApplications.gs — Service Stripe & Star helpers (concatenated by build)
// Do NOT call Google services at module load time.

function serviceListResponse_(state) {
  const projection = KPT.serviceListProjection(state);
  const unreadCount = (projection.applications || []).filter(a => ['PendingSecretary', 'NeedsInfo'].includes(a.status)).length;
  return { applications: projection.applications, batches: projection.batches, unreadCount };
}

function serviceAnonymousSubmit_(request) {
  // Honeypot
  if (request.website && String(request.website).length > 0) {
    return { ok: true, data: { received: true, reference: 'SVC-PLACEHOLDER' } };
  }
  const clientRequestId = String(request.clientRequestId || '').slice(0, 100);
  if (!clientRequestId) return { ok: false, error: 'Request ID is required.' };
  // Throttle via CacheService (TTL, no persistent rate keys)
  const cache = CacheService.getScriptCache();
  const globalKey = 'SVC_GLOBAL_RATE';
  const identityHash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, clientRequestId).map(b => (b + 256) % 256).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  const idKey = 'SVC_ID_' + identityHash;
  const globalCount = Number(cache.get(globalKey) || 0);
  const idCount = Number(cache.get(idKey) || 0);
  if (globalCount >= 30) return { ok: false, error: 'Too many submissions. Please try again later.' };
  if (idCount >= 3) return { ok: false, error: 'Too many submissions from this request. Please try again later.' };
  cache.put(globalKey, String(globalCount + 1), 3600);
  cache.put(idKey, String(idCount + 1), 3600);
  // Create with lock; dedup inside lock takes priority
  return withLock_(function () {
    const state = loadState_();
    const context = { actor: 'anonymous', now: new Date().toISOString(), uuid: function () { return Utilities.getUuid(); } };
    try {
      const result = KPT.serviceSubmit(state, request, context);
      if (!result.deduplicated) {
        commit_(state);
      }
      return { ok: true, data: { received: true, reference: result.reference } };
    } catch (error) {
      return { ok: false, error: String(error.message || error).slice(0, 500) };
    }
  });
}

function serviceValidateUpload_(request) {
  const kind = String(request.kind || '');
  const validKinds = ['duty', 'signedStripe', 'signedStar', 'signedSSS', 'covering', 'support', 'reply', 'combinedDuty', 'combinedSignedStripe', 'combinedSignedStar', 'combinedSignedSSS'];
  if (!validKinds.includes(kind)) throw new Error('Invalid attachment kind.');
  const fileName = String(request.fileName || '').slice(0, 200);
  if (!fileName) throw new Error('File name is required.');
  const mime = String(request.mime || '').slice(0, 100);
  // Signed forms, duty, and combined variants must be PDF
  const pdfRequired = ['duty', 'signedStripe', 'signedStar', 'signedSSS', 'combinedDuty', 'combinedSignedStripe', 'combinedSignedStar', 'combinedSignedSSS'];
  if (pdfRequired.includes(kind) && !/pdf$/i.test(fileName)) {
    throw new Error('Duty records, signed forms and combined forms must be PDF files.');
  }
  // Validate PDF magic bytes for PDF files
  const bytes = Utilities.base64Decode(String(request.base64 || ''));
  if (!bytes || !bytes.length) throw new Error('File content is empty.');
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Attachment exceeds the 10 MiB limit.');
  if (/pdf$/i.test(fileName)) {
    if (bytes.length < 5 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46 || bytes[4] !== 0x2D) {
      throw new Error('File does not appear to be a valid PDF.');
    }
  }
  // Server-side mime consistency for images
  if (/\.(jpg|jpeg)$/i.test(fileName) && !(bytes[0] === 0xFF && bytes[1] === 0xD8)) throw new Error('File does not appear to be a valid JPEG.');
  if (/\.png$/i.test(fileName) && !(bytes[0] === 0x89 && bytes[1] === 0x50)) throw new Error('File does not appear to be a valid PNG.');
  return { kind, fileName, mime: mime || 'application/pdf', bytes: bytes.length };
}

function serviceStoreFile_(fileName, base64) {
  const folderId = serviceFolderId_();
  const blob = Utilities.newBlob(Utilities.base64Decode(String(base64)), 'application/octet-stream', String(fileName).slice(0, 200));
  return DriveApp.getFolderById(folderId).createFile(blob).getId();
}

function serviceDeleteFile_(fileId) {
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* best-effort cleanup */ }
}

function serviceFolderId_() {
  const props = properties_();
  let folderId = props.getProperty('SERVICE_ATTACHMENTS_FOLDER_ID');
  if (folderId) return folderId;
  const folder = DriveApp.createFolder('TCCD Service Attachments');
  folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  folderId = folder.getId();
  props.setProperty('SERVICE_ATTACHMENTS_FOLDER_ID', folderId);
  return folderId;
}

function serviceDownloadFile_(state, attachmentId) {
  const id = String(attachmentId || '');
  const allTargets = [...(state.serviceApplications || []), ...(state.serviceBatches || [])];
  for (const target of allTargets) {
    const att = (target.attachments || []).find(a => a.id === id);
    if (att && att.fileId) {
      const file = DriveApp.getFileById(att.fileId);
      return { fileName: file.getName() || att.fileName, mime: att.mime || 'application/octet-stream', base64: Utilities.base64Encode(file.getBlob().getBytes()) };
    }
  }
  throw new Error('Attachment not found.');
}

function serviceGetTemplates_(neededKinds) {
  const props = properties_();
  const templates = {};
  // Only fetch templates for needed kinds
  const kinds = Array.isArray(neededKinds) && neededKinds.length ? neededKinds : ['signedStripe', 'signedStar'];
  if (kinds.includes('signedStripe')) {
    const stripeId = props.getProperty('SERVICE_STRIPE_TEMPLATE_ID');
    if (stripeId) {
      try {
        const file = DriveApp.getFileById(stripeId);
        templates.Stripe = Utilities.base64Encode(file.getBlob().getBytes());
      } catch (e) { templates.Stripe = null; }
    }
  }
  if (kinds.includes('signedSSS')) {
    const stripeId = props.getProperty('SERVICE_STRIPE_TEMPLATE_ID');
    if (stripeId) {
      try {
        const file = DriveApp.getFileById(stripeId);
        templates.SSS = Utilities.base64Encode(file.getBlob().getBytes());
      } catch (e) { templates.SSS = null; }
    }
  }
  if (kinds.includes('signedStar')) {
    const starId = props.getProperty('SERVICE_STAR_TEMPLATE_ID');
    if (starId) {
      try {
        const file = DriveApp.getFileById(starId);
        templates.Star = Utilities.base64Encode(file.getBlob().getBytes());
      } catch (e) { templates.Star = null; }
    }
  }
  // Never return Drive IDs — only base64 content
  return { templates };
}
