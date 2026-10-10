# TCCD Member System

TCCD cadet member administration and public award directory for SMJK Triang Combined Cadet Division.

Public website: https://wsk1234567.github.io/DivisionMemberSystem/

## Live deployment

The public directory and Google Apps Script administration system are deployed. Deployment details and future update steps are documented in [DEPLOYMENT.md](DEPLOYMENT.md).

Do not put passwords, access tokens, private spreadsheet IDs, backups or student files in this repository.

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
- Standard member options, configured examination types, activities with multiple categories, batch attendance and linked examinations.
- Annual Duty totals with decimals and missing values; annual efficiency requires at least 60 hours, 12 DIM participations, Inspection attendance and examination participation.
- System Setup installs the confirmed Probadge, Promotion, Special Service Shield and Service Stripe & Star catalogue. Eligibility is suggested from recorded Duty/Efficient data, but an administrator must confirm each award and date.
- Award history; public fields limited to member name, SJAM ID, status, award name/date/category/level.
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
