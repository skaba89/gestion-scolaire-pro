import logging
import os
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Callable, Optional, TypeVar
from sqlalchemy import create_engine, text, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker
from app.core.config import settings

logger = logging.getLogger(__name__)

# Global context for tenant_id to be used in database sessions
tenant_context: ContextVar[str] = ContextVar("tenant_id", default=None)

# ---------------------------------------------------------------------------
# Engine configuration — SQLite and PostgreSQL have different requirements.
# ---------------------------------------------------------------------------
_engine_kwargs = {
    "echo": settings.DEBUG,  # Log SQL queries in debug mode
}

if settings.is_sqlite:
    # SQLite: no connection pooling, enable WAL mode for better concurrency,
    # and support for foreign key constraints (off by default in SQLite).
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL: enable connection pooling and pre-ping checks.
    _engine_kwargs["pool_size"] = settings.DATABASE_POOL_SIZE
    _engine_kwargs["max_overflow"] = settings.DATABASE_MAX_OVERFLOW
    _engine_kwargs["pool_pre_ping"] = True

    # SSL for PostgreSQL:
    #   1. If the URL already contains sslmode=require → honour it.
    #   2. If DATABASE_SSL env var is explicitly "true" → force SSL.
    #   3. Otherwise → no forced SSL (safe for Docker internal networks and
    #      development; cloud providers include sslmode=require in their URLs).
    #
    # We intentionally avoid the "not DEBUG → force SSL" pattern because Docker
    # Compose internal PostgreSQL has no SSL certificate, causing connection
    # failures even though DEBUG=False is the correct production default.
    import os as _os
    _db_url = settings.DATABASE_URL_SYNC or ""
    _db_ssl_env = _os.getenv("DATABASE_SSL", "").lower()
    if "sslmode=require" in _db_url or "sslmode" in _db_url or _db_ssl_env == "true":
        _engine_kwargs.setdefault("connect_args", {})["sslmode"] = "require"

# Create SQLAlchemy engine
engine = create_engine(settings.DATABASE_URL_SYNC, **_engine_kwargs)

# ---------------------------------------------------------------------------
# SQLite pragmas: enable WAL journal mode and foreign keys on every connection.
# ---------------------------------------------------------------------------
if settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()


# ---------------------------------------------------------------------------
# RLS tenant context — TRANSACTION-scoped, re-applied on every transaction.
#
# SECURITY (pooler remediation, 2026-10): the tenant context used to be set
# once per session with `set_config('app.current_tenant_id', ..., false)`
# (SESSION scope). Behind a transaction-mode pooler (PgBouncer — Neon's
# `-pooler` endpoint), every transaction may run on a different server
# connection: a session-scoped GUC then survives on the server connection
# and is inherited by whichever client gets it next (tenant A's context
# leaking into tenant B's request, or a tenant request landing on an empty
# "platform" context), while the client's own next transaction may run
# without it. Reproduced on a Neon branch with two clients.
#
# The context now lives on the APPLICATION side (`Session.info`) and is
# re-asserted with `set_config(..., true)` (transaction-local, i.e.
# `SET LOCAL`) at the start of EVERY transaction the session begins, on
# whichever server connection that transaction actually got. A
# transaction-local value disappears at COMMIT/ROLLBACK, so a reused or
# pooled connection can never carry it over to anyone else, and a session
# that commits several times keeps its own context in every transaction.
# ---------------------------------------------------------------------------
_RLS_TENANT_KEY = "rls_tenant_id"
_SET_LOCAL_TENANT_SQL = text("SELECT set_config('app.current_tenant_id', :tid, true)")


@event.listens_for(Session, "after_begin")
def _reapply_rls_context_on_begin(session, transaction, connection):
    """Position the tenant context at the start of EVERY transaction on
    PostgreSQL: the session's own context (see `_set_rls_context`), or ''
    (no tenant) for a session that never declared one. Always writing a
    transaction-local value means a session-scoped value left on the server
    connection (older code during a mixed deployment, a manual SET behind
    the pooler) can never be inherited."""
    if connection.dialect.name != "postgresql":
        return
    connection.execute(_SET_LOCAL_TENANT_SQL, {"tid": session.info.get(_RLS_TENANT_KEY, "")})


