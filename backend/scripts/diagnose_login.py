#!/usr/bin/env python3
"""
SchoolFlow Pro — Login Diagnostic Script (Python)

Performs comprehensive checks from database connectivity through JWT validation
to identify the root cause of login failures.

Usage:
    cd backend/
    python -m scripts.diagnose_login
    python -m scripts.diagnose_login --env /path/to/.env

Requirements: Project Python dependencies installed (see requirements.txt)
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import traceback
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from typing import Any, Optional

# ── Ensure backend package is importable ──────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))


# ── Colored output ─────────────────────────────────────────────────────────────
class Color:
    """ANSI color codes for terminal output."""
    RED = "\033[0;31m"
    GREEN = "\033[0;32m"
    YELLOW = "\033[1;33m"
    CYAN = "\033[0;36m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    NC = "\033[0m"

    @staticmethod
    def ok(msg: str) -> str:
        return f"  {Color.GREEN}✔ OK{Color.NC}  {msg}"

    @staticmethod
    def fail(msg: str) -> str:
        return f"  {Color.RED}✘ FAIL{Color.NC} {msg}"

    @staticmethod
    def warn(msg: str) -> str:
        return f"  {Color.YELLOW}⚠ WARNING{Color.NC} {msg}"

    @staticmethod
    def info(msg: str) -> str:
        return f"  {Color.DIM}→ {msg}{Color.NC}"

    @staticmethod
    def remediation(msg: str) -> str:
        return f"  {Color.YELLOW}  ↳ Remediation: {msg}{Color.NC}"


# ── Diagnostic state ───────────────────────────────────────────────────────────
pass_count = 0
fail_count = 0
warn_count = 0
access_token: str = ""


def _ok(msg: str) -> None:
    global pass_count
    pass_count += 1
    print(Color.ok(msg))


def _fail(msg: str) -> None:
    global fail_count
    fail_count += 1
    print(Color.fail(msg))


def _warn(msg: str) -> None:
    global warn_count
    warn_count += 1
    print(Color.warn(msg))


def _info(msg: str) -> None:
    print(Color.info(msg))


def _remediate(msg: str) -> None:
    print(Color.remediation(msg))


def _header() -> None:
    print()
    print(f"{Color.CYAN}╔══════════════════════════════════════════════════════════════╗{Color.NC}")
    print(f"{Color.CYAN}║{Color.BOLD}  SchoolFlow Pro — Login Diagnostic Script (Python){Color.NC}         {Color.CYAN}║{Color.NC}")
    print(f"{Color.CYAN}╚══════════════════════════════════════════════════════════════╝{Color.NC}")
    print(f"  {Color.DIM}{time.strftime('%Y-%m-%d %H:%M:%S')}{Color.NC}")


def _step(num: int, desc: str) -> None:
    print()
    print(f"{Color.BOLD}━━━ Step {num}: {desc} ━━━{Color.NC}")


def _summary() -> None:
    print()
    print(f"{Color.CYAN}╔══════════════════════════════════════════════════════════════╗{Color.NC}")
    print(f"{Color.CYAN}║{Color.BOLD}  Diagnostic Summary{Color.NC}                                         {Color.CYAN}║{Color.NC}")
    print(f"{Color.CYAN}╠══════════════════════════════════════════════════════════════╣{Color.NC}")
    print(f"{Color.CYAN}║{Color.NC}  {Color.GREEN}Passed  : {pass_count}{Color.NC}")
    print(f"{Color.CYAN}║{Color.NC}  {Color.RED}Failed  : {fail_count}{Color.NC}")
    print(f"{Color.CYAN}║{Color.NC}  {Color.YELLOW}Warnings: {warn_count}{Color.NC}")
    print(f"{Color.CYAN}╚══════════════════════════════════════════════════════════════╝{Color.NC}")

    if fail_count == 0:
        print(f"  {Color.GREEN}{Color.BOLD}All checks passed! Login should be functional.{Color.NC}")
    else:
        print(f"  {Color.RED}{Color.BOLD}{fail_count} check(s) failed. See remediation steps above.{Color.NC}")
    print()


# ── Helpers ────────────────────────────────────────────────────────────────────
def read_env_var(env_path: Path, var_name: str) -> Optional[str]:
    """Read a variable from a .env file, handling comments and quotes."""
    if not env_path.is_file():
        return None
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, _, value = line.partition("=")
                    if key.strip() == var_name:
                        # Remove inline comments, surrounding quotes
                        value = value.split("#")[0].strip()
                        for quote in ('"', "'"):
                            if value.startswith(quote) and value.endswith(quote):
                                value = value[1:-1]
                        return value
    except OSError:
        pass
    return None


def normalize_sync_url(url: str) -> str:
    """Convert any PostgreSQL URL to psycopg v3 synchronous form."""
    if url.startswith("sqlite:"):
        return url  # SQLite pass-through
    for prefix, replacement in [
        ("postgresql+asyncpg://", "postgresql+psycopg://"),
        ("postgresql+psycopg2://", "postgresql+psycopg://"),
        ("postgres://", "postgresql+psycopg://"),
        ("postgresql://", "postgresql+psycopg://"),
    ]:
        if url.startswith(prefix):
            return url.replace(prefix, replacement, 1)
    return url


def mask_url(url: str) -> str:
    """Hide password in a database URL for safe display."""
    import re
    return re.sub(r"://([^:]+):([^@]+)@", "://\\1:***@", url)


def http_request(
    url: str,
    method: str = "GET",
    data: Optional[bytes] = None,
    headers: Optional[dict[str, str]] = None,
    timeout: int = 10,
) -> tuple[int, Any]:
    """Make an HTTP request and return (status_code, body_dict_or_str)."""
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(body)
            except json.JSONDecodeError:
                return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else ""
        try:
            return e.code, json.loads(body)
        except (json.JSONDecodeError, ValueError):
            return e.code, body
    except Exception as exc:
        return 0, str(exc)


def decode_jwt_payload(token: str) -> Optional[dict]:
    """Decode the payload of a JWT without verification (for inspection)."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload_b64 = parts[1]
        # Add base64url padding
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        return json.loads(payload_bytes)
    except Exception:
        return None


