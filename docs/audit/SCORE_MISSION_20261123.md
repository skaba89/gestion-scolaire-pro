# Score de maturité — grille de la mission, 2026-11-23

Mesuré sur `main` à `18a1606` (PR #590). **Score : 68/100, non certifié** (60/100 le 2026-11-09,
`SCORE_MISSION_20261109.md`). Même grille (20/15/15/10/15/10/5/5/5) et même règle : une
capacité sans preuve ne reçoit pas de points. Ce n'est ni une certification ni un audit
indépendant. Le « 80/100 » cité dans la mission du 2026-11-23 ne figure dans aucun document
du dépôt : il n'est pas repris.

## Preuves mesurées

| Indicateur | 2026-11-09 | 2026-11-23 | Source |
|---|---|---|---|
| CI `main` | 4/6 jobs créés (anomalie GitHub) | **6/6 verts** | run 45222194524 (`18a1606`) |
| Contrôles obligatoires (`protect-main`) | 5/6 (E2E non requis) | **6/6** (E2E requis depuis le 2026-11-11) | API rulesets |
| Backend PostgreSQL | 3 012 réussis ; couverture 74,6 % | **3 892 réussis**, 1 ignoré ; couverture **81 %** | job 137859122180 |
| Backend SQLite | — | 2 741 réussis, 1 152 ignorés | job 137859122453 |
| Vitest | 683 tests, 118 fichiers | **1 000+ tests, 150 fichiers** (1 001 sur la branche du lot S1) | job 137859122244 ; exécution locale |
| E2E sur vraie stack (NOBYPASSRLS) | 43 réussis | **56 réussis** (25 parcours), plus parcours de toutes les routes GET × rôles et des écritures (aucune 5xx) | job 137859122406 |
| TypeScript strict | 165 erreurs | **145** (cliquet 146) | `check-ts-baseline` |
| ESLint | 1 865 avertissements | **1 706** (budget CI 2 116) | job Frontend |
| Contrat frontend → API | 29 appels sans route | **0** (référence vide) | `scripts/audit/api-route-gaps-baseline.json` |
| Sauvegardes (VPS, lecture seule) | dump + B2 + supervision OK | dump du 23/11 00:00 OK ; supervision 5 min : `api=ok disque=ok distant=ok dump=ok`, aucune alerte | journaux `db-backup`, `/var/log/schoolflow-surveillance.log` |
| Production | 100 commits de retard | **19 commits de retard** : production en `61b9740` (21 déploiements validés du 09 au 18/11) ; #572–#590 et 2 migrations non déployés | `alembic_version = 20261116_0001` |
| Restauration | exercice B2 du 04/11 (base sans élèves) | inchangé : **non rejouée avec des données métier** | `docs/audit/preuves/restauration-b2-20261104.md` |
| Performance | k6 d'août, 25 VUs | inchangé, **jamais rejoué** | `docs/LOAD_TEST_RESULTS.md` |

## Grille

| Critère | Max | 09/11 | 23/11 | Preuve des points gagnés | Points manquants |
|---|---:|---:|---:|---|---|
| Parcours métier | 20 | 11 | **13** | Parcours E2E ajoutés et rejoués en CI : notation des rendus (21), historique des pointages (22), admissions / réinscription / transfert (13), annulation et export (15) ; incidents multi-élèves et bornes hors ligne couverts en PostgreSQL | Relevé et jury LMD en E2E ; webhook Mobile Money signé et remboursement en E2E ; recette terrain par rôle |
| Sécurité et multi-tenant | 15 | 11 | **12** | Fuite des secrets d'établissement corrigée (TENANT-SECRETS-03) ; FK étrangères refusées sur ~25 écritures (#533) puis factures (FIN-IDOR-01) ; périmètre par cycle refusé par défaut et testé route par route (lots A–B2e-1) ; fuites de notes et de remises corrigées | Jetons en `localStorage` ; aucune revue ASVS ni test d'intrusion indépendant ; rotation des secrets exposés à confirmer |
| Fiabilité backend et intégrité | 15 | 10 | **12** | 3 892 tests PG, couverture 81 % ; 0 appel sans route ; suppressions destructrices bloquées (#548–#554) ; plus de zéros ni de chiffres inventés en cas d'erreur (ANALYTICS-ZERO-01, ANALYTICS-MOCK-01) | Imports CSV, webhooks et tâches ARQ non audités (IMPORT-WEBHOOK-ARQ) ; scores de risque jamais calculés (RISK-SCORES-01) |
| Frontend, UX, accessibilité | 10 | 5 | **6** | TS 165 → 145, ESLint 1 865 → 1 706 ; portails traduits dans les 5 langues ; états « indisponible » au lieu de faux zéros | Aucune campagne d'accessibilité ; mobile non testé ; menus non adaptés au type d'établissement (B3) |
| Tests et non-régression | 15 | 11 | **13** | E2E obligatoire (6/6) ; test instable WebSocket stabilisé ; parcours GET et écritures de toutes les routes en CI ; règle « rouge avant, vert après » appliquée à chaque correctif | Couverture frontend non mesurée ; pas de tests sur appareils réels |
| Production, sauvegardes, observabilité | 10 | 6 | **6** | Sauvegardes et supervision vérifiées ce jour | Production en retard de 19 commits ; restauration non rejouée avec données métier ; pas de centralisation des journaux |
| Performance | 5 | 1 | **1** | — | Campagne de charge graduelle (jusqu'à 1 000 établissements) sur environnement dimensionné |
| Offline et mobile | 5 | 3 | **3** | (bornes hors ligne idempotentes, testées en DEV seulement) | Tablette réelle, mode avion, PWA installée |
| Préparation commerciale | 5 | 2 | **2** | — | Sandbox Mobile Money ; pilote ; onboarding de bout en bout |
| **Total** | **100** | **60** | **68** | | |

## Écart vers 99/100 (31 points)

Les points restants dépendent surtout de **preuves hors code**, que le code seul ne peut pas
fournir :

1. Déploiement validé de `main` puis restauration rejouée avec des données métier (+3 production).
2. Recette terrain : tablette, réseau coupé, Mobile Money sandbox puis réel, pilote (+5 offline, commercial).
3. Campagne de charge sur environnement dimensionné, bulletins groupés compris (+4 performance).
4. Revue de sécurité indépendante (ASVS) et jetons hors `localStorage` (+3 sécurité).
5. Lot B3 et activation de `cycle_policy_available` ; campagne d'accessibilité (+3 frontend).
6. Parcours E2E LMD, webhook signé, imports (+5 parcours et fiabilité).

## Conditions GO / NO-GO

**NO-GO pour une généralisation nationale** à cette date (inchangé depuis
`NATIONAL_DEPLOYMENT_READINESS.md`) : production en retard, aucune recette terrain, aucune
mesure de charge récente. Un **pilote de 2 à 5 établissements** devient envisageable après :
déploiement validé de `main`, restauration avec données démontrée, recette par rôle signée et
sandbox Mobile Money vérifiée.
