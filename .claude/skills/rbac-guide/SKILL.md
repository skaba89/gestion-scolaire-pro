---
name: rbac-guide
description: RBAC et multi-tenancy d'Academy Guinéenne — 16 rôles (dont rôles institutionnels à MFA obligatoire), permissions resource:action, synchronisation backend/frontend/doc, contrôle d'appartenance, isolation tenant. À utiliser pour ajouter/modifier une permission, un rôle, une garde de route, ou pour auditer les autorisations.
---

# RBAC & multi-tenancy

## Sources (ordre d'autorité)

1. `backend/app/core/security.py` — `ROLE_PERMISSIONS`, `PRIVILEGED_ROLES`,
   `SENSITIVE_PERMISSIONS`, `require_permission`, `user_has_permission`. **Fait autorité.**
2. `docs/PERMISSIONS_MATRIX.md`, `docs/INSTITUTIONAL_ROLES.md` — documentation.
3. `src/lib/permissions.ts` — miroir d'affichage (noms parfois différents).

Lire la version actuelle du code : la liste ci-dessous est un repère, pas une copie.

## Rôles

- Établissement : TENANT_ADMIN, DIRECTOR, DEPARTMENT_HEAD, TEACHER, STAFF,
  ACCOUNTANT, SECRETARY, STUDENT, PARENT, ALUMNI.
- Plateforme (`tenant_id = NULL`) : SUPER_ADMIN (`"*"`), MINISTRY_ADMIN, NATIONAL_INSPECTOR.
- Tutelle territoriale : REGIONAL_DIRECTOR, PREFECTURE_ADMIN, COMMUNE_ADMIN
  (périmètre géographique appliqué dans `endpoints/core/ministry.py`).
- MFA obligatoire : tout rôle de `PRIVILEGED_ROLES`.

## Mécanique

- Permission = `resource:action` ; `resource:*` et `*` sont des jokers.
- `require_permission(p)` → 403 si non accordé ; 503 fail-closed si `p` est
  sensible et que la révocation n'a pas pu être vérifiée.
- La permission **ne suffit pas** : il faut aussi le tenant (`resolve_current_tenant_id`)
  et, pour les rôles personnels, l'appartenance (parent ↔ enfant, enseignant ↔ classe,
  élève ↔ lui-même, chef de département ↔ son département).
- SUPER_ADMIN peut cibler un tenant via `X-Tenant-ID` ; personne d'autre.

## Ajouter / modifier une permission (changement important)

1. Plan : rôles concernés, routes concernées, effet sur l'UI, risques d'élévation.
2. `ROLE_PERMISSIONS` (backend) — ajouter aux rôles minimaux nécessaires (moindre privilège).
3. Sensible ? → `SENSITIVE_PERMISSIONS`.
4. `src/lib/permissions.ts` — permission(s) d'affichage correspondante(s).
5. `docs/PERMISSIONS_MATRIX.md` — ligne mise à jour.
6. Tests backend : rôle autorisé 2xx, rôle non autorisé 403, autre tenant 403/404,
   et pour les rôles personnels, ressource d'autrui refusée.
7. Vérifier les alias (`aliases.py`) et les routes jumelles.

## Audit RBAC (procédure)

- Lister les routes du périmètre (`grep -n "@.*router\.\(get\|post\|put\|patch\|delete\)"`).
- Pour chacune : permission ? tenant ? appartenance ? alias ? test existant ?
- Routes avec seulement `get_current_user` : justifier (profil, préférences) ou signaler.
- Accès direct `current_user["tenant_id"]` : signaler.
- Comparer les permissions utilisées côté UI (`can("...")`) avec celles du backend
  pour la même action.
- Sortie : tableau `route | permission | tenant | appartenance | test | verdict`.

Les tests de référence du dépôt (`backend/tests/test_*authorization*.py`,
`test_*idor*.py`, `test_tenant_isolation.py`, `test_permissions_sweep_*.py`)
montrent les motifs attendus.