def get_db():
    """Dependency to get a database session carrying the request's RLS tenant context.

    The context (TenantMiddleware's `tenant_context`, None = no tenant) is set
    with `_set_rls_context`: transaction-local and re-applied at the start of
    every transaction of this session, so nothing survives on a reused or
    pooled connection (see `_reapply_rls_context_on_begin`).
    """
    db = SessionLocal()

    if not settings.is_sqlite:
        try:
            # One SET LOCAL round-trip per transaction — the price of being
            # correct behind a transaction-mode pooler.
            _set_rls_context(db, tenant_context.get())
        except Exception:
            # Fail-closed: never serve a request whose tenant context could
            # not be positioned (rule: no silent degradation).
            logger.exception("get_db: impossible de positionner le contexte tenant RLS — requête refusée")
            db.close()
            raise

    try:
        # PERFORMANCE: this "SELECT 1" liveness probe is redundant on
        # PostgreSQL — pool_pre_ping=True (see engine creation above) already
        # validates every connection at checkout time, transparently and at
        # the pool level, before SQLAlchemy ever hands it back here. Paying
        # for a second, app-level round-trip on every single request just to
        # re-confirm what pre_ping already confirmed — one of three
        # round-trips get_db() spent before any real query. Under
        # connection-pool contention that's real held-connection time. Kept
        # for SQLite, which has no pool_pre_ping equivalent configured.
        if settings.is_sqlite:
            db.execute(text("SELECT 1"))
        yield db
    except Exception as exc:
        # Only log actual database/sqlalchemy errors, not HTTP exceptions raised
        # by endpoint handlers (e.g. 401/403/404), nor the rate limiter's
        # RateLimitExceeded (@limiter.limit(...) checks inside the endpoint
        # body, after get_db() already opened a session) — both propagate
        # through yield same as a real DB error, but neither is one. Without
        # this exclusion, every 429 gets misleadingly logged as
        # "Database error in get_db()", which sent a live debugging session
        # down the wrong path (see commit history).
        from fastapi import HTTPException as _HTTPException
        from slowapi.errors import RateLimitExceeded as _RateLimitExceeded
        if not isinstance(exc, (_HTTPException, _RateLimitExceeded)):
            import logging
            logging.getLogger(__name__).error(
                "Database error in get_db(): %s", exc
            )
        try:
            db.rollback()
        except Exception:
            pass
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Worker/background-job DB sessions — RLS tenant context outside the HTTP
# request cycle (security audit 2026-09, follow-up to PR #259/#260:
# docs/POSTGRES_APP_ROLE.md, docs/SECURITY_MODEL.md).
#
# The HTTP path gets its tenant context "for free": TenantMiddleware
# extracts tenant_id from the JWT and calls tenant_context.set(tenant_id)
# before the request handler runs, and every get_db() call above then reads
# that ContextVar and positions app.current_tenant_id accordingly. An ARQ
# worker job has no HTTP request, no middleware, and no ContextVar set by
# anyone — it only has whatever arguments were passed to enqueue_job(). Every
# job in app/workers/tasks.py that used to open `with SessionLocal() as db:`
# directly therefore ran with NO tenant context at all: under the current
# superuser database role this was invisible (superuser bypasses RLS
# unconditionally), but it is a real, silent multi-tenant isolation gap the
# moment the application connects as a restricted, non-superuser role
# (schoolflow_app, see infra/azure/sql/create_app_role.sql).
#
# These two context managers are the ONLY sanctioned way for worker code to
# open a database session — see docs/POSTGRES_APP_ROLE.md for the full
# worker architecture and the reasoning behind every choice below.
# ---------------------------------------------------------------------------


class TenantContextError(ValueError):
    """Raised by worker_db_session() when a tenant-scoped job cannot safely
    determine which tenant it is acting for. Never caught silently by this
    module — a job that cannot prove its own tenant scope must fail loudly
    (fail-closed) rather than run with no context (which would let it read/
    write across every tenant under a role that bypasses RLS, or silently
    see/change nothing under a role that enforces it — neither is an
    acceptable substitute for "refuse the job")."""


