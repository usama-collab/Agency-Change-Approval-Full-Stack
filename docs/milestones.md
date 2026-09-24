# Milestones and progress

The [PRD](PRD.md) defines product behavior and full acceptance criteria. This file tracks implementation, not evidence of customer demand.

| Milestone | Scope | Status |
| --- | --- | --- |
| M1 | Foundation, owner authentication/recovery, one agency per owner, PostgreSQL, local email, CI | Implemented; local checks pass. Compose startup and hosted CI remain unverified in this environment. |
| M2 | Tenant-safe clients and projects, exact money and baseline forms | Implemented; native local checks and browser journey pass. Hosted CI unverified. |
| M3 | Drafts, frozen proposals, client verification, decisions and concurrency | Planned |
| M4 | Dashboard, history, print records and currency-separated totals | Planned |
| M5 | Hosting, production email, backups, privacy and launch operations | Planned |

M1 targets AC01 and the agency ownership portion of AC02. M2 completes AC03 and extends AC02 to clients and projects. Request and print-record isolation remains later work, along with AC04–AC15. M2 is the active implemented milestone; M3 is not started. No interviews or demand validation have been performed.

M1 verification on 2026-09-24: a fresh PostgreSQL 18 database upgraded to Alembic head `0001_m1`; five PostgreSQL integration tests passed, including two-owner isolation, logout/CSRF, recovery revocation, rate limits, and email failure. Backend Ruff lint and format checks passed. Frontend ESLint, TypeScript check, and Vite production build passed. A browser journey completed registration, verification via a captured local SMTP message, login, and agency setup.

Docker Compose configuration validated, and the PostgreSQL 18 and Mailpit v1.27.0 image tags were found. Docker Desktop's daemon was unavailable, so the Compose services could not be started here. The browser test used a temporary PostgreSQL 18 server and SMTP capture process instead. The GitHub Actions workflow has not run on a hosted runner because the repository had not yet been initialized or pushed.

M2 verification on 2026-09-24:

- Native PostgreSQL 18 on loopback port 55433, with separate `agency` and `agency_test` databases, and native Mailpit v1.27.0 on 1025/8025. The binary checksum was verified against the pinned release asset digest. Start, stop, restart, repeated start, and installer rerun were exercised. Existing services on 5432 and 55432 were left untouched. Development owner, agency, and client records survived restart.
- All **10 PostgreSQL integration tests passed**: five M1 tests, four M2 tests, and a migration test covering both an empty installation and upgrade of populated M1 owner/agency records to `0002_m2`. Shared test fixtures clean projects before clients and agencies and retain the `_test` database guard.
- M2 tests cover both owners' CRUD and list isolation, foreign and absent IDs, cross-agency client assignment/reassignment, owned client filtering, pagination bounds, missing agency setup, all write methods' Origin/CSRF enforcement, strict integer prices, zero and maximum values, fractional/negative/boolean/string inputs, supported currencies, malformed dates, required text, and client deletion restrictions at API and database levels. Valid client reassignment and nonunique email addresses also pass.
- Backend Ruff lint and format checks passed. Frontend ESLint, TypeScript, exact-money Node test file, and Vite production build passed. Money tests cover exact decimal round trips and excessive precision/overflow rejection.
- A real browser journey used native Mailpit for email verification, then signed in, created an agency, followed the no-client “Add client” action, created and edited clients, previewed/saved/edited/deleted a project, and confirmed blocked client deletion followed by successful deletion after project removal. Preview/edit preserved USD 90071992547409.91 exactly; 100.001 was rejected; a 0.00 update saved. Deletion cancellation was checked.
- At 375×812, project form and preview had no horizontal overflow, preview focus moved to its heading, and returning to edit preserved the draft. A simulated 503 stayed on screen and recovered via Retry. Unknown routes displayed not-found, and an expired session redirected to login. Returning owners with an agency landed on Projects.

Limitations: this checkout had no Git repository during M2 verification; Git was initialized afterward. Hosted CI has not run. Compose and hosted CI configuration were preserved, but Docker startup was not exercised. The mounted checkout cannot enforce PostgreSQL's directory permissions, so this run used `/tmp/agency-add-on-billing-ms/postgres`; durable use should select a native persistent filesystem via `PG_DATA_DIR`. Linux amd64 was exercised; the pinned arm64 installer path was not. Test output includes existing Starlette/httpx and Alembic configuration deprecation warnings. The client picker fetches all clients through bounded API pages and is intended for M2-sized agencies. Production deployment and later-milestone acceptance criteria remain unimplemented.
