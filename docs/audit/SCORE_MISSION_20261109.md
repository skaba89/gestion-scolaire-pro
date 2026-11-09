# Score de maturité — grille de la mission, 2026-11-09

Mesuré sur `main` à `7b072ea` (PR #509). **Score : 60/100, non certifié.**
Une capacité sans preuve ne reçoit pas de points ; un point n'est accordé
qu'avec une preuve citée ci-dessous. Ce n'est pas une certification ni un
audit indépendant.

> Grille de la mission (20/15/15/10/15/10/5/5/5) — différente du barème
> historique de `QUALITY_SCORECARD.md` (15/15/15/10/10/10/10/5/5/5, 60/100
> le 2026-11-05). Les deux totaux ne sont pas comparables ligne à ligne.

## Preuves mesurées (commit exact de `main`)

| Indicateur | Résultat | Source |
|---|---|---|
| CI `main` `7b072ea` | 4 jobs créés, 4 verts (Frontend, Backend Tests PostgreSQL, Security Scan, E2E) ; **Backend et Browser Smoke jamais créés par GitHub** (échec au démarrage, deux tentatives) | run 42672089068 |
| Preuve de substitution | Arbre de `main` **identique** (`1634452f`) au commit de la PR #509 (`92db7bd`) : **6/6 jobs verts** | check-runs de `92db7bd` |
| Backend PostgreSQL | 3 012 réussis, 1 ignoré ; couverture 74,6 % | job 129350744004 |
| Vitest | 683 réussis, 118 fichiers | job Frontend |
| E2E sur vraie stack (NOBYPASSRLS) | 43 réussis, dont recette des 9 portails (202 entrées de menu, 0 défaut connu), hors ligne (10, 11) | job 129350744450 |
| Test instable connu | `test_realtime_websocket_revocation…test_super_admin_role_still_in_db_can_cross_tenant` (`CancelledError`, run `main` de #506 ; vert ensuite) | run 42644039294 |
| TypeScript strict | 165 erreurs (référence abaissée 173 → 165) | `npm run type-check` |
| ESLint | 0 erreur, 1 865 avertissements (budget CI 2 116) | ESLint JSON |
| Contrat frontend → API | 666 opérations ; **29** appels sans route (référence abaissée 35 → 29) | `scripts/audit/frontend-api-routes.mjs` |
| Dépendances | pip-audit : aucune vulnérabilité connue ; npm audit : pas de HIGH/CRITICAL | job Security Scan |
| Contrôles obligatoires | **5/6** : « E2E Journeys (real stack) » n'est pas requis | ruleset `protect-main` 24558312 |
| Sauvegardes (VPS, lecture seule) | dump quotidien OK (09/11 00:00) ; copie chiffrée B2 OK ; supervision 5 min : `api=ok disque=ok distant=ok dump=ok` | journaux `db-backup`, `/var/log/schoolflow-surveillance.log` |
| Restauration | exercice B2 réussi le 2026-11-04 (RPO 5 h, RTO 19 s) — base alors sans élèves | `docs/audit/preuves/restauration-b2-20261104.md` |
| Production | **100 commits de retard sur `main`** : les correctifs de #498–#509 ne sont pas déployés (aucun déploiement autorisé) | `git rev-list --count HEAD..origin/main` sur le checkout de production |
| Performance | k6 réel, août 2026, Docker local : 25 VUs p99 2,26 s, erreurs 0,14 % ; jamais rejoué depuis ni sur environnement dimensionné | `docs/LOAD_TEST_RESULTS.md` |

## Grille

| Critère | Max | Points | Preuve | Points manquants / action |
|---|---:|---:|---|---|
| Parcours métier | 20 | **11** | E2E réels : inscription, FK étrangères, concurrence ; évaluation → note → bulletin PDF (moyenne/rang = bulletin, texte PDF comparé en pytest PG) ; présences (corrigées, hors ligne) ; frais → facture → Mobile Money + espèces ; 9 portails parcourus | B2 admission/réinscription/transfert/changement d'année ; B3 correction/publication ; relevé LMD en E2E ; B6 webhook signé, remboursement, export comptable en E2E ; actions des pages (formulaires) non jouées |
| Sécurité et multi-tenant | 15 | **11** | API sous rôle NOBYPASSRLS en E2E ; nombreux tests cross-tenant/IDOR (PG) ; refus 403 par rôle en E2E ; purge hors ligne à la déconnexion ; secrets (gitleaks) et dépendances propres | Jetons en `localStorage` ; aucune revue ASVS / test d'intrusion indépendant ; politique CSP/XSS non auditée dans ce lot |
| Fiabilité backend et intégrité | 15 | **10** | 3 012 tests PG, couverture 74,6 % ; idempotence des écritures hors ligne ; nombreux correctifs d'intégrité (bulletins, inscriptions, notes) | SQL brut divergeant du schéma encore découvert ce jour (portails étudiant, département) : risque résiduel sur le SQL brut non couvert ; 29 appels sans route ; un test instable |
| Frontend, UX, accessibilité | 10 | **5** | 202 entrées de menu sans erreur ; états d'erreur visibles ajoutés (bulletins, rappels, hors ligne) | 165 erreurs TS, 1 865 avertissements ESLint ; aucune campagne d'accessibilité ; mobile non testé ; couleurs/seuils en dur |
| Tests et non-régression | 15 | **11** | PG + SQLite + Vitest + 43 E2E ; preuve « rouge avant, vert après » sur chaque correctif ; cliquets (TS, ESLint, API, portails) resserrés | E2E non obligatoire (5/6) ; test instable ; CI `main` incomplète sur `7b072ea` (anomalie GitHub) |
| Production, sauvegardes, observabilité | 10 | **6** | Dump + B2 + supervision vérifiés ce jour ; restauration prouvée le 04/11 | Production en retard de 100 commits ; restauration non rejouée avec des données réelles ; pas de centralisation des journaux ni d'alerting au-delà de l'e-mail vérifié ici |
| Performance | 5 | **1** | Campagne k6 réelle (août), plan existant | Pas de mesure récente p50/p95/p99, ni de palier 100/1000 sur environnement dimensionné, ni de génération groupée de bulletins mesurée |
| Offline et mobile | 5 | **3** | E2E coupure/reprise (une seule présence au dernier statut) ; purge à la déconnexion ; liste hors ligne juste ; indicateur fiable | Appareils réels, mode avion, PWA installée, rechargement hors ligne (service worker) ; deux chemins de saisie (O7) |
| Préparation commerciale | 5 | **2** | Plans, essai, lecture seule à l'échéance et facturation locale testés (`test_subscription_enforcement.py`, `test_subscription_expiry.py`, `test_local_billing.py`) | Sandbox Mobile Money non vérifiée ; pas de recette pilote école/université ; onboarding non testé de bout en bout |
| **Total** | **100** | **60** | | |

## Problèmes P0 ouverts

Aucun défaut P0 connu dans le code à cette date (les trois P0 trouvés par la
recette des portails — R1, R2, R3 — sont corrigés et vérifiés en CI).
**Condition opérationnelle bloquante pour annoncer ces correctifs aux
utilisateurs** : ils ne sont pas en production (100 commits de retard) ; un
déploiement exige une validation explicite, une sauvegarde préalable et un
plan de retour arrière (`deploy/vps/README.md`).

## Ce qui ferait gagner des points, par ordre d'effet

1. Rendre « E2E Journeys » obligatoire et stabiliser le test WebSocket (+2 tests).
2. Recette B2 admissions et B6 webhook/remboursement/export en E2E (+3 à +4 parcours).
3. Déploiement validé de `main` puis exercice de restauration avec données (+2 production).
4. Campagne de charge sur environnement dimensionné, dont bulletins groupés (+2 performance).
5. Revue de sécurité indépendante (ASVS) et passage des jetons hors `localStorage` (+2 sécurité).
6. Réduction mesurée de la dette TS/ESLint et campagne d'accessibilité (+2 frontend).
