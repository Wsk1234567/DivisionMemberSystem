# AGENTS.md — TCCD Member System

给后续 agent 的上手说明。私人交接备注 `START_HERE.txt` 在上一层目录；`MIMO_HANDOFF.md` 在本仓库根目录。文档与代码冲突时，以代码和测试为准。

## 命令

- 需要 Node 22+。**不要 `npm install`** — 零依赖；SheetJS 已 vendor 在 `vendor/`，构建时校验 SHA256。
- `npm test` — `node --test tests/*.test.cjs`（domain、workbook、backend、deployment）。
- `npm run build` — 生成 `dist/`（GitHub Pages）、`preview/`（500 人虚构本地预览）、`build/apps-script/`（Admin + Public 部署包）。
- `npm start` — 本地预览 `http://127.0.0.1:4173/`（公开目录）与 `/admin.html`。预览数据虚构、刷新即重置。**禁止发布 `preview/`**。
- `npm run test:browser` — Playwright 浏览器测试，端口 4174；需自行安装 Playwright。**未经 owner 同意不要增删依赖**。
- 每次改动固定顺序：读源码与测试 → 只改源码 → `npm test` → `npm run build` → `git diff --check` → **仅在 owner 要求部署时**才 commit/push。

## 架构

- 两套线上环境，不要合并：
  - **GitHub Pages** 公开目录 — 由 `.github/workflows/pages.yml` 在 `main` 上发布，**只发 `dist/`**。
  - **Google Apps Script** 的 **Admin**（需登录的管理后台）和 **Public**（独立只读接口）。Public 项目**绝不能**写入 `PRIVATE_SHEET_ID`。
- 存储：私人 Sheet（交替文本编码快照槽 + 校验写入 + 每日备份）与独立公开投影 Sheet。
- `src/domain.js` 是 schema、校验、业务规则、`recommendedCatalog`、公开字段白名单的唯一权威。
- 只改 `src/`、`apps-script/`、`tests/`、`scripts/`、`config.public.json`。**不要手改** `build/`、`dist/`、`preview/`（生成物）。
- `config.public.json` 只能放公开 URL 和机构名称 — 可入库。

## 隐私（不可协商）

- **绝不**把 IC、学生 Excel、导出档、备份、Sheet ID、密码、token、OAuth 凭证提交进仓库。
- 公开投影只允许：姓名、SJAM ID、状态、奖项名称/日期/类别/等级。IC、考勤、考试、Duty、证书编号、备注必须保持私有。
- Admin 部署设置必须保持 **Execute as: User accessing the web app** / **Anyone with Google account**，且服务端强制校验身份。身份不符必须拒绝。
- Owner 专属：管理员授权、恢复、Phase 切换、Recycle Bin 删除/恢复、Delete All Students。Owner 与 Secretary 可维护普通记录并应用 System Setup。
- 未经 owner 明确指示并预览，**不要**恢复、清空或删除线上 / Recycle Bin 数据。Phase 1 旧批量导入是有意放进 Recycle Bin 的。

## 容易做错的业务规则

- 成员有永久内部 `id`；SJAM ID 可先留空后补。**姓名不是关联键**（允许同名；规范化后 IC 或 SJAM ID 重复则拒绝）。
- Phase 1 导入最少只需 `name`；系统生成 `id`/`version`，状态默认 `Active`。
- Efficient 年度条件：Duty ≥ 60 小时、DIM ≥ 12 次、有 Inspection 参与、且 ≥1 次 examination 参与。Pass/Fail 算参与；Pending 仅在确认参与后计入；Absent 不算。
- 证据不足得出 Pending，**绝不**给出假的 Efficient。
- SSS 资格 = 跨年累计 Duty 小时；Service Stripe & Star = 累计 Efficient 年数（**不要求连续**）。资格只是建议 — 管理员必须自行录入奖项与日期。
- **不要**改名稳定 catalogue 条目或其 `code`（历史 Excel 与旧奖项必须兼容）。确认目录在 `src/domain.js` 的 `recommendedCatalog`。
- 暂缓实现：BF1、BFC4、按次 Duty 记录。

## 部署（仅 owner 要求时）

- Pages：push `main`；Actions 跑 test + build，只发布 `dist/`。
- Admin 代码变更 → 把 `build/apps-script/admin/{Code.gs,Domain.gs,Admin.html}` 贴进**现有** Admin Apps Script 项目，对现有 web app **部署新版本**以保持 URL 不变。保存项目 ≠ 部署。
- Public 后端变更 → 更新并重新部署独立的 Public Apps Script 项目；除非有意更换，否则保持 `config.public.json` 里的 `publicApiUrl`。
- 部署后核对：线上 Admin、公开搜索、Apps Script 执行日志。
- 使用 owner 已登录的 Google/GitHub 环境。**不要**在聊天或源码里索取/粘贴密码或 token。若缺 push/部署权限，准备好 patch/构建产物，请 owner 自行认证。
- 浏览器多 Google 账号会令 Admin 同意页死循环 — 在只登一个授权账号的无痕/InPrivate 窗口测试。
- Apps Script 时区：`Asia/Kuala_Lumpur`。首次初始化需临时 `function initializeTCCD() { initialSetup_(); }`（编辑器不列出下划线函数），完成后删掉临时函数。
