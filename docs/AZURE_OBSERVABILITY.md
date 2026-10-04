# Azure probes and runtime observability

The last technical safeguard before the first real Azure DEV deployment:
Container Apps probes tuned to this application's actual startup/failure
behavior, and just enough runtime visibility (release identity, worker
heartbeat, queue depth) to answer "why isn't Azure DEV starting?" without
guessing.

## Audit — before/after

| Component | Health signal before this PR | Probe before | Missing | Target (this PR) |
|---|---|---|---|---|
| API | `/health/live`, `/health/ready` (already correct: live never touches deps, ready checks DB/Redis/RLS/storage/schema), `/health/deep` (already secret-protected) | `/health/ready` readiness only (from #263) | Startup + Liveness probes; release identity in responses | Add Startup+Liveness probes; add `release_sha` to live/ready/deep |
| Worker | None — no HTTP server, no heartbeat, no Container Apps probe of any kind | None | Everything: is it alive, connected to Redis, processing jobs | Per-replica Redis heartbeat + ARQ's own built-in health-check key, both read from `/health/deep` |
| Migration Job | Alembic's own CLI log output only; exit code | None (Jobs have no probes — only exit code matters) | Readable started/current/target/succeeded-or-failed lines; release identity | `scripts/run_migration.py` wrapper; `RELEASE_SHA` env var |
| Frontend | Docker `HEALTHCHECK` (local only, invisible to Azure) | None | Any Container Apps-level probe | Liveness+Readiness `httpGet /` |

This matches the existing, already-solid `/health/live`/`/health/ready`/`/health/deep` design in `app/main.py` — most of the API side of this PR is Container Apps *configuration* catching up to application code that already did the right thing, not new application logic.

## Diagnosing "why doesn't Azure DEV start?"

This PR's whole point is making these distinguishable from `az containerapp` output + `/health/deep` + Log Analytics, without SSHing anywhere:

| Symptom | Where it shows up |
|---|---|
| Container crashed | Replica status != Running; `az containerapp logs show` shows a Python traceback before any `Startup probe` log line |
| DB unavailable | `/health/ready` → `components.database != "connected"`; readiness probe failing; `/health/deep` → `components.database` |
| Redis unavailable | `/health/ready` → `components.cache != "connected"` (fails readiness — see "Readiness policy" below); `/health/deep` → `components.cache` |
| Blob/storage unavailable | `/health/ready` → `components.storage == "unreachable"` (fails readiness); `"disabled"` is not a failure |
| Migration pending | `/health/ready` → `components.schema == "outdated"`; migration Job's own logs never printed `migration succeeded` |
| Migration failed | Migration Job execution status `Failed` in `az containerapp job execution list`; its logs end with `ERROR [migration] migration failed: <type>: <detail>` |
| API alive but not ready | `/health/live` → 200, `/health/ready` → 503 — this is the single most common "looks broken but isn't crashed" state; check `/health/ready`'s `components` for which one is failing |
| Worker dead | `/health/deep` → `workers: []` (no replica has ever announced itself) or every listed worker `status: "missing"` |
| Worker connected but stuck | `/health/deep` → a worker shows `status: "stale"` (heartbeat aging but not yet expired — the event loop is blocked by something) |
| Queue backlog | `/health/deep` → `queue.depth` high and/or `queue.oldest_pending_age_seconds` growing |
| Frontend unavailable | Frontend Container App readiness probe failing on `GET /`; `az containerapp logs show --name ca-schoolflow-frontend-<env>` |

## API probes

Three Container Apps probes, all against the API's port (8000), each checking something different — see the inline Bicep comments in `infra/azure/modules/container-apps.bicep` for the full reasoning:

| Probe | Endpoint | periodSeconds | timeoutSeconds | failureThreshold | Budget before action |
|---|---|---|---|---|---|
| Startup | `/health/ready` | 10 | 5 | 12 | ~120s cold-start tolerance before Container Apps restarts the container |
| Liveness | `/health/live` | 15 | 5 | 3 | ~45s of a genuinely hung process before restart |
| Readiness | `/health/ready` | 10 | 5 | 3 | ~30s before traffic is withheld |

While the Startup probe is still failing, Container Apps does not evaluate Liveness or Readiness at all (platform behavior) — this is what gives a slow cold start (first DB/Redis connection, gunicorn worker spin-up) room to succeed without a false-positive restart, while a genuinely hung process still gets caught by Liveness on a much tighter budget once started.

### `/health/live`

Confirmed by reading `app/main.py::liveness_check()`: returns 200 unconditionally, checks nothing beyond "can this process serve an HTTP response" — no DB, no Redis, no storage. `test_liveness_does_not_touch_external_dependencies` (existing test, unchanged by this PR) asserts this directly by mocking the DB/cache checks and confirming they're never called. This PR adds `release_sha` to the response body; it changes nothing about what gets checked.

### `/health/ready`

Confirmed by reading `app/main.py::readiness_check()`/`_readiness_is_healthy()` (already correct going into this PR — see #263's work on the schema check):

| Dependency | Classification | Failure behavior |
|---|---|---|
| PostgreSQL | CRITICAL | `database != "connected"` → not ready |
| Alembic schema revision | CRITICAL | `"outdated"` or `"unknown"` → not ready (never auto-migrates — see #263) |
| Redis (cache) | CRITICAL | `cache != "connected"` → not ready — this API genuinely depends on Redis for rate limiting, token blacklist, session limits; a Redis outage is a real degradation of security-relevant behavior, not cosmetic |
| RLS operational state | CRITICAL | `rls != "active"` → not ready (a tenant-isolation failure must never look "ready") |
| Durable storage (Blob/MinIO) | CRITICAL if configured, INFORMATIONAL if disabled | `"unreachable"` → not ready; `"disabled"` (local-disk fallback, dev only) → still ready |
| SQLite (dev only) | N/A | short-circuits to ready once the DB connection itself succeeds — none of the above apply |

This policy was **read from the existing code, not invented for this PR** — `_readiness_is_healthy()`'s own comments already document exactly why each dependency is treated this way (e.g. "readiness is the one place this repo has decided to fail closed on an unverifiable schema state").

### `/health/deep`

Already correctly protected before this PR: open in `DEBUG=true`, otherwise requires `HEALTH_DEEP_SECRET` via query param or `Authorization: Bearer` header (same pattern as `/metrics/`), `include_in_schema=False` (not in the public OpenAPI schema). This PR adds two new sections without weakening that protection:

- `release_sha` — the deployed commit.
- `workers` — per-replica heartbeat status (see below).
- `queue` — ARQ queue depth + oldest pending job age (see below).

Never exposes: DATABASE_URL, REDIS_URL, connection strings, Key Vault references, stack traces, or any credential — confirmed by the existing `str(exc)`-avoidance pattern in `_check_storage_readiness()` (Azure SDK auth errors can embed a SAS token; only `type(exc).__name__` is logged there) and preserved in every new check this PR adds.

## Frontend probe

The frontend is static Nginx serving a built SPA (`root Dockerfile`) — "does the server respond" is the whole question, so both Liveness and Readiness are a plain `GET /` on port 80 (the same target the Dockerfile's own `HEALTHCHECK` already used locally, now also visible to Azure). Deliberately **not** calling any backend endpoint from the frontend's probe — a slow/unreachable API must show up as the *API's own* readiness going non-ready, never as the static file server (which doesn't need the API to serve its own files) being torn down for a dependency it doesn't have.

## Migration Job

Still exactly what #263 established: `START → alembic upgrade head → EXIT 0/non-zero → STOP`, never a long-running process, never re-introduced into API/worker startup. The only change is *how* it runs `alembic upgrade head` — `backend/scripts/run_migration.py` wraps it with:

```
migration started: release_sha=<sha>
current revision: <revision or "none (fresh database)">
target revision: <revision>
migration succeeded: release_sha=<sha> revision=<revision>
```
or on failure:
```
migration failed: <ExceptionType>: <detail>
```
exiting non-zero.

**A real bug was found and fixed while building this**: `alembic`'s own `env.py` calls `logging.config.fileConfig(alembic.ini)` as a side effect of `command.upgrade()` — `fileConfig()` defaults to `disable_existing_loggers=True`, which silently disables any `logging.getLogger()` instance not explicitly listed in `alembic.ini`'s `[loggers]` section, including a naive wrapper script's own logger. Confirmed by reproduction: a first version of this script using `logging.getLogger("run_migration").error(...)` for its failure line printed **nothing at all** on a real failure — exit code 1, zero explanation, exactly the "masked failure" this whole PR exists to prevent. Fixed by using plain `print()` (flushed, timestamped, to stdout for INFO / stderr for ERROR) instead, which is immune to `fileConfig()`'s logger-disabling side effect and still lands in the same Azure Log Analytics stream as everything else the container writes.

Never logs: `DATABASE_URL`, `DATABASE_URL_MIGRATIONS`, passwords, or any secret. Revision identifiers are short hex strings from this repo's own migration filenames (public, not sensitive); `RELEASE_SHA` is a public git commit.

## Worker heartbeat

The ARQ worker has no HTTP server, and this PR does not add one just to satisfy a probe (`app/workers/heartbeat.py`'s module docstring spells out why: Azure Container Apps has no `exec`-style probe — only `httpGet`/`tcpSocket` — so there is no way to wire ARQ's own `--check` CLI flag into a Container App probe field either, and a FastAPI instance whose only route is a health check would be pure overhead).

Instead, `app/workers/tasks.py`'s `on_startup`/`on_shutdown` hooks run a background loop (`app/workers/heartbeat.py`) that writes a small JSON heartbeat to Redis every 30 seconds:

```json
{"worker_id": "ca-schoolflow-worker-dev--abc123", "timestamp": 1735000000.0, "release_sha": "<sha>"}
```
under a **per-replica** key (`worker:heartbeat:<worker_id>`, TTL 90s = 3× the interval), with a lightweight index set (`worker:heartbeat:index`, no TTL, pruned on graceful shutdown) recording which worker ids have ever announced themselves.

`worker_id()` uses `CONTAINER_APP_REPLICA_NAME` (a reserved env var Azure Container Apps injects into every replica automatically), falling back to the container hostname for local dev. **This is deliberately per-replica, never one shared key**: a single global heartbeat key would let one live worker's write mask a second, crashed worker's death the moment this app scales beyond one replica (`workerMinReplicas`/`workerMaxReplicas` in `container-apps.bicep` are unchanged by this PR — still 1 — but the mechanism is correct for N replicas today, not something to redo later).

`GET /health/deep` reads this back (`_check_worker_observability()` → `read_all_heartbeats()`) and classifies each known worker id:

- **`running`** — heartbeat fresh (age ≤ 45s).
- **`stale`** — heartbeat key still present but its embedded timestamp is aging (45–90s) — the event loop is blocked by something (a slow job, a stuck query), not yet reported missing.
- **`missing`** — heartbeat key expired entirely (crashed, or never wrote one).

This read is bounded (one `SMEMBERS` + one `GET` per known replica) and only ever runs on `/health/deep` — never on the hot `/health/ready` path, per the explicit "avoid an expensive check on every probe" rule this PR follows.

### Exception : Azure App Service (production actuelle, 2026-10)

Contrairement à Container Apps, App Service (conteneur Linux) **exige** qu'un conteneur réponde en HTTP sur son port pour le considérer démarré ; sinon il le redémarre en boucle. Pour ce seul cas, `app/workers/http_health.py` fournit une sonde minimale, **désactivée par défaut**, activée par `WORKER_HEALTH_PORT` :

- `GET /health/live` → `200` tant que le dernier heartbeat Redis a réussi il y a moins de 90 s (ou pendant les 90 s de grâce au démarrage), sinon `503` ; tout autre chemin → `404`, rien d'exposé ;
- aucune dépendance (`asyncio.start_server`), aucun FastAPI : le heartbeat Redis reste la source de vérité, la sonde n'en est que le reflet local.

Réglages App Service du worker (à appliquer lors du déploiement par digest, **non appliqués** ici) : `WORKER_HEALTH_PORT=8000`, `WEBSITES_PORT=8000`, et facultativement le « Health check path » `/health/live`. Commande de démarrage inchangée : `arq app.workers.tasks.WorkerSettings`.

ARQ's own built-in health-check mechanism (`Worker.record_health()`, a queue-scoped key — `arq:queue:health-check` — carrying `j_complete`/`j_failed`/`j_retried`/`j_ongoing`/`queued` counts) is also reused, not reinvented: `WorkerSettings.health_check_interval` is lowered from ARQ's 1-hour default to 30s so "is *any* worker at all consuming this queue" is answerable within ~30s of a total outage. Its raw value is surfaced as `arq_health_check` in `/health/deep`'s `queue` section for an operator who wants ARQ's own job-count view alongside the per-replica identity view above.

## Queue observability

`/health/deep`'s `queue` section, read directly from ARQ's own Redis ZSET (`arq:queue`, the same one `enqueue_job()`/the `Worker` already use — no new infrastructure):

```json
{
  "status": "ok",
  "depth": 3,
  "oldest_pending_age_seconds": 12.4
}
```

`depth` = `ZCARD arq:queue` (pending + not-yet-due jobs). `oldest_pending_age_seconds` = age of the lowest-scored (earliest-due) entry, `null` when the queue is empty. This is the minimum useful signal — not a job-by-job breakdown, not a failed/running split beyond what ARQ's own health-check string already carries in `arq_health_check` — deliberately, per this PR's "minimum necessary before Azure DEV" scope.

## Multiple workers / cron risk (documented, not built)

`workerMinReplicas`/`workerMaxReplicas` are unchanged (still 1) — this PR does not scale the worker out just because heartbeats now support it. The heartbeat mechanism (per-replica keys) is verified correct for N replicas today.

**Documented risk, not fixed in this PR** (per the task's explicit "don't refactor the whole architecture, document the risk"): `WorkerSettings.cron_jobs` (`purge_expired_idempotency_keys`, `purge_old_public_form_submissions`, `check_inactive_tenants`) are scheduled per-worker-process. ARQ's own cron mechanism uses a deterministic job id (`f'{cron_job.name}:{to_unix_ms(cron_job.next_run)}'` when `unique=True`, ARQ's own default) precisely so that N workers all attempting to enqueue "the same cron firing" collapse to one job — `pool.enqueue_job` returns `None` for a duplicate id instead of creating a second job. This is ARQ's own built-in protection, not something this PR added; the risk that remains **undocumented protection, not undocumented danger**: if a future change ever passes `unique=False` to one of these `cron()` calls, double-execution becomes real. No code change made here — flagging it so it isn't rediscovered the hard way after a second replica is added.

## Release identification (`RELEASE_SHA`)

`app/core/config.py`'s new `RELEASE_SHA` setting (`os.getenv("RELEASE_SHA", "unknown")`) is the plain, non-secret Git SHA #264's release manifest built this image from (`release-manifest.json`'s `release.git_sha`). Threaded through:

- `infra/azure/modules/container-apps.bicep`: a new required `releaseSha` parameter (no default — same "an unnamed release must never silently deploy" rule as `backendImage`/`frontendImage`), set as a plain `RELEASE_SHA` env var on the migration Job, `api`, and `worker` containers.
- The three `.bicepparam` files: `param releaseSha = readEnvironmentVariable('RELEASE_SHA')` — same mechanism already used for `postgresAdminPassword`/`backendImage`/`frontendImage` (a `.bicepparam` file must satisfy every no-default parameter itself; a same-command-line `--parameters` override is not reliable — see #264's own report for why).
- `.github/workflows/deploy-azure.yml`: sets `RELEASE_SHA` from the same release manifest it already reads `BACKEND_IMAGE`/`FRONTEND_IMAGE` from (`steps.manifest.outputs.git_sha`).

Result: `API running release <sha>` (startup log line), `Worker starting: release_sha=<sha>` (startup log line), `migration started: release_sha=<sha>` (migration Job log), and `release_sha` in `/health/live`, `/health/ready`, `/health/deep` response bodies — all traceable to the exact commit #264's pipeline built, never a guess. Frontend was left out of this pass (item 17's own "if appropriate" — the frontend has no server-side logs to annotate; its identity is already provable via the image digest itself per #264, and adding a client-side display was judged out of this PR's "stay short and targeted" scope).

## Log Analytics

Audited: `infra/azure/modules/container-apps.bicep`'s `containerAppsEnv` (`Microsoft.App/managedEnvironments`) already configures `appLogsConfiguration.destination = 'log-analytics'` wired to `logAnalyticsCustomerId`/`logAnalyticsSharedKey` (from `modules/monitoring.bicep`) — **this was already correct before this PR**, for every container in the environment (api, worker, frontend, and the migration Job, since Jobs run inside the same managed environment). Nothing added here; this PR's new log lines (release identity, migration started/current/target/succeeded-or-failed, worker startup) automatically flow into the same Log Analytics workspace as everything else, queryable via:

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s in ("ca-schoolflow-api-dev", "ca-schoolflow-worker-dev", "caj-schoolflow-migrate-dev")
| order by TimeGenerated desc
```

## Application Insights

Audited: `appInsightsConnectionString` is already threaded into `api`/`worker` as `APPLICATIONINSIGHTS_CONNECTION_STRING` (`modules/monitoring.bicep` → `container-apps.bicep`) — already correct before this PR. No OpenTelemetry/APM SDK wiring was found or added in application code; this PR does not start one (explicitly out of scope — "ne pas construire un projet OpenTelemetry complet").

## Minimal alerting (prepared, not wired to a notification channel)

Out of scope to fully wire (needs an Action Group with real recipients, which is an operational decision for whoever runs Azure DEV, not something to invent here) — but the four signals this PR makes observable are exactly the four a first alert set should cover once that Action Group exists:

1. **API not ready** — `/health/ready` returning 503 for N consecutive checks (Azure Monitor can alert on the readiness probe's own failure count, or on an Application Insights availability test hitting the same URL).
2. **API container restart/crash** — Azure Monitor's built-in `Restart Count` metric on the `api` Container App.
3. **Migration job failed** — the migration Job's execution status; `az containerapp job execution list --name caj-schoolflow-migrate-<env> --query "[?properties.status=='Failed']"` is the manual check today, an Azure Monitor alert rule on the Job's own execution-status metric is the automatable version.
4. **Worker heartbeat missing** — not natively an Azure Monitor metric (it's an application-level Redis key, not a platform signal) — the practical version for now is an operator or a scheduled script calling `/health/deep` and checking `workers[].status`; a proper alert would need a small Azure Monitor custom-metric bridge, deliberately not built in this PR (the "prepare, don't build a 50-alert catalog" scope line).

## Security

- No secret in any new log line, health response, or heartbeat payload — confirmed for the migration script by direct reproduction (`tests/test_run_migration_script.py::test_migration_logs_contain_no_secrets`, checking for `password=`, `postgres://`, `postgresql://`, `redis://`, `Authorization:`, `Bearer ` in real subprocess output) and for the worker heartbeat by a unit test asserting the JSON payload never contains those same substrings.
- `RELEASE_SHA` and revision hashes are not secrets (a public git commit, a migration filename fragment) — safe to log and to return from `/health/live`/`/health/ready` (unauthenticated) as well as `/health/deep` (protected).
- `/health/deep`'s existing protection (secret via query param or `Authorization: Bearer`, open only in `DEBUG=true`) is unchanged — the new `workers`/`queue` sections are exposed exactly as protected as the sections already there.

## Testing

- `tests/test_health.py`: existing 32 tests unchanged and passing; 11 new tests covering `release_sha` presence on all three health endpoints, the `workers`/`queue` sections' presence and non-crashing behavior on `/health/deep`, and `app/workers/heartbeat.py`'s `worker_id()`/`write_heartbeat()`/`read_all_heartbeats()` (running/stale/missing classification, no-secrets-in-payload) via mocked Redis — no real Redis required for these unit tests.
- `tests/test_run_migration_script.py` (new): runs `scripts/run_migration.py` as a real subprocess against a fresh SQLite DB, asserting the started/current-revision/target-revision lines always appear, that a real failure (this repo's migration chain includes Postgres-only DDL with no SQLite guard, so it deterministically fails on SQLite — a pre-existing, unrelated fact, not something this script causes) is logged with a non-zero exit code (the exact regression this PR's `fileConfig()` bug fix targets), and that no secret substring appears in either success or failure output.
- **Not exercised**: a real Postgres migration success path (no PostgreSQL available in this sandbox — see #263/#264's own reports for the same limitation), a real multi-replica worker heartbeat scenario, and anything requiring an actual Azure deployment (Container Apps probe behavior itself, Log Analytics query results, Application Insights telemetry). See "Known limitations" below.

## Known limitations / remaining risks

- No real Azure deployment has validated Container Apps' actual probe behavior (Startup→Liveness/Readiness gating, restart-on-liveness-failure, traffic-withholding-on-readiness-failure) — only the Bicep template's syntax and structure were validated locally (`bicep build`/`bicep lint`).
- The worker heartbeat and ARQ's own health-check key have not been exercised against a real multi-replica deployment; the per-replica key design is correct by inspection of `CONTAINER_APP_REPLICA_NAME`'s documented semantics, not confirmed against a live scale-out.
- The migration script's success path was not verified against real PostgreSQL (only the failure path, which fully exercises the logging-bug fix, was — this repo's own migration chain cannot complete against SQLite regardless of this script).
- Minimal alerting is prepared (see above) but not wired to a real Action Group/notification channel — deliberately out of this PR's scope.
