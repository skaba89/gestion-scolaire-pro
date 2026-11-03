# Backlog priorisé — 2026-11-02 (commit `c28b482`)

Statuts réels issus de `AUDIT_GLOBAL.md` / `BUGS_AND_GAPS.md`. Complexité :
S (≤ 1 PR courte), M (1 PR, plusieurs couches), L (plusieurs PR), XL (lot).
Aucun calendrier n'est annoncé : l'ordre fait foi.

## P0 — Bloquant / sécurité / données

| ID | Domaine | Statut réel | Problème | Cx | Dépendances | Critères de validation |
|---|---|---|---|---|---|---|
| P0-1 | Sessions | SIMULÉ → **PR #342** | révocation fictive, registre Redis incohérent (BUG-SESS-01/03/04) | M | — | test : session révoquée → 401 sur requête et refresh ; refresh multi-onglets jamais en 429 ; UI liste de vraies sessions |
| P0-2 | Audit des connexions | DÉFECTUEUX → **PR #342** | aucun événement serveur (BUG-SESS-02) | S | P0-1 (même PR) | tests : succès/échec/MFA/logout/révocation écrits par le serveur avec tenant, IP, UA ; historique visible côté admin |
| P0-3 | Sauvegardes | PARTIEL | restauration du format de production depuis B2 non prouvée, RTO inconnu (OPS-01) | M | accès VPS (humain) | exercice depuis B2 sur base isolée : comptages, RLS, head Alembic, durée consignée |
| P0-4 | Données affichées | SIMULÉ | tendances IA aléatoires (SIM-AI-01) | S | — | plus aucun `Math.random()` dans une donnée affichée ; test Vitest |

## P1 — Stabilisation

| ID | Domaine | Statut | Problème | Cx | Dép. | Validation |
|---|---|---|---|---|---|---|
| P1-1 | Front ↔ API | DÉFECTUEUX | 91 appels sans route (§ G) | L | — | contrôle CI qui échoue sur un appel sans route ; chaque groupe branché ou retiré |
| P1-2 | Facturation | PARTIEL | quotas utilisateurs/IA/exports non bloquants (BILL-01) | M | décision produit | tests 402/429 par ressource ; préavis pour dépassements existants |
| P1-3 | Qualité | DÉFECTUEUX | suite pytest non hermétique (QA-01) | S | — | 2 exécutions successives vertes |
| P1-4 | Jetons | RISQUE | jeton en `localStorage` (S4) | L | P0-1 | étude cookie HttpOnly + CSRF, plan validé |
| P1-5 | E2E | PARTIEL | `e2e-journeys` non obligatoire ; parcours manquants (révocation session, impayé, notification) | M | P0-1 | job requis sur `main` |
| P1-6 | Passerelles | PARTIEL | initiation CinetPay/PayTech jamais jouée en sandbox | M | comptes sandbox (humain) | parcours sandbox enregistré |
| P1-7 | Dette TS | PARTIEL | 184 erreurs strictes | L | — | plancher abaissé à chaque lot, sans `@ts-ignore` |

## P2 — Compétitivité

| ID | Domaine | Problème | Cx |
|---|---|---|---|
| P2-1 | Pédagogie | délibérations, rattrapages, passage/redoublement configurables | XL |
| P2-2 | Supérieur LMD | UE, compensation, jurys, stages, mémoires | XL |
| P2-3 | Hors-ligne | preuves de saisie de présences hors connexion + synchronisation + conflits | L |
| P2-4 | UX | audit écran par écran (`FEATURE_MATRIX.md`), états vides/erreur, accessibilité | XL |
| P2-5 | Détection de connexions suspectes | nouvel appareil/IP → notification | M |
| P2-6 | Benchmark concurrentiel sourcé | `COMPETITOR_BENCHMARK.md` | M |

## P3 — Expansion

Multi-pays (règles de notation, devises, langues), BI institutionnelle,
IA avancée (risque de décrochage avec validation humaine), redondance
d'infrastructure (2e nœud, réplication PostgreSQL), modules optionnels selon
valeur commerciale.

## Ordre des PR proposé

1. `docs/audit-baseline-2026-11` — ce socle d'audit (documentation seule).
2. `fix/server-side-sessions` — P0-1 + P0-2 (plan soumis à validation).
3. `fix/ai-insights-no-fabricated-data` — P0-4.
4. `ops/restore-drill` — P0-3 (exécution sur le VPS par l'administrateur).
5. `test/hermetic-pytest-db` — P1-3.
6. `ci/frontend-api-route-check` + lots de branchement/retrait — P1-1.
7. `feat/billing-quota-enforcement` — P1-2 (après décision produit).
