# Préparation à l'échelle nationale (1000+ établissements)

Ce document fait le point réel — pas aspirationnel — sur ce qui est déjà en
place pour supporter une montée en charge à l'échelle d'un déploiement
national, et ce qui reste à valider avant d'y aller. Chaque ligne renvoie à
un fichier ou un test vérifiable ; aucune affirmation ici n'est de confiance
si elle n'est pas backée par du code existant.

## 1. Pagination

Tous les endpoints de liste identifiés dans l'audit national (modules
`operational/` : incidents, inventory, library, communication, school_life,
alumni, clubs, parents, surveys) acceptent `page`/`page_size` avec
`page_size` borné (`le=100` côté FastAPI `Query`) — aucun endpoint ne peut
retourner la base entière sans limite. Vérifié par
`backend/tests/test_operational_pagination.py` (18 tests, contre PostgreSQL
réel avec volumes de données réels).

## 2. Index composites PostgreSQL

Migration `backend/alembic/versions/20260724_0001_operational_composite_indexes.py` :
11 index `(tenant_id, horodatage)` sur les tables à plus fort volume
(incidents, inventory_items, inventory_transactions, orders,
library_resources, announcements, student_forums, student_badges,
career_event_registrations, alumni_document_requests, surveys). Vérifié par
`backend/tests/test_operational_indexes.py` (interroge directement
`pg_indexes`, PostgreSQL uniquement).

Index déjà présents par ailleurs (voir migrations antérieures) :
`tenant_id` seul sur la quasi-totalité des tables, `tenant_id + student_id`
sur grades/attendance/payments, `tenant_id + academic_year_id` sur
assessments/terms.

## 3. Jobs asynchrones

Infrastructure Arq (Redis-backed) en place : `backend/app/core/jobs.py`,
worker dédié (`backend/app/workers/`), service Docker Compose `worker`.
Actuellement utilisé pour l'envoi d'email de bienvenue à l'inscription
(`send_welcome_email`), avec fallback synchrone (`BackgroundTasks`) si la
queue est indisponible — jamais de blocage total. Détails et guide
d'extension : `docs/ASYNC_JOBS_GUIDE.md`.

**Non encore migrés en asynchrone** (retour direct de la requête HTTP
aujourd'hui, à surveiller si le volume grandit) : génération de bulletins en
lot (`generate-report-cards/batch/`), imports Excel volumineux, exports CSV
ministère. Ce sont les candidats naturels pour la prochaine itération de
jobs asynchrones — l'infrastructure existe déjà, il s'agit de brancher ces
handlers dessus, pas de la construire.

## 4. Quotas par plan

`backend/app/middlewares/quota.py` : quotas par tenant sur
`max_students`/`max_teachers`/`max_staff` (lus depuis `tenant.settings.quotas`,
avec valeurs par défaut sinon), appliqués sur les requêtes POST de création.
`max_storage_mb` défini mais son application (upload MinIO) reste à
vérifier/étendre.

## 5. Throttling

Rate limiting par IP (slowapi) déjà en place sur les endpoints sensibles :
login (5/min), logout-all (5/min), bootstrap, reset password, etc. Pas de
throttling par tenant à ce stade (seulement par IP) — à évaluer si un
tenant à fort trafic doit être isolé des autres sur une infrastructure
mutualisée.

## 6. Monitoring par tenant

Middleware `metrics.py` expose des métriques Prometheus, mais pas encore
ventilées par tenant_id — actuellement un agrégat plateforme uniquement.
Point à traiter avant un déploiement à 1000+ tenants pour pouvoir isoler un
tenant bruyant/problématique.

## 7. Backup / restore

Testé et documenté : `docs/BACKUP_SETUP.md`, `docs/DRP_GUIDE.md`, suite
`backend/tests/test_backup_scripts.py` (atomicité, checksum, non-publication
en cas d'échec pg_dump, rotation, restauration en mode vérification par
défaut). Ces tests échouent actuellement en environnement Windows local
(limitation `tmp_path` de pytest sur ce poste, sans rapport avec la logique
testée) — à revalider en CI Linux avant industrialisation.

## 8. Import Excel massif

Existant (`backend/app/api/v1/endpoints/core/imports.py`) mais synchrone —
candidat prioritaire pour la bascule en job asynchrone si des écoles
importent des milliers d'élèves d'un coup lors de l'onboarding.

## Verdict

Les fondations techniques de la scalabilité (pagination, index, quotas,
throttling, jobs async pour au moins un cas d'usage) sont posées et
vérifiées. Ce qui manque avant un vrai déploiement à 1000+ établissements
n'est pas architectural mais opérationnel : brancher les gros consommateurs
(bulletins en lot, imports, exports) sur l'infrastructure de jobs déjà
existante, et ventiler le monitoring par tenant.
