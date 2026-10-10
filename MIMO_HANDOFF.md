# TCCD Data System — Xiaomi Mimo 交接说明

更新日期：2026-10-10  
仓库：https://github.com/Wsk1234567/DivisionMemberSystem  
公开目录：https://wsk1234567.github.io/DivisionMemberSystem/  
Admin web app：https://script.google.com/macros/s/AKfycbyEkEYW1DVIB6qYCzfx_hWL0sL6WWJacvn14T_VIUkcRzmVA0TLT6vNtFkHJeTRwrNi/exec

## 从这里开始

本仓库是 TCCD 成员数据系统的权威来源，包含：

- 公开的 GitHub Pages 成员目录。
- 私有的 Google Apps Script 管理后台。
- 私有 Google Sheets 存储与独立的公开投影。
- Excel 导入/导出、备份、版本冲突保护与回收站。

改动任何东西之前，先读 `README.md` 与 `DEPLOYMENT.md`。**除非 owner 明确要求，不要重新设计架构。**

## 当前部署状态

- Git 分支：`main`
- 交接 commit：`0103091`（`Add TCCD system setup and award eligibility`）
- Admin Apps Script 部署：Version 7
- 当前推进阶段：Phase 1
- 已确认的 Exam 与 Award 目录已通过 System Setup 应用。
- 旧的批量导入学员已**有意**移入 Recycle Bin。除非 owner 明确要求，不要恢复或永久删除。
- 交接时，活动数据库中有一位手动添加的成员。

以上是有日期的快照，不是永久假设。做数据决策前请重新加载线上 Admin 状态。

## 不可协商的隐私与访问规则

- **绝不**提交 IC 号码、学生 Excel、私有导出、备份、Sheet ID、密码、token 或 OAuth 凭证。
- 公开结果只允许包含：成员姓名、SJAM ID、状态，以及公开奖项的名称/日期/类别/等级。
- IC、考勤、考试、Duty、证书编号与备注必须保持私有。
- Admin 必须以 **User accessing the web app** 运行，并允许 **Anyone with Google account**。服务端身份校验是强制的。
- Public Apps Script 必须保持为独立的只读部署，**不含**私人 Sheet ID。
- Owner 专属操作：管理员授权、恢复、Phase 切换、Recycle Bin 删除/恢复、Delete All Students。
- Owner 与 Secretary 可维护普通记录并应用 System Setup 默认项。
- 未经 owner 直接指示与清晰预览，**不要**恢复、清空或删除线上记录。

## 业务规则

- 成员拥有永久内部 ID。SJAM ID 可留空、稍后补填。
- 新的 Phase 1 导入只需 `name`；`sjamId` 可选。系统生成 `id` 与 `version`，状态默认 `Active`。
- **姓名不是关联键。** 允许同名；规范化后 IC 或 SJAM ID 重复则拒绝。
- 单一日历年的 Efficient 需要：Duty ≥ 60 小时、DIM ≥ 12 次、Inspection 参与，以及至少一次 examination 参与。
- Pass 与 Fail 计入 examination 参与。Pending 仅在确认参与后计入。Absent 不计。
- 证据缺失产生 Pending，而不是假的 Efficient 结果。
- SSS 资格使用跨所有年度的累计 Duty 小时，并显示每一个已达到但未颁发的里程碑。
- Service Stripe & Star 资格使用累计 Efficient 年数；年数**不要求连续**。
- 资格只是建议。管理员必须录入奖项与奖项日期。

## 已确认的设置选项

- Tingkatan：Peralihan, Form 1, Form 2, Form 3, Form 4, Form 5, Adult.
- Race：Melayu, India, Cina, Other.
- Exams：EFA (New), EFA (Recert), BFA (New), BFA (Recert), BFA (Renew), Home Nursing, AFA.
- Awards：完整的已确认 Probadge、Promotion、SSS 与 Service Stripe & Star 列表定义在 `src/domain.js` 的 `recommendedCatalog`。

**不要**悄悄改名稳定 catalogue 条目或其内部 `code` 值。旧 Excel 文件与历史奖项必须保持兼容。

## 源码布局

- `src/domain.js`：数据 schema、校验、业务规则、setup 默认项与公开投影。
- `src/admin.js`：Admin 界面与交互。
- `src/public.js`：公开成员搜索。
- `src/workbook.js`：Excel 模板/导入/导出规则。
- `apps-script/admin/Code.gs`：需身份验证的 Admin 后端。
- `apps-script/public/Code.gs`：匿名只读公开接口。
- `scripts/build.mjs`：生成可部署产物。
- `tests/`：domain、backend 与 workbook 测试。
- `config.public.json`：仅公开 URL 与机构标签。
- `build/`、`dist/`、`preview/`：生成产物；**不要手改**。

## 每次改动的必备流程

1. 先检查相关源码与测试。
2. 在源码文件做聚焦修改，不要改生成文件。
3. 运行 `npm test`。
4. 运行 `npm run build`。
5. 运行 `git diff --check` 并审阅 diff。
6. **仅当 owner 要求部署时**才 commit 并 push 到 `main`。
7. 若 Admin 代码有变，从 `build/apps-script/admin/` 更新 `Code.gs`、`Domain.gs`、`Admin.html`，然后为现有 web app 部署**新版本**，以保持 URL 不变。
8. 若公开后端代码有变，更新并重新部署独立的 Public Apps Script 项目。
9. 验证线上 Admin、公开搜索与 Apps Script 执行日志。

本地浏览器测试命令是 `npm run test:browser`，但需要已安装 Playwright。**未经与 owner 确认，不要增删依赖。**

## Google 部署注意事项

- 保持现有 Admin 部署 URL。优先对现有部署「编辑并发布新版本」，而不是新建部署。
- 除非有意更换公开部署，否则保持 `config.public.json` 中的现有公开 API URL。
- 浏览器同时登录多个 Google 账号时，Apps Script Admin 登录可能死循环。请在只含授权账号的无痕/InPrivate 会话中测试。
- 代码保存成功 **≠** 已部署。请核对已部署版本号与执行状态。
- 应用 System Setup 会在修改 catalogue 数据前建立私人安全备份。

## 给 Mimo 的建议起步任务

不要一上来就写代码。先：

1. Clone/pull 仓库。
2. 阅读 `README.md`、`DEPLOYMENT.md`、`MIMO_HANDOFF.md`、`src/domain.js` 与测试。
3. **不修改文件**的前提下运行 `npm test` 与 `npm run build`。
4. 向 owner 概述你对架构、隐私边界、业务规则与部署流程的理解。
5. 询问 owner 下一阶段或下一步要改什么。

## 可粘贴给 Xiaomi Mimo 的提示词

```text
你正在接手 TCCD Data System 项目。

仓库：https://github.com/Wsk1234567/DivisionMemberSystem
改动前先读 MIMO_HANDOFF.md、README.md 与 DEPLOYMENT.md。以仓库为权威来源。保留现有 GitHub Pages + 独立 Google Apps Script Admin/Public 架构，以及全部隐私边界。

写代码之前，pull main，运行 npm test 与 npm run build，然后向我说明你的理解。不要恢复或永久删除 Recycle Bin 数据。不要把学生数据、IC、Sheet ID、导出、备份、凭证或 token 放进 GitHub。除非我直接要求，不要部署或改动线上 Google 数据。

当我要求改动时，更新源码文件而不是 build/dist/preview，补充或更新测试，跑完整 test/build 流程，并准确告诉我需要部署什么。
```
