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
en évidence des problèmes réels — deux corrigés dans une PR de suivi
(migration `20260928_0001`), un troisième qui reste un vrai risque non
résolu :

1. **(CORRIGÉ, migration `20260928_0001`) Le cast `::uuid` de chaque
   politique RLS plantait sur toute requête sans tenant.**
   `set_config('app.current_tenant_id', NULL, false)` — ce que
   `get_db()` exécute à chaque requête pour repartir d'un état propre —
   ne remet PAS le GUC personnalisé à `NULL` : il le redéfinit à une
   chaîne vide `''` (confirmé directement contre un PostgreSQL 16 réel,
   sans ORM). Chaque politique RLS créée par
   `20260224_0730_fdb89a2e3b4d_enable_rls.py` faisait
   `tenant_id = (current_setting('app.current_tenant_id', true))::uuid`
   — `(''::uuid)` lève `invalid input syntax for type uuid: ""` pour
   tout le balayage de lignes, sur `/auth/bootstrap/` ou toute requête
   SUPER_ADMIN par exemple. Invisible jusqu'ici car le rôle admin actuel
   est superutilisateur et bypass RLS entièrement, donc ce cast n'a
   jamais été réellement évalué en production ni dans la suite de
   tests existante.
2. **(CORRIGÉ, même migration) Une fois le cast corrigé, l'égalité
   simple rejetait encore les lignes sans tenant (comptes SUPER_ADMIN,
   `tenant_id IS NULL`).** En SQL, `NULL = NULL` vaut `NULL`, pas
   `TRUE` — donc même avec le cast corrigé, l'INSERT du compte
   SUPER_ADMIN lui-même (créé par `/auth/bootstrap/` avec
   `tenant_id=NULL`) était rejeté par sa propre politique
   `WITH CHECK`. Remplacé `=` par `IS NOT DISTINCT FROM` (égalité
   NULL-safe de PostgreSQL), qui vaut `TRUE` pour NULL vs NULL tout en
   restant strictement équivalent à `=` pour deux valeurs non-nulles —
   vérifié que l'isolation inter-tenant reste intacte (un tenant réel
   ne voit toujours pas les lignes `tenant_id IS NULL`, et
   réciproquement).
3. **(NON RÉSOLU) `app/workers/tasks.py` ne fixe jamais le contexte
   RLS.** Les jobs ARQ en arrière-plan (synchronisation WhatsApp,
   rappels de paiement, imports CSV, génération de bulletins) utilisent
   `SessionLocal()` directement, environ 20 sites d'appel, sans jamais
   appeler `set_config('app.current_tenant_id', ...)` ni
   `tenant_context.set(...)`. Aujourd'hui ces jobs ne fonctionnent
   correctement (au sens : ne mélangent pas les données de plusieurs
   tenants) que **parce que** le rôle de connexion actuel bypass RLS.
   Faire tourner le worker avec `schoolflow_app` casserait silencieusement
   l'isolation multi-tenant de tous ces jobs, ou les ferait échouer selon
   les politiques RLS exactes.

**Précision importante, après investigation plus poussée** : la suite
backend complète, exécutée avec la connexion applicative sur
`schoolflow_app` (rôle restreint), produit encore un nombre d'échecs
important (de l'ordre de 900 tests) même après les deux corrections
ci-dessus. Une PR de suivi précédente décrivait cela comme un
« poisoning apparent du pool de connexions » supposant un `rollback()`
manquant quelque part — **ce diagnostic était imprécis**. La cause
réelle, confirmée en traçant un échec représentatif jusqu'au bout
(`tests/test_admission_timeline.py` et des dizaines de fichiers
similaires) : ces tests créent leurs données via
`with SessionLocal() as db: db.add(User(..., tenant_id=tenant_id))`,
c'est-à-dire **directement via l'ORM, en dehors de tout cycle de
requête HTTP**, sans jamais appeler `set_config`. Sous le rôle admin
(superutilisateur), RLS étant bypass, cela n'a jamais eu d'importance.
Sous le rôle restreint, une telle insertion échoue nécessairement — la
connexion réutilisée du pool ne porte pas le bon tenant, ou aucun —
comme la politique le prévoit correctement.

Ce n'est **pas un bug du code de production** : toute vraie requête
HTTP passe par `app/core/database.py::get_db()`, qui positionne
correctement le contexte tenant à chaque requête, sans exception. C'est
une limite du **harnais de tests** de ce dépôt — des dizaines de
fichiers créent des données de test en contournant délibérément l'API
pour aller plus vite, un choix raisonnable tant que RLS n'est jamais
réellement évaluée par la suite de tests, mais qui empêche de faire
tourner cette même suite contre le rôle restreint sans une refonte
significative des fixtures concernées (hors périmètre ici — risque de
régression bien plus large qu'une correction RLS ciblée).

Le point 3 (`app/workers/tasks.py`) reste, lui, un authentique risque de
**production**, puisque les jobs ARQ tournent réellement en dehors de
tout cycle de requête HTTP, contrairement aux tests.

**Tant que le point 3 n'est pas résolu**, exécuter les étapes 2-4
ci-dessus sur un environnement réel casserait silencieusement
l'isolation multi-tenant des jobs d'arrière-plan. Le scope volontairement
restreint des PR de ce chantier est donc :

- Le script de création de rôle (`create_app_role.sql`), validé de façon
  approfondie contre un vrai PostgreSQL 16 (création idempotente,
  rotation de mot de passe, refus du DDL pour ce rôle, héritage des
  droits par défaut pour les tables créées après coup).
- Le câblage `DATABASE_URL_MIGRATIONS`/`effective_migrations_url`, qui
  ne change rien tant qu'il n'est pas explicitement activé.
- La correction du bug `ensure_operational_tables` (DDL via le mauvais
  engine), un vrai problème indépendant de l'activation du rôle
  restreint.
- Les deux corrections RLS ci-dessus (migration `20260928_0001`), des
  bugs de production réels et indépendants de l'activation du rôle
  restreint (n'importe quel futur rôle non-superutilisateur, ou même un
  défaut de configuration futur, les aurait déclenchés).

La fermeture complète du risque P1 (rôle non-superutilisateur
**effectivement utilisé** en production) reste un travail de suivi,
conditionné à la résolution du point 3 ci-dessus — et, séparément, à
une revue des fixtures de test qui contournent `get_db()` si l'on
souhaite un jour faire tourner la suite de tests elle-même contre le
rôle restreint.

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
  inchangé (comportement actuellement déployé), migration `20260928_0001`
  appliquée : **1857 passed, 1 skipped, 0 failed** — 0 régression.
- Suite backend complète (SQLite) : **1359 passed, 499 skipped, 0 failed**
  — 0 régression.
- Vérification manuelle directe (`psycopg`, sans ORM) sur une base
  portant le rôle restreint : l'INSERT du compte SUPER_ADMIN
  (`tenant_id=NULL`) réussit désormais, et un contexte tenant différent
  ne voit toujours pas cette ligne — l'isolation inter-tenant reste
  intacte après le passage à `IS NOT DISTINCT FROM`.
- Suite backend complète contre PostgreSQL réel avec la connexion
  applicative pointée sur le rôle **restreint** (`schoolflow_app`,
  expérimentation de due diligence, jamais activée par défaut) : passée
  de ~935 à ~877 échecs après les deux corrections RLS — la baisse est
  réelle mais plus faible qu'espéré, car la majorité des échecs
  restants viennent des fixtures de test contournant `get_db()`
  (voir ci-dessus), pas d'un bug de code applicatif supplémentaire.
