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
aucun changement nécessaire) : **Journaux d'audit** (`audit.py`),
**Imports/Exports** (`imports.py` — templates de téléchargement
délibérément ouverts, preview/confirm gatés sur `students:write`/
`users:write`), **departments.py** (auto-scopé par appartenance au
département, pas de `require_permission` mais pas de fuite non plus).

> ⚠️ **Faux positif corrigé (2026-09), même défaut méthodologique que pour
> `subjects`/DEPARTMENT_HEAD ci-dessus** : **Finance/Paiements/Factures**
> avaient été marqués "sains" ici en vérifiant que chaque endpoint avait
> bien un `require_permission(...)`, sans vérifier lequel exactement ni si
> les rôles que le frontend expose s'alignaient dessus. En réalité :
> `AdminLayout.tsx` affiche à **DIRECTOR** le lien "Finances" (permission
> frontend `fees:read`, bien accordée), qui appelle `useFees` →
> `GET /payments/fees/` → gardé côté backend par `payments:read`
> (`payments.py::list_fees`) — que DIRECTOR n'a jamais eu dans
> `ROLE_PERMISSIONS` (seulement `finance:read`, une chaîne **jamais
> vérifiée nulle part** dans le backend : `grep -rn 'require_permission("finance'
> backend/app/` ne renvoie rien). Un DIRECTOR qui clique sur son propre
> lien "Finances" obtenait un 403. **Corrigé** en ajoutant `payments:read`
> (lecture seule, comme le frontend) au rôle DIRECTOR dans
> `backend/app/core/security.py`. Testé : `test_director_can_list_fees` /
> `test_director_cannot_create_fee`
> (`backend/tests/test_director_finance_read_access.py`), le second
> confirmant qu'aucun droit d'écriture n'a été accordé en trop.
> ACCOUNTANT (déjà `payments:read`/`write` mais pas `invoices:*`/`fees:*`
> explicitement) reste correct dans les faits : ces deux permissions ne
> sont vérifiées nulle part non plus, `payments:*` couvre déjà tous les
> endpoints réels de factures/frais (`aliases.py`, `payments.py`).

Méthodologie retenue pour la suite : ne jamais se fier à la seule présence
de `require_permission(...)` — vérifier aussi (1) que le jeu de rôles
qu'il autorise correspond à ce que montre le frontend, et (2) pour tout
endpoint prenant un identifiant en paramètre (`student_id`, `message_id`,
`conversation_id`...), qu'il existe une vérification de propriété/
participation quand le rôle appelant n'est pas un rôle "staff" à accès
large. Écrire les tests de régression contre PostgreSQL réel (pas
seulement SQLite, où plusieurs tables opérationnelles n'existent même
pas) — c'est ce qui a révélé les deux bugs fonctionnels d'alumni.py.

## Balayage complet de la navigation admin (2026-09) — 3 bugs de plus, même famille

Suite directe de la correction Finance/DIRECTOR ci-dessus : chaque élément
de `AdminLayout.tsx` tracé jusqu'à son endpoint backend réel (pas juste
comparaison de noms), avec un focus sur les rôles à permissions étroites
(DIRECTOR, DEPARTMENT_HEAD, STAFF, SECRETARY, ACCOUNTANT, TEACHER — les
rôles où ce genre de trou apparaît, SUPER_ADMIN/TENANT_ADMIN ayant
quasiment tout). 3 nouveaux 403-sur-son-propre-lien confirmés et corrigés :

- **DIRECTOR** sur `/admin/schedule` (`schedule:read` frontend accordé,
  mais `GET /schedule/` exige `schedule:read` côté backend — absent) et
  sur `/admin/elearning` (`homework:read` frontend accordé, mais
  `GET /analytics/elearning/courses/`+`.../enrollments/` exigent
  `homework:read` côté backend — absent).
- **DEPARTMENT_HEAD** sur `/admin/enrollments` (`enrollments:read`
  frontend, `GET /enrollments/` exige `enrollments:read` backend —
  absent) et sur `/admin/elearning` (même bug que DIRECTOR ci-dessus).
- **STAFF** sur `/admin/enrollments` (même bug que DEPARTMENT_HEAD ;
  `enrollments:write` ajouté aussi car le frontend accorde à STAFF
  `enrollments:create/update/manage`, impliquant des actions d'écriture
  sur cette même page).

