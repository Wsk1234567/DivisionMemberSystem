(function (root) {
  'use strict';
  // Hardcoded activity introductions. Keys match DocPackages.activityType.
  const intros = {
    AGM: {
      en: {
        eyebrow: 'About · AGM',
        what: 'Annual General Meeting — TCCD’s yearly meeting for reports, elections and handover.',
        why: 'Settle the year, elect the next committee, and lock next year’s plan.',
        do: 'Open this package → download templates → edit offline → upload → Submit.',
        note: 'Owner or Secretary approves. Only this package’s OC email can open it. Rejected files show red remarks — fix and upload again.',
        guide: [
          { title: 'What', body: 'The Annual General Meeting (AGM) is TCCD’s division-wide yearly meeting.' },
          { title: 'Purpose', body: 'Department reports, committee election, file handover, and next-year plan.' },
          { title: 'Typical flow', body: 'Before the meeting: application letter and invitations. On the day: department reports → election → handover → speeches. After the meeting: minutes, committee board, archive.' },
          { title: 'Must deliver', body: '1) Application letter to ASO  2) Email to ASO  3) Invitations (JDO / speaker / guests)  4) Agenda  5) Action Plan  6) Meeting Minutes  7) Committee Board. Optional: venue letter, photo pack, finance I&E.' },
          { title: 'Roles', body: 'Owner creates the package and sets OC email. Secretary drafts and uploads. OC of this AGM uploads and follows due dates. Owner or Secretary approves. Treasurer stays out of this pack.' },
          { title: 'System map', body: 'Activity type AGM · Annual Activity checklist · optional Attendance (not DIM) · Treasurer Work only if money is involved.' },
          { title: 'Rules', body: 'Rejected files show red remarks — fix, re-upload, Submit again. When every required item is Approved, the package is complete. Package OC email must match the Gmail that signs in.' }
        ]
      },
      zh: {
        eyebrow: '关于 · AGM',
        what: '年度大会（AGM）——本区一年一度的正式会议：报告、换届、交接。',
        why: '交代过去一年，选出新工委，并定下来年方向。',
        do: '打开本包 → 下载模板 → 本地改好 → 上传 → 提交。',
        note: 'Owner 或 Secretary 批准。只有本包 OC 的 Gmail 能打开。退回看红字，改完再传。',
        guide: [
          { title: '是什么', body: '年度大会（AGM）是本区面向全区的年度正式会议。' },
          { title: '目的', body: '各部门报告、换届、文件交接、通过来年方向。' },
          { title: '流程', body: '开会前：申请信与邀请。当天：部门报告 → 选举 → 交接 → 致辞。开完后：会议记录、执委表、归档。' },
          { title: '必须交', body: '1) 致 ASO 申请信  2) 致 ASO 邮件  3) 邀请函（JDO / 致辞嘉宾 / 来宾）  4) Agenda  5) Action Plan  6) 会议记录  7) 执委表。可选：场地申请、照片包、财务 I&E。' },
          { title: '角色', body: 'Owner 开包并填 OC email。Secretary 起草上传。本包 OC 按截止日上传。Owner 或 Secretary 批准。Treasurer 不进本文件包。' },
          { title: '系统对应', body: '活动类型 AGM · 年度活动清单 · 可选出勤（不算 DIM）· 若涉及金钱走 Treasurer Work。' },
          { title: '规则', body: '退回看红字，改完再传。全部必交文件 Approved 后整包完成。包上 OC email 必须与登录 Gmail 一致。' }
        ]
      }
    },
    CadetEnrolment: {
      en: {
        eyebrow: 'About · Cadet Enrolment',
        what: 'Cadet Enrolment is the formal intake of new members into the division.',
        why: 'Register new cadets, complete personal records, and start their yearly participation.',
        do: 'Collect forms → oath / ceremony if any → upload required letters → Submit → approve.',
        note: 'Keep IC and family contacts private. Add each new member in Members after the list is final.'
      },
      zh: {
        eyebrow: '关于 · Cadet Enrolment',
        what: 'Cadet Enrolment（新团员入团）是本区正式接纳新成员的流程。',
        why: '完成登记、建立个人档案，并开始计算他们的年度参与。',
        do: '收齐表格 → 需要则举行宣誓/入团仪式 → 上传所需文件 → 提交 → 等批准。',
        note: 'IC 与家长联络要保密。名单定稿后，在 Members 里逐个加入新团员。'
      }
    },
    OrientationDay: {
      en: {
        eyebrow: 'About · Orientation Day',
        what: 'Orientation Day introduces new and existing cadets to TCCD routines, ranks and the year plan.',
        why: 'Help newcomers settle, align discipline, and publish the year’s activity calendar.',
        do: 'Run the session → record attendance → upload key slides or reports → Submit.',
        note: 'Attendance here does not replace DIM. Create a separate Activities row if you need official DIM points.'
      },
      zh: {
        eyebrow: '关于 · Orientation Day',
        what: 'Orientation Day（迎新日）让新旧团员认识本区制度、编制与年度计划。',
        why: '帮助新人上手、统一纪律，并公布全年重要活动。',
        do: '办活动 → 记录出席 → 上传讲义或简报 → 提交。',
        note: '这里的出席**不能**代替 DIM。若要计 DIM，另建 Activities 行并打 DIM 标签。'
      }
    },
    Exam: {
      en: {
        eyebrow: 'About · EFA / BFA Exam',
        what: 'Emergency / Basic First Aid examination for cadets (and related first-aid courses).',
        why: 'Pass or Fail both count toward annual Examination participation for efficiency.',
        do: 'Run training if needed → exam day → enter results → certificates → Submit package files.',
        note: 'Absent does not count. Pending counts only when participation is confirmed. Link exams to the Exam-tagged activity when possible.'
      },
      zh: {
        eyebrow: '关于 · EFA / BFA 考试',
        what: '团员急救考试（EFA / BFA）及相关急救课程考核。',
        why: '通过或不及格都算年度「考试参与」，影响 Efficient。',
        do: '需要则先培训 → 考试当天 → 录入成绩 → 证书号 → 上传本包文件并提交。',
        note: 'Absent 不算参与。Pending 须确认出席才算。尽量把考试挂到带 Exam 标签的活动上。'
      }
    },
    MidTermReview: {
      en: {
        eyebrow: 'About · MidTerm Review',
        what: 'Mid-term review meeting to check training, attendance and progress against the year plan.',
        why: 'Catch gaps in duty hours, DIM count and paperwork before inspection and exams.',
        do: 'Compile stats → meeting → action list → upload minutes → Submit.',
        note: 'This review is not DIM. Use it to drive catch-up on Duty, DIM and documents.'
      },
      zh: {
        eyebrow: '关于 · MidTerm Review',
        what: '期中检讨会：检查训练、出席与年度计划进度。',
        why: '在检阅和考试前，补上勤务时数、DIM 次数和文件缺口。',
        do: '汇总数据 → 开会 → 列出改进项 → 上传会议记录 → 提交。',
        note: '检讨会本身不算 DIM。重点是推动补 Duty、DIM 和各类文件。'
      }
    },
    JuniorCamp: {
      en: {
        eyebrow: 'About · Junior Camp',
        what: 'Junior Camp is a multi-day camp for junior cadets focused on discipline, first aid and teamwork.',
        why: 'Build skills and unit spirit; expenses and sponsors must be documented.',
        do: 'Plan → camp days → attendance and photos → finance I&E → Submit camp documents.',
        note: 'Finance lives in Treasurer Work. Mark absence reasons; camp attendance is not automatic DIM.'
      },
      zh: {
        eyebrow: '关于 · Junior Camp',
        what: 'Junior Camp（初级营）以纪律、急救与团队为主的多日营会。',
        why: '练技能、增凝聚力；花费与赞助必须有记录。',
        do: '筹备 → 营期 → 出席与照片 → 财务 I&E → 上传本营文件并提交。',
        note: '账目在 Treasurer Work。缺席要说明原因；营会出席不会自动算 DIM。'
      }
    },
    InspectionDay: {
      en: {
        eyebrow: 'About · Inspection Day',
        what: 'Formal division inspection of uniform, drill, first aid and readiness.',
        why: 'Required for annual efficiency — cadets must be marked present on an Inspection activity.',
        do: 'Prepare squads → inspection day → mark Attendance → upload scores/photos → Submit.',
        note: 'Tag the activity as Inspection. Without a Present mark, yearly efficiency stays Pending or fails inspection condition.'
      },
      zh: {
        eyebrow: '关于 · Inspection Day',
        what: '正式检阅：制服、操练、急救与待命状态的全区检查。',
        why: '年度效率必要条件——团员必须在带 Inspection 标签的活动上记为出席。',
        do: '备队 → 检阅日 → 勾选 Attendance → 上传评分/照片 → 提交。',
        note: '活动标签选 Inspection。没有 Present，年度效率的检阅条件就过不了。'
      }
    }
  };
  function introFor(activityType, lang) {
    const key = String(activityType || '').trim();
    const pack = intros[key] || null;
    const langKey = lang === 'zh' ? 'zh' : 'en';
    if (!pack) {
      return {
        eyebrow: langKey === 'zh' ? '关于 · 活动' : 'About · Activity',
        what: langKey === 'zh' ? '自定义或未收录的活动类型。请按 Owner 要求准备文件与出席记录。' : 'Custom or not-yet-listed activity type. Follow the Owner’s file and attendance requirements.',
        why: langKey === 'zh' ? '用于会务归档与效率相关记录时，仍需按清单交件。' : 'Still complete the checklist when this activity is used for records or efficiency.',
        do: langKey === 'zh' ? '打开本包 → 按清单上传 → 提交 → 等批准。' : 'Open the package → upload per checklist → Submit → wait for approval.',
        note: langKey === 'zh' ? '若类型应是 AGM / Inspection / Exam 等，请让 Owner 改成标准活动类型。' : 'If this should be AGM / Inspection / Exam, ask the Owner to set the standard activity type.'
      };
    }
    return pack[langKey] || pack.en;
  }
  root.KPTActivityIntro = {
    intros,
    introFor,
    has: type => !!intros[String(type || '').trim()]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KPTActivityIntro;
})(typeof globalThis !== 'undefined' ? globalThis : this);
