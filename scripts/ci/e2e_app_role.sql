-- Rôle applicatif des parcours E2E : mêmes attributs que les rôles runtime
-- de production (schoolflow_api / schoolflow_worker) — NOSUPERUSER,
-- NOBYPASSRLS — pour que les tests exercent réellement la RLS.
-- Base de test jetable uniquement (mot de passe factice).
CREATE ROLE e2e_app LOGIN PASSWORD 'e2e-app-pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT CONNECT ON DATABASE schoolflow_e2e TO e2e_app;
GRANT USAGE ON SCHEMA public TO e2e_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO e2e_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO e2e_app;
-- Comme en production (migration 20261008_0002) : lecture seule.
REVOKE INSERT, UPDATE, DELETE ON schema_migration_compat FROM e2e_app;