**Corrigé** : `schedule:read`/`write` + `homework:read` ajoutés à DIRECTOR ;
`homework:read` + `enrollments:read` ajoutés à DEPARTMENT_HEAD ;
`enrollments:read`/`write` ajoutés à STAFF (`backend/app/core/security.py`).
Testé : `backend/tests/test_permissions_sweep_2026_09.py` (5 tests,
chacun confirmé 403 avant le fix / 200 après en repassant temporairement
sur l'état pré-correctif).

**Reste du balayage, confirmé sain** : `admissions:read`, le groupe
`students:read` (élèves/listes de classe/gamification/carrières),
`teachers:read` (en réalité `users:read`), `grades:read`/`report_cards:read`,
`academic_years:manage`/`terms:manage`/`faculties:manage`/`departments:read`/
`rooms:read` côté DIRECTOR, `users:read` (alumni/utilisateurs),
`users:update` sur `/admin/hr` (en réalité `hr:read`/`write`) —
tous cohérents de bout en bout entre les deux vocabulaires.

**Une trouvaille corrigée dans le même correctif, hors de la famille
403 ci-dessus** : `/admin/data-import` était gaté sur
`permission: "students:write"` dans `AdminLayout.tsx`, une valeur qui
**n'existe dans aucun rôle** de `src/lib/permissions.ts` (probable faute
de frappe pour `students:import`, la valeur réellement accordée à
SUPER_ADMIN/TENANT_ADMIN/DIRECTOR/STAFF) — ce lien était donc invisible
pour **tous les rôles**, y compris TENANT_ADMIN/SUPER_ADMIN. Pas un 403
(personne ne pouvait même cliquer dessus), mais un lien mort. Corrigé en
remplaçant par `students:import`.

**`/admin/teacher-hours` traité séparément (2026-09-24)** : `GET`/`POST
/hr/teacher-work-hours/` n'existaient nulle part dans le backend — un 404
pour tous les rôles, pas une divergence de permission — et la table
`teacher_work_hours` elle-même n'existait pas non plus :
`academic/departments.py::department_teachers` la référence déjà en SQL
brut pour un total d'heures mensuel et aurait 500 dès sa première exécution
réelle, et `analytics.py` mockait `total_teacher_hours`/`active_teachers`
à 0 avec un commentaire explicite notant l'absence de la table. Corrigé :
table ajoutée (`app/core/operational_tables.py`, RLS automatique via le
sweep générique), endpoints `GET`/`POST /hr/teacher-work-hours/` ajoutés
(`hr.py`), gatés sur un nouveau couple `teacher_progress:read`/`write`
plutôt que sur `hr:read`/`write` (le frontend accorde déjà
`teacher_progress:read` à TENANT_ADMIN/DIRECTOR/DEPARTMENT_HEAD/STAFF/
SECRETARY pour ce nav item — réutiliser `hr:read` aurait aussi donné à
DEPARTMENT_HEAD l'accès aux fiches de paie et contrats de tout le
personnel, hors de son périmètre). Testé :
`backend/tests/test_teacher_work_hours.py` (8 tests, Postgres réel).

