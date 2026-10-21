(function (root) {
  'use strict';
  // Hardcoded activity introductions. Keys match DocPackages.activityType.
  const intros = {
    AGM: {
      en: {
        eyebrow: 'OC guide · AGM',
        what: 'Annual General Meeting — the division’s yearly meeting for reports, election and handover.',
        why: 'Finish the year with clear reports, elect the next chairperson/committee, hand over files, and agree next year’s plan.',
        do: 'Use this package as your work board: download templates, upload, Submit. Owner or Secretary approves.',
        note: 'You are OC only for this package’s Gmail. Rejected files show red remarks — fix and Submit again.',
        guide: [
          {
            title: '1 · Event introduction — What is AGM?',
            body: 'AGM (Annual General Meeting) is the formal yearly meeting of SMJK Triang Combined Cadet Division.\n\nIt is not a normal training night. Members come to:\n• Hear how the past year went (department reports)\n• Vote for the next leadership (Chairperson and committee)\n• Watch the old committee hand files to the new one\n• Discuss next year’s activities together\n\nWho usually attends: all Cadets, NCOs, JDO/DO. You may invite ASO Cadet to attend or give a speech.\n\nWhere / how long: follow last year’s setup (last AGM at SMJK Triang, about 10:00–12:00 / roughly two hours). Confirm venue with school and update Event date in this package.'
          },
          {
            title: '2 · Event overview — What does the day look like?',
            body: 'A typical AGM day:\n\n• Cadets and NCOs seated by squad\n• Teacher Advisor, JDO/DO, optional ASO Cadet sit at the front\n• MC (Master of Ceremonies) runs the whole programme from the Action Plan\n• Ten departments give short reports\n• Election for chairperson / committee (paper ballots)\n• Handover of documents, department by department\n• Close with thanks and group photo if needed\n\nOC’s job is not to give every speech — it is to make sure every station (MC, reports, election, handover, photo, PA) is ready and on time.'
          },
          {
            title: '3 · Event programme — Full run of the day',
            body: 'Follow the yearly Action Plan (example from AGM 2026):\n\n1) Preparation — all committees arrange seats; AV officer sets slides and microphones\n2) Opening — MC opens; other committees keep members orderly\n3) Teacher Advisor speech — MC invites TA; photography\n4) Department reports (fixed order):\n   Secretary → Treasurer → Cadet Voluntary Service Coordinator → Storekeeper → First Aid Room Duty In Charge → Medicine Board In Charge → Activity In Charge → Training In Charge → Recruit In Charge → Knowledge Board In Charge\n   (PA/mics ready; photography)\n5) Election — MC explains voting; committees hand out ballots; members vote (NCOs watch to stop discussion); count and announce\n6) Rest time — keep order; share leftover refreshments if any\n7) JDO speech — MC invites JDO; photography\n8) New committee announcement — MC reads the new list\n9) Handover ceremony — old → new committee, same order as reports: Secretary, Treasurer, CVS Coordinator, Storekeeper, First Aid, Medicine, Activity, Training, Recruit, Knowledge Board\n10) Upcoming event — discuss next year’s plan together\n11) ASO Cadet speech (if invited) — photography\n12) Dismiss — MC thanks guests, ASO Cadet, JDO, Teacher Advisor and all members; close'
          },
          {
            title: '4 · Preparation & work scope — What must be ready',
            body: 'No fixed number of weeks — start as soon as OC is confirmed, in this order:\n\nA. Paperwork (this Annual Activity package)\n• Application letter + email to ASO\n• Invitations: JDO/DO, Teacher Advisor, ASO Cadet, other guests\n• Agenda + Action Plan for the day\n\nB. People\n• Confirm MC\n• Confirm AV / slides / mic person\n• Confirm election counters\n• Brief each department to prepare a short report\n\nC. Logistics\n• Venue booking with school\n• Seating plan (members / VIPs / committee)\n• Ballots, pens, ballot box\n• Refreshments if budget allows\n• Camera / phone for official photos\n\nD. After the day\n• Minutes + Committee Board upload here\n• Photo archive\n• Any spend → Treasurer Work\n• File handover to new committee'
          },
          {
            title: '5 · OC responsibilities & checklist',
            body: 'As Organizing Chairman you:\n• Own this package (only your Gmail opens it)\n• Break work into stations: paperwork, MC/programme, election, handover, AV, photo, logistics\n• Assign one lead per station and chase them gently\n• Keep this checklist Approved item by item\n• Cannot approve your own files — Owner or Secretary does\n\nMinimum checklist for AGM:\n1. Application letter — ASO\n2. Email to ASO\n3. Invitations (JDO / speaker / guests)\n4. Agenda\n5. Action Plan\n6. Meeting Minutes (after the day)\n7. Committee Board (after the day)\n\nOptional: venue letter, photo pack, finance I&E.\n\nDay-of reminder cards (print or share):\n• MC: follow Action Plan order, no free-style reordering\n• Election lead: paper ballots only; NCOs stop any discussion before voting\n• Handover lead: files go in report order; photograph each handover\n• AV: slides for speeches and election result\n• Secretary: collect written reports before the day'
          }
        ]
      },
      zh: {
        eyebrow: 'OC 指南 · AGM',
        what: '年度大会——本区年度正式会议：报告、选举、交接。',
        why: '把一年交代清楚，选出下一届主席与工委，完成文件交接，并谈妥来年计划。',
        do: '把本包当工作板：下载模板 → 上传 → 提交。Owner 或 Secretary 批准。',
        note: '你只是本包 OC（以本包 Gmail 登录）。退回看红字，改完再提交。',
        guide: [
          {
            title: '1 · 活动介绍 — AGM 是什么？',
            body: 'AGM（Annual General Meeting）是 SMJK Triang Combined Cadet Division 的年度正式大会。\n\n它不是普通训练课。团员到场是为了：\n• 听取过去一年各部门报告\n• 投票选出下一届主席与工委\n• 见证旧委员会把文件交给新委员会\n• 一起讨论来年活动\n\n通常出席：全体 Cadet、NCO、JDO/DO；可邀请 ASO Cadet 出席或致辞。\n\n地点/时长：跟去年安排（如在 SMJK Triang，约 10:00–12:00 / 约两小时）。场地与学校确认后，更新本包的 Event date。'
          },
          {
            title: '2 · 活动总览 — 当天是什么样子？',
            body: '典型 AGM 当天：\n\n• Cadet 与 NCO 按队形就座\n• Teacher Advisor、JDO/DO、受邀的 ASO Cadet 坐前排\n• 司仪（MC）按 Action Plan 推进全场\n• 十个部门依次短报告\n• 投票选出主席/委员会（纸选票）\n• 文件按部门交接\n• 致谢；需要则大合照后散会\n\nOC 的工作不是讲完所有内容，而是确保每个环节（司仪、报告、选举、交接、拍照、音响）都有人、有准备、不卡住。'
          },
          {
            title: '3 · 当天流程 — 照 Action Plan 走完',
            body: '按每年 Action Plan 执行（下列顺序来自 AGM 2026）：\n\n1) 准备 — 各工委排好座位；负责 Slide/麦克风的人测试设备\n2) 开场 — 司仪致开幕词；其他工委维持团员秩序\n3) Teacher Advisor 致辞 — 司仪邀请；摄影记录\n4) 部门报告（固定顺序）：\n   Secretary → Treasurer → Cadet Voluntary Service Coordinator → Storekeeper → First Aid Room Duty In Charge → Medicine Board In Charge → Activity In Charge → Training In Charge → Recruit In Charge → Knowledge Board In Charge\n   （音响/麦克风就绪；摄影）\n5) 选举 — 司仪解释投票流程；工委发选票；团员投票（NCO 盯场，禁止讨论）；计票并公布\n6) 中场休息 — 维持秩序；早餐/茶点若有剩余可分发\n7) JDO 致辞 — 司仪邀请；摄影记录\n8) 宣布新委员会名单 — 司仪宣读\n9) 交接典礼 — 旧 → 新，顺序与部门报告相同：Secretary、Treasurer、CVS Coordinator、Storekeeper、First Aid、Medicine、Activity、Training、Recruit、Knowledge Board\n10) 来年计划 — 全体讨论下一年活动\n11) ASO Cadet 致辞（如邀请）— 摄影记录\n12) 散会 — 司仪感谢来宾、ASO Cadet、JDO、Teacher Advisor 与全体成员；宣布解散'
          },
          {
            title: '4 · 筹备与工作范围 — 要准备什么',
            body: '不写固定周数——从你接任 OC 起按顺序推进：\n\nA. 文件（本「年度活动」包）\n• 致 ASO 申请信 + 邮件\n• 邀请：JDO/DO、Teacher Advisor、ASO Cadet、其他来宾\n• 当天 Agenda + Action Plan\n\nB. 人员\n• 确认司仪 MC\n• 确认负责 Slide/麦克风的人\n• 确认计票人\n• 通知各部门准备短报告\n\nC. 后勤\n• 与学校订场地\n• 座位图（团员 / 嘉宾 / 工委）\n• 选票、笔、票箱\n• 茶点（若有预算）\n• 相机或手机负责正式照片\n\nD. 开完之后\n• 会议记录 + 执委表传到本包\n• 照片归档\n• 花费记入 Treasurer Work\n• 资料交给新委员会'
          },
          {
            title: '5 · OC 职责与检查清单',
            body: '作为 Organizing Chairman，你要：\n• 拥有本文件包（只有你的 Gmail 能打开）\n• 把工作拆成工位：文件、司仪/流程、选举、交接、音响、拍照、后勤\n• 每个工位指定一名负责人，并跟进进度\n• 在本清单里逐项把文件交到 Approved\n• 不能批准自己的文件——由 Owner 或 Secretary 批准\n\nAGM 最低清单：\n1. Application letter — ASO\n2. Email to ASO\n3. Invitations（JDO / 致辞嘉宾 / 来宾）\n4. Agenda\n5. Action Plan\n6. Meeting Minutes（当天之后）\n7. Committee Board（当天之后）\n\n可选：场地申请、照片包、财务 I&E。\n\n当天提醒卡（可打印或发群里）：\n• MC：严格按 Action Plan 顺序，不私自调换\n• 选举负责人：只用纸选票；投票前 NCO 禁止讨论\n• 交接负责人：文件按报告顺序交；每步拍照\n• 音响：致辞与选举结果要有 Slide\n• Secretary：当天前收齐各部门书面报告'
          }
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