def _resolve_tenant_context(db: Session, tenant_id: str) -> str:
    """Validate tenant_id is a syntactically valid UUID AND that a tenant
    with that id actually exists, before ever touching a tenant-scoped
    table. `tenants` itself carries no RLS policy (it is the root of the
    tenant hierarchy, not a tenant-scoped table - see
    20260224_0730_fdb89a2e3b4d_enable_rls.py), so this lookup is safe
    regardless of what app.current_tenant_id is currently set to."""
    try:
        normalized = str(uuid.UUID(str(tenant_id)))
    except (ValueError, AttributeError, TypeError) as exc:
        raise TenantContextError(f"Invalid tenant_id (not a UUID): {tenant_id!r}") from exc

    from app.models.tenant import Tenant  # local import: avoids a circular import at module load

    exists = db.query(Tenant.id).filter(Tenant.id == normalized).first() is not None
    if not exists:
        # Fail closed rather than silently running the job with no
        # isolation guarantee for a tenant that no longer exists (e.g. a
        # job enqueued just before the tenant was deleted).
        raise TenantContextError(f"Tenant does not exist: {normalized}")
    return normalized


def _set_rls_context(db: Session, tenant_id: Optional[str]) -> None:
    """Set the tenant context of this SESSION (None = no tenant / platform).

    The value is stored in `db.info` and applied TRANSACTION-locally
    (`set_config(..., true)`): immediately if a transaction is already open,
    and again by `_reapply_rls_context_on_begin` at the start of every later
    transaction of this session — so a session that commits several times
    (check_inactive_tenants, an HTTP request committing then reading back)
    keeps its own context in each transaction, and nothing ever survives on
    the server connection once a transaction ends. Safe behind a
    transaction-mode pooler and on a reused pooled connection (see the
    module-level comment above `_RLS_TENANT_KEY`).

    "No tenant" is stored as the empty string: every RLS policy reads the
    setting through NULLIF(..., '') (migrations 20260928_0001 and
    20260929_0001), so '' and an unset GUC mean exactly the same thing.
    """
    if settings.is_sqlite:
        return
    if db.in_nested_transaction():
        # A SET LOCAL issued inside a SAVEPOINT is undone by ROLLBACK TO
        # SAVEPOINT while db.info would keep the new value: the effective
        # context and the application's view would diverge. Refuse.
        raise RuntimeError("Le contexte tenant ne peut pas être changé dans un savepoint (begin_nested).")
    value = str(tenant_id) if tenant_id else ""
    db.info[_RLS_TENANT_KEY] = value
    if db.in_transaction():
        db.execute(_SET_LOCAL_TENANT_SQL, {"tid": value})
    else:
        # Begins the transaction: _reapply_rls_context_on_begin applies it.
        db.connection()


