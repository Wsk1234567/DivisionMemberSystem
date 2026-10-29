const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const rfBytes = fs.readFileSync(path.join(root, 'templates', 'Reimbursement Form Empty.xlsx'));
const ieBytes = fs.readFileSync(path.join(root, 'templates', 'IncomeExpenses Badminton Blank Base.xlsx'));
const toB64 = buf => Buffer.from(buf).toString('base64');
const js = `(function (root) {
  'use strict';
  root.KPTFinanceTemplates = {
    reimbursement: '${toB64(rfBytes)}',
    incomeExpenses: '${toB64(ieBytes)}'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTFinanceTemplates;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
const output = path.join(root, 'src', 'finance-templates.js');
if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== js) {
  const temporary = output + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(temporary, js);
    fs.renameSync(temporary, output);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
console.log('templates embedded', fs.statSync(output).size);
