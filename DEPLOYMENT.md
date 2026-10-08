# 部署与交接

代码与本地预览已经可以构建。上线还需要你的 Google 账号和 GitHub 仓库；以下步骤必须先用虚构资料验证，再导入真实学生资料。

## 1. 建立 Google 管理后台

1. 用你的个人 Gmail 打开 [Google Apps Script](https://script.google.com/)，新建独立项目，命名 `TCCD Admin`。项目不要与秘书共享代码编辑权限。
2. 执行 `npm run build`。把 `build/apps-script/admin/Code.gs`、`Domain.gs`、`Admin.html` 加入项目，文件名保持一致。
3. 在项目设置中开启显示 `appsscript.json`，复制同目录的 manifest。时区使用 `Asia/Kuala_Lumpur`。
4. 编辑器不列出下划线结尾的函数。临时在 Code.gs 加入 `function initializeTCCD() { initialSetup_(); }`，保存后选择并执行 `initializeTCCD`，完成你自己项目的 Google 授权。它建立私人资料表、独立公开资料表、私人备份文件夹和每日备份触发器，不导入任何真实资料。成功后移除临时函数并保存，才继续部署；`initialSetup_` 的下划线保留，避免初始化函数被网页远程调用。
5. 在项目设置 → Script properties 检查 `OWNER_EMAIL`、`PRIVATE_SHEET_ID`、`PUBLIC_SHEET_ID`、`BACKUP_FOLDER_ID`。初次设置自动填写，现有资料不会被重复 setup 清空。
6. Deploy → New deployment → Web app：**Execute as: User accessing the web app**；**Who has access: Anyone with Google account**。复制 `/exec` 地址作为 `adminUrl`。不要选择 Execute as me，否则秘书的身份检查会拒绝访问。
7. 用你的 Gmail 打开管理页面，在 Settings 增加秘书的 Gmail。后台会共享必要的储存文件并登记授权名单。
8. 用秘书自己的 Gmail 在独立浏览器会话打开管理地址，完成授权；再用第三个账号确认拒绝访问。

Google 可能要求 OAuth consent 配置或显示尚未验证应用的提示。只为你自己核对过的项目授权；若项目处于 Testing，登记你和秘书为测试用户，并实际检查授权有效期。个人 Gmail 的实际授权体验尚需在你的项目测试，不预先保证没有额外设置。

## 2. 建立只读公开服务

1. 同一 Gmail 新建第二个 Apps Script 项目，命名 `TCCD Public`。
2. 复制 `build/apps-script/public/Code.gs` 和 `appsscript.json`。manifest 启用 Advanced Sheets v4 服务，保持 spreadsheets.readonly 权限；默认 Google Cloud 项目会自动启用对应 API。若使用自定义 Cloud 项目，需自行启用 Google Sheets API。
3. Script properties 只加入 `PUBLIC_SHEET_ID`，使用第一步建立的公开资料表 ID。**不加入 PRIVATE_SHEET_ID、OWNER_EMAIL 或备份信息**。
4. 部署 Web app：**Execute as: Me**，**Who has access: Anyone（包含未登录访客）**。复制 `/exec` 地址作为 `publicApiUrl`。
5. 无痕打开这个地址，应返回 `ok:true` 和只有允许公开字段的 JSON。公开表和私人表本身保持不公开，不设置 Anyone with the link。

公开网页通过只读 JSONP 连接；接口再次筛选字段。不要把管理后台设置为匿名部署，也不要把私人表拿来代替公开表。

## 3. 配置并发布 GitHub Pages

1. 在本机 `config.public.json` 填入两个 `/exec` 地址，并可修改 organization/region。这个文件只放公开地址和机构名称。
2. 同一配置文件的 `publicSiteUrl` 填入最终 GitHub Pages 查询地址，例如 `https://USERNAME.github.io/kpt-members/`。它决定 Admin 页面的“Open public directory”链接，不需要修改程序代码。
3. 重新执行 `npm test`、`npm run build`，再把更新后的 Admin.html 部署为管理项目的新版本。
4. 建立 GitHub 仓库，把 **kpt-web 目录里的内容作为仓库根目录**。不要上传外层旧 Excel 文件、`preview/`、`build/`、备份或真实学生文件；`.gitignore` 已排除生成目录。
5. Repository Settings → Pages → Source 选 GitHub Actions。仓库默认分支若不是 `main`，修改 `.github/workflows/pages.yml`。
6. 提交后工作流测试、构建，并仅把 `dist/` 发布到 Pages。没有设置真实地址时页面会明确提示尚未连接，不会偷偷发布虚构数据。

GitHub Pages 免费网址即可，不要求购买域名。项目路径使用相对资源地址，支持 `username.github.io/repository/`。

## 4. 首次验证

- 用 Downloads template 新增 2–3 位虚构学生，保存后 export，取得自动分配的内部 ID，再添加关联记录。
- 建立一个 DIM＋Inspection＋Exam 活动，记录参加／缺席，检查生成的考试记录。
- 验证无 SJAM ID、同名学生、补填 ID、毕业成员，以及 59.5／60 小时、11／12 次 DIM 和 Fail／Absent。
- 更新姓名或奖项，确认公开网页下次搜索反映更新；查看接口原始内容，不应包含 IC、证书号或内部备注。
- 暂时撤销公开表写入权限，验证私人保存成功、公开同步警告、恢复权限后 Retry 成功。
- 导出 Excel，原样重新上传应是 0 changes；修改旧版本后上传必须提示冲突。
- 创建备份、修改记录、由你恢复，确认安全备份已生成且旧文件不能覆盖恢复后的新版本。
- 确认秘书无法在应用内授权管理员或恢复备份，第三账号无法访问管理接口。
- 在触发器页面确认 `dailyBackup_` 由你的账号创建、每天执行，检查一次真实备份和最近 30 份保留策略。

## 5. 平时操作

你和秘书主要在网站维护资料；批量修改先导出当前 Excel，保留 `id` 和 `version`，修改后导入预览并确认。姓名用于显示和搜索，不是记录关联键。

Members 编辑会保存所选 reporting year 的 Tingkatan／状态快照。过去年度的资料用 Data Center → Annual profile 修改，避免改动当前成员状态。

考试活动先点名，再更新考试结果。单独考试可直接新增，Pass／Fail 计参加，Pending 需勾选 Participation confirmed，Absent 不计参加。Duty 暂时只填写年度总数。

如看到 Public update pending，私人资料已经保存；按 Retry public update。遇到网络超时先 Reload data 再检查，不直接重复建立学生或记录。

完整导出、储存表和备份仅给可信管理员。Google Drive 编辑权限本身允许秘书直接编辑其获共享文件；应用内权限不能限制绕过应用的文件编辑。恢复入口和管理员授权入口在应用内仍仅由你操作。

## 官方参考

- [GitHub Pages 静态托管](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Apps Script Web app 的运行身份](https://developers.google.com/apps-script/guides/web)
- [Google Session 身份限制](https://developers.google.com/apps-script/reference/base/session)
- [只读 JSONP 与 Content Service](https://developers.google.com/apps-script/guides/content)
- [Apps Script 配额](https://developers.google.com/apps-script/guides/services/quotas)
- [SheetJS 官方浏览器发行版](https://docs.sheetjs.com/docs/getting-started/installation/standalone/)
