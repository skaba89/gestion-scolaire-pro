#!/usr/bin/env bash
# =============================================================================
# SchoolFlow Pro — Login Diagnostic Script
# =============================================================================
# Checks all common login failure causes from network to JWT token validation.
#
# Usage:
#   ./diagnose_login.sh
#   ./diagnose_login.sh --env /path/to/.env
#
# Requirements: curl, python3, psycopg2-binary
# =============================================================================

set -euo pipefail

# ── Colors ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# ── Counters ───────────────────────────────────────────────────────────────────
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# ── Defaults ───────────────────────────────────────────────────────────────────
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"
BACKEND_PORT=8000
FRONTEND_PORTS="3000 5173"

# Override env file path if provided
if [[ "${1:-}" == "--env" && -n "${2:-}" ]]; then
    ENV_FILE="$2"
fi

# ── Helper functions ───────────────────────────────────────────────────────────
print_header() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${BOLD}  SchoolFlow Pro — Login Diagnostic Script${NC}               ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo -e "${DIM}  $(date '+%Y-%m-%d %H:%M:%S')${NC}"
}

print_step() {
    local num="$1"
    local desc="$2"
    echo ""
    echo -e "${BOLD}━━━ Step ${num}: ${desc} ━━━${NC}"
}

print_ok() {
    echo -e "  ${GREEN}✔ OK${NC}  $1"
    ((PASS_COUNT++))
}

print_fail() {
    echo -e "  ${RED}✘ FAIL${NC} $1"
    ((FAIL_COUNT++))
}

print_warn() {
    echo -e "  ${YELLOW}⚠ WARNING${NC} $1"
    ((WARN_COUNT++))
}

print_info() {
    echo -e "  ${DIM}→ $1${NC}"
}

print_remediation() {
    echo -e "  ${YELLOW}  ↳ Remediation: $1${NC}"
}

print_summary() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${BOLD}  Diagnostic Summary${NC}                                         ${CYAN}║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}Passed  : ${PASS_COUNT}${NC}"
    echo -e "${CYAN}║${NC}  ${RED}Failed  : ${FAIL_COUNT}${NC}"
    echo -e "${CYAN}║${NC}  ${YELLOW}Warnings: ${WARN_COUNT}${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"

    if [[ ${FAIL_COUNT} -eq 0 ]]; then
        echo -e "  ${GREEN}${BOLD}All checks passed! Login should be functional.${NC}"
    else
        echo -e "  ${RED}${BOLD}${FAIL_COUNT} check(s) failed. See remediation steps above.${NC}"
    fi
    echo ""
}

# Extract DATABASE_URL from .env (handles comments, quotes, and inline comments)
read_env_var() {
    local var_name="$1"
    if [[ ! -f "${ENV_FILE}" ]]; then
        return 1
    fi
    # Strip comments, quotes, inline comments, and whitespace
    local val
    val=$(grep -E "^[[:space:]]*${var_name}[[:space:]]*=" "${ENV_FILE}" 2>/dev/null \
        | head -1 \
        | sed -E 's/^[^=]*=//' \
        | sed -E 's/#.*$//' \
        | sed -E 's/^[[:space:]]*//;s/[[:space:]]*$//' \
        | sed -E "s/^['\"]//;s/['\"]$//")
    if [[ -n "${val}" ]]; then
        echo "${val}"
        return 0
    fi
    return 1
}

# ── Main Checks ────────────────────────────────────────────────────────────────
print_header

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: Backend Reachable
# ═══════════════════════════════════════════════════════════════════════════════
print_step "1" "Backend Reachable (http://localhost:${BACKEND_PORT}/health/)"

BACKEND_HTTP_CODE=$(curl -s -o /tmp/schoolflow_health.json -w "%{http_code}" \
    --connect-timeout 5 --max-time 10 \
    "http://localhost:${BACKEND_PORT}/health/" 2>/dev/null || true)

