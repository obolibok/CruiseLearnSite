# CruiseLearn official site

This repository contains the static GitHub Pages site for CruiseLearn, including product pages, help content, privacy information, the browser-based content editor, screenshots, and GitHub issue templates.

Production domain: https://cruiselearn.app

## Related repository

The Android application lives in the sibling `CruiseLearn` repository. Implemented application behavior and accepted architecture decisions take precedence over site copy. Read `../CruiseLearn/docs/PROJECT_STATUS.md` before changing Android Auto, Premium, import/export, privacy, or release information.

## Local preview

The site has no build step. Serve the repository root with any local static HTTP server and open `index.html`. Do not rely only on `file://` because browser security rules can differ.

Example with a locally available Python runtime:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080/`.

## Structure

- Root `*.html`: home, help, product documentation, privacy, contact, and editor shell.
- `css/styles.css`: shared site and editor styles.
- `js/editor.js`: client-side chapter/topic editor and JSON/CSV import/export.
- `vendor/ag-grid/`: pinned browser bundle used by the editor.
- `img/`: help screenshots.
- `.github/ISSUE_TEMPLATE/`: public issue forms.
- `CNAME`: GitHub Pages custom domain.

## Manual verification checklist

- Open every changed page at desktop and narrow mobile widths.
- Confirm all local links, stylesheets, scripts, icons, and images resolve.
- Verify page `lang`, title, headings, alt text, keyboard navigation, and focus indicators.
- Test the content editor with create/import/edit/collapse/copy/paste/export JSON/export CSV.
- Import text containing `<`, `>`, `&`, quotes, and HTML-shaped strings and confirm it is displayed as text rather than executed.
- If contact or analytics behavior changes, update the privacy notice and verify consent/data-flow wording.
- Compare product claims with the Android repository before deployment.

## Deployment

GitHub Pages publishes from the repository configuration associated with this branch and uses the domain in `CNAME`. Do not change the domain or deployment configuration without explicit approval.