@contextmanager
def worker_db_session(tenant_id: Optional[str]):
    """The ONLY sanctioned way for a tenant-scoped background job (ARQ task,
    cron job, webhook handler acting on behalf of one resolved tenant...) to
    open a database session outside the HTTP request cycle.

    Fail-closed by construction - there is no code path in this function
    that runs a business query without first proving a real, existing
    tenant:
      - tenant_id is None/empty      -> TenantContextError, no session ever
                                         used for a query.
      - tenant_id is not a valid UUID -> TenantContextError.
      - tenant_id does not exist      -> TenantContextError.
      - Never falls back to "run without context" or "pick the first
        tenant" - there is no default tenant, ever.

    Lifecycle (mirrors get_db() above): opens a session, validates and
    positions the tenant context, yields the session for the caller's
    business logic, commits on success / rolls back on any exception,
    then always closes the session - returning the connection to the pool
    only after rollback/commit has run, so the pool never receives a
    connection sitting mid-transaction.

    Usage::

        with worker_db_session(tenant_id) as db:
            run_student_import(db, tenant_id, ...)
            db.commit()  # jobs that need an intermediate commit still can;
                         # the final implicit commit below is a no-op on an
                         # already-clean session either way.
    """
    if not tenant_id:
        raise TenantContextError(
            "worker_db_session() requires a tenant_id - a tenant-scoped job "
            "must never run with no tenant context. Use platform_db_session() "
            "for a job that is deliberately platform-wide."
        )

    db = SessionLocal()
    try:
        normalized = _resolve_tenant_context(db, tenant_id)
        _set_rls_context(db, normalized)
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@contextmanager
def platform_db_session():
    """The ONLY sanctioned way for a genuinely platform-scoped background
    job (no single tenant: it acts across every tenant, or on
    platform-level data that carries no tenant_id at all - e.g.
    purge_expired_idempotency_keys, check_inactive_tenants) to open a
    database session outside the HTTP request cycle.

    Deliberately a SEPARATE function from worker_db_session() rather than
    "worker_db_session(None)" - a platform-scoped job must say so
    explicitly by calling this one, so a future caller can never end up
    here by accident (e.g. a bug that leaves tenant_id unset falls into
    worker_db_session()'s TenantContextError instead of silently running
    platform-wide).

    Resets app.current_tenant_id to "no tenant" (see _set_rls_context's
    docstring for exactly what that means under the hood, and why
    migration 20260929_0001 is required for the RLS policies that grant
    platform-scoped visibility to actually honour it). A job that needs to
    read/write ONE tenant's data at a time inside a platform-wide sweep
    (check_inactive_tenants iterating every tenant, retry_failed_notifications
    processing events across tenants) must call `_set_rls_context(db,
    tenant_id)` itself for each tenant in its own loop, then reset back to
    None before moving to the next one - see those functions in
    app/workers/tasks.py for the pattern.
    """
    db = SessionLocal()
    try:
        _set_rls_context(db, None)
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def switch_tenant_context(db: Session, tenant_id: str) -> str:
    """For a platform-scoped job (opened via platform_db_session()) that
    processes several tenants' data one at a time on the SAME session - the
    only correct way to move from one tenant to the next without ever
    reading/writing under a stale tenant's context.

    Same fail-closed validation as worker_db_session() (valid UUID, tenant
    must exist) - a platform sweep must never silently skip validating one
    of the tenants it iterates just because it already validated a
    DIFFERENT one earlier in the loop. Returns the normalized tenant_id so
    callers can use the canonical string form afterward.

    Callers MUST call `reset_tenant_context(db)` (or otherwise leave this
    session) before doing platform-scoped work again on this session: the
    context lives on the SESSION (`db.info`) and is re-applied to every later
    transaction of it. Nothing survives on the database connection itself
    (transaction-local) - see check_inactive_tenants and
    retry_failed_notifications in app/workers/tasks.py for the pattern.
    """
    normalized = _resolve_tenant_context(db, tenant_id)
    _set_rls_context(db, normalized)
    return normalized


def reset_tenant_context(db: Session) -> None:
    """Companion to switch_tenant_context() - clears the per-tenant context
    on a platform-scoped session after finishing that tenant's work, before
    moving to the next one (or before the session closes). See
    platform_db_session()'s docstring for what "reset" actually means at
    the PostgreSQL level and why it's safe (migration 20260929_0001)."""
    _set_rls_context(db, None)