def decode_jwt_header(token: str) -> Optional[dict]:
    """Decode the header of a JWT without verification."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64 = parts[0]
        padding = 4 - len(header_b64) % 4
        if padding != 4:
            header_b64 += "=" * padding
        header_bytes = base64.urlsafe_b64decode(header_b64)
        return json.loads(header_bytes)
    except Exception:
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# CHECK IMPLEMENTATIONS
# ═══════════════════════════════════════════════════════════════════════════════

def check_backend(env_path: Path) -> str:
    """Step 1: Verify the FastAPI backend is reachable on /health/."""
    port = int(read_env_var(env_path, "BACKEND_PORT") or "8000")
    url = f"http://localhost:{port}/health/"
    status, body = http_request(url, timeout=5)

    if status == 200 and isinstance(body, dict):
        health_status = body.get("status", "?")
        version = body.get("version", "?")
        _ok(f"Backend is responding (HTTP 200, status={health_status}, v{version})")
        return "ok"
    elif status == 0:
        _fail(f"Cannot connect to backend on port {port}")
        _remediate(f"Start the backend: cd backend && uvicorn app.main:app --reload --port {port}")
        return "fail"
    else:
        detail = body.get("detail", str(body)) if isinstance(body, dict) else str(body)[:200]
        _fail(f"Backend returned HTTP {status}: {detail}")
        _remediate("Check uvicorn logs for errors.")
        return "fail"


def check_frontend() -> None:
    """Step 2: Check if the Vite/React frontend is reachable."""
    ports = [3000, 5173]
    for port in ports:
        status, _ = http_request(f"http://localhost:{port}/", timeout=3)
        if status == 200:
            _ok(f"Frontend is responding on port {port} (HTTP 200)")
            return

    _warn(f"Frontend not reachable on ports {ports}")
    _remediate("Start the frontend dev server: npm run dev (port 3000 or 5173)")
    _info("Note: Frontend is not strictly required for API login; continuing diagnostics.")


def check_database(env_path: Path) -> Optional[str]:
    """Step 3: Verify PostgreSQL database connectivity using SQLAlchemy."""
    database_url = read_env_var(env_path, "DATABASE_URL")
    if not database_url:
        _fail(f"DATABASE_URL not found in {env_path}")
        _remediate(f"Create {env_path} with DATABASE_URL=postgresql://user:pass@host:5432/dbname")
        return None

    _info(f"DATABASE_URL found: {mask_url(database_url)}")

    try:
        from sqlalchemy import create_engine, text

        sync_url = normalize_sync_url(database_url)
        engine = create_engine(sync_url, pool_pre_ping=True)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version()"))
            version_str = result.scalar()
            version_short = version_str.split(",")[0] if version_str else "PostgreSQL"
            _ok(f"Database connected ({version_short})")
        engine.dispose()
        return database_url

    except ImportError:
        # Fall back to psycopg (v3) directly
        try:
            import psycopg
            sync_url = normalize_sync_url(database_url)
            conn = psycopg.connect(sync_url, connect_timeout=5)
            with conn.cursor() as cur:
                cur.execute("SELECT version()")
                ver = cur.fetchone()[0].split(",")[0]
            conn.close()
            _ok(f"Database connected via psycopg ({ver})")
            return database_url
        except Exception as exc:
            _fail(f"Cannot connect to database: {exc}")
            _remediate("1. Ensure PostgreSQL is running: sudo systemctl status postgresql")
            _remediate("2. Verify credentials and host in DATABASE_URL")
            _remediate("3. Check pg_hba.conf allows connections from this host")
            return None
    except Exception as exc:
        _fail(f"Cannot connect to database: {exc}")
        _remediate("1. Ensure PostgreSQL is running: sudo systemctl status postgresql")
        _remediate("2. Verify credentials and host in DATABASE_URL")
        _remediate("3. Check pg_hba.conf allows connections from this host")
        return None


def check_tables(env_path: Path, database_url: Optional[str]) -> bool:
    """Step 4: Verify that required tables (users, user_roles, tenants) exist."""
    if not database_url:
        _fail("Skipped — no DATABASE_URL available")
        return False

    required_tables = ["users", "user_roles", "tenants"]

    try:
        from sqlalchemy import create_engine, text

        sync_url = normalize_sync_url(database_url)
        engine = create_engine(sync_url, pool_pre_ping=True)
        with engine.connect() as conn:
            all_exist = True
            for table in required_tables:
                result = conn.execute(
                    text(
                        "SELECT EXISTS("
                        "SELECT 1 FROM information_schema.tables "
                        "WHERE table_name = :t"
                        ")"
                    ),
                    {"t": table},
                )
                exists = result.scalar()
                if not exists:
                    _fail(f"Table '{table}' does not exist")
                    all_exist = False
                else:
                    count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
                    count = count_result.scalar()
                    _ok(f"Table '{table}' exists ({count} rows)")
            engine.dispose()
            if not all_exist:
                _remediate("Run Alembic migrations: cd backend && alembic upgrade head")
                _remediate("Or restart the backend (auto-migration on startup): uvicorn app.main:app --reload")
            return all_exist

    except Exception as exc:
        _fail(f"Could not check tables: {exc}")
        return False


def check_super_admin(env_path: Path, database_url: Optional[str]) -> Optional[dict]:
    """Step 5: Verify that a SUPER_ADMIN user exists."""
    if not database_url:
        _fail("Skipped — no DATABASE_URL available")
        return None

    try:
        from sqlalchemy import create_engine, text

        sync_url = normalize_sync_url(database_url)
        engine = create_engine(sync_url, pool_pre_ping=True)
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    """
                    SELECT u.id::text, u.email, u.username, u.is_active,
                           u.password_hash IS NOT NULL AS has_password,
                           u.tenant_id IS NULL AS is_platform_level,
                           LEFT(u.password_hash, 10) AS hash_prefix
                    FROM users u
                    JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'SUPER_ADMIN'
                    LIMIT 1
                    """
                )
            ).fetchone()

            if not row:
                _fail("No SUPER_ADMIN user found in database")
                _remediate("Create the super admin: cd backend && python -m scripts.create_admin")
                _info("Default credentials: admin@schoolflow.local / Admin@123456")
                engine.dispose()
                return None

            admin_id, email, username, is_active, has_password, is_platform, hash_prefix = row
            _ok(f"SUPER_ADMIN found: {email} (id={admin_id[:8]}...)")

            flags = []
            flags.append("active" if is_active else "INACTIVE")
            flags.append("has_password" if has_password else "NO_PASSWORD")
            flags.append("platform_level" if is_platform else "tenant_scoped")
            _info(f"Flags: {', '.join(flags)}")

            if hash_prefix:
                _info(f"Password hash prefix: {hash_prefix}...")

            if not is_active:
                _warn("Admin account is INACTIVE — login will be denied")
                _remediate(f"Activate: UPDATE users SET is_active = true WHERE email = '{email}';")

            if not has_password:
                _warn("Admin has no password_hash set — bcrypt verification will fail")
                _remediate("Reset the password using the create_admin script or an API reset endpoint")

            if not is_platform:
                _warn("SUPER_ADMIN is tenant-scoped (has a tenant_id) — may have restricted access")
                _info("Platform-level SUPER_ADMIN should have tenant_id=NULL")

            engine.dispose()
            return {
                "id": admin_id,
                "email": email,
                "username": username,
                "is_active": bool(is_active),
                "has_password": bool(has_password),
                "is_platform": bool(is_platform),
                "hash_prefix": hash_prefix,
            }

    except Exception as exc:
        _fail(f"Could not check admin user: {exc}")
        traceback.print_exc()
        return None


def check_bcrypt(env_path: Path, database_url: Optional[str], admin_info: Optional[dict]) -> None:
    """Step 5b: If admin exists, verify bcrypt hash can be checked."""
    if not admin_info or not database_url:
        return

    if not admin_info["has_password"]:
        _warn("Cannot verify bcrypt — no password_hash stored")
        return

    if not admin_info["hash_prefix"] or "$2" not in admin_info["hash_prefix"]:
        _warn(f"Password hash does not look like bcrypt (prefix: {admin_info['hash_prefix']})")
        _remediate("The hash should start with $2b$ or $2a$. Regenerate it.")
        return

    # Verify the known password against the stored hash
    test_password = "Admin@123456"

    try:
        from sqlalchemy import create_engine, text
        from passlib.context import CryptContext

        sync_url = normalize_sync_url(database_url)
        engine = create_engine(sync_url, pool_pre_ping=True)
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT password_hash FROM users WHERE email = :email"),
                {"email": admin_info["email"]},
            ).fetchone()

            if not row or not row[0]:
                _fail("Could not retrieve password_hash from database")
                engine.dispose()
                return

            stored_hash = row[0]
            match = pwd_context.verify(test_password, stored_hash)
            engine.dispose()

            if match:
                _ok(f"bcrypt verification passed for '{admin_info['email']}'")
            else:
                _fail(f"bcrypt verification FAILED for '{admin_info['email']}' — password mismatch")
                _remediate("The stored password hash does not match 'Admin@123456'")
                _remediate("Run: cd backend && python -m scripts.create_admin  (it will skip if already exists, so reset manually)")

    except ImportError:
        _warn("passlib not available — skipping bcrypt verification")
    except Exception as exc:
        _fail(f"bcrypt verification error: {exc}")


def check_login_api(env_path: Path) -> Optional[str]:
    """Step 6: Attempt to login via POST /api/v1/auth/login/."""
    global access_token

    port = int(read_env_var(env_path, "BACKEND_PORT") or "8000")
    login_url = f"http://localhost:{port}/api/v1/auth/login/"

    login_email = "admin@schoolflow.local"
    login_password = "Admin@123456"

    form_data = urllib.parse.urlencode({
        "username": login_email,
        "password": login_password,
    }).encode("utf-8")

    status, body = http_request(
        login_url,
        method="POST",
        data=form_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )

    if status == 200 and isinstance(body, dict):
        token = body.get("access_token", "")
        token_type = body.get("token_type", "?")
        expires_in = body.get("expires_in", "?")

        if token:
            _ok(f"Login successful (HTTP 200, token_type={token_type}, expires_in={expires_in}s)")
            _info(f"Access token (first 40 chars): {token[:40]}...")
            access_token = token
            return token
        else:
            _fail("Login returned 200 but no access_token in response")
            return None

    detail = ""
    if isinstance(body, dict):
        detail = body.get("detail", str(body))
    else:
        detail = str(body)[:200]

    _fail(f"Login returned HTTP {status}")
    _info(f"Detail: {detail}")

    if status == 401:
        _remediate("1. Verify the admin user exists and is active (Step 5)")
        _remediate("2. Check the password is correct: admin@schoolflow.local / Admin@123456")
        _remediate("3. Ensure password_hash is set (not NULL) for the admin user")
        _remediate("4. Check bcrypt hash is valid: the hash must start with $2b$")
    elif status == 403:
        _remediate("The user's tenant is inactive. Activate the tenant or remove tenant assignment.")
    elif status == 429:
        _remediate("Rate-limited (5 req/min on login). Wait 60 seconds and retry.")
    else:
        _remediate("Check backend logs for the full stack trace.")

    return None


def check_jwt_token() -> None:
    """Step 7: Decode and validate the JWT token."""
    if not access_token:
        _warn("Skipped — no access token available (login failed in Step 6)")
        return

    header = decode_jwt_header(access_token)
    payload = decode_jwt_payload(access_token)

    if not header or not payload:
        _fail("Cannot decode JWT — invalid format")
        _remediate("The token format is invalid. Check the SECRET_KEY configuration.")
        return

    alg = header.get("alg", "?")
    sub = payload.get("sub", "")
    email = payload.get("email", "")
    username = payload.get("preferred_username", "")
    roles = payload.get("roles", [])
    tenant_id = payload.get("tenant_id")
    exp = payload.get("exp", 0)

    now = int(time.time())
    is_expired = now > exp if exp else False
    time_left = max(0, exp - now) if exp else 0

    if is_expired:
        _warn(f"JWT token is expired (expired {now - exp}s ago)")
        _info(f"Subject: {sub}, Email: {email}, Roles: {roles}")
        _remediate("Obtain a fresh token by logging in again.")
        return

    _ok(f"JWT valid (alg={alg}, expires in {time_left}s)")
    _info(f"Subject: {sub}")
    _info(f"Email: {email}")
    _info(f"Username: {username}")
    _info(f"Roles: {', '.join(roles) if roles else '(none)'}")
    _info(f"Tenant ID: {tenant_id or '(none — platform level)'}")

    # Verify the token signature using the project's own SECRET_KEY
    try:
        from app.core.config import settings
        import jwt as jose_jwt

        decoded = jose_jwt.decode(
            access_token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_sub": True},
        )
        _ok("JWT signature verified with project SECRET_KEY")
    except ImportError:
        _info("PyJWT not available — skipping signature verification")
    except Exception as exc:
        _warn(f"JWT signature verification failed: {exc}")
        _remediate("The SECRET_KEY used to sign the token does not match the current SECRET_KEY.")
        _remediate("This can happen if SECRET_KEY is auto-generated on each startup (DEBUG mode without a configured key).")


def check_users_me() -> None:
    """Step 8: Call GET /api/v1/users/me/ with the token."""
    if not access_token:
        _warn("Skipped — no access token available (login failed in Step 6)")
        return

    port = 8000
    env_path = BACKEND_DIR.parent / ".env"
    if env_path.is_file():
        port = int(read_env_var(env_path, "BACKEND_PORT") or "8000")

    url = f"http://localhost:{port}/api/v1/users/me/"
    status, body = http_request(
        url,
        method="GET",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        timeout=10,
    )

    if status == 200 and isinstance(body, dict):
        user = body.get("user", {})
        roles = body.get("roles", [])
        tenant = body.get("tenant")
        profile = body.get("profile", {})

        _ok("/api/v1/users/me/ returned HTTP 200")
        _info(f"Email: {user.get('email', '?')}")
        _info(f"Name: {profile.get('first_name', '')} {profile.get('last_name', '')}".strip())
        _info(f"Roles: {', '.join(roles) if roles else '(none)'}")
        if tenant:
            _info(f"Tenant: {tenant.get('name', '?')} (slug={tenant.get('slug', '?')}, type={tenant.get('type', '?')})")
        else:
            _info("Tenant: (none — platform level)")
        return

    detail = ""
    if isinstance(body, dict):
        detail = body.get("detail", str(body))
    else:
        detail = str(body)[:200]

    _fail(f"/api/v1/users/me/ returned HTTP {status}")
    _info(f"Detail: {detail}")

    if status == 401:
        _remediate("Token validation failed. Check SECRET_KEY matches between token generation and validation.")
        _remediate("If SECRET_KEY was regenerated at startup, the old token is invalid. Login again.")
    elif status == 403:
        _remediate("Permission denied. The user may not have the required role for this endpoint.")
    else:
        _remediate("Check backend logs for the full stack trace.")


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(description="SchoolFlow Pro — Login Diagnostic Script")
    parser.add_argument(
        "--env",
        type=Path,
        default=None,
        help="Path to the .env file (default: auto-detected from project root)",
    )
    args = parser.parse_args()

    # Resolve .env path
    env_path = args.env or (BACKEND_DIR.parent / ".env")

    _header()

    # Step 1: Backend
    _step(1, "Backend Reachable")
    check_backend(env_path)

    # Step 2: Frontend
    _step(2, "Frontend Reachable")
    check_frontend()

    # Step 3: Database
    _step(3, "Database Reachable")
    database_url = check_database(env_path)

    # Step 4: Tables
    _step(4, "Required Tables Exist (users, user_roles, tenants)")
    tables_ok = check_tables(env_path, database_url)

    # Step 5: Super Admin
    _step(5, "Super Admin User Exists")
    admin_info = check_super_admin(env_path, database_url)

    # Step 5b: bcrypt verification
    if admin_info:
        print()
        print(f"{Color.BOLD}━━━ Step 5b: bcrypt Password Verification ━━━${Color.NC}")
        check_bcrypt(env_path, database_url, admin_info)

    # Step 6: Login API
    _step(6, "Login API Works (POST /api/v1/auth/login/)")
    check_login_api(env_path)

    # Step 7: JWT Token
    _step(7, "JWT Token Valid (Decode & Verify)")
    check_jwt_token()

    # Step 8: /users/me/
    _step(8, "Protected Endpoint Works (GET /api/v1/users/me/)")
    check_users_me()

    _summary()


if __name__ == "__main__":
    main()
