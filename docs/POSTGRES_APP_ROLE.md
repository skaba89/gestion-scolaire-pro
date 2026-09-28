# Rôle PostgreSQL non-superutilisateur pour l'application

Ce document couvre `infra/azure/sql/create_app_role.sql` et le câblage
associé (`DATABASE_URL_MIGRATIONS`, `effective_migrations_url`) dans
`backend/app/core/config.py`, `backend/alembic/env.py`,
`backend/start.sh` et `backend/app/main.py`.

## Le risque que ceci adresse

`docs/SECURITY_MODEL.md` (section « Risques connus ») documentait
explicitement ce P1 : le rôle PostgreSQL utilisé en production doit être
vérifié non-superutilisateur, sinon la Row-Level Security (RLS) est un
théâtre de sécurité — `rolsuper` ou tout rôle `BYPASSRLS` ignore
purement et simplement toutes les politiques RLS, quelle que soit leur
correction. `app/main.py::_check_rls_bypass_role` diagnostique déjà ce
cas sur `/health/deep`, mais jusqu'à cette PR rien ne fournissait
concrètement un rôle applicatif restreint à utiliser à la place de
l'admin login.

## Architecture : deux rôles, deux usages

```
schoolflow_admin  (superutilisateur Flexible Server, existant)
    |
    +-- Alembic (DDL : CREATE/ALTER/DROP TABLE)
    +-- ensure_operational_tables() au démarrage (DDL brut, tables sans modèle ORM)
    |   -> DATABASE_URL_MIGRATIONS (nouveau, optionnel)

schoolflow_app    (nouveau, non-superutilisateur, NOBYPASSRLS)
    |
    +-- toutes les requêtes applicatives à l'exécution (SELECT/INSERT/UPDATE/DELETE)
        -> DATABASE_URL / DATABASE_URL_SYNC / DATABASE_URL_ASYNC
```

