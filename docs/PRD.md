# Agency Change Approval — MVP handoff

Version: 0.1 | Date: 2026-09-24 | Status: implementation baseline

## 1. Product brief

Help small web development agencies get explicit client approval for additional work, its price, and its effect on the delivery date before starting that work.

Audience: agencies with 2–10 people doing fixed-price websites or web applications in Pakistan and internationally. Buyer/operator: agency owner. External participant: designated client approver.

The founder has chosen to build without interviews or manual pilots. Customer demand, differentiation, pricing, and willingness to pay remain unvalidated assumptions. This document defines product behavior, not evidence of product-market fit. The initial advantage to test is a simple approval workflow alongside existing project tools.

Success after launch: agencies send real requests; clients complete decisions; agencies return to send another request. Track approved amounts separately from owner-reported payments. Do not describe approved charges as recovered revenue.

## 2. Scope

Included: owner registration/login/email verification/password reset; one agency per owner; client records; projects with baseline scope, currency, price, and deadline; change requests; secure client review; email verification; decisions; event history; dashboard; browser-printable records.

Excluded: team invitations, client accounts, AI scope classification, chat integrations, payment processing, SaaS subscription checkout, invoicing/tax calculation, file attachments, project task boards, native mobile apps, and automatic legal-enforceability claims.

English UI. Project currencies: PKR, USD, GBP, EUR. No currency conversion. A price is a total agreed additional charge; show that tax and billing are handled externally. Initial changes allow zero or positive additional amounts. Discounts, cancellations of approved work, and negative adjustments are outside v1.

## 3. User journeys and screens

### Agency setup
Register → verify email → create agency profile → dashboard.
Profile: agency name and owner contact. One authenticated owner manages only their agency.

### Project setup
Clients → add client name, company (optional), and email → create project → enter title, baseline deliverables/exclusions, total price, currency, and delivery date → review → save.
The baseline is the owner's record of an existing agreement, not proof the client approved that original agreement in this product. Label it accordingly.

### Additional work
Project detail → New change request → description, reason, extra deliverables, additional charge, proposed new delivery date → preview → Issue request → copy link → owner shares link through their chosen channel.
Issuing freezes the proposal. “Pending” means issued and awaiting a decision, not successfully delivered or read. v1 does not automatically send the initial invitation.

### Client decision
Open link → see verification screen with masked recipient email → request verification email → enter code → review exact frozen proposal → approve or reject → confirmation and printable record.
No client registration. Reveal full commercial details only after verification. Approval requires name and an unchecked confirmation box explicitly agreeing to the displayed work, price, and date. Rejection may include a short reason. Never preselect approval or change state on a GET request.

### Tracking
Dashboard → filter requests by status → project detail → request record and chronological events → print/save through browser print.
Owner sees original project amount, approved additions, current agreed total, and current deadline. Pending additions are displayed separately. Aggregate money by currency, never sum different currencies.

Screens: auth pages; agency setup; dashboard; clients list/form; project list/form/detail; request editor/preview/detail; external verification/review/result; account settings.
Provide mobile layouts, keyboard access, labelled fields, visible focus, loading/empty/error states, and clear retry messages.

## 4. Business rules

1. Request states: draft, pending, approved, rejected, withdrawn, expired.
2. Allowed transitions: draft → pending; pending → approved/rejected/withdrawn/expired. Terminal states cannot return to pending.
3. Drafts are editable and deletable. Issued records cannot be overwritten or hard-deleted through the app. To revise, withdraw and duplicate into a new linked draft.
4. Only one pending request per project. This avoids conflicting price/date proposals in v1. Multiple drafts are allowed, but must be refreshed against current project terms before issue.
5. Lock baseline scope, currency, original price, and original deadline after the first request is issued. Later agreed changes accumulate as separate records. Approved proposals update current price/deadline atomically.
6. Each issued request snapshots agency/client display details, designated approver email, baseline and previously approved terms, new work, old/new totals, and old/new deadlines. Later contact edits do not alter issued records.
7. Default review window: 14 days from issue. Check expiry on the server for reads and decisions; do not depend on a scheduled job. Show the exact expiry time. Expired requests require a new request to proceed.
8. Approval/rejection uses a short-lived verification session bound to that request and its designated email. A forwarded URL alone cannot view full details or approve. Email verification proves mailbox access, not corporate authority; record the approver's declaration without promising legal validity.
9. Use random, unguessable review tokens; store hashes. Verification codes expire after 10 minutes, permit at most 5 failed attempts, and are invalidated on successful use. Resends invalidate older codes, have a 60-second cooldown, and are rate-limited per request and source. A verified review session lasts 30 minutes, bounded by proposal expiry.
10. Issuing and deciding must use database transactions. Concurrent approvals, retries, and owner withdrawal can produce only one final outcome. Repeated identical decision submissions return the existing result; conflicting decisions return a clear conflict.
11. Record actor, request ID, action, and server UTC timestamp for business events. Show local timestamps with timezone labels; project delivery dates are date-only. Approval and rejection records include the exact reviewed snapshot and submitted name/email.
12. Do not log secrets, review links, codes, or complete proposal content. Owner cannot edit decision events. This is an application audit record, not a claim of tamper-proof external certification.

## 5. Acceptance criteria