def resolve_authenticated_user_row(db: Session, user_id: str, tenant_id: Optional[str]):
    """Look up the authenticated caller's own row by id, safely under a
    NOSUPERUSER NOBYPASSRLS role - the shared fix for a bug found while
    auditing HTTP auth (app/core/security.py::get_current_user()) and
    WebSocket auth (app/api/v1/endpoints/core/realtime.py) for RLS-safety.

    Both call sites need the exact same two-step lookup, so it lives here
    rather than being duplicated:

    1. Position the RLS context to `tenant_id` (the value already
       established for this request/connection - the JWT's own tenant_id
       claim for a tenant-scoped user, or None for one with no tenant) and
       look the user up. This is correct and sufficient for the ordinary
       case: a tenant-scoped user's own row has that exact tenant_id, so
       `users`' RLS policy (`tenant_id IS NOT DISTINCT FROM
       current_setting(...)::uuid`, no platform-wide bypass) matches it.
    2. If step 1 finds nothing, retry under "no tenant" context. This is
       the ONE legitimate fallback: a platform-level account (tenant_id IS
       NULL in the DB - SUPER_ADMIN, MINISTRY_ADMIN, ...) is invisible
       under any OTHER tenant's context, which happens whenever such an
       account is impersonating/viewing a specific tenant (SUPER_ADMIN's
       X-Tenant-ID header) - its own row only ever matches a NULL context.
       This can never be used to see a DIFFERENT tenant's user: `users`
       has no bypass clause, so a real tenant-scoped row stays invisible
       under a NULL context exactly as it would under any other tenant's.

    The previous, buggy version of this lookup (in get_current_user())
    unconditionally reset to NULL context first, which is step 2's
    behaviour applied unconditionally - correct for a platform-level
    account, but it made every ORDINARY tenant-scoped user invisible to
    their own authentication query under a role that actually enforces
    RLS (confirmed empirically against a real NOSUPERUSER NOBYPASSRLS
    role). This function tries the correct context FIRST and only falls
    back to NULL when that fails, closing that bug without weakening RLS
    (no policy changed, no bypass added, no default tenant).

    The session's context is restored to `tenant_id` before returning
    (whichever step found the row) so that later queries on this same
    session - `get_db()`'s session is shared with the rest of the HTTP
    request via FastAPI's dependency caching - keep seeing the tenant this
    request was actually resolved for, not "no tenant" left over from
    step 2's probe.
    """
    from app.models.user import User

    if settings.is_sqlite:
        return db.query(User).filter(User.id == user_id).first()

    _set_rls_context(db, tenant_id)
    user_db = db.query(User).filter(User.id == user_id).first()
    if user_db is not None:
        return user_db

    _set_rls_context(db, None)
    user_db = db.query(User).filter(User.id == user_id).first()
    _set_rls_context(db, tenant_id)
    return user_db


_T = TypeVar("_T")


def find_user_across_all_tenants(db: Session, query_fn: Callable[[Session], Optional[_T]]) -> Optional[_T]:
    """Find a user matching `query_fn` (e.g. by email, by a password-reset
    token's user_id) when NO tenant is known yet - the login/registration/
    password-reset family of endpoints, all pre-authentication by design
    (TenantMiddleware exempts every /auth/* path so no JWT/tenant context
    exists for them at all).

    ARCHITECTURE (restricted-DB-role auth fix, docs/POSTGRES_APP_ROLE.md):
    `users.email` and `users.username` are GLOBALLY unique (one account per
    identity, not per tenant - see app/models/user.py), so a login-by-email
    lookup is inherently a search across every tenant, not a single
    tenant's own data. Under a role that actually enforces RLS
    (NOSUPERUSER NOBYPASSRLS), a query with no context positioned finds
    NOTHING for a tenant-scoped user - confirmed empirically: `users`' RLS
    policy (`tenant_id IS NOT DISTINCT FROM current_setting(...)::uuid`)
    deliberately carries NO platform-wide bypass clause (unlike e.g. `jobs`
    or `notification_events`), by design from the PR that introduced it
    (#260) - `users` holds credentials/PII and a broad "no context = see
    everyone" bypass on it would be a real weakening of RLS, not a fix.

    Rather than add such a bypass, this searches EXPLICITLY, one tenant at
    a time, using the exact same switch_tenant_context()/
    reset_tenant_context() every other platform-scoped sweep in this
    codebase uses (check_inactive_tenants, expire_overdue_subscriptions) -
    `tenants` itself carries no RLS policy, so listing every tenant id is
    always safe. Tries "no tenant" FIRST (covers a platform-level account
    - SUPER_ADMIN, MINISTRY_ADMIN, ... - with a single cheap query, the
    common case for admin-diagnostic call sites), then every tenant in
    turn, stopping at the first match (`email`/`username` are unique
    constraints, so at most one row can ever match across the whole
    platform). O(n) in the number of tenants in the worst case (no match
    anywhere, or the match is the last tenant tried) - acceptable for
    endpoints that already do a bcrypt hash and are rate-limited
    (login, register, forgot-password), not for anything performance
    sensitive; do not reuse this for a hot path.

    Always leaves the session's RLS context reset to "no tenant" - safe
    for every current caller (all pre-auth, nothing tenant-scoped runs on
    this same session afterward), and never leaves it pointed at whichever
    tenant this search happened to try last.
    """
    if settings.is_sqlite:
        return query_fn(db)

    _set_rls_context(db, None)
    found = query_fn(db)
    if found is not None:
        return found

    from app.models.tenant import Tenant  # local import: avoids a circular import at module load

    started = time.monotonic()
    tenant_ids = db.query(Tenant.id).all()
    try:
        for (tenant_id,) in tenant_ids:
            switch_tenant_context(db, str(tenant_id))
            found = query_fn(db)
            if found is not None:
                return found
        return None
    finally:
        reset_tenant_context(db)
        log_slow_tenant_sweep("find_user_across_all_tenants", len(tenant_ids), started)


