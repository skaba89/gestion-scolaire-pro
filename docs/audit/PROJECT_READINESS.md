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
| B2 Élèves / admissions | 01 inscription, 06 FK étrangères, 07 concurrence, 12 candidature → élève → inscription, **13 réinscription / transfert / année suivante** | Création UI, affectation, refus de FK étrangères, une seule inscription active en parallèle ; candidature convertie une seule fois, parent rattaché (compte existant ou en attente) ; réinscription rattachée à l'élève existant ; transfert de classe en une seule opération (historique TRANSFERRED, rejeu refusé) ; inscription l'année suivante | Préinscription publique en E2E UI (testée par l'API seulement), archivage |
| B3 Évaluations / notes | 03 notes, 07 matières | Création d'évaluation et saisie par l'enseignant ; matière notée non supprimable | Correction de note, coefficients multiples, publication, refus hors périmètre en UI |
| B4 Bulletins / relevés | 03 notes, 06 règles académiques | Note visible côté admin ; moyenne et rang affichés = métadonnées du bulletin v2 ; onglet Analyse = moyennes officielles de la période et seuil du niveau ; PDF valide ; seuils par niveau. Texte du PDF comparé au calcul serveur en pytest PostgreSQL (`test_report_card_class_summary.py`) | Classement/égalités en E2E ; relevé LMD ; parents/anciens élèves en E2E (couverts en pytest) |
| B5 Présences | 05 présences | Absent puis corrigé : une seule présence au bon statut | Justification, QR/badge, coupure réseau |
| B6 Finances | 04 frais/facture, **14 parent sans encaissement direct**, **15 annulation et export** | Frais → facture → Mobile Money + espèces → soldée ; un parent ne peut pas solder sa facture (403) ; annulation d'encaissement (facture rétablie, double annulation refusée, reçu annulé) et export CSV (ligne REVERSED conservée, périmètre parent) ; webhook PayTech : signature réelle `hmac_compute` (F5), confirmation unique, montant signé contrôlé, aucun paiement perdu en concurrence (pytest PostgreSQL) | Webhook signé en E2E, sandbox CinetPay |
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


## Intégrité des comptes — 2026-11-14

Référence auditée : `8461420` (#551). USER-DELETE-02 reproduit puis corrigé dans
`fix/user-delete-teacher-history` : suppression refusée en présence d'historique,
désactivation réversible, verrou contre affectation concurrente, tests sur le
schéma migré PostgreSQL 16.2 et rôle sans BYPASSRLS. Détail et limites dans
`INTEGRITY_DELETES_20261113.md`, lot 3. CI/fusion à confirmer. Non déployé.

Le score formel **60/100** reste une mesure historique, pas une mesure de ce
commit. L'estimation 73/100 n'est pas une certification. Aucun nouveau score
n'est accordé à partir de ce seul lot. Le déploiement national reste **NO-GO**
faute de recette complète, PRA représentatif, capacité de charge et validation
terrain documentés ; les risques INVOICE-DELETE-02 et TENANT-DELETE-01 restent
à traiter.


## Mise à jour vérifiée — 2026-11-14, après #552

`main` = `03084c6`. PR #552 fusionnée ; CI #1532 (run 43569446810) : **6/6 réussis**.
Backend PostgreSQL : 3273 réussis / 1 ignoré, couverture 76,87 % ; SQLite CI :
2347 réussis / 927 ignorés, couverture 59,86 %. Parcours E2E et crawl GET/écritures
réussis. Ce sont des résultats de CI, pas des preuves de production.

INVOICE-DELETE-02 est reproduit puis corrigé dans la branche suivante ; preuves,
limites et procédure de retour dans `INVOICE_DELETE_CONCURRENCY_20261114.md`.
Aucun nouveau score de maturité. Aucun déploiement national autorisé par ces tests seuls.


## Intégrité consolidée — 2026-11-14

Référence : `f5f0134` (#553 après #554 et #552). Les trois PR ont passé les six
contrôles requis ; #553 a été revalidée après mise à jour avec #554 (CI #1541).
La migration #555 est préparée : 25 tests PostgreSQL / 20 SQLite réussis (5 ignorés
SQLite), arrêt sur orphelins sans suppression. Les quatre correctifs réunis ont passé
168 tests PostgreSQL / 1 ignoré. La nouvelle CI de #555 intègre ce main consolidé.

Les documents `NATIONAL_DEPLOYMENT_READINESS.md`, `TECHNICAL_DEBT.md` et
`PRODUCTION_RECOVERY_PLAN.md` distinguent preuves et limites. Aucun déploiement,
aucun score actuel certifié, aucun GO national. L'archivage/export complet et les
validations opérationnelles réelles restent ouverts.
