## 9. First Codex prompt

Use the prompt below in the intended project directory after placing this document at docs/PRD.md. No particular Codex UI or version is assumed.

---

Build milestone M1 of the product described in docs/PRD.md. Treat that document as the implementation baseline. We are intentionally building before customer interviews; do not block on validation or claim demand has been proven.

First inspect the working directory, git status, existing code, dependency manifests and applicable AGENTS.md files. If the repository is empty, scaffold it. If it contains an unrelated project, stop and ask for the correct directory. Preserve unrelated changes. If docs/PRD.md is missing, ask me to supply it rather than inventing requirements.

Use React, TypeScript, FastAPI and PostgreSQL. Verify dependency APIs and compatible versions against current official documentation when needed, then lock dependencies. Follow the technical direction in the PRD; document any necessary deviations and their reasons.

Before editing application code, present a concise M1 plan with files/modules, important decisions, acceptance criteria and verification commands. Then proceed with M1 without asking about routine implementation details. Ask only if a consequential ambiguity or blocker prevents correct work.

Create or update root AGENTS.md, README.md, docs/architecture.md and docs/milestones.md. Keep the PRD intact unless explicitly documenting a resolved clarification. AGENTS.md should identify authoritative docs, scope boundaries, actual setup/test commands, coding conventions, migration rules, authorization requirements and the definition of done.

Implement M1 only: frontend/backend setup, local PostgreSQL configuration, initial Alembic migrations, secure owner registration/email verification/login/logout/password reset, one agency per owner, protected agency setup/profile UI, and CI. Use a local email sink so email flows are testable without external credentials. Include environment examples without secrets.

Implement tenant ownership checks and test them with two separate owner accounts. Use revocable cookie sessions with CSRF protection, vetted password hashing, rate-limited authentication/recovery, expiring one-use verification/reset tokens, and session invalidation after password reset. Do not hand-roll cryptography.

Keep the code modular but simple. Do not add projects, change requests, AI, payment processing, Redis, Celery, team roles or deployment in this milestone. Future modules belong in the plan, not placeholder implementations.

Run meaningful backend tests against PostgreSQL, including tenant isolation and session/recovery behavior. Verify a fresh database can migrate to head. Run frontend lint/type checks, production build, and an owner registration-to-agency-setup browser flow when browser tools are available. If verification cannot run, explain the precise blocker and provide the command to run it. Never fabricate test results.

Finish with a concise report of changes, checks and outcomes, remaining limitations, and exact local startup instructions. Update milestone progress truthfully. Stop after M1; do not push, deploy or purchase services.

---