# Pre-authentication lookups resolved by a SECURITY DEFINER function
# (migration 20261009_0001) instead of a tenant-by-tenant sweep.
_USER_TENANT_RESOLVERS = {
    "login": text("SELECT tenant_id FROM public.resolve_user_tenants_by_login(:value)"),
    "email_ci": text("SELECT tenant_id FROM public.resolve_user_tenants_by_email_ci(:value)"),
    "user_id": text("SELECT tenant_id FROM public.resolve_user_tenants_by_id(CAST(:value AS uuid))"),
}


def find_user_in_owner_tenant(
    db: Session,
    query_fn: Callable[[Session], Optional[_T]],
    *,
    by: str,
    value,
) -> Optional[_T]:
    """Constant-cost replacement of find_user_across_all_tenants() for the
    pre-authentication user lookups (login, registration duplicate checks,
    password reset, MFA).

    `by` selects the resolver — "login" (email or username, exact),
    "email_ci" (case-insensitive email) or "user_id" — which returns only the
    owning tenant id(s) of the matching user(s): normally one (NULL for a
    platform account), none when no user matches. `query_fn` then runs once
    under each such tenant's own RLS context, so the user row itself is
    still read through the normal strict policy, never through the
    SECURITY DEFINER function. Cost: a handful of round trips, independent
    of the number of tenants (was up to 2N+1).

    `query_fn` must match the resolver's semantics (it is the authoritative
    filter). Same contract as find_user_across_all_tenants(): the session's
    RLS context is reset to "no tenant" on return. SQLite: one plain call.
    """
    if settings.is_sqlite:
        return query_fn(db)
    if by not in _USER_TENANT_RESOLVERS:
        raise ValueError(f"Unknown user resolver: {by!r}")
    if value is None or value == "":
        return None
    if by == "user_id":
        try:
            value = str(uuid.UUID(str(value)))
        except (ValueError, AttributeError, TypeError):
            return None

    _set_rls_context(db, None)
    tenant_ids = [row[0] for row in db.execute(_USER_TENANT_RESOLVERS[by], {"value": str(value)}).all()]
    try:
        for tenant_id in tenant_ids:
            _set_rls_context(db, str(tenant_id) if tenant_id else None)
            found = query_fn(db)
            if found is not None:
                return found
        return None
    finally:
        reset_tenant_context(db)


SLOW_TENANT_SWEEP_SECONDS = 0.5


def log_slow_tenant_sweep(name: str, tenant_count: int, started: float) -> None:
    """Observability for the remaining tenant-by-tenant sweeps (platform
    dashboards, SUPER_ADMIN lookups): their cost grows with the number of
    tenants, so log when one gets slow — the signal to revisit them (see
    docs/STATUT_ACTUEL.md, threshold ~200 tenants)."""
    elapsed = time.monotonic() - started
    if elapsed >= SLOW_TENANT_SWEEP_SECONDS:
        logger.warning(
            "Slow tenant sweep: %s over %d tenants took %.0f ms",
            name, tenant_count, elapsed * 1000,
        )
