# Runbook — rôles runtime PostgreSQL sur Neon (API / worker, NOBYPASSRLS)

**Statut : exécuté en production le 2026-10-05 (étapes 1 à 5) ; étape 6 en
attente.** Chaque étape demande une validation humaine explicite (CLAUDE.md,
« Opérations interdites sans validation »). Ne jamais afficher, journaliser ni
committer un mot de passe ou une chaîne de connexion.

## Journal d'exécution (2026-10-05)

| Étape | Résultat |
|---|---|
| 1. Répétition (branche jetable `rehearsal-runtime-roles-20261005`, issue de `production` au 2026-10-04 22:01 UTC) | PASS : attributs, aucun droit DDL, RLS + FORCE sur 117/117 tables, lecture/écriture même tenant OK, lecture/écriture cross-tenant refusées (42501, 0 ligne) — chaque rôle × endpoint direct et `-pooler` ; 40 transactions/rôle sur 4 clients du pooler sans héritage de contexte ; code applicatif réel (8 threads × 25, `after_begin`) sans fuite. La base ne contenant qu'un établissement, un tenant B de test a été créé puis supprimé sur la branche. |
| 2. Création des rôles en production | PASS : une transaction (CREATE ROLE + GRANT/REVOKE + ALTER DEFAULT PRIVILEGES) ; empreinte RLS/policies identique avant/après ; aucune donnée modifiée. |
| 3. Image ≥ #269 sur API et worker | release `70e28278…` par digest (2026-10-04). |
| 4. Bascule API (`schoolflow_api`, `-pooler`, `sslmode=require`) | PASS à 06:09 UTC : seules les 3 `DATABASE_URL*` changées ; `/health/ready` 200 (`rls=active`, `schema=up_to_date`) ; login inconnu 401 ; aucun 5xx. |
| 5. Bascule worker (`schoolflow_worker`) | PASS à 06:15 UTC : heartbeat `/health/live` « alive » après la période de grâce ; premiers jobs planifiés sous ce rôle : nuit suivante (03:00–04:00 UTC). |
| 6. Retrait `POSTGRES_*` de l'API ; rotation du mot de passe `neondb_owner` | en attente |

Constats pendant l'exécution :

- Les mots de passe des rôles sont générés en mémoire, posés par `ALTER ROLE`
  au moment de la bascule et écrits directement dans les App Settings (API
  Azure Resource Manager), jamais affichés ni stockés ailleurs.
- `neondb_owner` ne peut pas `REASSIGN OWNED` / `DROP OWNED` sur ces rôles
  (il n'en est pas membre) : pour les retirer, `REVOKE ALL` (tables, séquences,
  schéma, base, droits par défaut) puis `DROP ROLE` — ils ne possèdent rien.
- Les deux rôles héritent de `TEMPORARY` via `PUBLIC` (défaut PostgreSQL ;
  aucune table temporaire dans le code). Remédiation prévue, après une nuit
  de jobs réussie : `REVOKE TEMPORARY ON DATABASE neondb FROM PUBLIC;`
- Sans contexte tenant, les 15 tables à contournement plateforme
  (migration `20260929_0001`) restent visibles en entier — comportement voulu
  pour les jobs plateforme ; l'audit des routes sans tenant reste à faire.
- Rollback d'une bascule : réécrire les 3 `DATABASE_URL*` avec `neondb_owner`
  (chaîne lue via `neonctl connection-string`, jamais affichée) tant que son
  mot de passe n'a pas été changé.

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

1. Répéter sur une branche Neon **jetable** issue de `production` (rôles +
   image de la release en local sur l'endpoint `-pooler` +
   `tests/test_rls_tenant_context_pooling.py`). Attention : la suite de tests
   écrit sur la branche (`create_all`, rôles et données de test) — jamais sur
   `production` ni sur une branche de sauvegarde.
2. Créer les rôles en production (sans effet tant qu'ils ne sont pas utilisés).
   Les mots de passe sont des variables psql (`\set api_pwd …` ou
   `psql -v api_pwd=…`), générés en mémoire et jamais tapés en clair.
3. Déployer l'image de la release **par digest** sur l'API **et sur le
   worker** (encore en `neondb_owner`), et vérifier qu'aucune instance ne
   tourne plus une image antérieure à #269.
4. Basculer `DATABASE_URL`, `DATABASE_URL_SYNC`, `DATABASE_URL_ASYNC` de l'API
   vers `schoolflow_api` ; vérifier `GET /platform/security/database-role/`.
5. Même chose pour le worker (`schoolflow_worker`), seulement après l'étape 3
   pour le worker.
6. Retirer `POSTGRES_*` de l'API ; faire tourner le mot de passe de `neondb_owner`.

**Invariant de sécurité** : une image antérieure à #269 (contexte tenant de
portée session) ne doit **jamais** tourner avec un rôle `schoolflow_*` via le
pooler — elle ferait fuir le contexte entre clients.

Rollback de chaque bascule : rétablir les valeurs précédentes des App Settings
(conservées hors dépôt) ; `DROP ROLE` si les rôles doivent être retirés. Un
rollback d'**image** vers une version antérieure à #269 impose de revenir
**d'abord** à `neondb_owner`.