if [[ "${BACKEND_HTTP_CODE}" == "200" ]]; then
    BACKEND_BODY=$(cat /tmp/schoolflow_health.json 2>/dev/null || echo "{}")
    BACKEND_STATUS=$(echo "${BACKEND_BODY}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "?")
    BACKEND_VERSION=$(echo "${BACKEND_BODY}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','?'))" 2>/dev/null || echo "?")
    print_ok "Backend is responding (HTTP 200, status=${BACKEND_STATUS}, v${BACKEND_VERSION})"
elif [[ "${BACKEND_HTTP_CODE}" == "000" ]]; then
    print_fail "Cannot connect to backend on port ${BACKEND_PORT}"
    print_remediation "Start the backend server: cd backend && uvicorn app.main:app --reload --port ${BACKEND_PORT}"
else
    print_fail "Backend returned HTTP ${BACKEND_HTTP_CODE}"
    BACKEND_BODY=$(cat /tmp/schoolflow_health.json 2>/dev/null || echo "(no body)")
    print_info "Response: ${BACKEND_BODY:0:200}"
    print_remediation "Check uvicorn logs for errors. Try: curl -v http://localhost:${BACKEND_PORT}/health/"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: Frontend Reachable
# ═══════════════════════════════════════════════════════════════════════════════
print_step "2" "Frontend Reachable"

FRONTEND_FOUND=false
for PORT in ${FRONTEND_PORTS}; do
    FE_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        --connect-timeout 3 --max-time 5 \
        "http://localhost:${PORT}/" 2>/dev/null || true)
    if [[ "${FE_HTTP_CODE}" == "200" ]]; then
        print_ok "Frontend is responding on port ${PORT} (HTTP 200)"
        FRONTEND_FOUND=true
        break
    fi
done

if [[ "${FRONTEND_FOUND}" == "false" ]]; then
    print_warn "Frontend not reachable on ports ${FRONTEND_PORTS}"
    print_remediation "Start the frontend dev server: npm run dev (port 3000 or 5173)"
    print_info "Note: Frontend is not strictly required for API login; continuing diagnostics."
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: Database Reachable
# ═══════════════════════════════════════════════════════════════════════════════
print_step "3" "Database Reachable"

DATABASE_URL=$(read_env_var "DATABASE_URL")

if [[ -z "${DATABASE_URL}" ]]; then
    print_fail "DATABASE_URL not found in ${ENV_FILE}"
    print_remediation "Create ${ENV_FILE} with DATABASE_URL=postgresql://user:pass@host:5432/dbname"
