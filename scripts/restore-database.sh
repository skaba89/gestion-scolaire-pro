#!/usr/bin/env bash

# Verify a SchoolFlow PostgreSQL backup or restore it after explicit confirmation.

set -Eeuo pipefail
umask 077

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-}"
DB_PASSWORD="${DB_PASSWORD:-${PGPASSWORD:-}}"
DB_PASSWORD_FILE="${DB_PASSWORD_FILE:-}"
DB_NAME="${DB_NAME:-}"
ALLOW_IN_PLACE_RESTORE="${ALLOW_IN_PLACE_RESTORE:-false}"

BACKUP_FILE=""
TARGET_DB_NAME=""
CONFIRM_DB_NAME=""
EXECUTE=false

usage() {
    cat <<'EOF'
Usage:
  restore-database.sh --backup FILE                         # verify only
  restore-database.sh --backup FILE --target-db DB --execute --confirm DB

The execute mode restores into an existing database with --clean and a single
transaction. Restoring into DB_NAME is refused unless ALLOW_IN_PLACE_RESTORE=true.
EOF
}

log() {
    printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
    printf 'ERROR: %s\n' "$1" >&2
    exit 1
}

while (($#)); do
    case "$1" in
        --backup)
            (($# >= 2)) || fail "--backup requires a file"
            BACKUP_FILE="$2"
            shift 2
            ;;
        --target-db)
            (($# >= 2)) || fail "--target-db requires a database name"
            TARGET_DB_NAME="$2"
            shift 2
            ;;
        --confirm)
            (($# >= 2)) || fail "--confirm requires the exact target database name"
            CONFIRM_DB_NAME="$2"
            shift 2
            ;;
        --execute)
            EXECUTE=true
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            fail "Unknown argument: $1"
            ;;
    esac
done

[[ -n "$BACKUP_FILE" ]] || fail "--backup is required"
[[ -f "$BACKUP_FILE" ]] || fail "Backup file does not exist: $BACKUP_FILE"
[[ -f "${BACKUP_FILE}.sha256" ]] || fail "Checksum sidecar is missing: ${BACKUP_FILE}.sha256"
command -v pg_restore >/dev/null 2>&1 || fail "Required command is missing: pg_restore"
command -v sha256sum >/dev/null 2>&1 || fail "Required command is missing: sha256sum"

if [[ -n "$DB_PASSWORD_FILE" ]]; then
    [[ -r "$DB_PASSWORD_FILE" ]] || fail "DB_PASSWORD_FILE is not readable"
    IFS= read -r DB_PASSWORD < "$DB_PASSWORD_FILE"
fi
if [[ -n "$DB_PASSWORD" ]]; then
    export PGPASSWORD="$DB_PASSWORD"
fi
trap 'unset PGPASSWORD' EXIT INT TERM
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"

expected_digest="$(awk 'NR == 1 {print $1}' "${BACKUP_FILE}.sha256")"
actual_digest="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
[[ "$expected_digest" =~ ^[[:xdigit:]]{64}$ ]] || fail "Checksum sidecar is malformed"
[[ "$actual_digest" == "$expected_digest" ]] || fail "Backup checksum does not match"
pg_restore --list "$BACKUP_FILE" >/dev/null || fail "PostgreSQL archive is unreadable"
log "Backup verification succeeded (sha256=${actual_digest})"

if [[ "$EXECUTE" != true ]]; then
    log "Verification-only mode: no database was modified"
    exit 0
fi

[[ -n "$TARGET_DB_NAME" ]] || fail "--target-db is required with --execute"
[[ -n "$DB_USER" ]] || fail "DB_USER is required with --execute"
[[ "$CONFIRM_DB_NAME" == "$TARGET_DB_NAME" ]] || \
    fail "--confirm must exactly match --target-db"
if [[ -n "$DB_NAME" && "$TARGET_DB_NAME" == "$DB_NAME" && "$ALLOW_IN_PLACE_RESTORE" != true ]]; then
    fail "In-place restore is blocked; use a drill database or explicitly set ALLOW_IN_PLACE_RESTORE=true"
fi

log "Restoring archive into database ${TARGET_DB_NAME}"
pg_restore \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$TARGET_DB_NAME" \
    --clean \
    --if-exists \
    --exit-on-error \
    --single-transaction \
    --no-owner \
    --no-acl \
    "$BACKUP_FILE"
log "Restore completed successfully for database ${TARGET_DB_NAME}"
