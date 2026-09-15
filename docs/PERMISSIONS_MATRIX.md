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

## Rôles

Les 11 rôles définis côté backend (`ROLE_PERMISSIONS` dans
`backend/app/core/security.py`), tous repris à l'identique côté frontend
(`src/lib/permissions.ts`) :

`SUPER_ADMIN`, `TENANT_ADMIN`, `DIRECTOR`, `DEPARTMENT_HEAD`, `TEACHER`,
`STUDENT`, `PARENT`, `ALUMNI`, `STAFF`, `ACCOUNTANT`, `SECRETARY`.

`SUPER_ADMIN` a `"*"` côté backend (toutes permissions, `tenant_id` NULL,
niveau plateforme). Tous les autres rôles sont scopés à un tenant.

## Pages & endpoints concernés (zones auditées)

| Zone | Pages frontend | Endpoints backend |
|---|---|---|
| Onboarding | `src/components/onboarding/OnboardingWizard.tsx`, `SchoolWizard.tsx` | `POST /tenants/onboarding/levels/`, `POST /tenants/onboarding/subjects/`, `PATCH /tenants/onboarding/complete/` |
| Settings | `src/pages/admin/Settings.tsx`, `src/components/settings/SecuritySettings.tsx` | `GET/PATCH /tenants/settings/`, `GET/PATCH /tenants/security-settings/`, `GET/PATCH /tenants/men-guinea/`, `GET /tenants/men-guinea/rapport/` |
| Levels | `src/pages/admin/Levels.tsx` | `GET/POST/PATCH/DELETE /levels/` |
| Subjects | `src/pages/admin/Subjects.tsx` | `GET/POST/PATCH/DELETE /subjects/` |

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
| **DEPARTMENT_HEAD** | `subjects:read`, `subjects:write` | `subjects:manage` | ⚠️ **Faux positif corrigé (2026-09)** — voir note ci-dessous. |
| TEACHER | `subjects:read` | pas de `subjects:manage` (lecture implicite via pages qui vérifient `subjects:read`) | ✅ |
| ALUMNI | `subjects:read` | pas de mapping frontend dédié | ✅ (pas de page Subjects exposée aux alumni) |

> ⚠️ **Correction méthodologique (institutional-readiness audit, 2026-09)** :
> la ligne DEPARTMENT_HEAD ci-dessus était marquée ✅ en comparant uniquement
> les *noms* de permission entre les deux fichiers — sans vérifier laquelle
> l'endpoint réel (`backend/app/api/v1/endpoints/academic/subjects.py`)
> vérifiait vraiment. En réalité, ce routeur contrôlait `settings:write` sur
> tous ses endpoints d'écriture, jamais `subjects:write` — un fait invisible
> à un audit qui ne compare que les deux `ROLE_PERMISSIONS`. Résultat concret :
> DEPARTMENT_HEAD avait bien `subjects:write` dans `ROLE_PERMISSIONS`
> (permission jamais vérifiée par aucun endpoint — morte), mais seulement
> `settings:read` (pas `settings:write`) — donc son bouton "modifier une
> matière", pourtant affiché par le frontend, retournait 403 à chaque clic.
> **Corrigé** en changeant les 5 vérifications d'écriture de `subjects.py`
> vers `subjects:write` (les lectures restent sur `settings:read`,
> volontairement non modifiées — voir le commentaire en tête de ce fichier).
> Testé : `test_department_head_can_write_subjects` et
> `test_teacher_still_cannot_write_subjects` (`backend/tests/test_tenant_isolation.py`).
> **Leçon pour les audits futurs** : comparer les noms de permission entre
> frontend et backend ne suffit pas — il faut tracer jusqu'à l'endpoint réel
> pour savoir quelle chaîne `require_permission(...)` compte vraiment.

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

## Audit institutionnel 2026-09 — modules couverts

Suite de l'audit initial (onboarding/settings/levels/subjects), même
méthode appliquée à chaque module de la liste "À auditer ensuite"
ci-dessous. Vraies failles trouvées et corrigées :

- **RH** (PR #159, **P0**) — `hr.py` : tous les endpoints RH/paie/contrats/
  congés ne dépendaient que de `get_current_user()`, aucune permission —
  n'importe quel utilisateur authentifié du tenant pouvait lire/modifier
  les données RH de tout le monde. Corrigé avec `require_permission
  ("hr:read"/"hr:write")`.
- **Messages** (PR #160, #165) — `communication.py` : création/suppression
  d'annonces ouvertes à tout rôle (#160) ; réactions aux messages
  consultables/ajoutables hors de la conversation d'appartenance, sans
  vérification de participation (#165).
- **Bulletins** (PR #162) — `school_life.py::generate_smart_report_card` :
  un élève/parent authentifié pouvait consulter le bulletin de n'importe
  quel autre élève via un `student_id` arbitraire.
- **Parents** (PR #163) — `parents.py` : `GET /parents/` (annuaire complet :
  nom, email, téléphone, adresse, enfants liés) sans aucune permission ;
  `GET /parents/students/{id}/parents/` sans vérification de propriété
  pour le rôle PARENT.
- **Enseignants** — `teachers.py` : gate sur `settings:write` au lieu d'un
  nom de permission dédié, mais même ensemble de rôles au final
  (TENANT_ADMIN/DIRECTOR) que ce qu'attend le frontend — pas de vraie
  faille, juste un nommage incohérent, laissé tel quel.
- **Élèves** — `students.py` : sain (chaque endpoint sur `students:read`/
  `students:write` ; les 2 endpoints self-scopés — dashboard, contacts
  de messagerie — n'exposent que les données du user courant).
- **Alumni** (module découvert en creusant "Messages"/"Élèves", pas dans
  la liste initiale) (PR #164) — `alumni.py` : `student_id` fourni par le
  client faisait autorité pour lire/écrire les candidatures et demandes
  de mentorat d'un autre élève ; deux bugs fonctionnels préexistants
  découverts en testant contre PostgreSQL réel (contrainte `ON CONFLICT`
  manquante bloquant 100% des candidatures, colonne `goals` inexistante
  cassant silencieusement la liste des demandes de mentorat).

Modules vérifiés sains (déjà correctement gatés `require_permission`,
aucun changement nécessaire) : **Finance**, **Paiements**, **Factures**,
**Journaux d'audit** (`audit.py`), **Imports/Exports** (`imports.py` —
templates de téléchargement délibérément ouverts, preview/confirm gatés
sur `students:write`/`users:write`), **departments.py** (auto-scopé par
appartenance au département, pas de `require_permission` mais pas de
fuite non plus).

Méthodologie retenue pour la suite : ne jamais se fier à la seule présence
de `require_permission(...)` — vérifier aussi (1) que le jeu de rôles
qu'il autorise correspond à ce que montre le frontend, et (2) pour tout
endpoint prenant un identifiant en paramètre (`student_id`, `message_id`,
`conversation_id`...), qu'il existe une vérification de propriété/
participation quand le rôle appelant n'est pas un rôle "staff" à accès
large. Écrire les tests de régression contre PostgreSQL réel (pas
seulement SQLite, où plusieurs tables opérationnelles n'existent même
pas) — c'est ce qui a révélé les deux bugs fonctionnels d'alumni.py.
