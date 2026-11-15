# Vérification — moteur de validation LMD configurable — 2026-11-15

Branche : `feature/lmd-validation-engine`. Base : `main` après fusion de la
PR #559. Aucun déploiement de production n'est inclus.

## Périmètre livré

Le lot réutilise les semestres, UE, matières/ECUE, notes, ECTS, seuils
académiques et contrôles de progression existants. Il ne crée aucune table et
ne réécrit aucune note. La configuration est additive dans le JSON tenant déjà
existant, avec révision optimiste et audit.

- défaut rétrocompatible : capitalisation de chaque ECUE ayant atteint le
  seuil académique effectif ; aucune compensation implicite ;
- compensation intra-UE activable explicitement ;
- compensation semestrielle activable avec moyenne, note éliminatoire par UE
  et exigence optionnelle de complétude des notes ;
- calcul centralisé par identifiants UE/ECUE, sans regroupement par libellé ;
- calcul sur la précision réelle, l'arrondi à deux décimales étant réservé à
  l'affichage ;
- aperçu en lecture seule par étudiant et semestre ;
- progression ECTS déléguée au même résultat central ;
- routes couvertes par le module `lmd`, RBAC tenant et contrôle d'accès au
  relevé de l'étudiant ;
- rejet du contournement par le PATCH générique des paramètres tenant ;
- écran administrateur responsive, lecture seule pour les profils sans droit
  d'écriture, et conflit 409 en cas de révision périmée ;
- parcours E2E qui modifie une règle puis restaure la configuration initiale.

## Preuves exécutées dans ce lot

| Contrôle | Résultat observé |
|---|---:|
| Backend ciblé SQLite, schéma neuf | 21 réussis, 14 ignorés PostgreSQL, 0 échec |
| Backend moteur + délégation progression | 11 réussis, 1 ignoré PostgreSQL, 0 échec |
| Backend SQLite complet, schéma neuf | 2 471 réussis, 952 ignorés, 0 échec |
| Frontend écran UE/règles LMD | 4 réussis, 0 échec |
| Frontend complet | 948 réussis, 141 fichiers, 0 échec |
| Build Vite production | réussi, 5 272 modules transformés |
| ESLint ciblé | réussi, 0 erreur |
| Vérification i18n | réussie, aucune clé française bloquante manquante |
| TypeScript par baseline | 146 erreurs historiques / baseline 146, aucun nouvel écart |
| `git diff --check` | réussi |

Les tests backend couvrent les valeurs par défaut, les deux compensations,
l'incomplétude, la note éliminatoire, l'audit, les révisions, le refus du
contournement générique, la précision 9,996, plusieurs évaluations d'un ECUE,
les UE homonymes et le cas où une compensation activée n'est pas réellement
nécessaire. Le test de concurrence par verrou de ligne est présent mais n'est
exécutable que sous PostgreSQL. Le parcours Playwright ajouté est seulement
écrit à ce stade ; son succès ne sera déclaré qu'après exécution sur la pile
réelle ou en CI.

## Sécurité et conservation

Le PUT des règles exige `settings:write`, verrouille la ligne tenant, compare
`expected_revision`, écrit la configuration et l'audit dans la même
transaction. Le GET exige `settings:read`. L'aperçu exige `grades:read` et la
même règle de propriété que les relevés. L'arrêt du module LMD bloque ces
routes côté serveur ; masquer le menu n'est pas la mesure de sécurité.

Les valeurs par défaut reproduisent le comportement historique. Modifier ou
désactiver une règle ne supprime aucune UE, ECUE, note, attribution ECTS ou
trace d'audit. Une corruption de la configuration revient aux valeurs sûres
par défaut sans muter les données.

## Limites restantes

Ce moteur calcule un aperçu déterministe ; il ne constitue pas une décision de
jury. Les sessions de rattrapage, tentatives, décisions motivées, dérogations,
procès-verbaux, signatures, recours, diplômes, stages et mémoires nécessitent
des modèles historiques dédiés. Ils restent absents ou non vérifiés et ne
doivent pas être simulés par une simple modification des notes.
