# Runbook — rôles runtime PostgreSQL sur Neon (API / worker, NOBYPASSRLS)

**Statut : préparé, NON exécuté en production.** Chaque étape demande une
validation humaine explicite (CLAUDE.md, « Opérations interdites sans
validation »). Ne jamais afficher, journaliser ni committer un mot de passe ou
une chaîne de connexion.

## Contexte

La production (App Service `academy-guineenne-api` / `-worker`, base Neon
`neondb`, projet `ancient-feather-57701824`) se connecte en `neondb_owner` :
propriétaire des tables, `BYPASSRLS`, membre de `neon_superuser`. Toutes les
politiques RLS sont donc sans effet pour l'application. Cible :

| Rôle | Usage | Attributs | Propriétaire des tables |
|---|---|---|---|
| `neondb_owner` | migrations Alembic uniquement (identifiants hors App Service) | inchangé | oui |
| `schoolflow_api` | API | LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION **NOBYPASSRLS** | non |
| `schoolflow_worker` | worker ARQ | idem | non |

Prérequis : le code doit poser le contexte tenant **par transaction**
(`app/core/database.py`, hook `after_begin`) — sinon le pooler fait fuir le
contexte entre clients — et ne plus exécuter de DDL au runtime.

## Créer les rôles (SQL, en `neondb_owner`, endpoint direct)

Créer les rôles **en SQL**, pas via `neonctl roles create` / la console : les
rôles créés par l'API Neon deviennent membres de `neon_superuser`.

```sql
CREATE ROLE schoolflow_api    LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'api_pwd';
CREATE ROLE schoolflow_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'worker_pwd';

GRANT CONNECT ON DATABASE neondb TO schoolflow_api, schoolflow_worker;
GRANT USAGE ON SCHEMA public TO schoolflow_api, schoolflow_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO schoolflow_api, schoolflow_worker;
REVOKE INSERT, UPDATE, DELETE ON public.alembic_version FROM schoolflow_api, schoolflow_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO schoolflow_api, schoolflow_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO schoolflow_api, schoolflow_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO schoolflow_api, schoolflow_worker;
```

Privilèges volontairement absents : DDL, `TRUNCATE`, `REFERENCES`, `TRIGGER`
(aucun usage applicatif), écriture sur `alembic_version`. `EXECUTE` sur les
fonctions est déjà accordé à PUBLIC (aucune fonction `SECURITY DEFINER`).

## Vérifier (lecture seule)

```sql
SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
FROM pg_roles WHERE rolname LIKE 'schoolflow_%';                          -- tout à false
SELECT r.rolname FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
WHERE m.member IN (SELECT oid FROM pg_roles WHERE rolname LIKE 'schoolflow_%');  -- aucune ligne
SELECT count(*) FROM pg_class WHERE pg_get_userbyid(relowner) LIKE 'schoolflow_%';  -- 0
```

## Ordre de bascule (chaque étape validée séparément)

1. Répéter sur une branche Neon issue de `production` (rôles + image de la
   release en local sur l'endpoint `-pooler` + `tests/test_rls_tenant_context_pooling.py`).
2. Créer les rôles en production (sans effet tant qu'ils ne sont pas utilisés).
3. Déployer l'image de la release **par digest** sur l'API (encore en `neondb_owner`).
4. Basculer `DATABASE_URL`, `DATABASE_URL_SYNC`, `DATABASE_URL_ASYNC` de l'API
   vers `schoolflow_api` ; vérifier `GET /platform/security/database-role/`.
5. Même chose pour le worker (`schoolflow_worker`).
6. Retirer `POSTGRES_*` de l'API ; faire tourner le mot de passe de `neondb_owner`.

Rollback de chaque bascule : rétablir les valeurs précédentes des App Settings
(conservées hors dépôt) ; `DROP ROLE` si les rôles doivent être retirés.