**`/admin/bookings` traité séparément (2026-09-24)** : `GET`/`POST
/school-life/bookable-resources/` et `.../bookings/` — même famille de 404
que teacher-hours ci-dessus. Corrigé : tables `bookable_resources`/
`bookings` ajoutées (RLS automatique via le sweep générique), endpoints
CRUD + vérification d'anti-chevauchement ajoutés (`school_life.py`), gatés
sur `school_life:read`/`write` — déjà accordé à TENANT_ADMIN/TEACHER, mais
manquant à DIRECTOR/DEPARTMENT_HEAD/SECRETARY alors que le frontend leur
accorde déjà `rooms:read` pour ce même nav item (`src/lib/permissions.ts`).
Testé : `backend/tests/test_bookings.py` (12 tests, Postgres réel,
incluant le rejet 409 d'un créneau déjà réservé).

**Nouveau balayage complet d'AdminLayout.tsx (2026-09-25)**, même méthode,
limité aux 6 rôles qui atteignent réellement ce layout
(`src/App.tsx` : SUPER_ADMIN/TENANT_ADMIN/DIRECTOR/STAFF/ACCOUNTANT/
SECRETARY) — 3 nouvelles instances trouvées, DIRECTOR ayant déjà été
corrigé pour schedule dans `test_permissions_sweep_2026_09.py` mais pas
STAFF/SECRETARY qui ont pourtant le même droit frontend :

- **STAFF, SECRETARY** sur `/admin/schedule` (frontend `schedule:read`) :
  `GET /schedule/` exige `schedule:read` côté backend, absent des deux
  rôles. Corrigé (`schedule:read`/`write` ajoutés aux deux).
- **STAFF** sur `/admin/scan` (scanner QR de présence, frontend
  `attendance:read`) : la vraie action de la page, `POST
  /school-life/check-ins/`, est gardée par `school_life:write`
  (`_can_access_checkin_for_student()`, `school_life.py`) — STAFF n'avait
  ni `school_life:read` ni `school_life:write`, donc chaque scan échouait
  en 403 malgré la page visible. Corrigé (`school_life:read`/`write`
  ajoutés à STAFF).
- **STAFF, ACCOUNTANT, SECRETARY** sur `/admin/analytics`,
  `/admin/decision-support`, `/admin/ministry-reporting` (frontend
  `dashboard:admin`) : tous les appels KPI (`analytics.py`) exigent
  `analytics:read`, qu'aucun des trois rôles n'avait. La page
  `/admin` (tableau de bord standard) utilise le même `dashboard:admin`
  mais dégrade silencieusement (fallback à 0 dans `src/queries/
  dashboard.ts`) — symptôme plus discret du même trou, mentionné pour
  mémoire mais non bloquant. Corrigé (`analytics:read` ajouté aux trois
  rôles).

Balayage exhaustif du reste des nav items d'AdminLayout (Levels,
AcademicYears, Terms, Campuses, Classrooms, Programs, Faculties,
Semesters, Departments, Certificates, Finances/AccountingExports,
Inventory/Orders, Announcements, Security/AuditLogs, AdvancedExports,
DataImport, HumanResources, Users/Teachers, AlumniMentors/Requests,
Bookings, Events/Clubs/Badges, Messages, KioskDevices/PublicPages/
DataQuality) confirmé sain pour ces 6 rôles — aucune autre divergence
frontend/backend trouvée, et aucun permission frontend orpheline (repeat
du bug `students:write`/`students:import`). Testé :
`backend/tests/test_permissions_sweep_2026_09_25.py` (6 tests, Postgres
réel, chacun confirmé 403 avant le fix / 200 après en repassant
temporairement sur l'état pré-correctif).

## Balayage des interfaces TEACHER/STUDENT/PARENT/ALUMNI (2026-09-26)

Suite directe du balayage d'AdminLayout ci-dessus : ces 5 interfaces
(`DepartmentLayout`, `TeacherLayout`, `StudentLayout`, `ParentLayout`,
`AlumniLayout`, plus un contrôle de `SuperAdminLayout`) ne gatent pas
leurs liens sur une chaîne de permission frontend comme AdminLayout —
l'accès à la page est purement basé sur le rôle (`ProtectedRoute
allowedRoles=[...]`, `src/App.tsx`). Le bug de cette famille prend donc
une forme différente : la page, visible pour le rôle, appelle un
endpoint backend qui soit n'existe pas du tout (404), soit manque une
vérification de propriété. 4 bugs confirmés et corrigés :

- **TEACHER** sur `/teacher/session-attendance` ("Badges", le scanner QR
  de présence) : `POST .../check-ins/sessions/start/`, `PATCH
  .../sessions/{id}/end/` et `GET .../check-ins/badges/?qr_code_data=...`
  n'existaient nulle part — la fonctionnalité entière (démarrer une
  session, scanner un badge, la terminer) était un 404 à chaque étape.
  Corrigé : les deux endpoints de cycle de vie de session ajoutés
  (`school_life.py`), colonnes `subject_id`/`start_time`/`end_time`
  ajoutées à `check_in_sessions` (`operational_tables.py`, migration
  additive), et un nouvel endpoint de résolution de badge ajouté — à ne
  pas confondre avec `GET /school-life/badges/`, qui liste des badges de
  gamification sans rapport ; le vrai identifiant scannable est
  `students.card_uid` (déjà utilisé par le flux kiosque,
  `kiosk.py::kiosk_scan`).
- **STUDENT** sur `/student/careers` (onglet Mentors) : le frontend
  appelait `GET /alumni/admin/mentorship-requests/` — l'endpoint
  **admin**, gardé sur `users:read`, que STUDENT n'a jamais — pour
  afficher ses propres demandes de mentorat. 403 sur sa propre page.
  Corrigé côté frontend uniquement (`studentsService.ts`) : appel du
  point d'entrée self-scopé existant `GET /alumni/mentorship-requests/`,
  qui ignore déjà tout `student_id` fourni par le client et se limite à
  l'appelant.
- **PARENT** sur `/parent/messages` et `/parent/appointments` : les deux
  pages appelaient chacune un endpoint différent (`/parents/children-
  teachers/` et `/parents/teachers/` respectivement) — aucun des deux
  n'existait. Sur Messages, l'échec était silencieux (avalé par un
  try/catch retournant `[]`) : un parent ne pouvait jamais voir un seul
  enseignant à qui écrire. Sur Appointments, le sélecteur d'enseignant
  restait vide. Corrigé par un unique nouvel endpoint `GET /parents/
  children-teachers/` (scopé aux enseignants des classes des propres
  enfants de l'appelant, via `teacher_assignments` joint sur les
  inscriptions actives — même schéma de jointure que
  `departments.py::department_teachers`), et les deux pages pointées
  dessus.
- **ALUMNI** (faille de sécurité) sur `GET /alumni/document-requests/
  {id}/history/` : la vérification de propriété acceptait `tenant_id =
  :tenant_id` comme alternative à la possession de la demande — ce qui
  admet N'IMPORTE QUEL utilisateur authentifié du tenant (un autre
  ALUMNI, un STUDENT, un PARENT...), pas seulement le personnel, malgré
  le commentaire du code affirmant l'inverse. Un utilisateur curieux
  pouvait lire l'historique d'actions (changements de statut, notes de
  validation) de la demande de document d'un autre alumnus. Corrigé :
  la vérification alternative est maintenant `user_has_permission(...,
  "users:read")`, la permission que le commentaire décrivait réellement.

Testé : `backend/tests/test_teacher_student_parent_alumni_2026_09_26.py`
(10 tests, Postgres réel, chacun confirmé en échec avant le fix — sauf
les 3 cas déjà sains par construction — puis en succès après) et
`src/features/students/services/__tests__/studentsService.test.ts`
(2 nouveaux tests couvrant le bon point d'entrée appelé).

**Hors périmètre de ce correctif, mis en tâche de suivi séparée** :
`/department/reports`, `/department/alerts-history` et une partie de
`/department/calendar` (DEPARTMENT_HEAD) appellent des endpoints
`/department-portal/members/`, `/department-portal/reports/stats/` et
`/department-portal/alerts/*` qui n'existent nulle part — une
fonctionnalité d'alertes entière à concevoir, pas un simple ajout de
permission (toujours en attente).

## Rattachement des check-ins QR à leur session (2026-09-26)

Suite du correctif TEACHER/STUDENT/PARENT/ALUMNI ci-dessus (PR #236) :
le scanner QR (`ClassSessionAttendance.tsx`) envoyait et lisait déjà un
`session_id` sur chaque check-in, mais `student_check_ins` (un vrai
modèle ORM, contrairement à `check_in_sessions` qui est une table
opérationnelle en SQL brut) n'avait pas cette colonne — Pydantic
ignorait silencieusement le champ à l'écriture, et la requête de lecture
l'ignorait aussi. Chaque check-in était donc enregistré sans lien avec
sa session, et le compteur "présents" affiché pour une session en cours
incluait en réalité tous les check-ins jamais faits pour le tenant.

Corrigé par une migration Alembic additive (`20260926_0001`, colonne
nullable, sans contrainte de clé étrangère vers `check_in_sessions` — ce
tableau opérationnel est créé au démarrage de l'application, pas par
Alembic, donc une FK au niveau base de données créerait un risque
d'ordre d'exécution ; la relation reste appliquée au niveau applicatif
uniquement), le modèle/schéma/CRUD/endpoint mis à jour en conséquence.
Aucun changement frontend nécessaire (le scanner envoyait déjà le bon
champ). Testé :
`backend/tests/test_check_in_session_scoping_2026_09_26.py` (2 tests,
PostgreSQL réel, confirmés en échec avant le correctif puis en succès
après ; migration testée dans les deux sens — upgrade et downgrade —
sur une base entièrement neuve).

## Construction du backend Rapports/Alertes du chef de département (2026-09-26)

Dernier point laissé en suspens par le balayage TEACHER/STUDENT/PARENT/
ALUMNI (PR #236) : les pages "Rapports & Statistiques" et "Historique
des Alertes" de DEPARTMENT_HEAD (`/department/reports`,
`/department/alerts-history`, et une partie de `/department/calendar`)
appelaient des endpoints qui n'existaient nulle part — `GET
/department-portal/members/`, `GET .../reports/stats/`, `POST
.../alerts/send/`, `POST .../alerts/` et `GET .../alerts/`. Contrairement
au reste de l'audit, ce n'était pas un simple oubli de permission mais
une fonctionnalité jamais construite côté serveur.

Construit à partir des données déjà exposées par ce routeur
(`teacher_assignments`, `enrollments`, `attendance`, `grades`, `exams`,
`classroom_departments`) plutôt qu'un nouveau système :

- `GET /members/` : résout le département de l'appelant, dans la forme
  `[{department_id, departments: {...}}]` que les 3 pages attendent
  depuis toujours — tout `user_id`/`tenant_id` fourni par le client est
  ignoré, comme sur chaque endpoint de ce routeur.
- `GET /reports/stats/` : agrège effectifs, présences (globales et par
  classe), moyenne des notes, examens et enseignants pour la période et
  les classes demandées — les `class_ids` fournis par le client sont
  croisés avec les classes réelles du département de l'appelant
  (`_get_department_classroom_ids`), jamais utilisés tels quels.
- `POST /alerts/send/` : envoie l'alerte par email **au chef de
  département appelant lui-même** via `EmailSender` (le service déjà
  utilisé pour les alertes de plateforme et les rappels de paiement) —
  `departmentId`/`tenantId` envoyés par le frontend sont ignorés,
  re-dérivés de la session authentifiée ; répond `email_sent: false`
  sans erreur si aucun fournisseur d'email n'est configuré (même
  convention que l'alerte de santé plateforme existante).
- `POST /alerts/` / `GET /alerts/` : persistent et listent l'historique
  dans une nouvelle table opérationnelle `department_alerts`, strictement
  scopée au département de l'appelant.

**Bug préexistant découvert au passage, hors périmètre de ce correctif
(tâche de suivi séparée)** : `GET /department-portal/attendance/`
(page "Présences" du chef de département, déjà existante) interroge la
table `attendance` avec des noms de colonnes (`class_id`, `notes`) qui
n'existent pas sur la table réelle (`classroom_id`, `reason`) — cet
endpoint plante très probablement en 500 sur PostgreSQL réel. Non corrigé
ici pour ne pas élargir le périmètre de ce correctif.

Testé :
`backend/tests/test_department_alerts_and_reports_2026_09_26.py`
(7 tests, PostgreSQL réel, isolation entre départements vérifiée
explicitement pour les statistiques et l'historique d'alertes ; chacun
confirmé en échec avant le correctif puis en succès après).

## Correction de `GET /department-portal/attendance/` (2026-09-26)

Bug trouvé au passage lors de la construction du backend Rapports/Alertes
ci-dessus, corrigé séparément comme annoncé : cet endpoint (page "Suivi
des présences" du chef de département, déjà existante) interrogeait la
table `attendance` réelle avec des noms de colonnes (`a.class_id`,
`a.notes`) qui n'existent pas dessus — les vraies colonnes sont
`classroom_id` et `reason` (`app/models/attendance.py`). Chaque appel
levait `UndefinedColumn` et renvoyait un 500 sur PostgreSQL réel ; ce
défaut ne se voyait pas sur la suite de tests SQLite par défaut, d'où son
passage inaperçu. Corrigé en alignant les deux occurrences de `class_id`
sur `classroom_id` et `notes` sur `reason`, en conservant `notes` comme
nom de champ dans la réponse JSON (c'est ce que `DeptAttendanceRecord`/
`DepartmentAttendance.tsx` attendent déjà côté frontend — aucun
changement frontend nécessaire).

Testé :
`backend/tests/test_department_attendance_column_fix_2026_09_26.py`
(2 tests, PostgreSQL réel, confirmés en échec — 500 — avant le correctif
puis en succès après, y compris avec le filtre `classroom_id`).
