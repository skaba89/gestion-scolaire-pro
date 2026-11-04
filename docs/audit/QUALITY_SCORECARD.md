# Scorecard qualité — Gestion Scolaire Pro

| | |
|---|---|
| **Commit évalué** | `a9c17a8` (`main`, 2026-11-04) |
| **Date** | 2026-11-04 |
| **Score mesuré** | **57 / 100** |
| **Historique** | 47 (2026-11-03, `6540145`) → 49 (restauration démontrée) → **57** (2026-11-04, PR #345 à #357) |
| **Cible** | 99 / 100 (conditions § 4) |
| **Périmètre** | code de `main` ; production VPS : exercice de restauration exécuté (2026-11-04), journaux applicatifs **non consultés** |

Règle : un point n'est accordé que sur une preuve citée (commande, test, CI,
fichier:ligne). Sans preuve, le critère est noté comme non acquis — pas
« probablement bon ». Toute hausse cite le commit et la preuve nouvelle ;
la colonne « Δ » renvoie aux PR qui la justifient.

## 1. Barème et notes

| Axe | Max | Note | Δ | Preuve principale | Défaut bloquant | Pour progresser |
|---|---:|---:|---:|---|---|---|
| Fonctionnalités scolaires et universitaires | 15 | **9** | +2 | 5 parcours E2E nominaux ; réparés et testés : pré-inscription parent (#351), réinscription publique (#352), messagerie (#354), règles de notation appliquées aux bulletins (#355), cartes QR reconnues au pointage (#357), exports comptables (#347) ; écrans DÉFECTUEUX 22 → **18**, appels sans route 94 → **53** | délibérations, passage/redoublement, UE/compensation/jurys LMD absents ; barème /10 absent ; 18 écrans défectueux | lots API-01 restants, Lot 4–5 |
| Sécurité et isolation multi-tenant | 15 | **12** | +1 | RLS `ENABLE+FORCE` (122 tables, identique après restauration), rôle runtime NOBYPASSRLS testé en CI ; MFA ; sessions révocables (#342) ; corrigés avec test de régression : réinscription publique sans vérification (#352), bulletin falsifiable (#355), listes de badges ouvertes à tout connecté (#357), pré-vol CORS (#345) | jeton en `localStorage` (P1-4) ; quotas IA/exports non bloquants ; pas d'audit ASVS formel ; exploitation passée des failles corrigées non vérifiée (journaux non consultés) | `SECURITY_AUDIT.md`, P1-4 |
| Tests et fiabilité | 15 | **10** | +2 | PostgreSQL en CI : **2 433 passed, 1 skipped, couverture 72 %** (seuil 43 %) ; SQLite **1 629 passed ×2 sur la même base** (hermétique, #349) ; cliquet CI frontend → API (#347) ; ≈ 120 tests de régression ajoutés, chacun en échec sur l'ancien code | `E2E Journeys` **non obligatoire** sur `main` (ruleset : 5 contrôles requis) ; aucun test hors-ligne, accessibilité, charge, migration descendante | P1-5 |
| Architecture et qualité du code | 10 | **6** | +1 | TS strict **184 → 178** (plancher abaissé) ; ESLint **2 027 → 1 949** ; ≈ 2 650 lignes de code mort retirées (#354, #355, #356) ; seuils de notation dédupliqués en un service (#355) | 178 erreurs TS ; 1 327 `any` ; `aliases.py` (dont `/student-badges/` qui avale ses erreurs) ; 2 systèmes de quotas | P1-7, lots TS/ESLint |
| UX/UI et accessibilité | 10 | **4** | +1 | écrans réparés avec états d'erreur explicites au lieu de résultats vides (exports, règles, pré-inscription, cartes) ; affichages trompeurs corrigés (« Validé » pour un paiement en attente #350, contacts toujours « hors ligne » #354) ; 5 locales, 0 clé FR bloquante | aucune mesure d'accessibilité ; 18 écrans défectueux ; matrice d'usage non jouée | Lot 8, axe-core en CI |
| Performance et scalabilité | 10 | **2** | 0 | `docs/LOAD_TEST_PLAN.md` (plan) ; index opérationnels testés | **aucune mesure** P95/P99 ni de capacité | Lot 7 (k6 sur stack locale) |
| Production, sauvegardes, supervision | 10 | **6** | 0 | restauration B2 démontrée sur le VPS (RPO 5 h, RTO technique 19 s, RLS identique — `preuves/restauration-b2-20261104.md`) ; surveillance email 5 min | mono-VPS ; exercice non planifié ; production encore sans données réelles | trimestrialiser l'exercice, 2e nœud |
| Mobile et hors connexion | 5 | **2** | 0 | PWA, file hors-ligne Dexie avec clé d'idempotence ; en-tête autorisé au pré-vol CORS (#345) | **aucun test de coupure** ni sur appareil | Lot 6 |
| Finance et SaaS | 5 | **3** | +1 | encaissements atomiques et idempotents (#345, tests de concurrence PostgreSQL) ; annulation réservée aux encaissés (#350) ; exports comptables justes (#347) | passerelles jamais jouées en sandbox ; quotas SaaS partiels (BILL-01) | P1-6, P1-2 |
| Adaptation aux marchés africains | 5 | **3** | 0 | Mobile Money (Wave, OM, MTN, CinetPay, PayTech), GNF, 5 langues dont arabe ; règles de passage/mention réglables par établissement et niveau (#355) | barème /10 du primaire absent ; aucune validation terrain documentée | Lot 4, pilotes |
| **Total** | **100** | **57** | **+8** | | | |

Excellence technique et position commerciale sont distinctes : ce score
n'évalue que la première. Aucun benchmark concurrentiel sourcé n'existe encore
(`COMPETITOR_BENCHMARK.md` : non produit).

## 2. Mesures (`a9c17a8`, 2026-11-04)

| Mesure | 2026-11-03 (`6540145`) | 2026-11-04 (`a9c17a8`) | Commande |
|---|---|---|---|
| Opérations OpenAPI | 635 | 644 | `scripts/audit/export-openapi-ops.py` |
| Appels front sans route (clés du cliquet) | 94 appels | **53** clés | `scripts/audit/frontend-api-routes.mjs --baseline` (CI, job `Backend`) |
| Écrans DÉFECTUEUX / À VÉRIFIER / NON VÉRIFIÉ | 22 / 35 / 88 | **18 / 32 / 95** (171 pages, 24 non routées) | `scripts/audit/feature-matrix.mjs` |
| Vitest | 416/416 | **452/452** (77 fichiers) | `npx vitest run` |
| TypeScript strict | 184 | **178** | `npm run type-check` |
| ESLint (avertissements) | 2 027 | **1 949** (`any` 1 327, inutilisés 562) | `npx eslint .` |
| pytest SQLite, 2 exécutions même base | 1 593/0 puis **19 failed** | **1 629/0 puis 1 629/0** | `python -m pytest tests/ -q` ×2 |
| pytest PostgreSQL + RLS (CI) | vert | **2 433 passed, 1 skipped, couverture 72 %** | job `Backend Tests (PostgreSQL)`, run 41827709344 |
| Contrôles requis sur `main` | 5 | 5 (`E2E Journeys` non requis) | ruleset `protect-main` |

## 3. Défauts ouverts — voir `BUGS_AND_GAPS.md`

| ID | Gravité | Statut | Objet |
|---|---|---|---|
| API-01 | P1 | PARTIEL | 53 appels sans route (94 au départ) ; cliquet CI actif |
| P1-5 | P1 | OUVERT | parcours E2E non obligatoires sur `main` |
| BILL-01 | P1 | OUVERT (décision produit) | quotas utilisateurs/IA/exports non bloquants |
| S4 | P1 | OUVERT | jeton d'accès en `localStorage` |
| RBAC-01 | P2 | OUVERT | `admissions:manage/convert` (front) ≠ `admissions:write` (back) |
| OPS-02 | P1 | OUVERT | mono-VPS |
| RT-02 | P2 | NON VÉRIFIÉ | test WebSocket instable résiduel possible |

**Aucun P0 ouvert.** Corrigés et vérifiés sur `main` depuis l'audit :
FIN-01, CORS-01 (#345) · API-02 (#347) · OPS-01 (#348, #353) · QA-01 (#349) ·
FIN-02 (#350) · API-03 (#351) · SEC-ADM-01, ADM-02 (#352) · MSG-01 (#354) ·
RULES-01, BUL-01 (#355) · GAME-01 (#356) · BADGE-01 (#357) — plus, avant :
BUG-SESS-01 à 04 (#342), SIM-AI-01 (#343), BUG-RT-01 et DEP-01 (#341).

## 4. Conditions pour 99/100

| # | Condition | État |
|---|---|---|
| 1 | Aucun P0 ouvert | ✅ (2026-11-04) |
| 2 | 0 appel sans route sur les écrans proposés au client (contrôle CI bloquant) | contrôle CI en place ; **53 restants** |
| 3 | Parcours E2E critiques obligatoires sur `main` | ❌ non requis |
| 4 | Suite pytest hermétique ; aucun test instable connu | hermétique ✅ ; RT-02 non vérifié |
| 5 | Charge mesurée contre des objectifs écrits | ❌ |
| 6 | Hors-ligne annoncé = testé | ❌ |
| 7 | Dette TS ramenée à 0 sur les modules livrés | ❌ (178) |
| 8 | Recette utilisateur sur un établissement pilote, consignée | ❌ (production sans élèves) |

Le 100/100 exige en plus une revue indépendante sur un périmètre et une date
définis.

## 5. Prochaines PR (ordre)

1. Lots API-01 restants par domaine (règles d'inscription, ressources humaines, vie scolaire, e-learning…), chaque écran branché ou retiré.
2. P1-5 — rendre `E2E Journeys` obligatoire sur `main` (décision du propriétaire : ruleset).
3. RBAC-01 — aligner les permissions d'admissions + test de parité back/front.
4. P1-4 / S4 — étude jeton en cookie HttpOnly + CSRF (plan à valider).
5. Lot 6 — test de coupure réseau de la file hors-ligne (Playwright, mode hors-ligne).
