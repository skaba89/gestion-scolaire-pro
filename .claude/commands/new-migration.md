---
description: Gabarit guidé pour une nouvelle migration Alembic (réversible, idempotente, RLS, une seule head) — passe par le plan et la validation, ne l'exécute jamais
argument-hint: "<changement de schéma souhaité>"
---

Changement de schéma : $ARGUMENTS

Une migration est un **changement important** : plan + validation explicite avant
d'écrire le fichier. Le hook `workflow-gate.mjs` a posé le verrou HUMAN VALIDATION,
levé seulement par « OK » ou `/approve-plan` ; terminer le plan par cette demande. Lire `.claude/skills/database-guide/SKILL.md` et `docs/MIGRATION_GUIDE.md`.

Le plan doit préciser :
1. `down_revision` = sortie actuelle de `alembic heads` (une seule head).
2. Nom : `backend/alembic/versions/YYYYMMDD_NNNN_<description>.py`.
3. Opérations gardées par `_table_exists` / `_column_exists` / `_index_exists`.
4. `downgrade()` réel.
5. Nouvelle table tenant : `TenantMixin`, index `tenant_id`, `ENABLE` + `FORCE` RLS,
   politique NULL-safe recopiée de la migration RLS la plus récente, droits du rôle applicatif.
6. Compatibilité avec la version N-1 de l'API (expand → contract) ; aucun DROP/TRUNCATE
   sans plan de sauvegarde et accord explicite.
7. Modèle SQLAlchemy mis à jour en cohérence.
8. Tests : modèle/endpoint sur SQLite + validation PostgreSQL en CI.

Après écriture : relecture par l'agent `database-reviewer`. Ne pas exécuter
`alembic upgrade` sans demande explicite, et jamais contre une base distante.
