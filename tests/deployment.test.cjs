const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
test('public and admin Apps Script deployments have separate scope and execution identity', () => {
  const admin = JSON.parse(read('apps-script/admin/appsscript.json'));
  const publicManifest = JSON.parse(read('apps-script/public/appsscript.json'));
  assert.equal(admin.webapp.executeAs, 'USER_ACCESSING');
  assert.equal(publicManifest.webapp.executeAs, 'USER_DEPLOYING');
  assert.equal(publicManifest.webapp.access, 'ANYONE_ANONYMOUS');
  assert.deepEqual(publicManifest.oauthScopes, ['https://www.googleapis.com/auth/spreadsheets.readonly']);
  assert.equal(read('apps-script/public/Code.gs').includes('PRIVATE_SHEET_ID'), false);
  assert.equal(read('.github/workflows/pages.yml').includes('path: dist'), true);
});
test('source JavaScript and Apps Script compile; vendored Excel library checksum matches', () => {
  for (const name of ['domain.js', 'admin.js', 'public.js', 'workbook.js', 'demo-transport.js', 'transport.js']) assert.doesNotThrow(() => new vm.Script(read('src/' + name)), name);
  for (const project of ['admin', 'public']) assert.doesNotThrow(() => new vm.Script(read('apps-script/' + project + '/Code.gs')), project);
  assert.equal(crypto.createHash('sha256').update(read('vendor/xlsx.full.min.js')).digest('hex'), read('vendor/SHA256.txt').trim());
});
