# Agency Change Approval

A React, TypeScript, FastAPI, and PostgreSQL app for an agency workflow that will cover extra work, pricing, deadline changes, and client approvals.

M2 implements owner access, one agency per owner, clients, and editable project baselines. The [PRD](docs/PRD.md) remains the product baseline. Approval requests, client review, payments, and dashboard totals belong to later milestones.

## Native local setup (no Docker required)

Requirements: Linux, PostgreSQL 18 binaries (default `/usr/lib/postgresql/18/bin`), Python 3.12+, uv, Node.js 22.13+, npm, curl, tar, and sha256sum. The Mailpit installer supports Linux amd64/arm64 and pins v1.27.0 with release SHA-256 digests.

From the repository root:

```sh
cp .env.example .env
# Replace the DATABASE_URL placeholders with the native helper credentials
# (agency / agency), and edit ports/paths before loading it.
set -a
. ./.env
set +a
scripts/install-mailpit.sh
scripts/local-services.py start
```

The helper owns a dedicated PostgreSQL cluster, creates separate `agency` and `agency_test` databases, and starts Mailpit bound to localhost (SMTP 1025, inbox [localhost:8025](http://localhost:8025)). It never initializes over an existing directory, never stops another service to free a port, and only signals the Mailpit process whose executable matches this checkout. Mailpit has no relay configured; inherited `MP_` options are removed so messages stay in the local sink. Binaries, logs, email storage, and default database files live in ignored `.local/`.

PostgreSQL defaults to port **55433** in the native helper and `.env.example`. Credentials `agency` / `agency` are local development defaults. Set `PG_BIN` for another PostgreSQL 18 installation. If a port is occupied, choose another `PG_PORT` and update the port in `DATABASE_URL`; for Mailpit, change `SMTP_PORT` and/or `MAILPIT_HTTP_PORT`. Stop this checkout's native services before changing their ports. Do not stop unrelated database services.

PostgreSQL needs a filesystem that supports Unix directory permissions. If the checkout is on a mounted drive that cannot enforce mode 0700, set `PG_DATA_DIR` in `.env` to a dedicated directory on a native filesystem, for example `/home/YOUR_USER/.local/share/agency-change-approval/postgres`. The helper creates its parent but never overwrites existing data. This environment was verified using `/tmp/agency-add-on-billing-ms/postgres` on port 55433; `/tmp` is disposable and unsuitable for records you want to keep. Keep external cluster directories outside version control.

In a backend terminal, load `.env` as above, then:

```sh
cd backend
uv sync --frozen --dev
uv run --no-sync alembic upgrade head
uv run --no-sync uvicorn app.main:app --reload
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open [localhost:5173/register](http://localhost:5173/register). Register, open the verification email in Mailpit, verify, sign in, create an agency, add a client, and create/review a project. The baseline is the owner's record of an existing agreement; tax and billing are handled externally. Supported currencies: PKR, USD, GBP, EUR. Prices accept at most two decimal places, up to 90071992547409.91. Past delivery dates are allowed.

Stop the frontend/backend with Ctrl-C. To stop only this checkout's native services, load the same `.env` and run `scripts/local-services.py stop`. Restart with `start`; records persist. No helper drops databases or removes cluster data.

## Checks

In a dedicated test shell, load `.env`, then override `DATABASE_URL` to the **test** database on your selected port:

```sh
export DATABASE_URL=postgresql+psycopg://agency:agency@127.0.0.1:55433/agency_test
cd backend
uv run --no-sync alembic upgrade head
uv run --no-sync ruff check .
uv run --no-sync ruff format --check .
uv run --no-sync pytest -q
```

Tests delete data and exercise migration downgrade/upgrade paths in that dedicated database. They reject names without the `_test` suffix. Never point tests at valuable records. Migrations are always applied explicitly; the application and tests do not use `create_all`.

```sh
cd frontend
npm run lint
npm run typecheck
npm test
npm run build
```

If the uv cache location is unwritable in a sandbox, set `UV_CACHE_DIR=/tmp/agency-uv-cache`. Do not reuse the test shell's `DATABASE_URL` when starting the development API.

## Optional Docker workflow

The existing `compose.yaml` and hosted CI configuration are preserved. Run `docker compose up -d`, use `DATABASE_URL=postgresql+psycopg://agency:agency@localhost:5432/agency`, then apply migrations and run the backend/frontend commands above. Create the test database with `docker compose exec postgres createdb -U agency agency_test`. Stop native Mailpit first if using Compose's same 1025/8025 ports. Hosted CI has not been run in this environment.

For production, HTTPS origin, secure cookies, production email, hosting, backups, and operations remain M5 work. See [architecture](docs/architecture.md) and [verification evidence](docs/milestones.md).
