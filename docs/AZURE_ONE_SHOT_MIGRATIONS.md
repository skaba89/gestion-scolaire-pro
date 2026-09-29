# Azure one-shot migrations (P0)

Separates three previously-conflated concerns — schema migration, API
startup, worker startup — into independent steps, so the application never
runs DDL and never needs DDL privileges to start.

## Why

Before this change, `backend/start.sh` ran `alembic upgrade head` (using
whatever role `DATABASE_URL_SYNC`/`DATABASE_URL` pointed at) on every single
container start, and `app/main.py`'s lifespan + two other runtime code paths
(`ensure_operational_tables()`, `mfa.py`'s `_ensure_mfa_tables()`) ran
additional `CREATE TABLE`/`CREATE POLICY`/`ALTER TABLE` statements the first
time the process (or a route) needed them. That is DDL, and it directly
conflicted with `schoolflow_app` (see `docs/POSTGRES_APP_ROLE.md`) — the
restricted, `NOSUPERUSER NOBYPASSRLS` role the API and worker connect as in
Azure DEV — which has no DDL grants of any kind, and must never be given
any: doing so would defeat the whole point of that role separation.

## Architecture

**Before:**

```
container start → start.sh → alembic upgrade head (DATABASE_URL_SYNC)
                → runtime DDL fixups (ensure_operational_tables, _ensure_mfa_tables)
                → Gunicorn
```

**After:**

```
deploy pipeline
  → az deployment group create --parameters deployApps=false
      (creates/updates the Container Apps environment + migration Job only)
  → az containerapp job start (migrationJob)
      alembic upgrade head, using DATABASE_URL_MIGRATIONS (schoolflow_migrator)
  → job exit code 0?
        NO  → workflow fails here. API/worker are NOT touched.
        YES → az deployment group create --parameters deployApps=true
                → api + worker (schoolflow_app, zero DDL) + frontend
```

The API and worker never run Alembic, never call `ensure_operational_tables()`
or `_ensure_mfa_tables()` (both removed from runtime code paths in this
change), and connect as `schoolflow_app`, which has no CREATE/ALTER/DROP
grants at all.

## Roles

- **`schoolflow_migrator`** — the only role allowed to run DDL. Used
  exclusively by the migration Job, via `DATABASE_URL_MIGRATIONS`.
- **`schoolflow_app`** — `SELECT`/`INSERT`/`UPDATE`/`DELETE` only,
  `NOSUPERUSER NOBYPASSRLS`, no DDL grants. Used by the API and worker, via
  `DATABASE_URL_SYNC`/`DATABASE_URL_ASYNC`.

Never grant `CREATE`/`ALTER`/`DROP`/`CREATEDB`/`CREATEROLE`/`SUPERUSER`/
`BYPASSRLS` to `schoolflow_app`, under any circumstance, including as a
workaround for a failing deployment — see `infra/azure/sql/create_app_role.sql`.

## Migration job (Azure Container Apps Job)

`infra/azure/modules/container-apps.bicep` defines `migrationJob`
(`caj-schoolflow-migrate-<env>`, `Microsoft.App/jobs`):

- Same image as the `api` Container App (`schoolflow-api:<apiImageTag>`) —
  no separate migration-only image to build or version.
- `command: ["alembic", "upgrade", "head"]` — nothing else; it never starts
  Gunicorn/uvicorn or the arq worker.
- `triggerType: Manual`, `replicaRetryLimit: 0` — the deploy workflow starts
  it explicitly and decides what a failure means; Container Apps' own
  retry/schedule machinery does not get to silently mask or retry a failed
  migration.
- `DATABASE_URL_MIGRATIONS` is a Key Vault secret reference, resolved at
  runtime via the job's managed identity — never a plaintext value in this
  repo or in Bicep.
- No ingress — it is a Job, not a Container App; there is nothing to route
  traffic to.

`container-apps.bicep` also gained a `deployApps` parameter (default
`true`). When `false`, the module's `if (deployApps)` condition skips
creating/updating `apiApp`/`workerApp`/`frontendApp` entirely, while
`containerAppsEnv` and `migrationJob` (both unconditional) still get
created/updated. This is what lets the deploy workflow apply the same
template twice — once to stand up (or update) the migration job without
touching the running application, then again to actually roll out
api/worker/frontend once migration has succeeded.

## Deployment pipeline

`.github/workflows/deploy-azure.yml` (`workflow_dispatch`-only, gated by a
GitHub Environment requiring human approval — unchanged) now runs, per
target environment:

1. `az deployment group create --parameters deployApps=false` — infra +
   migration job only.
2. `az containerapp job start` on `caj-schoolflow-migrate-<env>`, then polls
   `az containerapp job execution show` for that execution's own status
   (starting a Container Apps Job does not block on its exit code, so the
   workflow does not either — it watches the execution record instead).
3. If the job's status is anything other than `Succeeded`, the workflow
   step exits non-zero with `::error::`, and — because no later step sets
   `continue-on-error`, and GitHub Actions does not run subsequent steps in
   a job after a step fails — the workflow stops there. Step 4 never runs.
4. `az deployment group create --parameters deployApps=true` — rolls out
   api/worker/frontend.

A `concurrency: { group: deploy-azure-<environment>, cancel-in-progress:
false }` block serializes runs against the same environment: a second
`workflow_dispatch` targeting the same environment queues behind the first
instead of racing it (two concurrent migrations against the same database,
or one run's job-poll observing another run's execution, are the specific
failure this closes). This reuses GitHub's own concurrency mechanism rather
than inventing a custom database-level lock.

**Honesty note:** this infrastructure has never been applied against real
Azure resources — `deploy-azure.yml` is `workflow_dispatch`-only and its own
top-of-file comment has always said so. What has been verified in this
change is local: `bicep build`/`bicep lint` on `main.bicep` (0 errors, 0
warnings) and `bicep build-params` on all three `.bicepparam` files, plus
YAML-syntax validation of the workflow file. None of that is a substitute
for a real `az deployment group create` run against an actual Azure DEV
subscription, which has not been performed as part of this change.

## Schema version check (replaces runtime Alembic)

`app/main.py` reuses the pre-existing `_check_alembic_revision()` helper
(previously wired only into `/health/deep`) in two places:

- **Lifespan startup** (PostgreSQL only — SQLite still uses
  `Base.metadata.create_all()`): compares the DB's `alembic_version` against
  the code's head revision. Hard-exits (`raise SystemExit(1)`) only on a
  confirmed `"outdated"` result. A `"unknown"` result (e.g. a transient
  connectivity blip, or `alembic_version` missing entirely on a genuinely
  fresh DB before its first migration) logs a warning and continues,
  deliberately, to avoid crash-looping on an unverifiable state at boot.
- **`GET /health/ready`**: fails closed on *both* `"outdated"` and
  `"unknown"` — readiness is the stricter, designated enforcement point for
  an unverifiable schema state, since an orchestrator (or, in Azure, the
  Container App's own readiness probe — see below) is expected to act on a
  not-ready response by withholding traffic, not by crash-looping the
  process.

Neither path ever runs a migration itself — an outdated/unknown schema
makes the process refuse to start cleanly or report not-ready; it never
"fixes" the database.

`apiApp`'s container in `container-apps.bicep` now declares an explicit
`Readiness` probe against `/health/ready`. This means Azure Container Apps
itself withholds traffic from a new revision whose schema isn't migrated
yet, using the platform's own traffic-shifting behavior rather than any
custom orchestration in this repo.

## Runtime DDL removed

- **`backend/start.sh`**: no longer runs `alembic upgrade head` or the
  (already-redundant, superseded by migration `20260406_add_term_is_active`)
  `alembic_version` column-width fixup.
- **`app/main.py` lifespan**: no longer calls `ensure_operational_tables()`
  or falls back to `command.upgrade(alembic_cfg, "head")`.
- **`app/api/v1/endpoints/core/mfa.py`**: `_ensure_mfa_tables()` (14 call
  sites) removed entirely. `mfa_backup_codes`/`email_otps` were already
  Alembic-migrated (`20260406_add_mfa_and_perf_indexes.py`); `mfa_totp_secrets`
  had no migration and no ORM model at all — it is now covered by
  `alembic/versions/20260930_0001_adopt_operational_tables_into_alembic.py`,
  and by a new `app/models/mfa.py` (so SQLite dev/test still gets the table
  via `Base.metadata.create_all()`, since SQLite never runs Alembic).
- **`app/core/operational_tables.py`** (`ensure_operational_tables()`, the
  ~58-statement `_DDL` list, `_sweep_operational_rls()`): **kept**, not
  deleted — many existing tests (`tests/test_*`) call it directly against a
  real PostgreSQL test database as part of their own fixture setup,
  independent of app startup. What changed is that `app/main.py` no longer
  calls it automatically. The `_DDL` list and the RLS sweep are also now
  fully adopted into migration `20260930_0001` (imported by value, not
  re-typed, so there is no risk of drift between what used to run at every
  startup and what the migration now applies once) — so any environment
  that has already run `alembic upgrade head` has this DDL applied, and the
  module's own runtime call sites have nothing left to do. Retiring the
  module itself (or the ~58 tables it covers one-by-one into dedicated,
  named migrations with proper ORM models) is future cleanup, not required
  for this change: nothing in this PR needs it removed, and removing it now
  would break the tests that call it directly.

## Local development

Nothing changes for `docker compose up`: `.env.docker`'s `DATABASE_URL_SYNC`
is the local Postgres superuser, so it can still run DDL — but
`start.sh` itself no longer runs `alembic upgrade head` for you. Run it
explicitly before starting the stack (or whenever you pull new migrations):

```bash
docker compose run --rm api alembic upgrade head
docker compose up
```

or, from inside the `api` container / a local venv with `DATABASE_URL_SYNC`
pointed at your dev DB:

```bash
alembic upgrade head
```

If you forget, `GET /health/ready` will report the schema as `outdated` (or
the lifespan log will warn on `unknown`) — it will not silently apply the
migration for you.

## Azure DEV

1. `az deployment group create ... --parameters deployApps=false` (or let
   the workflow do it) to create/update `caj-schoolflow-migrate-dev`.
2. `az containerapp job start --name caj-schoolflow-migrate-dev --resource-group rg-schoolflow-dev`,
   then poll `az containerapp job execution show` for `Succeeded`.
3. Only then `az deployment group create ... --parameters deployApps=true`.

The `deploy-azure.yml` workflow does exactly this sequence when you run it
via `workflow_dispatch` with `environment: dev`.

## Azure REC/PROD

Same sequence, same workflow, `environment: rec` / `environment: prod` —
each is a separate GitHub Environment requiring its own approver(s) per
`infra/azure/README.md`. This PR does not add, test, or claim readiness for
REC/PROD beyond what the shared Bicep module/workflow logic implies; no
deployment to either has been attempted.

## Rollback

**Application rollback (redeploying a previous image tag) never runs
`alembic downgrade` automatically**, and nothing in this change adds such a
step. If the previous application version is compatible with the current
(already-migrated) schema, redeploying it via the same workflow (with the
older `image_tag`) is enough — the migration job re-running `alembic upgrade
head` against an already-current schema is a no-op (see idempotence, below).

If a migration itself needs to be reverted:

1. **Never run `alembic downgrade` against a shared environment casually** —
   confirm first whether the migration is backward-compatible with the
   application code that would run after a downgrade (a column removed by
   the "forward" migration cannot be un-removed without a data-loss
   warning).
2. For a genuinely broken migration not yet applied anywhere real: fix and
   replace it (only safe when nobody has deployed it yet).
3. For a broken migration already applied to a shared environment: write a
   new, forward-only migration that corrects the state — do not rewrite
   history. This matches the repository's existing convention (see e.g. how
   `20260406_add_term_is_active.py` fixed the `alembic_version` column width
   forward rather than rewriting an earlier migration).
4. A non-backward-compatible migration (e.g. a `NOT NULL` column with no
   default, a dropped column still read by the previous application
   version) must ship in two steps across two deploys: first a
   backward-compatible migration (nullable column, dual-write, etc.) that
   both the old and new application versions can run against, then a
   second migration once the new version is fully rolled out.

## Troubleshooting

**Migration job failed:**

1. Inspect its logs: `az containerapp job logs show --name caj-schoolflow-migrate-<env> --resource-group rg-schoolflow-<env>`
   (or via the Azure Portal → Container Apps Jobs → Execution history →
   Logs). Logs never contain `DATABASE_URL_MIGRATIONS`'s value — only
   Alembic's own upgrade progress/traceback output.
2. Correct the migration (or the underlying schema conflict) locally,
   verify with `alembic upgrade head` against a disposable database.
3. Push the fix, re-run the deploy workflow (or just re-run the "Run
   database migration job" step if the image itself didn't need to
   change) for the same environment.
4. Only once the job reports `Succeeded` does the workflow — or you,
   manually — proceed to `deployApps=true`.

**Readiness probe failing after a deploy:** check `GET /health/ready`'s
`components.schema` field — `"outdated"` means the migration job has not
actually run yet (or ran against a different database than the app is
pointed at — check `DATABASE_URL_SYNC` vs `DATABASE_URL_MIGRATIONS` target
the same server/database); `"unknown"` means the app couldn't read
`alembic_version` at all (check connectivity/permissions).

## Known limitations / remaining risks

- No real Azure deployment has validated this end-to-end; only Bicep/YAML
  syntax and local (SQLite) test runs. See the PR description for exact
  scope of what was and wasn't verified.
- `app/core/operational_tables.py`'s ~58-table `_DDL` list is now frozen
  into migration `20260930_0001` but the module itself, and the tests that
  call it directly against Postgres, remain. A future pass could give each
  of those tables a proper ORM model + dedicated migration and delete the
  module; not required by this change.
- The migration job's `replicaTimeout: 900` (15 minutes) is a guess for
  this schema's current size; a future very large migration may need it
  raised.
