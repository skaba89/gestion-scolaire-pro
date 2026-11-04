# Scorecard qualité — Gestion Scolaire Pro

| | |
|---|---|
| **Commit évalué** | `6540145` (`main`, 2026-11-03) |
| **Date** | 2026-11-03 |
| **Score mesuré** | **47 / 100** |
| **Cible** | 99 / 100 (conditions § 4) |
| **Périmètre** | code de `main` ; production VPS **non inspectée** (aucun accès) |

Règle : un point n'est accordé que sur une preuve citée (commande, test, CI,
fichier:ligne). Sans preuve, le critère est noté comme non acquis — pas
« probablement bon ». Toute hausse future doit citer le commit et la preuve
nouvelle.

## 1. Barème et notes

| Axe | Max | Note | Preuve principale | Défaut bloquant | Pour progresser |
|---|---:|---:|---|---|---|
| Fonctionnalités scolaires et universitaires | 15 | **7** | 5 parcours E2E nominaux (inscription, rôles, notes→bulletin, frais→paiement, présences) | 22 écrans DÉFECTUEUX, 94 appels sans route (`API_ROUTE_GAPS.md`) ; délibérations, passage/redoublement, UE/compensation/jurys LMD absents | Lot 2 (contrats API), Lot 4–5 |
| Sécurité et isolation multi-tenant | 15 | **11** | RLS `ENABLE+FORCE`, rôle runtime NOBYPASSRLS, tests `*_rls_restricted_role.py` verts en CI ; MFA ; sessions serveur révocables (#342) | jeton en `localStorage` (P1-4) ; quotas IA/exports non bloquants ; pas d'audit ASVS formel ; 18 `except Exception: pass` | `SECURITY_AUDIT.md`, P1-4 |
| Tests et fiabilité | 15 | **8** | ≈ 2 000 tests backend (SQLite + PostgreSQL en CI), 416 Vitest, couverture ≥ 43 % | `e2e-journeys` non obligatoire ; suite pytest non hermétique (§ 2) ; aucun test hors-ligne, accessibilité, charge, migration descendante | P1-3, P1-5 |
| Architecture et qualité du code | 10 | **5** | couches API/services/CRUD, RLS centralisée (`database.py`) | 184 erreurs TS strictes, 2 027 avertissements ESLint (1 399 `any`) ; `aliases.py` ; 2 systèmes de quotas | P1-7, lots TS/ESLint |
| UX/UI et accessibilité | 10 | **3** | 5 locales, aucune clé française bloquante manquante (`check:i18n`) | boutons sans effet (22 écrans) ; aucune mesure d'accessibilité ; matrice d'usage non jouée | Lot 8, axe-core en CI |
| Performance et scalabilité | 10 | **2** | `docs/LOAD_TEST_PLAN.md` (plan) ; index opérationnels testés | **aucune mesure** P95/P99 ni de capacité | Lot 7 (k6 sur stack locale) |
| Production, sauvegardes, supervision | 10 | **4** | dump quotidien + copie chiffrée B2 ; exercice de restauration CI ; surveillance email 5 min | restauration B2 au format de production **non démontrée**, RTO inconnu ; mono-VPS (RPO ≈ 24 h) | P0-3 (humain sur VPS) |
| Mobile et hors connexion | 5 | **2** | PWA, file hors-ligne Dexie avec clé d'idempotence (présences) | pré-vol CORS bloquait `X-Idempotency-Key` hors même origine (corrigé dans #345, non fusionné) ; aucun test de coupure | Lot 6 |
| Finance et SaaS | 5 | **2** | facture → Mobile Money reçu (E2E 04) ; webhooks signés testés | **encaissements non atomiques / rejouables sur `main`** (#345 en attente) ; export comptable cassé (`GET /payments/`) ; passerelles jamais jouées en sandbox ; quotas SaaS partiels | #345, Lot 5 |
| Adaptation aux marchés africains | 5 | **3** | Mobile Money (Wave, OM, MTN, CinetPay, PayTech), GNF, 5 langues dont arabe | aucune validation terrain documentée ; règles de notation non paramétrables par pays | Lot 4, pilotes |
| **Total** | **100** | **47** | | | |

Comparaison : l'audit du 2026-11-02 notait 2,5 / 5 sur 8 axes non pondérés ;
les deux barèmes ne sont pas convertibles — 47 / 100 est la nouvelle référence.

Excellence technique et position commerciale sont distinctes : ce score
n'évalue que la première. Aucun benchmark concurrentiel sourcé n'existe encore
(`COMPETITOR_BENCHMARK.md` : non produit).

## 2. Mesures de la baseline (`6540145`)

| Mesure | Valeur | Commande |
|---|---|---|
| Opérations OpenAPI | 635 | `app.openapi()` |
| Appels front littéraux | 1 027 (21 dynamiques non vérifiables) | `scripts/audit/frontend-api-routes.mjs` |
| Appels sans route | **94** (77 chemins, 17 méthodes) | idem — liste : `API_ROUTE_GAPS.md` |
| Pages | 171 (147 routées, 24 non routées) | `scripts/audit/feature-matrix.mjs` |
| Écrans DÉFECTUEUX / À VÉRIFIER | 22 / 35 | `FEATURE_MATRIX.md` |
| Vitest | 71 fichiers, **416/416** | `npx vitest run` |
| TypeScript strict | **184** erreurs (= plancher) | `npm run type-check` |
| ESLint | 0 erreur, **2 027** avertissements (budget 2 116) | `npx eslint .` |
| i18n | 0 clé FR bloquante ; 1 FR + 4 hors FR non bloquantes | `npm run check:i18n` |
| pytest SQLite, 2 exécutions successives | **1re : 1 593 passed, 0 failed · 2e (même base) : 19 failed** — `UNIQUE` sur `students.registration_number` et `tenants.slug` (`test_report_card_*`, `test_parents_directory_authorization`, `test_tenant_slug_validation`, `test_infrastructure_write_authorization`) | `python -m pytest tests/ -q` ×2 |
| pytest PostgreSQL + RLS | vert en CI sur `main` (migrations + rôle NOBYPASSRLS) | job `Backend Tests (PostgreSQL)` |

## 3. Défauts ouverts (P0/P1) — voir `BUGS_AND_GAPS.md`

| ID | Gravité | Statut | Objet |
|---|---|---|---|
| FIN-01 | **P0** | PARTIEL — correctif #345 (non fusionné) | encaissements concurrents : mise à jour perdue, trop-perçu, double annulation, rejeu = double paiement |
| CORS-01 | P1 | PARTIEL — correctif #345 | `X-Idempotency-Key` refusé au pré-vol (app native, file hors-ligne) |
| OPS-01 | **P0** | OUVERT | restauration B2 au format de production non démontrée |
| API-01 | P1 | PARTIEL | 94 → 89 appels sans route (export comptable #347, pré-inscription parent) ; cliquet CI actif |
| FIN-02 | P1 | CORRIGÉ (`fix/payment-reverse-completed-only`) | annulation acceptée sur un paiement non `COMPLETED` |
| QA-01 | P1 | CORRIGÉ (`test/hermetic-pytest-db`) — 2 exécutions successives vertes, SQLite et PostgreSQL | suite pytest non hermétique |
| BILL-01 | P1 | OUVERT (décision produit) | quotas utilisateurs/IA/exports non bloquants |
| S4 | P1 | OUVERT | jeton d'accès en `localStorage` |
| SEC-ADM-01 | P1 | OUVERT | réinscription publique sans vérification du demandeur |
| RT-02 | P2 | NON VÉRIFIÉ | `test_active_user_connection_is_accepted` a échoué une fois localement sur `main` après #341 (instabilité résiduelle possible) |

Corrigés et vérifiés sur `main` : BUG-SESS-01 à 04 (#342), SIM-AI-01 (#343),
BUG-RT-01 et DEP-01 (#341), description OPS-01 (#344).

## 4. Conditions pour 99/100 (aucune n'est remplie aujourd'hui)

1. Aucun P0 ouvert (FIN-01 fusionné, OPS-01 démontré avec RTO/RPO mesurés).
2. 0 appel sans route sur les écrans proposés au client (contrôle CI bloquant).
3. Parcours E2E critiques obligatoires sur `main` (succès, échec, 403, cross-tenant).
4. Suite pytest hermétique ; aucun test instable connu.
5. Charge mesurée contre des objectifs écrits (P95, établissements simultanés).
6. Hors-ligne annoncé = testé (coupure, reprise, doublons, conflits).
7. Dette TS ramenée à 0 sur les modules livrés ; avertissements ESLint justifiés.
8. Recette utilisateur sur au moins un établissement pilote, consignée.

Le 100/100 exige en plus une revue indépendante sur un périmètre et une date
définis.

## 5. Prochaines PR (ordre)

1. **#345** — FIN-01 + CORS-01 (attend validation du propriétaire).
2. `fix/api-contract-finance` — export comptable et écrans finance cassés (API-01, sous-ensemble finance), + contrôle CI qui échoue sur tout nouvel appel sans route.
3. `test/hermetic-pytest-db` — QA-01.
4. `fix/payment-reverse-completed-only` — FIN-02.
5. `ops/restore-drill-b2` — OPS-01 (exécution par l'administrateur sur le VPS, script fourni).
6. Lots API-01 restants par domaine (badges, messagerie, préinscription, règles académiques), chaque groupe branché ou retiré de l'interface.
