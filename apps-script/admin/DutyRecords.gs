// DutyRecords.gs — Duty In Charge / Duty Record helpers (concatenated by build)
// Do NOT call Google services at module load time.

function dutyInChargeList_() {
  return configuration_().dutyInCharges || [];
}

function dutyWorkspaceData_(state) {
  return KPT.dutyWorkspaceProjection(state);
}

function dutyValidateProof_(request) {
  const fileName = String(request.fileName || '').slice(0, 200);
  if (!fileName) throw new Error('File name is required.');
  const mime = String(request.mime || '').slice(0, 100) || 'application/octet-stream';
  const bytes = Utilities.base64Decode(String(request.base64 || ''));
  if (!bytes || !bytes.length) throw new Error('File content is empty.');
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Attachment exceeds the 10 MiB limit.');
  return { fileName, mime, bytes: bytes.length };
}

function dutyImportPreview_(state, request, context) {
  // Dry run on a copy: dutyImportRows returns a proposed state, never written here.
  const preview = KPT.dutyImportRows(KPT.copy(state), request, context);
  return { changes: preview.changes, errors: preview.errors, revision: preview.revision };
}

function dutyImportCommit_(state, request, context) {
  const preview = KPT.dutyImportRows(state, request, context);
  if (preview.errors.length) {
    const first = preview.errors[0];
    throw new Error((first.row ? 'Row ' + first.row + ': ' : '') + first.message);
  }
  if (!preview.changes.length) return dutyWorkspaceData_(state);
  backup_(state, 'Before duty import');
  commit_(preview.state);
  return dutyWorkspaceData_(preview.state);
}

function dutyRecordAction_(action, state, request, context) {
  backup_(state, 'Before duty change');
  const result = KPT[action](state, request, context);
  commit_(result.state);
  return dutyWorkspaceData_(result.state);
}

function dutyProofContent_(row) {
  if (!row || !row.fileId) return null;
  try {
    const file = DriveApp.getFileById(row.fileId);
    return { fileName: file.getName() || row.fileName, mime: row.mime || 'application/octet-stream', base64: Utilities.base64Encode(file.getBlob().getBytes()) };
  } catch (error) {
    return null;
  }
}

function dutyProofUpload_(state, request, context) {
  const validated = dutyValidateProof_(request);
  const previous = (state.DutyProofs || []).find(row => row.activityId === String(request.activityId || '').trim());
  backup_(state, 'Before duty change');
  // Store file first; clean up on failure like serviceUpload.
  let fileId = null;
  try {
    fileId = serviceStoreFile_(validated.fileName, request.base64);
    const result = KPT.dutyProofSave(state, Object.assign({}, request, { fileName: validated.fileName, mime: validated.mime, bytes: validated.bytes }), context);
    result.proof.fileId = fileId;
    commit_(result.state);
    if (previous && previous.fileId) serviceDeleteFile_(previous.fileId);
    return dutyWorkspaceData_(result.state);
  } catch (error) {
    if (fileId) serviceDeleteFile_(fileId);
    throw error;
  }
}

function dutyReportBundleData_(state, request) {
  const report = KPT.dutyReportBundle(state, request);
  const activityIds = new Set(report.lines.map(line => line.activityId));
  const proofs = (state.DutyProofs || []).filter(row => activityIds.has(row.activityId)).map(row => {
    const content = dutyProofContent_(row);
    return { activityId: row.activityId, fileName: row.fileName, mime: row.mime || 'application/octet-stream', base64: content ? content.base64 : '' };
  });
  return { report, proofs };
}

function dutyProofDownload_(state, request) {
  const row = (state.DutyProofs || []).find(item => item.id === String(request.proofId || ''));
  if (!row) throw new Error('Proof not found.');
  const content = dutyProofContent_(row);
  if (!content) throw new Error('File content unavailable. Please re-upload the proof.');
  return content;
}
