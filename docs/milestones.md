# Milestones and progress

The [PRD](PRD.md) defines product behavior and full acceptance criteria. This file tracks implementation, not evidence of customer demand.

| Milestone | Scope | Status |
| --- | --- | --- |
| M1 | Foundation, owner authentication/recovery, one agency per owner, PostgreSQL, local email, CI | Implemented; local checks pass. Compose startup and hosted CI remain unverified in this environment. |
| M2 | Tenant-safe clients and projects, exact money and baseline forms | Implemented; native local checks and browser journey pass. Hosted CI unverified. |
| M3 | Drafts, frozen proposals, client verification, decisions and concurrency | Implemented; local checks and browser journey pass. Hosted CI unverified. |
| M4 | Dashboard, history, print records and currency-separated totals | Planned |
| M5 | Hosting, production email, backups, privacy and launch operations | Planned |

M1 targets AC01 and the agency ownership portion of AC02. M2 completes AC03 and extends AC02 to clients and projects. M3 implements AC04–AC12, request isolation under AC02, and local email-failure handling for AC15. Print records and dashboard totals (AC13–AC14) remain M4; production email operations remain M5. No interviews or demand validation have been performed.

M1 verification on 2026-09-24: a fresh PostgreSQL 18 database upgraded to Alembic head `0001_m1`; five PostgreSQL integration tests passed, including two-owner isolation, logout/CSRF, recovery revocation, rate limits, and email failure. Backend Ruff lint and format checks passed. Frontend ESLint, TypeScript check, and Vite production build passed. A browser journey completed registration, verification via a captured local SMTP message, login, and agency setup.

Docker Compose configuration validated, and the PostgreSQL 18 and Mailpit v1.27.0 image tags were found. Docker Desktop's daemon was unavailable, so the Compose services could not be started here. The browser test used a temporary PostgreSQL 18 server and SMTP capture process instead. The GitHub Actions workflow has not run on a hosted runner because the repository had not yet been initialized or pushed.

M2 verification on 2026-09-24:

- Native PostgreSQL 18 on loopback port 55433, with separate `agency` and `agency_test` databases, and native Mailpit v1.27.0 on 1025/8025. The binary checksum was verified against the pinned release asset digest. Start, stop, restart, repeated start, and installer rerun were exercised. Existing services on 5432 and 55432 were left untouched. Development owner, agency, and client records survived restart.
- All **10 PostgreSQL integration tests passed**: five M1 tests, four M2 tests, and a migration test covering both an empty installation and upgrade of populated M1 owner/agency records to `0002_m2`. Shared test fixtures clean projects before clients and agencies and retain the `_test` database guard.
- M2 tests cover both owners' CRUD and list isolation, foreign and absent IDs, cross-agency client assignment/reassignment, owned client filtering, pagination bounds, missing agency setup, all write methods' Origin/CSRF enforcement, strict integer prices, zero and maximum values, fractional/negative/boolean/string inputs, supported currencies, malformed dates, required text, and client deletion restrictions at API and database levels. Valid client reassignment and nonunique email addresses also pass.
- Backend Ruff lint and format checks passed. Frontend ESLint, TypeScript, exact-money Node test file, and Vite production build passed. Money tests cover exact decimal round trips and excessive precision/overflow rejection.
- A real browser journey used native Mailpit for email verification, then signed in, created an agency, followed the no-client “Add client” action, created and edited clients, previewed/saved/edited/deleted a project, and confirmed blocked client deletion followed by successful deletion after project removal. Preview/edit preserved USD 90071992547409.91 exactly; 100.001 was rejected; a 0.00 update saved. Deletion cancellation was checked.
- At 375×812, project form and preview had no horizontal overflow, preview focus moved to its heading, and returning to edit preserved the draft. A simulated 503 stayed on screen and recovered via Retry. Unknown routes displayed not-found, and an expired session redirected to login. Returning owners with an agency landed on Projects.

M3 verification on 2026-09-24:

- Native PostgreSQL 18 upgraded from M2 through the M3 migrations. The migration test covers both an empty install and preservation of populated M1 owner/agency plus M2 client/project records; current project terms backfill exactly.
- All **15 PostgreSQL integration tests passed**: existing M1/M2 checks and five M3 tests. M3 tests cover two-owner request isolation, baseline locking, stale drafts, immutable snapshots after contact edits, exact approval updates and idempotency, rejection, link rotation, code attempts/reuse/cooldown, email failure/retry, expiry, approval-withdrawal races, and competing client decisions. Backend Ruff lint and format checks passed. Frontend ESLint, TypeScript, exact-money Node tests, and Vite build passed.
- A real browser journey registered and verified an owner through Mailpit, created an agency/client/project, drafted and previewed a USD 25.00 addition to a USD 100.01 project, issued it, rotated a lost link, verified the designated email, approved, refreshed the confirmation, and checked that the owner sees USD 125.01 and the proposed date. Before verification the client page showed only a masked recipient and expiry. At 375×812 the owner project detail had no horizontal overflow.

Limitations: hosted CI and Docker Compose startup remain unverified. The browser journey used the same browser profile for owner and client navigation; API tests separately assert that client review does not use owner authentication. Review-code email used local Mailpit only. Test output includes existing Starlette/httpx and Alembic configuration deprecation warnings. The mounted checkout still requires a native persistent filesystem for PostgreSQL data outside the disposable `/tmp` path. Dashboard totals, print records, production email, and deployment remain later milestones.
