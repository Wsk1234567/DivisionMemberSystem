(function (root) {
  'use strict';
  // Hardcoded activity introductions. Keys match DocPackages.activityType.
  // Override later with package-level text if needed; v1 is code-only.
  const intros = {
    AGM: {
      en: {
        eyebrow: 'About · AGM',
        what: 'Annual General Meeting — TCCD’s yearly meeting for reports, elections and handover.',
        why: 'Settle the year, elect the next committee, and lock next year’s plan.',
        do: 'Open this package → download templates → edit offline → upload → Submit.',
        note: 'Owner or Secretary approves. Only this package’s OC email can open it. Rejected files show red remarks — fix and upload again.'
      },
      zh: {
        eyebrow: '关于 · AGM',
        what: '年度大会（AGM）——本区一年一度的正式会议：报告、换届、交接。',
        why: '交代过去一年，选出新工委，并定下来年方向。',
        do: '打开本包 → 下载模板 → 本地改好 → 上传 → 提交。',
        note: 'Owner 或 Secretary 批准。只有本包 OC 的 Gmail 能打开。退回看红字，改完再传。'
      }
    }
  };
  function introFor(activityType, lang) {
    const pack = intros[String(activityType || '').trim()] || intros.AGM;
    const key = lang === 'zh' ? 'zh' : 'en';
    return pack[key] || pack.en;
  }
  root.KPTActivityIntro = { intros, introFor, has: type => !!intros[String(type || '')] };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTActivityIntro;
})(typeof globalThis !== 'undefined' ? globalThis : this);