- `schoolflow_app` n'a **aucun privilège DDL** — `GRANT SELECT, INSERT,
  UPDATE, DELETE ON ALL TABLES` et `GRANT USAGE, SELECT ON ALL SEQUENCES`
  uniquement (les séquences sont nécessaires pour toute colonne
  `SERIAL`/`IDENTITY`).
- `ALTER DEFAULT PRIVILEGES FOR ROLE schoolflow_admin ...` fait que toute
  table créée par une future migration Alembic (exécutée par
  `schoolflow_admin`) accorde automatiquement les mêmes droits à
  `schoolflow_app` — sans ce réglage, il faudrait ré-exécuter
  `create_app_role.sql` après chaque migration.
- `effective_migrations_url` (dans `config.py`) est
  `DATABASE_URL_MIGRATIONS` si l'opérateur l'a définie, sinon
  `DATABASE_URL_SYNC` — c'est-à-dire le comportement actuel, inchangé,
  tant que `DATABASE_URL_MIGRATIONS` n'est pas explicitement positionnée.
  Alembic (`alembic/env.py`) et l'étape de fixup de schéma dans
  `start.sh` utilisent tous les deux `effective_migrations_url`, jamais
  directement `DATABASE_URL_SYNC`.
- `ensure_operational_tables()` (DDL brut pour des tables sans modèle
  SQLAlchemy, appelé au démarrage dans `main.py`) est également routé via
  `effective_migrations_url` — l'oubli de ce détail était un vrai bug
  trouvé pendant ce travail : cette fonction utilisait l'engine
  applicatif (potentiellement restreint) au lieu de l'engine
  d'administration.

## Procédure (manuelle, une fois par environnement)

Jamais exécuté automatiquement par une migration, un job CI ou un
template Bicep — volontairement, pour ne jamais changer silencieusement
les identifiants de connexion de l'application sans qu'un humain ait
validé chaque étape ci-dessous.

1. **Créer le rôle** en se connectant en tant qu'admin login (le même
   que `infra/azure/modules/postgres.bicep` → `administratorLogin`) :

   ```bash
   psql "$ADMIN_DATABASE_URL" \
     -v app_role_password="$(openssl rand -base64 32)" \
     -f infra/azure/sql/create_app_role.sql
   ```

   Le script est idempotent (re-exécutable pour une rotation de mot de
   passe) et accepte `-v app_role_name=...`, `-v admin_role_name=...`,
   `-v db_name=...` pour s'écarter des valeurs par défaut
   (`schoolflow_app`, `schoolflow_admin`, `schoolflow`).

2. **Mettre à jour les secrets Key Vault** `database-url`,
   `database-url-sync`, `database-url-async` pour utiliser
   `schoolflow_app` (et le mot de passe généré ci-dessus) au lieu de
   l'admin login.

3. **Ajouter un nouveau secret** `database-url-migrations` portant la
   chaîne de connexion **admin** (celle que ces trois secrets
   utilisaient avant l'étape 2) — Alembic et `ensure_operational_tables`
   en ont besoin pour continuer à exécuter du DDL.

4. **Redémarrer la révision Container Apps** pour que les nouvelles
   valeurs d'environnement soient prises en compte.

## ⚠️ Ne pas encore activer en production

Cette PR livre l'outillage (le script de création de rôle, le câblage
`DATABASE_URL_MIGRATIONS`, les tests) de façon strictement additive —
**rien de ce qui est actuellement déployé ne change** tant que les
étapes 1 à 4 ci-dessus ne sont pas exécutées manuellement. C'est
délibéré : des tests exhaustifs contre un vrai PostgreSQL 16, avec la
connexion applicative réellement pointée sur le rôle restreint, ont mis
en évidence **deux problèmes réels et non résolus** qui rendent la
bascule effective encore risquée :

1. **`app/workers/tasks.py` ne fixe jamais le contexte RLS.** Les jobs
   ARQ en arrière-plan (synchronisation WhatsApp, rappels de paiement,
   imports CSV, génération de bulletins) utilisent `SessionLocal()`
   directement, environ 20 sites d'appel, sans jamais appeler
   `set_config('app.current_tenant_id', ...)` ni
   `tenant_context.set(...)`. Aujourd'hui ces jobs ne fonctionnent
   correctement (au sens : ne mélangent pas les données de plusieurs
   tenants) que **parce que** le rôle de connexion actuel bypass RLS.
   Faire tourner le worker avec `schoolflow_app` casserait silencieusement
   l'isolation multi-tenant de tous ces jobs, ou les ferait échouer selon
   les politiques RLS exactes.
2. **Poisoning apparent du pool de connexions sous le rôle restreint.**
   La suite backend complète, exécutée avec la connexion applicative sur
   `schoolflow_app`, produit un nombre d'échecs largement supérieur (de
   l'ordre de 900+ tests) à ce que les deux causes connues (point 1 et le
   bug `ensure_operational_tables` déjà corrigé) expliquent à elles
   seules. Un test représentatif
   (`test_kiosk.py::TestDeviceManagementAccessControl::test_admin_can_create`)
   échoue dans la suite complète (`InvalidRequestError: Could not refresh
   instance`) mais passe proprement en isolation — combiné à des dizaines
   d'occurrences de « current transaction is aborted » dans les logs,
   cela pointe vers des erreurs de permission non suivies d'un
   `rollback()` quelque part dans le cycle de vie d'une requête
   (`app/core/database.py::get_db()` ou ailleurs), qui empoisonnent la
   connexion pour la requête suivante utilisant le même pool.

**Tant que ces deux points ne sont pas résolus séparément**, exécuter les
étapes 2-4 ci-dessus sur un environnement réel romprait le
fonctionnement des jobs d'arrière-plan et/ou provoquerait des erreurs
5xx sporadiques et difficiles à diagnostiquer sur l'API elle-même. Le
scope volontairement restreint de cette PR est donc :

- Le script de création de rôle (`create_app_role.sql`), validé de façon
  approfondie contre un vrai PostgreSQL 16 (création idempotente,
  rotation de mot de passe, refus du DDL pour ce rôle, héritage des
  droits par défaut pour les tables créées après coup).
- Le câblage `DATABASE_URL_MIGRATIONS`/`effective_migrations_url`, qui
  ne change rien tant qu'il n'est pas explicitement activé.
- La correction du bug `ensure_operational_tables` (DDL via le mauvais
  engine), un vrai problème indépendant de l'activation du rôle
  restreint.

La fermeture complète du risque P1 (rôle non-superutilisateur
**effectivement utilisé** en production) reste un travail de suivi,
conditionné à la résolution des deux points ci-dessus.

## Validation effectuée

- `psql` contre un PostgreSQL 16 local réel : création idempotente du
  rôle, rotation de mot de passe sur ré-exécution, refus explicite d'un
  `ALTER TABLE` tenté avec ce rôle, héritage correct des privilèges par
  défaut sur une table créée après l'exécution du script.
- `pytest backend/tests/test_database_url_migrations_2026_09_28.py
  backend/tests/test_start_sh_db_resolution.py` : tous les nouveaux tests
  passent (fallback vers `DATABASE_URL_SYNC` quand
  `DATABASE_URL_MIGRATIONS` est absente, normalisation du driver
  `psycopg`, `start.sh` utilise bien les identifiants admin pour l'étape
  de fixup de schéma quand `DATABASE_URL_MIGRATIONS` est définie, aucune
  fuite de mot de passe dans les logs).
- Suite backend complète contre PostgreSQL réel avec le rôle **admin**
  inchangé (comportement actuellement déployé) : 0 régression introduite
  par le code de cette PR.
- Suite backend complète contre PostgreSQL réel avec la connexion
  applicative pointée sur le rôle **restreint** (`schoolflow_app`,
  expérimentation de due diligence, jamais activée par défaut) : a
  révélé les deux problèmes non résolus documentés ci-dessus — ce
  résultat est la preuve que cette PR ne prétend pas résoudre le risque
  P1 en entier, seulement poser l'outillage vérifié pour le faire plus
  tard en toute sécurité.
