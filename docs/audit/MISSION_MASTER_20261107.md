# Mission master — reprise du 7 novembre 2026

## Deuxième lot — dossiers salariés (base après #426)

La PR #426 est fusionnée (`ac5d12a2`), avec six jobs réussis sur son dernier
HEAD `5136563`. Le premier lot est validé en CI, sans déploiement effectué.

EMPLOYEE-DELETE-01 : perte de contrats, paies et congés reproduite sur les
cascades de salariés. Protection 409, verrou PostgreSQL, désactivation par
formulaire et tests proposés dans le lot suivant.

| Chantier | Fonctionnalité | Priorité | Diagnostic / correction | Tests | PR / CI / fusion | Production | Risque résiduel |
|---|---|---|---|---|---|---|---|
| 2 / 9 / 11 | Historique salariés | P0 | Cascade destructive reproduite ; blocage des dossiers renseignés, désactivation conservatrice | 33 SQLite, 2 Vitest ciblés réussis ; concurrence PG et parcours réel ajoutés | PR à ouvrir ; six jobs HEAD à confirmer | Non déployée | Rétention et suppression directe des documents RH hors lot |

Fichiers, politique, rollback et limites : [EMPLOYEE_HISTORY_20261107.md](EMPLOYEE_HISTORY_20261107.md).
Les sections initiales ci-dessous conservent les états du premier diagnostic.

## Référence vérifiée

