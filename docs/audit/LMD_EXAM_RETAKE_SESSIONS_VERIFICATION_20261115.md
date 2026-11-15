# Sessions d'examen et rattrapages LMD — vérification du lot

Date : 15 novembre 2026

## Périmètre livré

- Table additive `exam_sessions`, isolée par établissement et protégée par RLS PostgreSQL `ENABLE` + `FORCE`.
- Sessions `REGULAR` et `RETAKE`, états irréversibles `DRAFT → OPEN → CLOSED` et révision optimiste.
- Politiques de sélection configurables : meilleure note (`BEST`) ou dernière tentative (`LATEST`).
- Rattachement facultatif des évaluations existantes à une session, avec clé étrangère composite tenant/session.
- Contrôle de cohérence entre le semestre de la matière et celui de la session.
- Gel des évaluations et des notes, y compris via l'API miroir `school-life`, après clôture.
- Calcul LMD central : les évaluations historiques non rattachées restent la base régulière ; une session liée ne compte qu'après clôture.
- Détail des tentatives et de la session effectivement retenue dans l'aperçu de validation.
- Administration des sessions sur la page des UE et sélection de la session lors de la création d'une évaluation.
- Audit obligatoire de chaque création, changement d'état ou modification de session.
- Protection par le module `lmd` : une session n'est pas accessible par appel API direct lorsque le module est désactivé.

## Compatibilité et intégrité

- Migration `20261115_0002` strictement additive ; aucune note, évaluation ou configuration existante n'est réécrite.
- Les évaluations sans `exam_session_id` conservent exactement leur comportement antérieur.
- Aucun endpoint de suppression de session n'est exposé ; une session clôturée est immuable.
- Le champ historique isolé `school_settings.resit_enabled` n'est pas utilisé comme seconde source de vérité.
- Le `downgrade` ne supprime aucune donnée académique.

## Preuves exécutées localement

| Contrôle | Résultat observé |
|---|---:|
| Backend complet SQLite | 2 477 réussis, 956 ignorés, après le durcissement final du gel des notes |
| Tests ciblés sessions/LMD/notes/isolation | 47 réussis, 11 ignorés |
| Migration additive SQLite depuis schéma historique + réexécution | 1 réussi |
| Frontend complet Vitest | 950 réussis, 142 fichiers |
| Tests UI ciblés | 6 réussis, 2 fichiers |
| Build Vite production | réussi, 5 273 modules transformés |
| TypeScript | aucune nouvelle erreur, baseline inchangée 146/146 |
| Alembic | une seule tête : `20261115_0002` |

Les tests marqués PostgreSQL (RLS réelle, clé composite, concurrence, migration et APIs SQL UUID) et le parcours Playwright réel sont volontairement laissés à la CI PostgreSQL. Ils ne doivent être déclarés réussis qu'après publication de la preuve CI.

## Scénarios de non-régression couverts

1. Un rattrapage `OPEN` est ignoré par le résultat officiel.
2. Après clôture, `BEST` conserve la meilleure note et `LATEST` remplace la tentative précédente.
3. Deux établissements ne peuvent ni lire ni modifier leurs sessions respectives.
4. Une matière d'un autre semestre ou établissement ne peut pas être rattachée.
5. Une révision obsolète reçoit `409` ; deux écritures PostgreSQL concurrentes ne peuvent pas gagner ensemble.
6. Une session clôturée interdit la modification/suppression des évaluations et la création/modification/suppression des notes.
7. La désactivation du module LMD bloque `/exam-sessions/` au niveau de l'API.
8. Le parcours E2E crée une session de rattrapage, vérifie l'isolation, l'ouvre, la clôture et confirme l'absence de suppression.

## Hors périmètre du lot

Les décisions de jury, dérogations nominatives, procès-verbaux signés et délivrance de diplômes restent un lot séparé. Ils s'appuieront sur les tentatives historisées de ce lot sans modifier les notes sources.
