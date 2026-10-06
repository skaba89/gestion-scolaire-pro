---
description: Gabarit guidé pour un nouvel endpoint tenant (permission, tenant, pagination, FK, audit, tests, RBAC front, doc) — passe par le plan et la validation
argument-hint: "<méthode + chemin + rôle(s) + but, ex. \"GET /library/loans/ pour TENANT_ADMIN et SECRETARY\">"
---

Endpoint demandé : $ARGUMENTS

Un nouvel endpoint est un **changement important** : suivre `/feature`, avec ces
exigences supplémentaires dans le plan :

1. Emplacement : module de `backend/app/api/v1/endpoints/<domaine>/` (pas `aliases.py`) ;
   vérifier qu'aucune route équivalente n'existe déjà.
2. Contrat : chemin kebab-case avec slash final, schémas Pydantic requête/réponse.
3. Autorisation : permission `resource:action` (existante ou nouvelle → 3 sources RBAC),
   rôles autorisés au moindre privilège, appartenance pour les rôles personnels.
4. Tenant : `resolve_current_tenant_id` + filtre sur chaque requête + FK vérifiées.
5. Pagination bornée, validation des entrées, erreurs en français.
6. Opération sensible → `log_audit` ; création financière → idempotence.
7. Tests : matrice complète du skill `testing-guide`.
8. Frontend (si consommé) : hook React Query, garde `usePermissions`, i18n.
9. Doc : `docs/PERMISSIONS_MATRIX.md` si permission ; doc fonctionnelle si pertinent.

Arrêt obligatoire après le plan pour validation humaine : le hook `workflow-gate.mjs`
a posé le verrou HUMAN VALIDATION, levé seulement par « OK » ou `/approve-plan`.
