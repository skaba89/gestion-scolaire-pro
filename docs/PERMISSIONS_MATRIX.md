# Matrice des permissions — Onboarding, Settings, Levels, Subjects

Ce document existe parce que le backend et le frontend utilisent deux
vocabulaires de permissions différents, gérés dans deux fichiers séparés,
sans validation croisée automatique :

- Backend : `backend/app/core/security.py` → `ROLE_PERMISSIONS`, granularité
  `read` / `write` / `delete` par ressource (ex. `levels:write`).
- Frontend : `src/lib/permissions.ts` → `ROLE_PERMISSIONS`, granularité
  `read` / `manage` par ressource (ex. `levels:manage`), utilisé pour
  afficher/masquer les boutons et sections de l'UI.

Les deux ne partagent aucun code — un ajout de rôle ou de permission d'un
côté peut silencieusement désynchroniser l'autre. Ce document capture l'état
actuel constaté par lecture directe des deux fichiers (pas une spec — un
audit), pour les 4 zones prioritaires demandées : onboarding, settings,
levels, subjects.

## Convention de mapping

| Frontend (`manage`) | Backend équivalent le plus proche |
|---|---|
| `X:read` | `X:read` |
| `X:manage` | `X:write` **et** implicitement `X:delete` là où le backend a un `DELETE` (le frontend n'a pas de notion `delete` séparée pour ces 4 ressources) |
| *(absent)* | `X:import`, `X:export` — n'existent sur aucune des 4 ressources auditées ici |

`manage` n'est donc pas un simple alias de `write` : côté frontend il
recouvre write+delete pour une même ressource, alors que le backend garde
ces deux permissions distinctes. Aucune des 4 ressources auditées n'a de
permission `delete` dédiée côté backend (`levels`, `subjects`, `settings`,
onboarding) — `manage` == `write` en pratique ici.

## Onboarding (`POST /tenants/onboarding/levels/`, `/subjects/`, `PATCH /onboarding/complete/`)

| Rôle | Backend | Frontend | Cohérent ? |
|---|---|---|---|
| SUPER_ADMIN | `*` (tout) | toutes | ✅ |
| TENANT_ADMIN | `levels:write`, `subjects:write`, `settings:write` | `levels:manage`, `subjects:manage`, `settings:manage` | ✅ |
| Autres rôles | aucun accès onboarding | pas de route onboarding exposée | ✅ (onboarding n'est routé que pour TENANT_ADMIN/SUPER_ADMIN côté frontend) |

Pas d'incohérence constatée sur l'onboarding lui-même — les 3 endpoints
utilisent `require_permission("levels:write" | "subjects:write" |
"settings:write")`, exclusivement accordés à TENANT_ADMIN et SUPER_ADMIN.

## Settings (`GET/PATCH /tenants/settings/`, `/security-settings/`, `/men-guinea/`)

| Rôle | Backend | Frontend | Cohérent ? |
|---|---|---|---|
| SUPER_ADMIN | `*` | `settings:manage`, `tenant:manage` | ✅ |
| TENANT_ADMIN | `settings:read`, `settings:write` | `settings:manage`, `tenant:manage` | ✅ |
| DIRECTOR | `settings:read`, `settings:write` | `settings:read` seulement (pas `settings:manage`) | ⚠️ Le frontend reste **plus restrictif** que le backend sur les paramètres généraux : DIRECTOR peut PATCH `/tenants/settings/` via l'API mais l'UI ne lui montre aucun bouton d'édition. Pas un risque de sécurité, juste une fonctionnalité backend inutilisée — laissé tel quel. |
| DEPARTMENT_HEAD, TEACHER, STUDENT, PARENT, STAFF, ACCOUNTANT, SECRETARY | `settings:read` uniquement | pas de mapping `settings:*` dans leur liste frontend (accès implicitement lecture seule via les pages qui vérifient `settings:read`) | ✅ |

## Levels (`/admin/levels`, `POST/PATCH/DELETE .../levels/`)

| Rôle | Backend | Frontend | Cohérent ? |
|---|---|---|---|
| SUPER_ADMIN | `*` | `levels:manage` | ✅ |
| TENANT_ADMIN | `levels:read`, `levels:write` | `levels:manage` | ✅ |
| **DIRECTOR** | `levels:read`, `levels:write` ✅ (corrigé) | `levels:manage` | ✅ **Corrigé** — `levels:read`/`levels:write` ajoutés au rôle DIRECTOR dans `backend/app/core/security.py` pour aligner le backend sur ce que l'UI promettait déjà. Testé (`test_director_can_write_levels_and_subjects`). |
| DEPARTMENT_HEAD | aucune permission `levels:*` | aucune permission `levels:*` | ✅ (les deux sont cohérents : DEPARTMENT_HEAD ne gère pas les niveaux) |

## Subjects (`/admin/subjects`, `POST/PATCH/DELETE .../subjects/`)

| Rôle | Backend | Frontend | Cohérent ? |
|---|---|---|---|
| SUPER_ADMIN | `*` | `subjects:manage` | ✅ |
| TENANT_ADMIN | `subjects:read`, `subjects:write` | `subjects:manage` | ✅ |
| **DIRECTOR** | `subjects:read`, `subjects:write` ✅ (corrigé) | `subjects:manage` | ✅ **Corrigé** — même fix que pour `levels`. |
| DEPARTMENT_HEAD | `subjects:read`, `subjects:write` | `subjects:manage` | ✅ |
| TEACHER | `subjects:read` | pas de `subjects:manage` (lecture implicite via pages qui vérifient `subjects:read`) | ✅ |
| ALUMNI | `subjects:read` | pas de mapping frontend dédié | ✅ (pas de page Subjects exposée aux alumni) |

## Résumé des actions

- **Corrigé** : `levels:read`/`write`, `subjects:read`/`write`,
  `academic_years:read`/`write`, `terms:read`/`write`,
  `classrooms:read`/`write` ajoutés au rôle DIRECTOR côté backend
  (`backend/app/core/security.py`) — ces 5 ressources étaient déjà
  promises côté frontend (`*:manage`) mais bloquées en 403 côté API.
  Testé (`backend/tests/test_tenant_isolation.py`).
- **Non corrigé, volontairement** : DIRECTOR reste sans `settings:manage`
  côté frontend malgré `settings:write` côté backend — asymétrie inverse
  (backend plus permissif que l'UI), sans risque de sécurité, laissée telle
  quelle en attendant une décision produit sur si DIRECTOR doit éditer les
  paramètres généraux depuis l'interface.
- Étendre cet audit aux autres modules (finance, RH, communication) dans une
  passe ultérieure si besoin.
