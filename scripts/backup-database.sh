#!/bin/bash

# ============================================================================
# SchoolFlow Pro - Automated PostgreSQL Backup Script
# ============================================================================
# Description: Daily backup with 30-day rotation and error alerting
# Author: SchoolFlow DevOps Team
# Date: 2026-02-16
# ============================================================================

set -e  # Exit on error

# ============================================================================
# CONFIGURATION
# ============================================================================

# Database connection
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-postgres}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"

# Backup configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/schoolflow}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="schoolflow_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# Alert configuration
ALERT_EMAIL="${ALERT_EMAIL:-admin@schoolflow.com}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"  # Optional Slack/Discord webhook

# ============================================================================
# FUNCTIONS
# ============================================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

send_alert() {
    local subject="$1"
    local message="$2"
    
    log "ALERT: $subject - $message"
    
    # Send email alert (requires mailx or sendmail)
    if command -v mail &> /dev/null; then
        echo "$message" | mail -s "$subject" "$ALERT_EMAIL"
    fi
    
    # Send webhook alert (Slack/Discord)
    if [ -n "$ALERT_WEBHOOK" ]; then
        curl -X POST "$ALERT_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{\"text\": \"$subject: $message\"}" \
            2>/dev/null || true
    fi
}

check_disk_space() {
    local available=$(df -BG "$BACKUP_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')
    local required=5  # Minimum 5GB required
    
    if [ "$available" -lt "$required" ]; then
        send_alert "❌ Backup Failed - Disk Space" "Insufficient disk space: ${available}GB available, ${required}GB required"
        exit 1
    fi
}

create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        log "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi
}

perform_backup() {
    log "Starting backup: $BACKUP_FILE"
    
    # Set password for pg_dump
    export PGPASSWORD="$DB_PASSWORD"
    
    # Perform backup with compression
    if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --format=plain \
        --no-owner \
        --no-acl \
        --verbose \
        2>&1 | gzip > "$BACKUP_PATH"; then
        
        log "✅ Backup completed successfully: $BACKUP_PATH"
        
        # Get backup size
        local size=$(du -h "$BACKUP_PATH" | cut -f1)
        log "Backup size: $size"
        
        # Verify backup integrity
        if gunzip -t "$BACKUP_PATH" 2>/dev/null; then
            log "✅ Backup integrity verified"
        else
            send_alert "⚠️ Backup Warning" "Backup created but integrity check failed: $BACKUP_FILE"
        fi
        
        return 0
    else
        send_alert "❌ Backup Failed" "pg_dump failed for database: $DB_NAME"
        return 1
    fi
    
    unset PGPASSWORD
}

rotate_backups() {
    log "Rotating backups (keeping last $RETENTION_DAYS days)"
    
    # Find and delete backups older than retention period
    local deleted_count=0
    while IFS= read -r old_backup; do
        log "Deleting old backup: $(basename "$old_backup")"
        rm -f "$old_backup"
        ((deleted_count++))
    done < <(find "$BACKUP_DIR" -name "schoolflow_backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS)
    
    if [ $deleted_count -gt 0 ]; then
        log "Deleted $deleted_count old backup(s)"
    else
        log "No old backups to delete"
    fi
    
    # List current backups
    local backup_count=$(find "$BACKUP_DIR" -name "schoolflow_backup_*.sql.gz" -type f | wc -l)
    log "Total backups: $backup_count"
}

test_restore() {
    # Optional: Test restore on a separate test database
    # This is commented out by default to avoid overhead
    # Uncomment for production environments
    
    # local test_db="schoolflow_restore_test"
    # log "Testing restore to database: $test_db"
    # 
    # export PGPASSWORD="$DB_PASSWORD"
    # 
    # # Drop test database if exists
    # psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE IF EXISTS $test_db;" 2>/dev/null || true
    # 
    # # Create test database
    # psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $test_db;" 2>/dev/null
    # 
    # # Restore backup
    # if gunzip -c "$BACKUP_PATH" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$test_db" > /dev/null 2>&1; then
    #     log "✅ Restore test successful"
    #     psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE $test_db;" 2>/dev/null || true
    # else
    #     send_alert "⚠️ Backup Warning" "Restore test failed for: $BACKUP_FILE"
    # fi
    # 
    # unset PGPASSWORD
    
    log "Restore test skipped (enable in script if needed)"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    log "========================================="
    log "SchoolFlow Pro - Backup Script"
    log "========================================="
    
    # Pre-flight checks
    check_disk_space
    create_backup_dir
    
    # Perform backup
    if perform_backup; then
        # Rotate old backups
        rotate_backups
        
        # Optional: Test restore
        # test_restore
        
        log "========================================="
        log "Backup process completed successfully"
        log "========================================="
        
        exit 0
    else
        log "========================================="
        log "Backup process failed"
        log "========================================="
        
        exit 1
    fi
}

# Run main function
main
