# DivisionMemberSystem

KPT cadet member administration and public award directory for SMJK Triang Combined Cadet Division.

Public website: https://wsk1234567.github.io/DivisionMemberSystem/

## Google connection is still required

The website source is ready, but real records and administrator access require two Google Apps Script deployments. Until configured, the public page displays an explicit connection message and does not contain real or fictional student data.

Use the [Chinese deployment instructions](DEPLOYMENT.md). Build with `npm run build`; copy the generated files from `build/apps-script/admin/` and `build/apps-script/public/` into separate projects in the owner's Google account.

After deployment, put both Google `/exec` URLs in `config.public.json`, rebuild the administrator HTML, and commit the configuration update. Do not put passwords, access tokens, private spreadsheet IDs or student files in this repository.

## Local fictional preview

Requires Node.js 22 or newer; build and unit tests need no package installation.

```sh
npm test
npm run build
npm start
```

Open http://127.0.0.1:4173/ for the public sample directory or http://127.0.0.1:4173/admin.html for administration. Search `Sample Member 001` or `010001`. Preview data is fictional, includes 500 students with five years of records, and edits reset on reload. Never publish the `preview/` folder.

## Features

- Fixed internal student IDs, optional SJAM IDs, duplicate IC/SJAM checks, historical enrolments, graduation/withdrawal status.
- Activities with multiple categories, batch attendance, linked examinations, editable examination categories.
- Annual Duty totals with decimals and missing values; annual efficiency requires at least 60 hours, 12 DIM participations, Inspection attendance and examination participation.
- Award catalogue and history; public fields limited to member name, SJAM ID, status, award name/date/category/level.
- Private Data Center, Excel templates and round trips, import preview and version checks, safety backups before imports and restores.
- Google-authenticated administrators, owner-only authorisation/restore, daily private backup retention, retryable publication.

BF1, BFC4 and per-event Duty records are deferred.

## Hosting and storage

GitHub Actions runs the tests and builds the public site. It publishes **only `dist/`** to GitHub Pages. In repository Settings → Pages, select **GitHub Actions** as Source.

Admin runs as the Google user accessing the web app; each server operation checks the authorised administrator list. Private Sheets use alternating text-encoded snapshot slots and verified writes before changing the active pointer. Do not edit the storage tabs manually.

Public data lives in a separate Sheets file and is served by a separate, read-only Apps Script project with a second field allowlist. It has no private-sheet identifier. The public site's resource paths support the repository subpath.

The secretary needs editor access to the storage files because Admin runs as the accessing user. Owner-only controls apply inside the app; Google Drive editors can still directly edit files they are granted. Only share files with trusted administrators, and keep Apps Script source editing limited to the owner.

## Verification

`npm test` covers the domain, real Excel round trips and backend behaviours using mocked Google services. Browser checks also operate forms, downloads, imports, public searches and mobile layouts. Real Google login/consent, Sheet permissions and Pages deployment must be tested in the owner's account before importing real data.

For browser tests, install Playwright locally, build, and run `npm run test:browser`. The suite starts its own local preview server on port 4174. Screenshots are stored in `test-results/`.

## Dependencies

Excel support uses vendored SheetJS Community Edition 0.20.3 from its official CDN. The build verifies `vendor/SHA256.txt`; licensing is preserved in `vendor/SHEETJS-LICENSE.txt`. Administrator scripts are included inline, with no external script download at runtime.
