---
description: Audit RBAC et isolation tenant — permissions, tenant, appartenance, alias, tests, synchronisation backend/frontend/doc (lecture seule)
argument-hint: "[module, fichier d'endpoints, permission ou rôle ; vide = diff courant]"
---

Cible : $ARGUMENTS (vide = routes touchées par `git diff main...HEAD`).

Délègue à l'agent `rbac-reviewer` (procédure du skill `rbac-guide`).
Aucune modification de fichier.

Restitue le tableau `route | méthode | permission | rôles effectifs | tenant | appartenance | alias | test | verdict`,
les écarts entre `backend/app/core/security.py`, `src/lib/permissions.ts` et
`docs/PERMISSIONS_MATRIX.md`, puis les corrections proposées (chacune = changement
IMPORTANT → `/feature` ou `/fix` avec validation).
