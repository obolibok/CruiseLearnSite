# CruiseLearnSite instructions for Codex

## Scope

- This is the official static GitHub Pages site for CruiseLearn.
- The Android application is the sibling repository `../CruiseLearn` and is the source of truth for implemented behavior.
- Before changing feature, Premium, Android Auto, import/export, privacy, or release text, read `../CruiseLearn/docs/PROJECT_STATUS.md` and the relevant accepted ADR.

## Site architecture

- Static HTML files are served from the repository root.
- Shared styles are in `css/styles.css`.
- The content editor is `editor.html` plus `js/editor.js` and the vendored AG Grid bundle.
- `CNAME` configures the production domain.
- There is no tracked Flask backend. `flask-backend/.env` is local and ignored; never inspect, print, or commit it.

## Change rules

- Preserve a zero-build static deployment unless the task explicitly approves a site generator or build system.
- Keep navigation, footer, metadata, and feature claims consistent across all pages.
- Do not advertise an unreleased or policy-blocked capability as available.
- Treat imported editor JSON and all form inputs as untrusted. Prefer text rendering; escape content before any HTML-rendering API.
- Do not add secrets to HTML or JavaScript. Browser-side service identifiers must be intentionally public and documented.
- If contact behavior changes, reconcile `privacy.html` and any third-party data-processing disclosure in the same task.
- Preserve the documented JSON import/export contract unless the Android repository changes it deliberately.

## Verification

- Check that every local `href` and `src` target exists.
- Validate page language, unique title, heading hierarchy, image alt text, keyboard access, focus visibility, mobile layout, and color contrast.
- Exercise editor create/import/edit/collapse/copy/paste/export JSON/export CSV with benign and HTML-shaped input.
- For external links opened with `target="_blank"`, add `rel="noopener noreferrer"`.
- Preview affected pages at narrow and desktop widths before claiming completion.
- Run `git status --short --branch` in both repositories for cross-project changes and report exactly which checks were manual.

## Current high-priority inconsistencies

- Public Android Auto claims must wait for the architecture decision in the Android repository.
- The privacy notice conflicts with the contact form's collection and third-party submission of personal data.
- The content editor must not render imported strings as HTML.
- Repeated page chrome and generic titles make drift likely; improve them without introducing unnecessary tooling.

