#!/usr/bin/env bash

# Reliable PostgreSQL backups for SchoolFlow Pro.
# Produces an atomic custom-format archive plus a SHA-256 sidecar.

set -Eeuo pipefail
umask 077

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-}"
DB_USER="${DB_USER:-}"
DB_PASSWORD="${DB_PASSWORD:-${PGPASSWORD:-}}"
DB_PASSWORD_FILE="${DB_PASSWORD_FILE:-}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/schoolflow}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
MIN_FREE_SPACE_MB="${MIN_FREE_SPACE_MB:-5120}"
ALERT_EMAIL="${ALERT_EMAIL:-}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
BACKUP_S3_URI="${BACKUP_S3_URI:-}"
S3_SSE="${S3_SSE:-AES256}"
S3_KMS_KEY_ID="${S3_KMS_KEY_ID:-}"

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
BACKUP_FILE="schoolflow_backup_${TIMESTAMP}.dump"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"
CHECKSUM_PATH="${BACKUP_PATH}.sha256"
TEMP_PATH="${BACKUP_DIR}/.${BACKUP_FILE}.partial.$$"
TEMP_CHECKSUM_PATH="${TEMP_PATH}.sha256"
BACKUP_PUBLISHED=false
BACKUP_PATH_CREATED=false

log() {
    printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

send_alert() {
    local subject="$1"
    local message="$2"
    local payload escaped

    log "ALERT: ${subject} - ${message}"
    if [[ -n "$ALERT_EMAIL" ]] && command -v mail >/dev/null 2>&1; then
        printf '%s\n' "$message" | mail -s "$subject" "$ALERT_EMAIL" || true
    fi
    if [[ -n "$ALERT_WEBHOOK" ]] && command -v curl >/dev/null 2>&1; then
        escaped="${subject}: ${message}"
        escaped="${escaped//\\/\\\\}"
        escaped="${escaped//\"/\\\"}"
        payload="{\"text\":\"${escaped}\"}"
        curl --fail --silent --show-error --max-time 10 \
            -H 'Content-Type: application/json' \
            --data "$payload" "$ALERT_WEBHOOK" >/dev/null || true
    fi
}

fail() {
    send_alert "SchoolFlow backup failed" "$1"
    return 1
}

cleanup() {
    rm -f -- "$TEMP_PATH" "$TEMP_CHECKSUM_PATH"
    if [[ "$BACKUP_PATH_CREATED" == true && "$BACKUP_PUBLISHED" != true ]]; then
        rm -f -- "$BACKUP_PATH" "$CHECKSUM_PATH"
    fi
    unset PGPASSWORD
}
trap cleanup EXIT INT TERM

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "Required command is missing: $1"
}

require_non_negative_integer() {
    local name="$1"
    local value="$2"
    [[ "$value" =~ ^[0-9]+$ ]] || fail "${name} must be a non-negative integer"
}

load_credentials() {
    [[ -n "$DB_NAME" ]] || fail "DB_NAME is required"
    [[ -n "$DB_USER" ]] || fail "DB_USER is required"

    if [[ -n "$DB_PASSWORD_FILE" ]]; then
        [[ -r "$DB_PASSWORD_FILE" ]] || fail "DB_PASSWORD_FILE is not readable"
        IFS= read -r DB_PASSWORD < "$DB_PASSWORD_FILE"
    fi
    if [[ -n "$DB_PASSWORD" ]]; then
        export PGPASSWORD="$DB_PASSWORD"
    fi
    export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"
}

preflight() {
    require_command pg_dump
    require_command pg_restore
    require_command sha256sum
    require_command df
    require_command find
    require_command flock
    if [[ -n "$BACKUP_S3_URI" ]]; then
        require_command aws
    fi
    require_non_negative_integer RETENTION_DAYS "$RETENTION_DAYS"
    require_non_negative_integer MIN_FREE_SPACE_MB "$MIN_FREE_SPACE_MB"
    load_credentials

    mkdir -p -- "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"

    exec 9>"${BACKUP_DIR}/.backup.lock"
    flock -n 9 || fail "Another backup process already holds ${BACKUP_DIR}/.backup.lock"
    [[ ! -e "$BACKUP_PATH" && ! -e "$CHECKSUM_PATH" ]] || \
        fail "Backup target already exists: ${BACKUP_PATH}"
}