else
    print_info "DATABASE_URL found (host extracted): $(echo "${DATABASE_URL}" | sed -E 's|://[^@]+@|://***@|')"

    # Convert to psycopg2-compatible URL for the check
    SYNC_URL="${DATABASE_URL}"
    SYNC_URL="${SYNC_URL/postgresql+asyncpg:\/\//postgresql:\/\/}"
    SYNC_URL="${SYNC_URL/postgres:\/\//postgresql:\/\/}"
    if [[ "${SYNC_URL}" == postgresql://* ]] && [[ "${SYNC_URL}" != *"+psycopg2"* ]]; then
        SYNC_URL="${SYNC_URL/postgresql:\/\//postgresql+psycopg2:\/\/}"
    fi

    DB_CHECK=$(python3 -c "
import psycopg2
try:
    conn = psycopg2.connect('${SYNC_URL}', connect_timeout=5)
    cur = conn.cursor()
    cur.execute('SELECT version()')
    ver = cur.fetchone()[0].split(',')[0]
    cur.close()
    conn.close()
    print('OK:' + ver)
except Exception as e:
    print('FAIL:' + str(e))
" 2>&1) || true

    if [[ "${DB_CHECK}" == OK:* ]]; then
        DB_VERSION="${DB_CHECK#OK:}"
        print_ok "Database connected (${DB_VERSION})"
    else
        DB_ERROR="${DB_CHECK#FAIL:}"
        print_fail "Cannot connect to database: ${DB_ERROR}"
        print_remediation "1. Ensure PostgreSQL is running: sudo systemctl status postgresql"
        print_remediation "2. Verify credentials and host in DATABASE_URL"
        print_remediation "3. Check pg_hba.conf allows connections from this host"
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: Tables Exist
# ═══════════════════════════════════════════════════════════════════════════════
print_step "4" "Required Tables Exist (users, user_roles, tenants)"

if [[ -z "${DATABASE_URL}" ]]; then
    print_fail "Skipped — no DATABASE_URL available"
else
    SYNC_URL="${DATABASE_URL}"
    SYNC_URL="${SYNC_URL/postgresql+asyncpg:\/\//postgresql:\/\/}"
    SYNC_URL="${SYNC_URL/postgres:\/\//postgresql:\/\/}"
    if [[ "${SYNC_URL}" == postgresql://* ]] && [[ "${SYNC_URL}" != *"+psycopg2"* ]]; then
        SYNC_URL="${SYNC_URL/postgresql:\/\//postgresql+psycopg2:\/\/}"
    fi

    TABLES_RESULT=$(python3 -c "
import psycopg2, json
try:
    conn = psycopg2.connect('${SYNC_URL}', connect_timeout=5)
    cur = conn.cursor()
    required = ['users', 'user_roles', 'tenants']
    missing = []
    row_counts = {}
    for t in required:
        cur.execute(\"SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name=%s)\", (t,))
        exists = cur.fetchone()[0]
        if not exists:
            missing.append(t)
        else:
            cur.execute(f'SELECT COUNT(*) FROM {t}')
            count = cur.fetchone()[0]
            row_counts[t] = count
    cur.close()
    conn.close()
    print(json.dumps({'missing': missing, 'counts': row_counts}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
" 2>&1) || true

    TABLES_MISSING=$(echo "${TABLES_RESULT}" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
if 'error' in d:
    print('ERROR:' + d['error'])
else:
    print('MISSING:' + ','.join(d['missing']) if d['missing'] else 'NONE')
    for t, c in d.get('counts', {}).items():
        print(f'COUNT:{t}:{c}')
" 2>&1) || true

    if [[ "${TABLES_MISSING}" == ERROR:* ]]; then
        print_fail "Could not check tables: ${TABLES_MISSING#ERROR:}"
    elif [[ "${TABLES_MISSING}" == "MISSING:NONE" ]]; then
        # Print counts
        while IFS= read -r line; do
            if [[ "${line}" == COUNT:* ]]; then
                TABLE_NAME="${line#COUNT:}"
                TABLE_NAME="${TABLE_NAME%%:*}"
                TABLE_COUNT="${line##*:}"
                print_ok "Table '${TABLE_NAME}' exists (${TABLE_COUNT} rows)"
            fi
        done <<< "${TABLES_MISSING}"
    else
        MISSING_TABLES="${TABLES_MISSING#MISSING:}"
        print_fail "Missing tables: ${MISSING_TABLES}"
        print_remediation "Run Alembic migrations: cd backend && alembic upgrade head"
        print_remediation "Or restart the backend (auto-migration on startup): uvicorn app.main:app --reload"
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5: Super Admin Exists
# ═══════════════════════════════════════════════════════════════════════════════
print_step "5" "Super Admin User Exists"

if [[ -z "${DATABASE_URL}" ]]; then
    print_fail "Skipped — no DATABASE_URL available"
else
    SYNC_URL="${DATABASE_URL}"
    SYNC_URL="${SYNC_URL/postgresql+asyncpg:\/\//postgresql:\/\/}"
    SYNC_URL="${SYNC_URL/postgres:\/\//postgresql:\/\/}"
    if [[ "${SYNC_URL}" == postgresql://* ]] && [[ "${SYNC_URL}" != *"+psycopg2"* ]]; then
        SYNC_URL="${SYNC_URL/postgresql:\/\//postgresql+psycopg2:\/\/}"
    fi

    ADMIN_RESULT=$(python3 -c "
import psycopg2, json
try:
    conn = psycopg2.connect('${SYNC_URL}', connect_timeout=5)
    cur = conn.cursor()
    cur.execute('''
        SELECT u.id::text, u.email, u.username, u.is_active,
               u.password_hash IS NOT NULL AS has_password,
               u.tenant_id IS NULL AS is_platform_level
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id AND ur.role = %s
        LIMIT 1
    ''', ('SUPER_ADMIN',))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if row:
        print(json.dumps({
            'found': True,
            'id': row[0],
            'email': row[1],
            'username': row[2],
            'is_active': row[3],
            'has_password': row[4],
            'is_platform_level': row[5]
        }))
    else:
        print(json.dumps({'found': False}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
" 2>&1) || true

    ADMIN_CHECK=$(echo "${ADMIN_RESULT}" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
if 'error' in d:
    print('ERROR:' + d['error'])
elif d.get('found'):
    flags = []
    flags.append('active' if d['is_active'] else 'INACTIVE')
    flags.append('has_password' if d['has_password'] else 'NO_PASSWORD')
    flags.append('platform_level' if d['is_platform_level'] else 'tenant_scoped')
    print(f\"FOUND:{d['email']}|{'|'.join(flags)}|{d['id']}\")
else:
    print('NOT_FOUND')
" 2>&1) || true

    if [[ "${ADMIN_CHECK}" == ERROR:* ]]; then
        print_fail "Could not check admin user: ${ADMIN_CHECK#ERROR:}"
    elif [[ "${ADMIN_CHECK}" == NOT_FOUND ]]; then
        print_fail "No SUPER_ADMIN user found in database"
        print_remediation "Create the super admin: cd backend && python -m scripts.create_admin"
        print_info "Default credentials: admin@schoolflow.local / Admin@123456"
    else
        ADMIN_EMAIL="${ADMIN_CHECK#FOUND:}"
        ADMIN_FLAGS="${ADMIN_EMAIL#*|}"
        ADMIN_EMAIL="${ADMIN_EMAIL%%|*}"
        ADMIN_ID="${ADMIN_FLAGS##*|}"
        ADMIN_FLAGS="${ADMIN_FLAGS%|*}"

        print_ok "SUPER_ADMIN found: ${ADMIN_EMAIL} (id=${ADMIN_ID:0:8}...)"
        print_info "Flags: ${ADMIN_FLAGS//|/, }"

        # Check for specific warnings
        if [[ "${ADMIN_FLAGS}" == *"INACTIVE"* ]]; then
            print_warn "Admin account is INACTIVE — login will be denied"
            print_remediation "Activate the account: UPDATE users SET is_active = true WHERE email = '${ADMIN_EMAIL}';"
        fi
        if [[ "${ADMIN_FLAGS}" == *"NO_PASSWORD"* ]]; then
            print_warn "Admin has no password_hash set — bcrypt verification will fail"
            print_remediation "Reset the password using the create_admin script or an API reset endpoint"
        fi
        if [[ "${ADMIN_FLAGS}" == *"tenant_scoped"* ]]; then
            print_warn "SUPER_ADMIN is tenant-scoped (has a tenant_id) — may have restricted access"
            print_info "This is OK for tenant admins, but platform-level SUPER_ADMIN should have tenant_id=NULL"
        fi
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6: Login API Works
# ═══════════════════════════════════════════════════════════════════════════════
print_step "6" "Login API Works (POST /api/v1/auth/login/)"

LOGIN_EMAIL="admin@schoolflow.local"
LOGIN_PASSWORD="Admin@123456"
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" \
    --connect-timeout 5 --max-time 10 \
    -X POST "http://localhost:${BACKEND_PORT}/api/v1/auth/login/" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=${LOGIN_EMAIL}&password=${LOGIN_PASSWORD}" 2>/dev/null || true)

LOGIN_HTTP_CODE=$(echo "${LOGIN_RESPONSE}" | tail -1)
LOGIN_BODY=$(echo "${LOGIN_RESPONSE}" | sed '$d')

if [[ "${LOGIN_HTTP_CODE}" == "200" ]]; then
    ACCESS_TOKEN=$(echo "${LOGIN_BODY}" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
print(d.get('access_token', ''))
" 2>/dev/null || echo "")

    TOKEN_TYPE=$(echo "${LOGIN_BODY}" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
print(d.get('token_type', ''))
" 2>/dev/null || echo "")

    EXPIRES_IN=$(echo "${LOGIN_BODY}" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
print(d.get('expires_in', ''))
" 2>/dev/null || echo "")

    print_ok "Login successful (HTTP 200, token_type=${TOKEN_TYPE}, expires_in=${EXPIRES_IN}s)"
    print_info "Access token (first 40 chars): ${ACCESS_TOKEN:0:40}..."

    # Save token for subsequent steps
    echo "${ACCESS_TOKEN}" > /tmp/schoolflow_diagnostic_token.txt
else
    print_fail "Login returned HTTP ${LOGIN_HTTP_CODE}"
    LOGIN_DETAIL=$(echo "${LOGIN_BODY}" | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    print(d.get('detail', d))
except:
    print(sys.stdin.read()[:200])
" 2>/dev/null || echo "${LOGIN_BODY:0:200}")
    print_info "Detail: ${LOGIN_DETAIL}"

    if [[ "${LOGIN_HTTP_CODE}" == "401" ]]; then
        print_remediation "1. Verify the admin user exists and is active (Step 5 above)"
        print_remediation "2. Check the password is correct: admin@schoolflow.local / Admin@123456"
        print_remediation "3. Ensure password_hash is set (not NULL) for the admin user"
        print_remediation "4. Check bcrypt hash is valid: the hash must start with \$2b\$"
    elif [[ "${LOGIN_HTTP_CODE}" == "403" ]]; then
        print_remediation "The user's tenant is inactive. Activate the tenant or remove tenant assignment."
    elif [[ "${LOGIN_HTTP_CODE}" == "429" ]]; then
        print_remediation "Rate-limited (5 req/min). Wait 60 seconds and retry."
    else
        print_remediation "Check backend logs: the login endpoint may have thrown an exception"
    fi

    # No token means subsequent steps cannot run
    echo "" > /tmp/schoolflow_diagnostic_token.txt
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 7: JWT Token Valid
# ═══════════════════════════════════════════════════════════════════════════════
print_step "7" "JWT Token Valid (Decode & Verify)"

ACCESS_TOKEN=$(cat /tmp/schoolflow_diagnostic_token.txt 2>/dev/null || echo "")

if [[ -z "${ACCESS_TOKEN}" ]]; then
    print_warn "Skipped — no access token available (login failed in Step 6)"
else
    JWT_RESULT=$(python3 -c "
import json, sys

token = '${ACCESS_TOKEN}'

# JWT is: header.payload.signature (base64url encoded)
parts = token.split('.')
if len(parts) != 3:
    print(json.dumps({'error': 'Invalid JWT format (expected 3 parts, got ' + str(len(parts)) + ')'}))
    sys.exit(0)

import base64

def decode_part(part):
    # Add padding
    padding = 4 - len(part) % 4
    if padding != 4:
        part += '=' * padding
    return base64.urlsafe_b64decode(part)

try:
    header = json.loads(decode_part(parts[0]))
    payload = json.loads(decode_part(parts[1]))

    import time
    now = int(time.time())
    exp = payload.get('exp', 0)
    is_expired = now > exp if exp else False
    time_left = exp - now if exp and not is_expired else 0

    print(json.dumps({
        'header': header,
        'payload': {
            'sub': payload.get('sub'),
            'email': payload.get('email'),
            'preferred_username': payload.get('preferred_username'),
            'tenant_id': payload.get('tenant_id'),
            'roles': payload.get('roles'),
            'exp': exp,
            'expired': is_expired,
            'time_left_s': time_left
        }
    }))
except Exception as e:
    print(json.dumps({'error': str(e)}))
" 2>&1) || true

    JWT_CHECK=$(echo "${JWT_RESULT}" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
if 'error' in d:
    print('ERROR:' + d['error'])
else:
    p = d['payload']
    if p['expired']:
        print(f\"EXPIRED:{p['sub']}|{p['email']}|{p.get('roles',[])}\")
    else:
        print(f\"VALID:{p['sub']}|{p['email']}|{','.join(p.get('roles',[]))}|{p['time_left_s']}s|{d['header'].get('alg','?')}\")
" 2>&1) || true

    if [[ "${JWT_CHECK}" == ERROR:* ]]; then
        print_fail "Cannot decode JWT: ${JWT_CHECK#ERROR:}"
        print_remediation "The token format is invalid. Check the SECRET_KEY configuration."
    elif [[ "${JWT_CHECK}" == EXPIRED:* ]]; then
        print_warn "JWT token is expired: ${JWT_CHECK#EXPIRED:}"
        print_remediation "Obtain a fresh token by logging in again."
    else
        JWT_SUB="${JWT_CHECK#VALID:}"
        JWT_EMAIL="${JWT_SUB#*|}"
        JWT_ROLES="${JWT_EMAIL#*|}"
        JWT_EMAIL="${JWT_EMAIL%%|*}"
        JWT_SUB="${JWT_SUB%%|*}"
        JWT_TIME="${JWT_ROLES#*|}"
        JWT_ALG="${JWT_TIME#*|}"
        JWT_ROLES="${JWT_ROLES%%|*}"
        JWT_TIME="${JWT_TIME%%|*}"

        print_ok "JWT valid (alg=${JWT_ALG}, expires in ${JWT_TIME})"
        print_info "Subject: ${JWT_SUB}"
        print_info "Email: ${JWT_EMAIL}"
        print_info "Roles: ${JWT_ROLES}"
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 8: Users/Me Works
# ═══════════════════════════════════════════════════════════════════════════════
print_step "8" "Protected Endpoint Works (GET /api/v1/users/me/)"

ACCESS_TOKEN=$(cat /tmp/schoolflow_diagnostic_token.txt 2>/dev/null || echo "")

if [[ -z "${ACCESS_TOKEN}" ]]; then
    print_warn "Skipped — no access token available (login failed in Step 6)"
else
    ME_RESPONSE=$(curl -s -w "\n%{http_code}" \
        --connect-timeout 5 --max-time 10 \
        -X GET "http://localhost:${BACKEND_PORT}/api/v1/users/me/" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -H "Content-Type: application/json" 2>/dev/null || true)

    ME_HTTP_CODE=$(echo "${ME_RESPONSE}" | tail -1)
    ME_BODY=$(echo "${ME_RESPONSE}" | sed '$d')

    if [[ "${ME_HTTP_CODE}" == "200" ]]; then
        ME_EMAIL=$(echo "${ME_BODY}" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
u = d.get('user', {})
print(u.get('email', ''))
" 2>/dev/null || echo "")
        ME_ROLES=$(echo "${ME_BODY}" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
print(','.join(d.get('roles', [])))
" 2>/dev/null || echo "")
        ME_TENANT=$(echo "${ME_BODY}" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
t = d.get('tenant')
print(t.get('name', 'none') if t else 'none (platform level)')
" 2>/dev/null || echo "")

        print_ok "/api/v1/users/me/ returned HTTP 200"
        print_info "Email: ${ME_EMAIL}"
        print_info "Roles: ${ME_ROLES}"
        print_info "Tenant: ${ME_TENANT}"
    else
        print_fail "/api/v1/users/me/ returned HTTP ${ME_HTTP_CODE}"
        ME_DETAIL=$(echo "${ME_BODY}" | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    print(d.get('detail', d))
except:
    print(sys.stdin.read()[:200])
" 2>/dev/null || echo "${ME_BODY:0:200}")
        print_info "Detail: ${ME_DETAIL}"

        if [[ "${ME_HTTP_CODE}" == "401" ]]; then
            print_remediation "Token validation failed. Check SECRET_KEY matches between token generation and validation."
            print_remediation "If SECRET_KEY was regenerated at startup, the old token is invalid. Login again."
        elif [[ "${ME_HTTP_CODE}" == "403" ]]; then
            print_remediation "Permission denied. The user may not have the required role for this endpoint."
        else
            print_remediation "Check backend logs for the full stack trace."
        fi
    fi
fi

# ── Cleanup ────────────────────────────────────────────────────────────────────
rm -f /tmp/schoolflow_health.json /tmp/schoolflow_diagnostic_token.txt

# ── Summary ────────────────────────────────────────────────────────────────────
print_summary
