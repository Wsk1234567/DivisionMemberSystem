# TCCD Data System — Xiaomi Mimo Handoff

Updated: 2026-10-10  
Repository: https://github.com/Wsk1234567/DivisionMemberSystem  
Public directory: https://wsk1234567.github.io/DivisionMemberSystem/  
Admin web app: https://script.google.com/macros/s/AKfycbyEkEYW1DVIB6qYCzfx_hWL0sL6WWJacvn14T_VIUkcRzmVA0TLT6vNtFkHJeTRwrNi/exec

## Start here

This repository is the source of truth for a TCCD member data system. It contains:

- A public GitHub Pages member directory.
- A private Google Apps Script administration web app.
- Private Google Sheets storage and a separate public projection.
- Excel import/export, backups, version conflict protection and a recycle bin.

Read `README.md` and `DEPLOYMENT.md` before changing anything. Do not redesign the architecture unless the owner explicitly requests it.

## Current deployed state

- Git branch: `main`
- Handoff commit: `0103091` (`Add TCCD system setup and award eligibility`)
- Admin Apps Script deployment: Version 7
- Current rollout phase: Phase 1
- The confirmed Exam and Award catalogue was applied through System Setup.
- Old bulk-imported students were deliberately moved to Recycle Bin. Do not restore or permanently delete them unless the owner explicitly asks.
- At handoff time, the active database contains one manually added member.

These are a dated snapshot, not permanent assumptions. Reload the live Admin state before making data decisions.

## Non-negotiable privacy and access rules

- Never commit IC numbers, student Excel files, private exports, backups, Sheet IDs, passwords, tokens or OAuth credentials.
- Public results may contain only member name, SJAM ID, status and public award name/date/category/level.
- IC, attendance, exams, Duty, certificate numbers and notes must remain private.
- Admin must run as **User accessing the web app** and allow **Anyone with Google account**. Server-side identity checks are mandatory.
- Public Apps Script must remain a separate read-only deployment that has no private Sheet ID.
- Owner-only operations include administrator access, restore, phase switching, Recycle Bin deletion/restoration and Delete All Students.
- Owner and Secretary may maintain normal records and apply System Setup defaults.
- Do not restore, purge or delete live records without a direct owner request and a clear preview.

## Business rules

- A member has a permanent internal ID. SJAM ID may be blank and added later.
- New Phase 1 imports require only `name`; `sjamId` is optional. The system generates `id` and `version`, and defaults status to `Active`.
- Names are not merge keys. Duplicate names are allowed; duplicate normalized IC or SJAM ID is rejected.
- Efficient for one calendar year requires Duty at least 60 hours, DIM at least 12, Inspection participation and at least one examination participation.
- Pass and Fail count as examination participation. Pending counts only when participation is confirmed. Absent does not count.
- Missing evidence produces Pending rather than a false Efficient result.
- SSS eligibility uses cumulative Duty hours across all years and shows every reached, unissued milestone.
- Service Stripe & Star eligibility uses cumulative Efficient years; years do not need to be consecutive.
- Eligibility is only a suggestion. An administrator must record the award and award date.

## Confirmed setup options

- Tingkatan: Peralihan, Form 1, Form 2, Form 3, Form 4, Form 5, Adult.
- Race: Melayu, India, Cina, Other.
- Exams: EFA (New), EFA (Recert), BFA (New), BFA (Recert), BFA (Renew), Home Nursing, AFA.
- Awards: the complete confirmed Probadge, Promotion, SSS and Service Stripe & Star list is defined in `src/domain.js` as `recommendedCatalog`.

Do not silently rename stable catalogue entries or their internal `code` values. Old Excel files and historical awards must remain compatible.

## Source layout

- `src/domain.js`: data schema, validation, business rules, setup defaults and public projection.
- `src/admin.js`: Admin UI and interactions.
- `src/public.js`: public member search.
- `src/workbook.js`: Excel template/import/export rules.
- `apps-script/admin/Code.gs`: authenticated Admin backend.
- `apps-script/public/Code.gs`: anonymous read-only public endpoint.
- `scripts/build.mjs`: generates deployable output.
- `tests/`: domain, backend and workbook tests.
- `config.public.json`: public URLs and organisation labels only.
- `build/`, `dist/` and `preview/`: generated output; do not hand-edit.

## Required workflow for every change

1. Inspect the relevant source and tests first.
2. Make focused changes in source files, not generated files.
3. Run `npm test`.
4. Run `npm run build`.
5. Run `git diff --check` and review the diff.
6. Commit and push to `main` only when the owner asked for deployment.
7. If Admin code changed, update `Code.gs`, `Domain.gs` and `Admin.html` from `build/apps-script/admin/`, then deploy a **new version** of the existing web app so the URL stays unchanged.
8. If public backend code changed, update and redeploy the separate public Apps Script project.
9. Verify the live Admin, public search and Apps Script execution log.

The local browser test command is `npm run test:browser`, but it requires Playwright to be installed. Do not add or upgrade dependencies without checking with the owner.

## Google deployment cautions

- Keep the existing Admin deployment URL. Editing the deployment with a new version is preferred over creating a new deployment.
- Keep the existing public API URL in `config.public.json` unless the public deployment is intentionally replaced.
- Apps Script Admin login can loop when several Google accounts are active in one browser. Test in an Incognito/InPrivate session containing only the authorised account.
- A successful code save is not a deployment. Verify the deployed version number and execution status.
- Applying System Setup creates a private safety backup before changing catalogue data.

## Suggested first task for Mimo

Do not start by writing code. First:

1. Clone/pull the repository.
2. Read `README.md`, `DEPLOYMENT.md`, `MIMO_HANDOFF.md`, `src/domain.js` and the tests.
3. Run `npm test` and `npm run build` without modifying files.
4. Summarise your understanding of the architecture, privacy boundary, business rules and deployment process.
5. Ask the owner what the next phase or requested change is.

## Prompt to paste into Xiaomi Mimo

```text
You are taking over the TCCD Data System project.

Repository: https://github.com/Wsk1234567/DivisionMemberSystem
Read MIMO_HANDOFF.md, README.md and DEPLOYMENT.md before making changes. Treat the repository as the source of truth. Preserve the existing GitHub Pages + separate Google Apps Script Admin/Public architecture and all privacy boundaries.

Before coding, pull main, run npm test and npm run build, then explain your understanding to me. Do not restore or permanently delete Recycle Bin data. Do not place student data, IC, Sheet IDs, exports, backups, credentials or tokens in GitHub. Do not deploy or change live Google data unless I directly ask you to do so.

When I request a change, update source files rather than build/dist/preview, add or update tests, run the full test/build workflow, and tell me exactly what must be deployed.
```

