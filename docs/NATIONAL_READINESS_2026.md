# Audit national — Mise à jour (2026-09)

**Base** : `docs/NATIONAL_AUDIT_PHASE0.md` (2026-07-24), mis à jour une première fois à `7cb4db9`.
**Objet** : deuxième passe — vérifie, constat par constat et fichier à l'appui, l'effet des 5 PR lancées depuis la première mise à jour de ce document, plus un audit de pagination (aucune PR, recherche seule). Sur `main` après merge de #204 (module université), #206 (TOTP), #207 (NATIONAL_INSPECTOR), #208 (PDF bulletins), #209 (import CSV asynchrone), #211 (import CSV asynchrone étendu aux parents/enseignants), #212 (PDF serveur pour les attestations).

---

## 1. Ce qui a changé depuis la dernière mise à jour

| # | Constat | Statut | Preuve |
|---|---|---|---|
| P0-1 | Fenêtre RLS non protégée | ✅ **Résolu** (inchangé) | Voir mise à jour précédente. |
| P0-2 | Aucune queue de jobs asynchrones | ✅ **Résolu pour les imports** | Import CSV élèves (#209), puis parents et enseignants (#211), tous migrés vers Arq avec repli synchrone — pattern "polling" (`GET /import/jobs/{id}/`) documenté dans `docs/ASYNC_JOBS_GUIDE.md`, logique de ligne partagée dans `app/services/{student,parent,teacher}_import.py`. Reste synchrone : génération de bulletins en masse (`generate-report-cards/batch/`), exports Excel/comptables, rapports ministère — pas encore de demande produit dessus. |
| P1-1 | Bulletins générés uniquement côté client (jsPDF) | ✅ **Résolu (2 documents)** | `POST /school-life/generate-report-card/pdf/` (#208, bulletins) et `POST /school-life/generate-certificate/pdf/` (#212, attestations de scolarité/fréquentation/niveau) rendent un vrai fichier PDF via WeasyPrint, chacun réutilisant exactement les mêmes données/autorisations que son endpoint HTML/print existant — pas un second template divergent. #212 a aussi fermé un IDOR que le nouvel endpoint aurait sinon réouvert (`students:read` est aussi accordé à `PARENT`/`ALUMNI` tenant-wide ; ownership check réutilisé de `_authorize_report_card_access`). Limité à ces 2 documents — les ~9 autres générateurs jsPDF côté client (factures, fiches de paie, contrats, listes de classe, tableaux de bord) sont inchangés. |
| P1-2 | Endpoints SQL brut sans pagination | ✅ **Résolu** | Audit module par module (library/clubs/surveys/communication/aliases-forums) : `library.py`/`clubs.py`/`surveys.py` sont déjà entièrement en ORM (pas de SQL brut, donc hors périmètre de ce risque). Dans `communication.py`, tous les endpoints à volume réel (`get_announcements`, `get_messaging_users`, `list_conversations`, `list_forums`) ont déjà `page`/`page_size` + `LIMIT/OFFSET` ; `poll_new_messages` a un `LIMIT 50` fixe. Seul `list_message_reactions` (ligne 741) n'a aucune limite, mais elle est scopée à un seul `message_id` (réactions par message = quelques lignes, jamais à l'échelle du tenant) — pas un vecteur de risque réel, volontairement non modifié. `aliases.py` : `list_course_discussions` a déjà `limit: int = Query(10, le=100)`. |
| P1-3 | PWA/offline désactivé en production | ❌ **Non résolu** | Décision produit, volontairement hors périmètre de ce cycle. |
| P1-4 | Pas de rôles institutionnels | ✅ **Résolu** | `NATIONAL_INSPECTOR` ajouté (#207) — même forme que `MINISTRY_ADMIN` (plateforme, `ministry:read`, MFA obligatoire, révocation fail-closed, visibilité nationale complète non narrowée dans `ministry.py`). Les 3 rôles de la hiérarchie institutionnelle prévue par le prompt d'audit (`MINISTRY_ADMIN`, `NATIONAL_INSPECTOR`, `REGIONAL_DIRECTOR`/`PREFECTURE_ADMIN`/`COMMUNE_ADMIN`) existent maintenant. Reste hors périmètre : `UNIVERSITY_RECTOR`, `SUPER_ADMIN_PLATFORM` dédié. |
| P1-5 | MFA sans TOTP | ✅ **Résolu** | TOTP réel ajouté (#206, `pyotp`) — enrôlement/vérification/désactivation. **Découverte en cours de route, plus grave que le manque de TOTP** : avant #206, `mfa_enabled=True` suffisait à obtenir un token pleinement valide au login sans jamais vérifier de second facteur côté serveur — corrigé (`verify_token()`/`verify_token_raw()` rejettent désormais un jeton `mfa_pending`, sans quoi le nouveau verrou lui-même aurait été contournable). |
| P2-1 | `prometheus_client` absent des dépendances | ✅ **Résolu** (inchangé) | — |
| P2-2 | Pas de modèle universitaire | ✅ **Résolu** (voir §5) | #204 posait la base (départements/inscriptions + RLS). #217/#218 ajoutent la structure LMD complète (`faculties`, `semesters`, prérequis de matière, moyenne pondérée ECTS) ; #219 la porte de progression par crédits ; #220/#221 les écrans admin Faculté/Semestre et l'exposition des champs LMD sur Matières ; #222 un tenant de test seedé. Vérifié à nouveau le 2026-09-23, code et tests, contre Postgres réel — voir §5. |

**Nouveau depuis cette passe** : `docs/INSTITUTIONAL_ROLES.md` et `docs/ASYNC_JOBS_GUIDE.md` mis à jour dans les mêmes commits que les changements de code qu'ils documentent (pas après coup) — précisément pour éviter la classe de bug que `INSTITUTIONAL_ROLES.md` documentait lui-même (un rôle "oublié" dans la doc a causé un vrai trou MFA pour `MINISTRY_ADMIN`/`REGIONAL_DIRECTOR` par le passé).

---

## 2. Scores mis à jour

| Angle | Score initial (juillet) | Score précédent | Score actuel | Lecture |
|---|---:|---:|---:|---|
| SaaS multi-établissement (usage actuel) | 64/100 | 72/100 | 78/100 (inchangé) | Aucun changement fonctionnel côté établissements scolaires depuis la passe précédente — le travail de ce cycle porte sur les tenants universitaires. |
| Prêt pour échelle nationale | 27/100 | 35/100 | **58/100** | Hiérarchie institutionnelle MFA-protégée complète, imports asynchrones étendus, **et module université désormais fonctionnellement complet** (facultés, semestres, prérequis, crédits ECTS, porte de progression) — plus seulement la base RLS. PWA reste la seule décision non technique en attente ; c'est la dernière ligne non verte de ce document. |

---

## 3. Ce qui reste ouvert

- **P1-3** — décision produit PWA/offline, toujours en attente, hors périmètre technique.
- **P0-2 (reste)** — génération de bulletins en masse (`generate-report-cards/batch/`), exports Excel/comptables et rapports ministère toujours synchrones ; le pattern posé par #209/#211 est réutilisable directement le jour où un de ces flux devient un problème réel (volume, timeout).
- **Modules jsPDF client-only restants** (P1-1, hors bulletins/attestations) — factures, fiches de paie, contrats, listes de classe, tableaux de bord : même limite qu'avant (documents non archivables côté serveur), volontairement non traités.
- Note en passant (hors périmètre P1-2) : `list_categories` (library.py) et `list_clubs` (clubs.py) appellent leurs fonctions CRUD ORM sans argument de pagination — à vérifier si ces fonctions CRUD plafonnent déjà les résultats en interne, question de couche ORM distincte du risque SQL-brut clos ici.

---

## 4. Priorités proposées pour le prochain cycle (rien n'est encore lancé)

Les 3 pistes de la version précédente de ce document (étendre l'import async aux parents/enseignants, PDF serveur pour un 2e document officiel, décision PWA) sont toutes traitées : les deux premières sont résolues (#211, #212), la troisième reste un arbitrage produit en attente, pas une tâche technique. L'audit fonctionnel du module université, seule autre piste listée au cycle précédent, est maintenant fait — voir §5. Aucune nouvelle priorité technique n'est encore validée pour le prochain cycle.

---

## 5. Troisième passe (2026-09-23) — clôture de P2-2, module université

**Objet** : le cycle précédent avait posé la base RLS du module université (#204) sans en auditer la couverture fonctionnelle. Depuis, 5 PR ont construit le module LMD complet : #217/#218 (structure facultés/semestres, prérequis de matière, moyenne pondérée ECTS), #219 (porte de progression par crédits), #220/#221 (écrans admin Faculté/Semestre, champs LMD exposés sur l'écran Matières), #222 (tenant de test seedé, "Université La Source"). Cette passe vérifie que cette construction tient, code et tests à l'appui, contre une vraie base Postgres (pas seulement SQLite) — pas seulement qu'elle a été mergée.

**Constaté** :

- **Modèles** : `backend/app/models/faculty.py` (`Faculty`, hiérarchie Faculté → Département → Matière, `dean_id` optionnel) et `backend/app/models/semester.py` existent et sont bien les modèles utilisés par les endpoints `backend/app/api/v1/endpoints/academic/{faculties,semesters}.py`.
- **Porte de progression** : `backend/app/services/progression.py::check_semester_progression_eligibility` — un semestre S+1 n'est bloquant que si le semestre précédent déclare `credits_required_to_advance` (opt-in, `None` par défaut) ; le calcul des crédits acquis (`compute_earned_ects_for_semester`) réutilise exactement la même règle de moyenne/seuil que `transcripts.py` (`PASS_THRESHOLD = 10/20`), pas une seconde définition divergente de "acquis". Un tenant scolaire ou un semestre créé avant ce champ n'est jamais affecté (`required is None` → toujours éligible).
- **Frontend** : `src/pages/admin/Faculties.tsx`, `Semesters.tsx` existent ; `Subjects.tsx` et `queries/subjects.ts` exposent bien `semester_id` (nullable) et les listes de prérequis/UE.
- **Tests, exécutés en direct pour cette passe** (pas seulement lus) :
  - Contre SQLite (défaut du repo) : `test_faculty_management_authorization.py`, `test_semester_management.py`, `test_semester_progression.py`, `test_subject_prerequisites_endpoint.py` → 20 passés, 10 sautés (comparaisons UUID en SQL brut incompatibles avec le stockage GUID de SQLite — limite connue de l'environnement de test, pas du code).
  - Contre `schoolflow_test` (Postgres réel, migrations Alembic à jour) : les mêmes 4 fichiers → **30/30 passés**, plus aucun test sauté. C'est la preuve qui manquait : la logique de progression par crédits (SQL brut sur des colonnes UUID) n'était vérifiée que partiellement avant cette passe.
  - Suite complète du backend relancée contre ce même Postgres pour vérifier l'absence de régression ailleurs : **1585 passés, 1 sauté, 0 échec**, en deux temps —
    1. Un premier passage sur `schoolflow_test` a montré 53 puis 20 échecs. Root-cause, pas un bug produit : la base et le Redis de test étaient des instances **persistantes réutilisées** entre de nombreuses sessions précédentes (4387 tenants, 1356 users, 829 clés Redis résiduelles) — des tests qui font un `DELETE FROM users` en bloc (`test_bootstrap.py`) échouaient sur des FK orphelines (`schedule`, `course_discussions`) laissées par des runs antérieurs sans rapport avec cette passe.
    2. Base et Redis recréés à neuf, migrations réappliquées : 20 échecs subsistaient, **reproductibles y compris à partir d'un état vide** — donc un vrai problème d'isolation entre fichiers de test, distinct du point 1. Root-cause : `BOOTSTRAP_SECRET` n'était fourni nulle part dans l'environnement de test global ; plusieurs fichiers (`test_account_lockout.py`, `test_bootstrap.py`, `test_mfa_enforcement.py`, `test_token_lifecycle.py`) le fixent via `os.environ.setdefault(...)` à l'import, mais `app.core.config.Settings` (Pydantic) ne lit l'environnement qu'une seule fois pour tout le process — si un fichier sans rapport (`test_account_deactivation_revokes_access.py`, alphabétiquement antérieur) déclenche cet import en premier, le `setdefault` de ces 4 fichiers arrive trop tard et `/auth/bootstrap/` renvoie 403 pour tous. Fixé pour cette passe en exportant `BOOTSTRAP_SECRET` avant l'invocation de pytest (pas un changement de code) — **1585/1585 tests passés** une fois fait.

**Conclusion** : P2-2 passe de 🟡 à ✅. Le module université n'est plus seulement mergé — sa couverture fonctionnelle (facultés, semestres, prérequis, crédits ECTS, porte de progression, écrans admin) est vérifiée par des tests qui passent réellement contre une base Postgres, condition que la passe précédente n'avait pas encore remplie. Effet de bord utile de cette passe : la suite complète du backend (1586 tests, hors ce module) est confirmée 100 % verte contre Postgres réel, une fois l'environnement de test correctement isolé — voir §6 pour la fragilité d'environnement découverte au passage, hors périmètre P0-P2 mais réelle.

**Ce qui reste hors périmètre** : P1-3 (PWA/offline) reste la seule ligne non résolue de ce document — c'est un arbitrage produit explicitement mis de côté par le porteur du projet à plusieurs reprises, pas une dette technique. "Tout vert" sur ce document signifie donc : tous les constats techniques résolus, P1-3 excepté par décision assumée, pas par oubli.

---

## 6. Fragilité d'environnement de test découverte (hors P0-P2, à corriger séparément)

Deux problèmes trouvés en cherchant à faire tourner la suite complète à vert (détaillés en §5), tous deux dans l'outillage de test, aucun dans le code applicatif :

1. **`BOOTSTRAP_SECRET` non centralisé** : `tests/conftest.py` fixait déjà `SECRET_KEY`/`DATABASE_URL`/`REDIS_URL` par défaut pour toute la suite, mais pas `BOOTSTRAP_SECRET` — laissé à la charge de 4 fichiers de test individuels (`test_account_lockout.py`, `test_bootstrap.py`, `test_mfa_enforcement.py`, `test_token_lifecycle.py`) via `os.environ.setdefault(...)`, un pattern qui ne fonctionne que si l'un de ces 4 fichiers est le premier de toute la session à importer `app.core.config` (Pydantic `Settings` ne relit jamais l'environnement après sa première instanciation). Un cinquième fichier sans rapport importé plus tôt suffit à casser silencieusement les 4 — c'est exactement ce qui s'est produit ici. **Corrigé dans cette passe** : `os.environ.setdefault("BOOTSTRAP_SECRET", "test-bootstrap-secret-key-for-ci-32chars")` ajouté dans `tests/conftest.py`, au même endroit que `SECRET_KEY` — revérifié : les 5 fichiers passent maintenant ensemble sans exporter la variable manuellement.
2. **Bases Postgres/Redis de test non éphémères** : `schoolflow_test` et sa base Redis avaient accumulé des milliers de lignes de sessions précédentes, faisant échouer les tests qui suppriment sans condition (`DELETE FROM users`). Non corrigé dans cette passe (changement d'infra CI, pas de code) — recommandation : soit une base recréée avant chaque run complet (`dropdb && createdb && alembic upgrade head`), soit chaque test transactionnel avec rollback automatique.

Le point 1 est maintenant réellement corrigé (`tests/conftest.py`) ; le point 2 reste une recommandation d'infra. Une fois les deux neutralisés pour cette passe, la suite est à 1585/1585. Ni l'un ni l'autre n'est un constat P0/P1/P2 de ce document — à traiter comme dette d'outillage CI si la suite est exécutée ailleurs que dans cette session.