- Base : `0ae32f79a012ac9d654fc23af2b33bb7b5fc6155` (main, PR #425).
- PR #423 fusionnée le 7 novembre à 12:37 UTC ; #424 et #425 déjà intégrées.
- Aucune PR ouverte lors de la lecture initiale de l'API GitHub.
- Les six checks de cette base sont `completed/success` : Backend,
  Backend Tests (PostgreSQL), Frontend, Browser Smoke (Playwright),
  E2E Journeys (real stack), Security Scan.
- Preuve : https://github.com/skaba89/gestion-scolaire-pro/actions/runs/42381524806
- Recalcul OpenAPI : 658 opérations. Analyse frontend : 983 appels,
  21 URL dynamiques non vérifiables, 34 occurrences avec chemin manquant,
  1 avec méthode incorrecte ; 33 clés distinctes contre 35 dans la référence.
  Les deux écarts déjà corrigés sont `GET /schedule/terms` et `PATCH /students/X`.
  Aucun changement de référence dans ce lot, sans rapport avec ces contrats.
- TypeScript : 173 erreurs, référence 173, aucune nouvelle erreur.
- La matrice statique exécutée sous Windows présente des séparateurs de
  chemins différents ; ses classifications ne constituent pas une mesure
  comparable à l'historique Linux. Recette des écrans non réalisée.
- Score historique 60/100 non certifié : non recalculé, aucun point ajouté.

## Premier lot : ASSESSMENT-DELETE-01 (P0, intégrité académique)

`DELETE /assessments/{id}/` supprimait une évaluation sans vérifier ses notes.
`grades.assessment_id` utilise ON DELETE CASCADE (migration
`20260224_0915_b2c3d4e5f6a7_add_school_life_infrastructure.py`).
Le test SQLite avec clés étrangères actives échoue avant correction : aucune
exception, note supprimée. Deux autres scénarios passent déjà.

Correction : verrou PostgreSQL de l'évaluation appartenant au tenant avant
lecture des notes ; réponse 409 si une note existe ; suppression toujours
possible pour une évaluation vide ; 404 pour un identifiant étranger.
Rollback sur refus pour libérer le verrou. Les contrôles enseignant existants
sont conservés. Aucun changement de schéma ni de permissions.

La route miroir `DELETE /school-life/assessments/{id}/` utilisait aussi
une suppression ORM en cascade ; elle est protégée par le même contrôle
d'historique et un verrou ORM, avec conservation de son audit de suppression.

Fichiers : `backend/app/api/v1/endpoints/academic/assessments.py`,
`backend/app/api/v1/endpoints/operational/school_life.py`,
`backend/tests/test_assessment_delete_history.py`,
`backend/tests/test_assessments_teacher_scope.py`.

Validation locale : six tests SQLite ciblés réussis après correction,
dont trois sur le miroir ORM réel (409, suppression vide, tenant étranger).
Vitest : 98 fichiers et 551 tests réussis. Build réussi.
Quatre scénarios HTTP PostgreSQL ajoutés : administrateur sur les deux routes,
enseignant et autre établissement. Docker local indisponible ; validation PostgreSQL et
concurrence réelle non annoncées avant résultats CI.

Impact interface : le contrat d'erreur existant reçoit 409 au lieu d'un faux
succès destructeur. Recette visuelle non réalisée. Retour arrière : revert
du commit applicatif ; aucune migration à annuler, mais le revert réintroduit
le risque. Les suppressions historiques ne sont pas restaurées par ce lot.

## Suivi des douze chantiers

Les lignes « à auditer » sont des travaux à vérifier, pas des défauts confirmés.
La priorité P0 du premier lot repose sur la perte reproduite d'une note.

| Chantier | Fonctionnalité / priorité | Diagnostic | Correction / tests | PR / CI / fusion | Production | Risque résiduel / dépendances |
|---|---|---|---|---|---|---|
| 1 | RBAC et tenants / P0 | Audit transversal à reprendre | Lot 2 conserve les contrôles et ajoute test étranger | Non validé globalement | Non déployée | Revue routes, fichiers, sessions et rôles |
| 2 | Suppression évaluations / P0 | Perte de notes reproduite | ASSESSMENT-DELETE-01 ; 6 tests SQLite verts, tests PostgreSQL ajoutés | [#426](https://github.com/skaba89/gestion-scolaire-pro/pull/426), brouillon ; six jobs du dernier HEAD à confirmer | Non déployée | Autres cascades, concurrence et rétention à examiner |
| 3 | Contrats API / P0 | 33 clés statiques encore ouvertes | Recalcul 658 opérations / 983 appels | Aucun correctif dans ce lot | Non déployée | Vérification manuelle des 21 URL dynamiques |
| 4 | Comptes et menus / P1 | Correctifs #424 déjà présents ; cycle complet à vérifier | Aucun nouveau test de recette | À auditer | Non vérifiée | Matrice rôle × action requise |
| 5 | Scolarité / P1 | #425 protège des liens et factures | Ne pas redévelopper ce correctif | Déjà fusionné ; CI base verte | Non vérifiée | Inscriptions, transferts, doublons |
| 6 | Notes et bulletins / P1 | Suppression des évaluations liée au chantier 2 | Protection proposée ; calculs indépendants hors lot | En attente | Non déployée | Règles métier et validation pédagogique |
| 7 | Emplois du temps / P1 | #421 déjà intégrée | Audit documentaire existant à compléter | Pas de nouveau correctif | Non vérifiée | Concurrence PostgreSQL et recette |
| 8 | Parents et élèves / P1 | Audits de lecture existants | Recette multi-enfants à reprendre | Non validé globalement | Non vérifiée | Familles recomposées et accès étrangers |
| 9 | Finance/SaaS / P1 | Ancien défaut FIN-01 corrigé ; sandbox non confirmée | Aucun résultat fournisseur inventé | À auditer | Non vérifiée | Accès sandbox et règles quotas |
| 10 | Offline/mobile / P1 | Preuves sur appareils manquantes | Aucun essai réel réalisé | Non validé | Non vérifiée | Appareils, synchronisation, compte partagé |
| 11 | TypeScript/UX / P2 | 173 erreurs actuelles | Contrôle de référence réussi | Pas de nouvelle dette TS | Non déployée | Accessibilité et performances non mesurées |
| 12 | Exploitation / P0 lancement | CI base verte ; état OVH inconnu | Aucune intervention production | GO/NO-GO non établi | Aucun déploiement | Sauvegarde/restauration récente, charge, pilote, accord distinct |

Ordre suivant : terminer la validation du lot 2, auditer les autres cascades
d'évaluations/matières et dossiers salariés ; puis traiter les contrats API
par domaine. La sécurité globale et la préparation nationale restent ouvertes.
