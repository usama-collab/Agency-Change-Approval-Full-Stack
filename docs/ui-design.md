# UI design and review log

This document records the approved polish work after M1–M4. The [PRD](PRD.md) remains the product behavior baseline. M5 hosting and deployment remain later work.

## Approved visual direction

- Clean, light B2B workspace with warm white surfaces, deep ink text, muted teal actions, subtle borders, generous spacing, and a restrained type scale.
- Shared tokens and reusable navigation, buttons, fields, status badges, feedback, and empty states. Use the existing React/Vite stack without new dependencies.
- Clear primary actions and customer-facing language. Show approved charges separately from pending charges and payments; never combine currencies.
- Make existing work, added work, additional charge, total, and deadline changes easy to compare before a decision. Keep client verification and approval simple on mobile.
- Preserve routes, API contracts, authentication, approval rules, exact money handling, print records, and existing data. No fake product data, decorative charts, or excessive animation.
- Check contrast, keyboard navigation, visible focus, desktop and mobile layouts, and affected flows after each phase.

## Phase checklist

| Phase | Work | Status |
| --- | --- | --- |
| 1 | Shared design foundations and dashboard as the representative screen | Implemented; awaiting review |
| 2 | Client verification, proposal comparison, decision, confirmation, and client print | Implemented; awaiting review |
| 3 | Owner change request editor, preview, detail, history, and print | Awaiting approval |
| 4 | Clients, projects, agency profile, and authentication | Awaiting approval |
| 5 | Final consistency and accessibility pass; full frontend and owner/client flow checks | Awaiting approval |

After each phase, record completed work, checks, browser findings, limitations, preview URL, and user feedback here. Stop before the next phase until the user approves it.

## Phase 1 — foundations and dashboard

Completed work:

- Added shared color, spacing, typography, surface, border, control, and focus styles. The owner header now has a clear active page indicator and a skip link; owner navigation is hidden on authentication pages.
- Added reusable status badges and empty states. The dashboard has a clear project action, responsive currency-specific totals, approved versus awaiting-decision amounts, status counts, filters, and scannable request rows.
- Kept dashboard filters and URL parameters, API calls, exact money values, and existing request routes intact. Currency cards appear only for currencies with projects; a first-project empty state appears when the agency has none.

Verification results (2026-09-25):

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check` passed. No backend code or API contract changed; backend tests were not rerun for this UI-only phase.
- Browser review at 1280×900 and 375×812 showed separate PKR and USD totals, a PKR request awaiting a decision, responsive request rows, and no horizontal overflow at 375 px. Zero-project currency cards were removed after the first mobile review.
- Status and currency filters updated the URL and results; the no-match state and Clear filters action worked. A request row opened its existing detail page. Keyboard Tab reached the visible skip link and focus outline.
- Owner registration, email verification through local Mailpit, sign-in, agency setup, client creation, project creation in two currencies, draft preview, and issue worked in the local browser. Clients, projects, request detail, agency profile, client review error state, and owner print record were smoke checked after the shared style changes. The mobile auth page has no owner navigation.
- The configured PostgreSQL path under `/tmp` was absent at the start of this phase, so the earlier local browser records were unavailable. An isolated new cluster was started at `/tmp/agency-change-approval-ui/postgres` on port 55434; no existing cluster or data was overwritten. The review records in this cluster are local only and `/tmp` remains disposable. The local API uses port 8000, frontend port 5174, and isolated Mailpit ports 1026/8026 because the default ports were occupied.
- The client decision flow and a saved PDF were not repeated in Phase 1; both remain part of later phase and final checks.

Preview: [dashboard](http://127.0.0.1:5174/dashboard). An authenticated owner session is required; [local Mailpit](http://127.0.0.1:8026) receives verification mail for a new local account.

User feedback: pending review.

## Tailwind foundation conversion (before Phase 2)

- Switched the app entry point from the former custom stylesheet to Tailwind CSS v4. Existing page and component layouts now use Tailwind utilities, with shared colors in `@theme` and a small Tailwind base layer for native form controls, headings, focus, and typography.
- Kept the Phase 1 visual direction and existing page behavior. Client verification, comparison, and decision screens still await Phase 2 design work.
- Verification: frontend lint, typecheck, tests, build, and `git diff --check` passed. Login was reviewed in a browser at desktop and 375 px mobile width; no horizontal overflow appeared. Dashboard, client decision, and saved PDF flows were not repeated in this conversion pass.
- Preview: [login](http://127.0.0.1:5174/login) while the local Vite server is running.

## Phase 2 — client review and print

Completed work:

- Gave the client flow a clear verification, review, and decision sequence. The verification screen highlights the masked recipient and exact expiry, keeps proposal details behind the existing email check, and presents code sending and entry as distinct actions.
- Added a client proposal layout that compares existing work with the requested addition, then shows original amount, earlier approved additions, current total, additional charge, proposed total, and all three delivery dates. Amounts use the existing integer money formatter and remain in one currency.
- Separated approval and rejection forms with visible names, an unchecked agreement box for approval, and optional rejection reason. After a decision, confirmation and the print action appear before the proposal details. The client print record uses the same terms layout and includes decision identity, timestamp, and reason when present.
- Preserved review routes, API contracts, token handling, decision rules, owner proposal view, and owner print view. No backend or database schema changed.

Verification results (2026-09-25):

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check` passed. Backend Ruff lint and format checks passed. All 17 PostgreSQL tests passed against the dedicated `agency_test` database after migrations, with `APP_ORIGIN=http://localhost:5173` matching the test client's origin. An initial run inherited the live dev origin (`http://127.0.0.1:5174`) and failed at the origin guard; no application change was needed.
- Browser review at 1280×900 and 375×812 used local mocked review responses to check masked verification, proposal comparison, the unchecked agreement box, approval and rejection confirmations, rejection reason, print navigation, and no horizontal overflow. This visual fixture did not exercise live code delivery, session expiry, or backend decision persistence; those remain for the final owner/client flow check.
- A browser saved A4 PDF of the sample approved record was inspected. Print controls were hidden and the record fit on one page after tightening print spacing. Longer real proposals may span pages.

Preview: [client review](http://127.0.0.1:5174/review) requires a valid issued link to show the proposal; a verified review session is required for its print record.

User feedback: pending review.
