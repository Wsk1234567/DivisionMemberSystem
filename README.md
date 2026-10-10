# TCCD Member System

SMJK Triang Combined Cadet Division 的学员成员管理与公开奖项目录。

公开网站：https://wsk1234567.github.io/DivisionMemberSystem/

## 线上部署

公开目录与 Google Apps Script 管理系统均已部署。部署细节与后续更新步骤见 [DEPLOYMENT.md](DEPLOYMENT.md)。

**不要**把密码、访问 token、私人 spreadsheet ID、备份或学生文件放进本仓库。

## 本地虚构预览

需要 Node.js 22 或更新；构建与单元测试**无需**安装任何包。

```sh
npm test
npm run build
npm start
```

打开 http://127.0.0.1:4173/ 查看公开示例目录，或 http://127.0.0.1:4173/admin.html 进入管理端。可搜索 `Sample Member 001` 或 `010001`。预览数据虚构，含 500 名学员、五年记录，改动在刷新后重置。**永远不要发布 `preview/` 文件夹。**

## 功能

- 固定内部学员 ID、可选 SJAM ID、IC/SJAM 查重、历史入队记录、毕业/退出状态。
- 标准成员选项、可配置考试类型、多类别活动、批量考勤与关联考试。
- 年度 Duty 合计支持小数与缺失值；年度 Efficient 需至少 60 小时、12 次 DIM、Inspection 参与以及 examination 参与。
- System Setup 安装已确认的 Probadge、Promotion、Special Service Shield 与 Service Stripe & Star 目录。系统会根据 Duty/Efficient 数据建议资格，但**必须由管理员确认**每项奖项与日期。
- 奖项历史；公开字段仅限成员姓名、SJAM ID、状态、奖项名称/日期/类别/等级。
- 私有 Data Center、Excel 模板与往返导入导出、导入预览与版本冲突检查、导入/恢复前安全备份。
- Google 身份验证的管理员、Owner 专属授权/恢复、每日私人备份保留、可重试的公开同步。

BF1、BFC4 与按次 Duty 记录暂缓实现。

## 托管与存储

GitHub Actions 运行测试并构建公开站点，**只把 `dist/` 发布**到 GitHub Pages。仓库 Settings → Pages 请选择 **GitHub Actions** 作为 Source。

Admin 以「访问 web app 的用户」身份运行；每次服务端操作都会检查授权管理员名单。私人 Sheet 使用交替文本编码快照槽，校验写入成功后才切换活动指针。**不要手动编辑存储分页。**

公开数据存放在独立的 Sheets 文件中，由独立的只读 Apps Script 项目提供服务，并再次执行字段白名单。它不含私人表标识。公开站点的资源路径支持仓库子路径。

秘书需要存储文件的编辑权限，因为 Admin 以访问用户身份运行。Owner 专属控件只约束应用内操作；Google Drive 编辑者仍可直接改他们被共享的文件。只与可信管理员共享文件，并把 Apps Script 源码编辑权限限制给 Owner。

## 验证

`npm test` 覆盖业务域、真实 Excel 往返，以及使用 mock Google 服务的后端行为。浏览器测试还会操作表单、下载、导入、公开搜索与移动端布局。真实 Google 登录/授权、Sheet 权限与 Pages 部署必须先在 Owner 账号中验证，再导入真实资料。

浏览器测试请在本地安装 Playwright，先构建，再运行 `npm run test:browser`。该套件会在端口 4174 启动自己的本地预览服务器。截图存放在 `test-results/`。

## 依赖

Excel 支持使用自官方 CDN vendor 的 SheetJS Community Edition 0.20.3。构建会校验 `vendor/SHA256.txt`；许可证保留在 `vendor/SHEETJS-LICENSE.txt`。管理员脚本内联打包，运行时不下载外部脚本。
