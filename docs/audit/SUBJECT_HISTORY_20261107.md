# SUBJECT-DELETE-01 — protection de l'historique des matières

## Base et diagnostic

Base vérifiée : `0c78fc67d920b69c83c211d214fc9586511b3468` (PR #427 fusionnée).
Aucune PR ouverte au contrôle initial. CI du commit de fusion examinée ;
certains jobs étaient encore en cours. Les six jobs du HEAD de #427 ont été
validés dans le lot précédent. Aucun résultat de fusion en cours n'est
présenté comme terminé.

Le DELETE matière appelait `db.delete()` sans contrôle des usages. La FK
assessments.subject_id utilise CASCADE et grades.assessment_id utilise
CASCADE : supprimer la matière contournait la protection du DELETE évaluation.
Les notes directes et présences perdaient leur matière par SET NULL.
Les inscriptions et prérequis disparaissaient ; un planning bloquait avec 500.

Reproduction HTTP SQLite avant correction : 9 échecs / 6 succès dans les
nouveaux tests (204 destructeur ou 500 au lieu du refus métier attendu).

## Politique et correction

- Refuser avec 409 toute matière possédant des dossiers ou affectations
  pédagogiques. Conserver identité, notes et contexte ; une modification
  conservant l'identifiant reste possible. Aucun archivage fictif ajouté.
- Conserver la suppression des matières inutilisées : les trois configurations
  `subject_levels`, `subject_departments`, `subject_preferred_rooms` peuvent
  suivre la suppression, comme auparavant. Les affectations à des classes ou
  élèves et les prérequis ne sont pas des configurations jetables.
- Verrouiller la matière du tenant courant avec FOR UPDATE avant vérification.
  Les insertions FK concurrentes prennent KEY SHARE sur PostgreSQL.
- Examiner les FK réelles du schéma courant avec SQLAlchemy, y compris les
  tables opérationnelles migrées sans modèle ORM (devoirs, examens, enseignants,
  pointages, etc.). Les identifiants de catalogue sont cités par SQLAlchemy ;
  les UUID restent paramétrés. Aucun SQL construit depuis une saisie utilisateur.
- Une erreur SQL de vérification renvoie 503 et rollback, jamais un succès.
- Permissions subjects:write conservées, tenant étranger masqué par 404.
- Le frontend réutilise sa notification d'erreur et n'abandonne plus une
  promesse rejetée via mutateAsync. Bouton de suppression nommé pour le clavier
  et les lecteurs d'écran.

## Validation avant PR

- 48 tests SQLite réussis / 3 PostgreSQL ignorés : nouveau lot + isolation.
- 19 autres tests réussis / 12 ignorés localement : associations, prérequis,
  salles préférentielles et inscriptions individuelles.
- Build réussi ; TypeScript 173 erreurs historiques, aucune nouvelle.
- Tests PostgreSQL ajoutés pour les tables migrées homework et exams,
  ainsi que la concurrence réelle : observation de pg_blocking_pids, commit
  d'une évaluation, puis refus de suppression et conservation des deux lignes.
- Nouveau parcours Playwright réel : matière, élève, évaluation et note créés
  via API ; refus 409 dans l'écran matières ; note 17/20 et identifiants conservés.

Les six jobs du nouveau HEAD doivent réussir ; résultats définitifs à consigner
dans la PR. Aucun succès PostgreSQL local revendiqué (Docker indisponible).

## Fichiers, rollback et limites

`backend/app/crud/academic.py`,
`backend/app/api/v1/endpoints/academic/subjects.py`,
`backend/tests/test_subject_delete_history.py`,
`src/pages/admin/Subjects.tsx`, `src/components/subjects/SubjectTable.tsx`,
`tests/e2e/journeys/07-subject-history.spec.ts`.

Aucune migration, aucune permission élargie et aucun score global ajouté.
Les pertes historiques ne sont pas restaurées. La suppression globale d'un
établissement et les autres entités académiques restent des périmètres distincts.
Ce contrôle traite les références déclarées dans le schéma courant ; les
références textuelles sans FK ne sont pas couvertes automatiquement.

Retour arrière : revert applicatif, réintroduisant le risque de perte/détachement.
Aucun déploiement ni fusion automatique. Prochain lot : années et périodes
académiques, après diagnostic des suppressions et éventuels travaux concurrents.
