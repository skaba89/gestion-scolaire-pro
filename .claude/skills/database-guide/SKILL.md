---
name: database-guide
description: Base de données Academy Guinéenne — PostgreSQL 16, Row-Level Security par tenant, modèles SQLAlchemy (UUIDMixin/TenantMixin), migrations Alembic (une seule head, réversibles, idempotentes, exécutées par une étape de déploiement séparée). À utiliser pour toute modification de schéma, de modèle, d'index, de politique RLS ou de requête SQL brute.
---

# Base de données & migrations

Sources de vérité (lire avant d'agir) :
- `docs/MIGRATION_GUIDE.md` — règles absolues, helpers idempotents, pièges connus
  (sa section « tables fantômes » est antérieure à leur adoption dans Alembic par
  `20260930_0001_adopt_operational_tables_into_alembic.py`).
- `docs/AZURE_ONE_SHOT_MIGRATIONS.md` — les migrations tournent dans un job dédié avant l'API.
- `docs/POSTGRES_APP_ROLE.md` — rôle applicatif NOSUPERUSER / NOBYPASSRLS.
- `docs/SECURITY_MODEL.md` — modèle RLS.

## Invariants

1. **Ne jamais modifier une migration existante** (déjà appliquée quelque part).
   Corriger = nouvelle révision. (Bloqué par hook.)
2. **Une seule head** : `alembic heads` doit afficher une seule ligne (vérifié en CI).
3. **Réversible** : `downgrade()` réel, pas `pass`.
4. **Idempotente** : garder chaque opération par `_table_exists` / `_column_exists` /
   `_index_exists` (voir la migration de référence citée dans le guide).
5. **Aucune DDL hors migrations** : ni au démarrage de l'API/worker, ni dans un endpoint.
6. **Destructif** (`DROP TABLE/COLUMN`, `TRUNCATE`, `DELETE` massif, changement de
   type avec perte) : interdit sans plan de sauvegarde + accord explicite.
7. `backend/app/core/operational_tables.py` est importé par une migration : gelé.

## Nouvelle table tenant

- Modèle : `UUIDMixin` + `TenantMixin` (FK `tenant_id`), index sur `tenant_id`
  et sur les colonnes filtrées fréquemment.
- Migration : `ENABLE` + `FORCE ROW LEVEL SECURITY` et politique alignée sur les
  politiques existantes, en particulier la forme NULL-safe :
  `(tenant_id)::text = current_setting('app.current_tenant_id', true)
   OR NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL`
  — recopier la forme exacte de la migration RLS la plus récente plutôt que de la réécrire.
- Table enfant sans `tenant_id` : voir `20260927_0001_rls_child_tables_without_tenant_id.py`.
- Droits du rôle applicatif : vérifier `infra/azure/sql/create_app_role.sql` /
  `docs/POSTGRES_APP_ROLE.md` (privilèges par défaut sur les nouvelles tables).

## Nommage

`backend/alembic/versions/YYYYMMDD_NNNN_description_courte.py`, `revision` =
préfixe identique, `down_revision` = head actuelle (`alembic heads`).

## Compatibilité de déploiement

Le job de migration s'exécute **avant** la nouvelle API ; l'ancienne version
tourne encore pendant la bascule. Donc : ajout de colonne nullable ou avec défaut
d'abord, suppression/renommage en deux temps (expand → contract) sur deux releases.

## Vérification

```bash
cd backend
alembic heads                         # une seule head
python -m pytest tests/ -q -k <sujet> # SQLite : n'exerce PAS la RLS
```

Le test d'isolation réel exige PostgreSQL (job CI `backend-tests`, ou stack
Docker locale). `alembic upgrade` local : uniquement avec accord, jamais contre
une base distante.

## Requêtes

- ORM de préférence ; `text()` avec paramètres liés ; jamais d'interpolation de valeur.
- Index pour tout nouveau filtre fréquent ; vérifier `EXPLAIN` sur les tables volumineuses
  (élèves, notes, présences, paiements).
