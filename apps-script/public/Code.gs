function publicPayload_() {
  const id = PropertiesService.getScriptProperties().getProperty('PUBLIC_SHEET_ID');
  if (!id) throw new Error('Public service is not configured.');
  const read = range => Sheets.Spreadsheets.Values.get(id, range, { valueRenderOption: 'FORMATTED_VALUE' }).values || [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const marker = read('Manifest!A1:B1')[0];
    if (!marker || !/^[01]$/.test(String(marker[0]))) throw new Error('Invalid projection marker.');
    const value = JSON.parse(read('Store' + marker[0] + '!A:A').map(row => { if (!String(row[0]).startsWith('KPT:')) throw new Error('Invalid projection.'); return row[0].slice(4); }).join(''));
    const after = read('Manifest!A1:B1')[0];
    if (marker.join(':') !== after.join(':')) continue;
    return { schema: 1, revision: Number(value.revision), updatedAt: String(value.updatedAt), members: value.members.map(member => ({ name: String(member.name), sjamId: String(member.sjamId), status: String(member.status), awards: member.awards.map(award => ({ name: String(award.name), date: String(award.date), category: String(award.category), level: String(award.level) })) })) };
  }
  throw new Error('Data is being updated. Please retry.');
}
function doGet(event) {
  const callback = String(event && event.parameter && event.parameter.callback || '');
  if (callback && !/^kpt_[a-zA-Z0-9_]{1,80}$/.test(callback)) return ContentService.createTextOutput('{"ok":false,"error":"Invalid callback"}').setMimeType(ContentService.MimeType.JSON);
  let output;
  try { output = { ok: true, data: publicPayload_() }; }
  catch (error) { output = { ok: false, error: 'Member information is temporarily unavailable. Please retry shortly.' }; }
  const json = JSON.stringify(output).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return ContentService.createTextOutput(callback ? callback + '(' + json + ');' : json).setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
