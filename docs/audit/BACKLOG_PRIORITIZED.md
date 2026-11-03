# Backlog priorisé — 2026-11-02 (commit `c28b482`), actualisé le 2026-11-03 (`6540145`)

Statuts réels issus de `AUDIT_GLOBAL.md` / `BUGS_AND_GAPS.md`. Complexité :
S (≤ 1 PR courte), M (1 PR, plusieurs couches), L (plusieurs PR), XL (lot).
Aucun calendrier n'est annoncé : l'ordre fait foi.

## P0 — Bloquant / sécurité / données (actif au 2026-11-03, `6540145`)

| ID | Domaine | Statut | Problème | Cx | Dépendances | Critères de validation |
|---|---|---|---|---|---|---|
| P0-5 | Finance | PARTIEL — #345 | encaissements non atomiques / rejouables (FIN-01) + pré-vol CORS (CORS-01) | M | validation propriétaire | `test_payment_integrity.py` 12/12 PostgreSQL ; E2E 04 vert ; contrôle de cohérence des factures de production |
| P0-3 | Sauvegardes | OUVERT | restauration B2 au format de production non démontrée (OPS-01) | M | accès VPS (humain) | exercice journalisé sur base isolée : déchiffrement, restauration, head Alembic, comptages, RLS `FORCE`, connexion `schoolflow_app`, RTO/RPO mesurés |

### Historique P0 (retirés du backlog actif)

| ID | Statut | Preuve |
|---|---|---|
| P0-1 | CORRIGÉ | #342 — sessions serveur révocables |
| P0-2 | CORRIGÉ | #342 — 8 événements d'authentification écrits par le serveur |
| P0-4 | CORRIGÉ | #343 — plus aucune donnée inventée dans « Insights IA » |

## P1 — Stabilisation

| ID | Domaine | Statut | Problème | Cx | Dép. | Validation |
|---|---|---|---|---|---|---|
| P1-1 | Front ↔ API | DÉFECTUEUX | 94 appels sans route (§ G, `API_ROUTE_GAPS.md`) — commencer par l'export comptable (API-02) | L | — | contrôle CI qui échoue sur un appel sans route ; chaque groupe branché ou retiré |
| P1-2 | Facturation | PARTIEL | quotas utilisateurs/IA/exports non bloquants (BILL-01) | M | décision produit | tests 402/429 par ressource ; préavis pour dépassements existants |
| P1-3 | Qualité | CORRIGÉ (2026-11-03) | suite pytest non hermétique (QA-01) | S | — | 2 exécutions successives vertes : SQLite 1 596/0 ×2, PostgreSQL 74/74 ×2 |
| P1-4 | Jetons | RISQUE | jeton en `localStorage` (S4) | L | P0-1 | étude cookie HttpOnly + CSRF, plan validé |
| P1-5 | E2E | PARTIEL | `e2e-journeys` non obligatoire ; parcours manquants (révocation session, impayé, notification) | M | P0-1 | job requis sur `main` |
| P1-6 | Passerelles | PARTIEL | initiation CinetPay/PayTech jamais jouée en sandbox | M | comptes sandbox (humain) | parcours sandbox enregistré |
| P1-7 | Dette TS | PARTIEL | 184 erreurs strictes | L | — | plancher abaissé à chaque lot, sans `@ts-ignore` |
| P1-8 | Finance | OUVERT | annulation d'un paiement non encaissé (FIN-02) | S | P0-5 | annulation d'un `PENDING` → 400, facture inchangée |

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

## Ordre des PR proposé (au 2026-11-03)

1. #345 `fix/payments-atomic-idempotent` — P0-5 (en attente de validation).
2. `fix/api-contract-finance` — API-02 + contrôle CI sur tout nouvel appel sans route — P1-1 (1er lot).
3. `test/hermetic-pytest-db` — P1-3.
4. `fix/payment-reverse-completed-only` — P1-8.
5. `ops/restore-drill-b2` — P0-3 (script fourni, exécution par l'administrateur).
6. Lots P1-1 par domaine (badges, messagerie, préinscription, règles académiques).
7. `feat/billing-quota-enforcement` — P1-2 (après décision produit).

Fusionnées depuis le 2026-11-02 : #340, #341, #342, #343, #344.
