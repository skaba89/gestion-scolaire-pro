-- SECURITY (Postgres non-superuser app role pass, docs/POSTGRES_APP_ROLE.md):
-- creates the restricted role the application connects with at runtime,
-- so DATABASE_URL/DATABASE_URL_SYNC/DATABASE_URL_ASYNC stop being the
-- Flexible Server admin login — which bypasses Row-Level Security
-- entirely (rolsuper on Flexible Server's admin, or explicit BYPASSRLS),
-- making every RLS policy in this database security theater against that
-- connection, whatever the policies themselves say. See
-- app/main.py::_check_rls_bypass_role, which is what first turned this
-- from "someone should run this by hand one day" into an automated
-- check on /health/deep.
--
-- NOT applied automatically by any migration, CI job, or Bicep template —
-- run manually, once per environment, connected AS THE ADMIN LOGIN
-- (the same one in infra/azure/modules/postgres.bicep's administratorLogin
-- param). Never commit a real password anywhere this script's history is
-- tracked: pass it in via a psql variable, e.g.
--
--   psql "$ADMIN_DATABASE_URL" \
--     -v app_role_password="$(openssl rand -base64 32)" \
--     -f infra/azure/sql/create_app_role.sql
--
-- (Note: psql variable substitution does NOT reach inside dollar-quoted
-- ($$...$$) PL/pgSQL bodies — confirmed while testing this script against
-- a real PostgreSQL 16 instance — so every dynamic identifier/value below
-- is built with format()+\gexec at the top level instead of a DO block.)
--
-- After running this, per docs/POSTGRES_APP_ROLE.md:
--   1. Update the `database-url`/`database-url-sync`/`database-url-async`
--      Key Vault secrets to use schoolflow_app (not the admin login).
--   2. Add a new `database-url-migrations` Key Vault secret carrying the
--      ADMIN connection string — alembic/env.py needs it once
--      DATABASE_URL_SYNC is no longer the admin login (see
--      app.core.config.effective_migrations_url).
--   3. Restart the Container Apps revision so both env vars are picked up.

-- Every \set below only applies a default when the variable wasn't
-- already passed via -v on the command line (:{?name} is psql's
-- "is this variable defined" test) — an unconditional \set here would
-- silently override a caller's -v value with the hardcoded default
-- instead of the other way around, which is the whole point of making
-- these overridable. Confirmed the hard way while validating this script
-- against a real PostgreSQL 16 instance under a non-default database name.
\if :{?app_role_name}
\else
\set app_role_name 'schoolflow_app'
\endif

-- Must match infra/azure/main.bicep's postgresAdminLogin param for this
-- environment (defaults to 'schoolflow_admin' — override with
-- -v admin_role_name='...' if that param was overridden at deploy time).
\if :{?admin_role_name}
\else
\set admin_role_name 'schoolflow_admin'
\endif

-- Must match modules/postgres.bicep's database resource name (hardcoded
-- there as 'schoolflow' for every environment) — override with
-- -v db_name='...' if you're running this against a differently-named
-- database (e.g. a local test database).
\if :{?db_name}
\else
\set db_name 'schoolflow'
\endif

-- Idempotent create: only runs CREATE ROLE if it doesn't already exist —
-- \gexec executes whatever command text the SELECT produces, one row per
-- statement, and zero rows means "nothing to do" rather than an error.
SELECT format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
    :'app_role_name'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role_name')
\gexec

-- Always (re)applied, whether the role was just created above or already
-- existed (e.g. rotating the password on a re-run) — explicit, not just
-- "default state", so a reviewer never has to also know Postgres's
-- role-creation defaults to confirm this role can't bypass RLS or alter
-- schema. :app_role_name substitutes as a raw identifier (no quotes,
-- like any psql variable used outside a string literal); :'app_role_password'
-- substitutes as a properly SQL-quoted string literal.
ALTER ROLE :app_role_name PASSWORD :'app_role_password';
ALTER ROLE :app_role_name NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

GRANT CONNECT ON DATABASE :db_name TO :app_role_name;
GRANT USAGE ON SCHEMA public TO :app_role_name;

-- Row data only — no DDL (no CREATE/ALTER/DROP TABLE), so a compromised
-- or buggy app connection can corrupt or leak rows within what RLS
-- policies allow, never rewrite the schema itself.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :app_role_name;
-- Sequences back every SERIAL/IDENTITY primary key in this schema —
-- without USAGE+SELECT here, every INSERT into such a table fails with
-- "permission denied for sequence ...".
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :app_role_name;

-- Alembic migrations run as the admin login (see
-- app.core.config.effective_migrations_url) and create new tables/
-- sequences over time. Without this, every future migration would need
-- this script re-run by hand afterward, or the app's very next request
-- against a brand-new table would fail with a permission error instead
-- of the (hopefully already-tested) migration failing loudly in CI.
SELECT format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    :'admin_role_name', :'app_role_name'
)
\gexec

SELECT format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
    :'admin_role_name', :'app_role_name'
)
\gexec
