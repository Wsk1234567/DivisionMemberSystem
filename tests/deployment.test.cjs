const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('built admin page embeds literal scripts without unresolved placeholders', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: path.join(__dirname, '..') });
  const html = read('build/apps-script/admin/Admin.html');
  assert.equal(/__(STYLE|LIBRARY|DOMAIN|WORKBOOK|FINANCETPL|FINANCEWB|FINANCEPDF|TRANSPORT|ADMIN|CONFIG)__/.test(html), false);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.equal(scripts.length, 11);
  for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script));
  assert.match(scripts[0], /KPT_CONFIG/);
  assert.equal(scripts[1], read('vendor/xlsx.full.min.js').replace(/<\/script/gi, '<\\/script'));
  assert.ok(scripts.some(script => script.includes('tccd-lang') && script.includes('KPTI18n')));
  assert.ok(scripts.some(script => script.includes('KPTActivityIntro')));
  assert.ok(scripts.some(script => script.includes('KPTTransport')));
  const githubAdmin = read('dist/admin.html');
  assert.match(githubAdmin, /src="config\.js\?v=[a-f0-9]{12}"/);
  assert.match(githubAdmin, /src="transport\.js\?v=[a-f0-9]{12}"/);
  assert.match(githubAdmin, /src="admin\.js\?v=[a-f0-9]{12}"/);
  assert.equal(read('src/transport.js').includes('portalLogin'), true);
});
test('public and admin Apps Script deployments have separate scope and execution identity', () => {
  const admin = JSON.parse(read('apps-script/admin/appsscript.json'));
  const publicManifest = JSON.parse(read('apps-script/public/appsscript.json'));
  // Admin API is called from GitHub Pages with session tokens; execute as deployer + Anyone.
  assert.equal(admin.webapp.executeAs, 'USER_DEPLOYING');
  assert.equal(admin.webapp.access, 'ANYONE_ANONYMOUS');
  assert.ok(admin.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'));
  assert.match(read('apps-script/admin/Code.gs'), /function authorizeExternalRequest\(\)/);
  assert.equal(publicManifest.webapp.executeAs, 'USER_DEPLOYING');
  assert.equal(publicManifest.webapp.access, 'ANYONE_ANONYMOUS');
  assert.deepEqual(publicManifest.oauthScopes, ['https://www.googleapis.com/auth/spreadsheets.readonly']);
  assert.equal(read('apps-script/public/Code.gs').includes('PRIVATE_SHEET_ID'), false);
  assert.equal(read('.github/workflows/pages.yml').includes('path: dist'), true);
});
test('public website uses credential-free CORS instead of JSONP', () => {
  const source = read('src/public.js');
  assert.match(source, /credentials:\s*'omit'/);
  assert.match(source, /mode:\s*'cors'/);
  assert.doesNotMatch(source, /createElement\('script'\)/);
});
test('admin transport detects deployment login pages and expires stale sessions promptly', () => {
  const source = read('src/transport.js');
  assert.match(source, /isGoogleAuthorisationPage/);
  assert.match(source, /Authorization needed/);
  assert.match(source, /Execute as Me \/ Anyone/);
  assert.match(source, /memoryTokens/);
  assert.match(source, /action: 'portalLogin', idToken: tokens\.idToken/);
  assert.match(source, /return callApi\(request, true\)/);
  assert.doesNotMatch(source, /setTimeout\(send, 400\);[\s\S]*?60000/);
  assert.doesNotMatch(source, /addEventListener\('load',[\s\S]*?markBridgeReady/);
  assert.match(source, /method:\s*'POST'/);
  assert.match(source, /'Content-Type':\s*'text\/plain;charset=UTF-8'/);
  assert.match(source, /return postApi\(body, base\)\.catch/);
  assert.doesNotMatch(source, /const attempts = \[bridgeCall/);
});
test('admin API falls back to a valid Google token when a portal session is missing', () => {
  const source = read('apps-script/admin/Code.gs');
  assert.match(source, /function portalRequestEmail_\(request\)/);
  assert.match(source, /if \(request\.idToken\) return verifyGoogleIdToken_\(request\.idToken\)\.email/);
  assert.ok((source.match(/portalRequestEmail_\(request\)/g) || []).length >= 3);
});
test('OC sidebar lists Annual Activity plus assigned activity packages', () => {
  const source = read('src/admin.js');
  assert.match(source, /ocNav = \[\['Documents', 'Documents'\]\]/);
  assert.match(source, /doc-package-link/);
  assert.match(source, /data-package=/);
  assert.match(source, /navLabel/);
  assert.doesNotMatch(source, /Document Packages/);
});
test('admin bridge derives an origin from the full GitHub Pages URL', () => {
  const source = read('apps-script/admin/Code.gs');
  assert.match(source, /function portalPublicOrigin_\(\)/);
  assert.match(source, /match\(\/\^\(https:/);
  assert.match(source, /const origin = portalPublicOrigin_\(\)/);
  assert.match(source, /e\.origin===allow/);
  assert.match(source, /setXFrameOptionsMode\(HtmlService\.XFrameOptionsMode\.ALLOWALL\)/);
});
test('source JavaScript and Apps Script compile; vendored Excel library checksum matches', () => {
  for (const name of ['domain.js', 'admin.js', 'public.js', 'workbook.js', 'finance-templates.js', 'finance-workbook.js', 'finance-pdf.js', 'demo-transport.js', 'transport.js', 'i18n.js', 'activity-intro.js']) assert.doesNotThrow(() => new vm.Script(read('src/' + name)), name);
  for (const project of ['admin', 'public']) assert.doesNotThrow(() => new vm.Script(read('apps-script/' + project + '/Code.gs')), project);
  assert.equal(crypto.createHash('sha256').update(read('vendor/xlsx.full.min.js')).digest('hex'), read('vendor/SHA256.txt').trim());
});
