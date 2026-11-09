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
- Score : **60/100 historique, non certifié, non recalculé** dans ce lot. La grille
  sur 100 points de la mission n'a pas encore été évaluée critère par critère ;
  aucune note supérieure n'est revendiquée.

## Matrice des parcours métier réellement couverts (stack réelle)

Source : `tests/e2e/journeys/` exécuté par le job « E2E Journeys (real stack) »
(PostgreSQL + Redis + API + frontend, rôle runtime NOBYPASSRLS).

| Parcours | Scénario E2E existant | Couvert | Manquant / limite |
|---|---|---|---|
| B1 Admin / établissements | 02 isolation, 06 règles académiques | Isolation lecture/écriture entre deux établissements ; redirection d'URL étrangère ; enseignant refusé en finance | Création d'établissement, année, campus/facultés, réinitialisation de mot de passe, changement d'établissement |
| B2 Élèves / admissions | 01 inscription, 06 FK étrangères, 07 concurrence | Création UI, affectation, refus de FK étrangères, une seule inscription active en parallèle | Préinscription → admission, réinscription, transfert, changement d'année, archivage |
| B3 Évaluations / notes | 03 notes, 07 matières | Création d'évaluation et saisie par l'enseignant ; matière notée non supprimable | Correction de note, coefficients multiples, publication, refus hors périmètre en UI |
| B4 Bulletins / relevés | 03 notes, 06 règles académiques | Note visible côté admin, PDF valide (en-tête `%PDF-`), seuils par niveau | **Contenu du PDF non comparé au calcul serveur** ; classement/égalités en E2E ; relevé LMD ; parents/anciens élèves en E2E (couverts en pytest) |
| B5 Présences | 05 présences | Absent puis corrigé : une seule présence au bon statut | Justification, QR/badge, coupure réseau |
| B6 Finances | 04 frais/facture | Frais → facture → Mobile Money + espèces → soldée | Webhook signé en E2E, remboursement, export comptable |
| B7 Portails | 02, 08 alertes | Admin, enseignant, admin témoin | DIRECTOR, SECRETARY, ACCOUNTANT, STUDENT, PARENT, ALUMNI, DEPARTMENT_HEAD : aucun compte de recette E2E |
| E Offline / mobile | — | — | Aucun scénario coupure / reprise réseau |

Les règles de calcul des bulletins (rangs individuel/groupé, égalités, notes
pondérées, élèves sans note, identifiants SQLite/PostgreSQL, propriété
parent/ancien élève/enseignant) sont couvertes par pytest (`backend/tests/test_*bulletin*`,
`test_report_card_*`, `test_individual_batch_bulletin_rank_parity.py`) et non en E2E.

## Défauts corrigés depuis cette référence

| ID | Priorité | Défaut | Preuve | PR |
|---|---|---|---|---|
| REPORT-CARDS-ROSTER-01 | P0 (émission des bulletins) | La page admin « Bulletins » croisait les inscriptions de la classe avec `GET /students/?page_size=100` (100 élèves les plus récents, plafond serveur `le=100`, tri `created_at desc`). Dans un établissement de plus de 100 élèves, les inscrits plus anciens disparaissaient de la liste et du compteur « Tous les bulletins », sans erreur (`.catch` silencieux). | `src/pages/admin/__tests__/ReportCards.roster.test.tsx` rouge avant, vert après ; contrat d'embarquement de l'élève vérifié dans `03-grades-report-card.spec.ts` | à ouvrir |
