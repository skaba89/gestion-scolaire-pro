# Préparation du projet — état mesuré

Document vivant. Chaque ligne cite une preuve vérifiable ; une capacité sans preuve
est marquée **non vérifiée** et ne reçoit pas de points. Historique des lots :
`QUALITY_SCORECARD.md`, `MISSION_MASTER_20261107.md`.

## Référence du 2026-11-09

- `main` = `8643ddb` (PR #497). Aucune PR ouverte à la lecture.
- CI de la PR #496 (`5682e93`, run 42533274300) : 6/6 jobs `success` — Backend,
  Backend Tests (PostgreSQL), Frontend, Security Scan, Browser Smoke (Playwright),
  E2E Journeys (real stack). Run de #497 en cours à la lecture.
- Local (worktree de `8643ddb`) : Vitest 111 fichiers / 643 tests réussis ;
  TypeScript 165 erreurs pour une référence de 173 (aucune nouvelle).
- Score : **60/100 sur la grille de la mission, mesuré le 2026-11-09** sur
  `main` `7b072ea`, non certifié — détail critère par critère et preuves :
  [`SCORE_MISSION_20261109.md`](SCORE_MISSION_20261109.md). Les correctifs de
  cette session ne sont **pas déployés** (production en retard de 100 commits).

## Matrice des parcours métier réellement couverts (stack réelle)

Source : `tests/e2e/journeys/` exécuté par le job « E2E Journeys (real stack) »
(PostgreSQL + Redis + API + frontend, rôle runtime NOBYPASSRLS).

| Parcours | Scénario E2E existant | Couvert | Manquant / limite |
|---|---|---|---|
| B1 Admin / établissements | 02 isolation, 06 règles académiques | Isolation lecture/écriture entre deux établissements ; redirection d'URL étrangère ; enseignant refusé en finance | Création d'établissement, année, campus/facultés, réinitialisation de mot de passe, changement d'établissement |
| B2 Élèves / admissions | 01 inscription, 06 FK étrangères, 07 concurrence | Création UI, affectation, refus de FK étrangères, une seule inscription active en parallèle | Préinscription → admission, réinscription, transfert, changement d'année, archivage |
| B3 Évaluations / notes | 03 notes, 07 matières | Création d'évaluation et saisie par l'enseignant ; matière notée non supprimable | Correction de note, coefficients multiples, publication, refus hors périmètre en UI |
| B4 Bulletins / relevés | 03 notes, 06 règles académiques | Note visible côté admin ; moyenne et rang affichés = métadonnées du bulletin v2 ; onglet Analyse = moyennes officielles de la période et seuil du niveau ; PDF valide ; seuils par niveau. Texte du PDF comparé au calcul serveur en pytest PostgreSQL (`test_report_card_class_summary.py`) | Classement/égalités en E2E ; relevé LMD ; parents/anciens élèves en E2E (couverts en pytest) |
| B5 Présences | 05 présences | Absent puis corrigé : une seule présence au bon statut | Justification, QR/badge, coupure réseau |
| B6 Finances | 04 frais/facture | Frais → facture → Mobile Money + espèces → soldée | Webhook signé en E2E, remboursement, export comptable |
| B7 Portails | 02, 08 alertes, **09 portails** | 9 rôles d'établissement connectés par l'interface ; 202 entrées de menu ouvertes (admin 64, direction 53, secrétariat 29, comptabilité 18, chef de département 11, enseignant 8, parent 8, étudiant 7, ancien étudiant 4) ; redirection hors portail et 403 API par rôle | **référence vide** : 0 défaut connu sur les entrées parcourues (R1–R5 traités) ; actions des pages (formulaires, boutons) non jouées ; affichage mobile non testé ; SUPER_ADMIN non couvert |
| E Offline / mobile | 10 confidentialité, 11 coupure / reprise | Après déconnexion, aucune base IndexedDB ne conserve de données ; liste hors ligne = élèves inscrits de la classe (un élève d'une autre classe n'y figure pas) ; pointage saisi sans réseau, corrigé, envoyé une seule fois au dernier statut au retour du réseau ; indicateur global = vraies saisies en attente | Appareils réels / mode avion, PWA installée, rechargement de page hors ligne (service worker), fusion des deux chemins de saisie (O7) |

Les règles de calcul des bulletins (rangs individuel/groupé, égalités, notes
pondérées, élèves sans note, identifiants SQLite/PostgreSQL, propriété
parent/ancien élève/enseignant) sont couvertes par pytest (`backend/tests/test_*bulletin*`,
`test_report_card_*`, `test_individual_batch_bulletin_rank_parity.py`) et non en E2E.

## Défauts corrigés depuis cette référence

| ID | Priorité | Défaut | Preuve | PR |
|---|---|---|---|---|
| REPORT-CARDS-ROSTER-01 | P0 (émission des bulletins) | La page admin « Bulletins » croisait les inscriptions de la classe avec `GET /students/?page_size=100` (100 élèves les plus récents, plafond serveur `le=100`, tri `created_at desc`). Dans un établissement de plus de 100 élèves, les inscrits plus anciens disparaissaient de la liste et du compteur « Tous les bulletins », sans erreur (`.catch` silencieux). | `src/pages/admin/__tests__/ReportCards.test.tsx` (ex-`ReportCards.roster.test.tsx`) rouge avant, vert après ; contrat d'embarquement de l'élève vérifié dans `03-grades-report-card.spec.ts` | [#498](https://github.com/skaba89/gestion-scolaire-pro/pull/498), fusionnée (`8412460`), CI 6/6 |
| REPORT-CARDS-SUMMARY-01 | P1 | « Moy. estimée » recalculée dans le navigateur sur toutes les périodes, regroupée par nom de matière, note absente = 0 : pouvait différer du PDF. N requêtes `/grades/` à chaque affichage. | `test_report_card_class_summary.py` (SQLite + PostgreSQL), `ReportCards.test.tsx`, parcours E2E 03 | à ouvrir |
| PDF-FILENAME-01 | P2 | `Content-Disposition` des PDF de bulletin/attestation contenait des octets non ASCII (prénoms accentués) ; la réponse échouait sous le client de test. | Échec reproduit sur PostgreSQL avant correctif ; tests d'en-tête | à ouvrir |