check_disk_space() {
    local available_kb required_kb
    available_kb="$(df -Pk "$BACKUP_DIR" | awk 'NR == 2 {print $4}')"
    [[ "$available_kb" =~ ^[0-9]+$ ]] || fail "Unable to determine available disk space"
    required_kb=$((MIN_FREE_SPACE_MB * 1024))
    if (( available_kb < required_kb )); then
        fail "Insufficient disk space: $((available_kb / 1024)) MB available, ${MIN_FREE_SPACE_MB} MB required"
    fi
}

perform_backup() {
    local digest size
    local connection=(--host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME")

    log "Creating PostgreSQL custom archive ${BACKUP_FILE}"
    if ! pg_dump "${connection[@]}" \
        --format=custom \
        --compress=6 \
        --no-owner \
        --no-acl \
        --file="$TEMP_PATH"; then
        fail "pg_dump failed for database ${DB_NAME}"
    fi
    [[ -s "$TEMP_PATH" ]] || fail "pg_dump produced an empty archive"

    if ! pg_restore --list "$TEMP_PATH" >/dev/null; then
        fail "pg_restore could not read the generated archive"
    fi

    digest="$(sha256sum "$TEMP_PATH" | awk '{print $1}')"
    [[ "$digest" =~ ^[[:xdigit:]]{64}$ ]] || fail "Unable to calculate archive checksum"
    printf '%s  %s\n' "$digest" "$BACKUP_FILE" > "$TEMP_CHECKSUM_PATH"
    chmod 600 "$TEMP_PATH" "$TEMP_CHECKSUM_PATH"

    mv -- "$TEMP_PATH" "$BACKUP_PATH"
    BACKUP_PATH_CREATED=true
    mv -- "$TEMP_CHECKSUM_PATH" "$CHECKSUM_PATH"

    local actual_digest
    actual_digest="$(sha256sum "$BACKUP_PATH" | awk '{print $1}')"
    [[ "$actual_digest" == "$digest" ]] || fail "Published archive checksum verification failed"
    BACKUP_PUBLISHED=true

    size="$(du -h "$BACKUP_PATH" | awk '{print $1}')"
    log "Backup verified: ${BACKUP_PATH} (${size}, sha256=${digest})"
}

upload_offsite() {
    [[ -n "$BACKUP_S3_URI" ]] || return 0

    local destination="${BACKUP_S3_URI%/}"
    local s3_args=(--only-show-errors)
    if [[ -n "$S3_SSE" ]]; then
        s3_args+=(--sse "$S3_SSE")
    fi
    if [[ "$S3_SSE" == "aws:kms" ]]; then
        [[ -n "$S3_KMS_KEY_ID" ]] || fail "S3_KMS_KEY_ID is required when S3_SSE=aws:kms"
        s3_args+=(--sse-kms-key-id "$S3_KMS_KEY_ID")
    fi

    log "Uploading backup and checksum to off-site storage"
    aws s3 cp "$BACKUP_PATH" "${destination}/${BACKUP_FILE}" "${s3_args[@]}" || \
        fail "Off-site archive upload failed"
    if ! aws s3 cp "$CHECKSUM_PATH" "${destination}/${BACKUP_FILE}.sha256" "${s3_args[@]}"; then
        aws s3 rm "${destination}/${BACKUP_FILE}" --only-show-errors >/dev/null 2>&1 || true
        fail "Off-site checksum upload failed"
    fi
    log "Off-site upload completed"
}

rotate_backups() {
    local old_backup deleted_count=0
    while IFS= read -r -d '' old_backup; do
        log "Deleting expired local backup: $(basename "$old_backup")"
        rm -f -- "$old_backup" "${old_backup}.sha256"
        deleted_count=$((deleted_count + 1))
    done < <(find "$BACKUP_DIR" -maxdepth 1 -type f \
        -name 'schoolflow_backup_*.dump' -mtime "+${RETENTION_DAYS}" -print0)
    log "Local retention completed: ${deleted_count} expired backup(s) removed"
}

main() {
    preflight
    check_disk_space
    perform_backup
    upload_offsite
    rotate_backups
    log "Backup process completed successfully"
}

main "$@"
