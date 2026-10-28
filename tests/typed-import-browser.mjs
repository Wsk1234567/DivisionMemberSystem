// Typed import UI browser tests (port 4186). Fictional data only.
// KPTWorkbook is mocked to the frozen contract so UI flow can be verified
// before Agent2 lands real single-sheet workbook support.
import assert from 'node:assert/strict';

const playwrightUrl = process.env.PLAYWRIGHT_MODULE || 'playwright';
const chromiumPath = process.env.CHROMIUM_EXECUTABLE || undefined;
const BASE = process.env.IMPORT_BASE || 'http://127.0.0.1:4186';

const { chromium } = await import(playwrightUrl);

const MOCK_WORKBOOK = `
window.KPTWorkbook = {
  parse(buffer, options) {
    window.__wbCalls = window.__wbCalls || [];
    window.__wbCalls.push({ kind: 'parse', options: options || null });
    const table = options && options.table;
    const sheets = table ? [table, 'Notes', 'OldSheet'] : ['Members', 'Attendance', 'Exams', 'Duty', 'Awards', 'Activities', 'Enrolments'];
    if (table === 'Missing') {
      return { workbook: { SheetNames: ['Other'] }, errors: [], ignoredSheets: [] };
    }
    return {
      workbook: { SheetNames: sheets, __typed: table || 'ALL' },
      errors: [],
      ignoredSheets: table ? ['Notes', 'OldSheet'] : []
    };
  },
  create(state, template, summaryRows, options) {
    window.__wbCalls = window.__wbCalls || [];
    window.__wbCalls.push({ kind: 'create', template: !!template, options: options || null });
    return { SheetNames: options && options.table ? [options.table] : ['Members', 'Attendance'] };
  },
  download(state, template, summaryRows, options) {
    window.__wbCalls = window.__wbCalls || [];
    window.__wbCalls.push({ kind: 'download', template: !!template, options: options || null });
  }
};
`;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/workbook.js', route => route.fulfill({
      status: 200, contentType: 'application/javascript; charset=utf-8', body: MOCK_WORKBOOK
    }));
    await page.goto(BASE + '/admin.html');
    await page.waitForFunction(() => window.KPTTransport && document.querySelector('#account'));
    await page.locator('#reload').click();
    await page.waitForTimeout(100);
    // Owner may land in portal — switch to Admin work first.
    const adminMode = page.locator('[data-action="setMode"][data-id="admin"]');
    if (await adminMode.count()) await adminMode.first().click();
    await page.waitForTimeout(100);
    const importNav = page.locator('[data-nav="Import"]');
    if (await importNav.count()) await importNav.first().click();
    else {
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('[data-action="navigate"]')].find(b => b.dataset.id === 'Import');
        if (btn) btn.click();
      });
    }
    await page.locator('#import-type').waitFor({ timeout: 10000 });

    // Default is Members.
    assert.equal(await page.locator('#import-type').inputValue(), 'Members');
    const typeText = await page.locator('#content').innerText();
    assert.match(typeText, /这次要导入什么|What are you importing/);
    assert.match(typeText, /选择要导入的类型|Choose what you are importing/);

    // Template download is typed.
    await page.locator('[data-action="importTemplate"]').click();
    const templateCall = await page.evaluate(() => window.__wbCalls.filter(c => c.kind === 'download').at(-1));
    assert.equal(templateCall.options.table, 'Members');
    assert.equal(templateCall.template, true);

    // Existing records download keeps IDs (template=false, typed).
    await page.locator('[data-action="importExisting"]').click();
    const existingCall = await page.evaluate(() => window.__wbCalls.filter(c => c.kind === 'download').at(-1));
    assert.equal(existingCall.options.table, 'Members');
    assert.equal(existingCall.template, false);

    // Choose a file and preview — parse gets options; ignored sheets shown.
    await page.locator('#excel-file').setInputFiles({ name: 'members.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK\x03\x04 fake') });
    await page.locator('[data-action="previewImport"]').click();
    await page.locator('#import-preview .card').waitFor({ timeout: 10000 });
    const previewText = await page.locator('#import-preview').innerText();
    assert.match(previewText, /不导入的其他页|Not imported/);
    assert.match(previewText, /Notes/);
    const parseCall = await page.evaluate(() => window.__wbCalls.filter(c => c.kind === 'parse').at(-1));
    assert.equal(parseCall.options.table, 'Members');

    // Switch type clears preview and invalidates generation.
    await page.selectOption('#import-type', 'Attendance');
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#import-preview').innerText(), '');
    const note = await page.locator('#notice').innerText();
    assert.match(note, /类型已切换|Type changed/);

    // Preview failure must not keep a committable previous preview.
    await page.evaluate(() => {
      window.KPTWorkbook.parse = () => { throw new Error('bad file'); };
    });
    await page.locator('#excel-file').setInputFiles({ name: 'bad.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK\x03\x04 bad') });
    await page.locator('[data-action="previewImport"]').click();
    await page.waitForTimeout(100);
    const failText = await page.locator('#import-preview').innerText();
    assert.match(failText, /bad file|无法读取|Could not read/);
    assert.equal(await page.locator('[data-action="commitImport"]').count(), 0, 'no commit button after failed preview');

    assert.deepEqual(errors, []);
    console.log('PASS: typed import picker, typed template/existing, ignoredSheets, generation clear, no stale commit');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
