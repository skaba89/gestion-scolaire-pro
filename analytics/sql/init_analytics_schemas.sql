-- SchoolFlow Analytics schemas
-- This database is OLAP-only. Do not connect the operational API to it.

CREATE SCHEMA IF NOT EXISTS bronze;
CREATE SCHEMA IF NOT EXISTS silver;
CREATE SCHEMA IF NOT EXISTS gold;
CREATE SCHEMA IF NOT EXISTS ml;
CREATE SCHEMA IF NOT EXISTS monitoring;

CREATE TABLE IF NOT EXISTS monitoring.pipeline_runs (
    id BIGSERIAL PRIMARY KEY,
    pipeline_name TEXT NOT NULL,
    layer_name TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    row_count BIGINT DEFAULT 0,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS monitoring.data_quality_results (
    id BIGSERIAL PRIMARY KEY,
    model_name TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    status TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    failed_count BIGINT DEFAULT 0,
    details JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS bronze.students_raw (
    source_id TEXT,
    tenant_id TEXT,
    payload JSONB NOT NULL,
    operation TEXT DEFAULT 'snapshot',
    source_updated_at TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bronze.grades_raw (
    source_id TEXT,
    tenant_id TEXT,
    payload JSONB NOT NULL,
    operation TEXT DEFAULT 'snapshot',
    source_updated_at TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bronze.attendance_raw (
    source_id TEXT,
    tenant_id TEXT,
    payload JSONB NOT NULL,
    operation TEXT DEFAULT 'snapshot',
    source_updated_at TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bronze.payments_raw (
    source_id TEXT,
    tenant_id TEXT,
    payload JSONB NOT NULL,
    operation TEXT DEFAULT 'snapshot',
    source_updated_at TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_bronze_students_raw_tenant ON bronze.students_raw (tenant_id);
CREATE INDEX IF NOT EXISTS ix_bronze_grades_raw_tenant ON bronze.grades_raw (tenant_id);
CREATE INDEX IF NOT EXISTS ix_bronze_attendance_raw_tenant ON bronze.attendance_raw (tenant_id);
CREATE INDEX IF NOT EXISTS ix_bronze_payments_raw_tenant ON bronze.payments_raw (tenant_id);