| ID | Scenario | Required result |
|---|---|---|
| AC01 | Owner registers, verifies, logs in and logs out | Agency access requires valid authentication; logout invalidates session |
| AC02 | Owner A requests Owner B's project, client, request or print record | No data is exposed; access is rejected consistently |
| AC03 | Project is created | Required fields and supported currency validated; money stored exactly, never as floating point |
| AC04 | Draft proposal is previewed | Extra price, old/new totals, original/current/proposed dates and work are unambiguous |
| AC05 | Owner issues a request | Snapshot and pending state saved atomically; only one pending request per project |
| AC06 | Anyone edits an issued proposal | Rejected; contact changes cannot silently change the reviewed terms |
| AC07 | Visitor opens or forwards a review link | Full proposal remains unavailable until designated email is verified |
| AC08 | Verification code is wrong, expired, reused or requested repeatedly | Attempts/resends bounded; no review session granted improperly |
| AC09 | Verified client approves | Name and explicit agreement required; one decision saved with snapshot; project totals/date updated exactly once |
| AC10 | Verified client rejects | Decision saved; project terms unchanged |
| AC11 | Withdrawal, expiry and approval race | Exactly one valid terminal outcome; withdrawn/expired request cannot be approved |
| AC12 | Client refreshes or retries after approval | Existing confirmation returned; no duplicate event or amount |
| AC13 | Owner prints a record | Identity, frozen terms, status and timestamps included; secret token/code excluded |
| AC14 | Dashboard contains different currencies | Totals kept separate; pending and approved money distinguished |
| AC15 | Email service fails | UI gives actionable retry feedback; no false claim of successful verification |

## 6. Technical direction

Proposed design, to verify against the actual repository and current official dependency documentation before implementation:

- Monorepo: frontend/ (React, TypeScript, Vite), backend/ (FastAPI, SQLAlchemy, Alembic), docs/, .github/workflows/.
- One backend application with modules for auth, agencies, clients, projects, change requests and review access. PostgreSQL is the source of truth. No microservices, Redis or Celery initially.
- Prefer one browser origin with /api routing. Use revocable server-side sessions in HttpOnly cookies, Secure in production, with appropriate SameSite and CSRF protection. Do not store authentication tokens in localStorage. Use vetted password hashing and cryptographic libraries.
- Relational tenant boundaries: agency_id on owned resources; enforce ownership in all queries and validate cross-resource links. UUIDs are identifiers, not authorization.
- Money: integer minor units plus currency, with exact parsing and validation. Date-only delivery deadlines; timezone-aware UTC event times.
- Owner registration verification/reset and client verification use a transactional email adapter. Development uses a local mail sink; production provider selected before launch. Check current provider availability, limits and cost then.
- Database constraints enforce one agency per owner, valid ownership links, nonnegative amounts, and one pending request per project. Concurrency control protects request state and project totals.
- Use explicit request/response schemas. Keep client-review responses separate from owner responses to prevent accidental exposure.

Conceptual entities: User, Session, Agency, Client, Project, ChangeRequest (including frozen proposal snapshot and final decision), RequestEvent, ReviewAccessToken, EmailChallenge, ReviewSession. Verification/reset credentials for owners are separate from client review credentials. Implement only entities needed by the current milestone.

## 7. Professional workflow

Keep docs/PRD.md as the product baseline, docs/architecture.md for technical decisions, and docs/milestones.md for acceptance criteria and progress. Root AGENTS.md describes scope discipline, commands, conventions, security boundaries and verification expectations. README explains local setup; .env.example contains placeholders only.

Work in small feature branches and reviewable changes. Inspect git state before edits; preserve unrelated work. Review diffs for authorization, race conditions and leaked data as well as functionality. Use peer review when available; a solo developer should still inspect the diff and test evidence before merging.

Definition of done: relevant acceptance criteria met; migrations included; meaningful tests pass; lint/type checks/build pass; required UX states work; docs reflect changed behavior; no secrets committed; known limitations recorded. Do not report checks as passed if they could not run.

## 8. Milestones and gates

M1 — Foundation and owner access: repository/docs, local PostgreSQL, migrations, registration/verification/login/logout/reset, agency setup, protected UI, tenant-safe queries, and CI. Tests cover auth/session lifecycle, tenant isolation and fresh migration application. No project/change-request implementation yet.

M2 — Clients and projects: CRUD within tenant; baseline forms and validation; meaningful tests for cross-tenant links and exact money values. Empty/error/mobile states work.

M3 — Complete approval workflow: drafts, snapshots, issuance, review verification, decisions, withdrawal/expiry; enforce business rules and test concurrent decisions against PostgreSQL. Exercise one full owner-to-client flow in a browser.

M4 — Dashboard and records: filters, currency-separated totals, accessible print layout and history. Verify approved records remain unchanged after contact edits.

M5 — Launch: choose hosting within a founder-agreed budget; separate staging/production secrets; HTTPS; production email; scoped error reporting; health checks; database backups and an actual restore exercise; migration/deployment runbook and rollback strategy. Prefer backward-compatible migrations; app rollback is not automatic data rollback. Review privacy/retention and service terms before real client data. Do not deploy or incur charges without founder authorization.

Measure after launch: agencies issuing a first request, client decision completion, time to decision, repeat agency usage, and requests abandoned at verification. Use minimal internal counts without third-party analytics initially. SaaS pricing and billing implementation remain later decisions.

