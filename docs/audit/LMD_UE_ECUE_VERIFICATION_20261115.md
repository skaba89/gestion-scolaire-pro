# Vérification LMD — unités d'enseignement et ECUE — 2026-11-15

Branche : `feature/lmd-teaching-units`. Base fonctionnelle : `main` après la
fusion de la PR #558. Aucun déploiement en production n'a été effectué.

## Réutilisation et périmètre

Le lot ne remplace ni `subjects`, ni les semestres, ni les ECTS, ni les
prérequis, ni la progression existante. Il ajoute une ressource UE additive ;
une matière existante peut rester indépendante ou devenir un ECUE en étant
rattachée à une UE du même semestre. Aucune donnée historique n'est réécrite.

- table `teaching_units`, révision optimiste, archivage sans suppression ;
- lien nullable `subjects.teaching_unit_id` ;
- clé étrangère composite `(tenant_id, teaching_unit_id)` interdisant un lien
  vers l'UE d'un autre établissement, même hors API ;
- cohérence obligatoire du semestre UE/ECUE ;
- RLS `ENABLE` + `FORCE`, politique tenant en lecture et écriture ;
- routes `/teaching-units/` rattachées au module `lmd`, donc refusées par appel
  API direct lorsque ce module est désactivé ;
- API de création, lecture et modification/archivage avec RBAC et audit ;
- une UE archivée conserve ses liens existants mais refuse tout nouveau
  rattachement ECUE, y compris par appel API direct ;
- écran responsive UE, crédits attendus/affectés et état de cohérence ;
- sélection de l'UE dans le formulaire matière, limitée au même semestre ;
- navigation masquée par le moteur modulaire et libellée dans les cinq langues.

## Preuves exécutées avant PR

| Contrôle | Résultat |
|---|---:|
| Backend ciblé SQLite, schéma neuf | 65 réussis, 11 ignorés, 0 échec |
| PostgreSQL 16.2 migré, LMD + RLS + progression/relevés | 93 réussis, 0 échec |
| Frontend ciblé UE + moteur modulaire | 17 réussis, 0 échec |
| Backend SQLite complet, schéma neuf | 2 466 réussis, 951 ignorés, 0 échec |
| Frontend complet | 946 réussis, 141 fichiers, 0 échec |
| ESLint ciblé | 0 erreur ; avertissements historiques dans fichiers existants |
| Build Vite production | réussi, 5 272 modules transformés |
| TypeScript par baseline | 146 erreurs historiques / baseline 146, aucun nouvel écart |
| JSON FR/EN/ES/AR/ZH | valide |
| Parcours Playwright UE/ECUE | 1 scénario découvert/compilé ; exécution réelle CI en attente |

Le parcours Playwright `20-lmd-teaching-units.spec.ts` couvre l'interface,
l'isolation, la cohérence ECTS, le mobile et l'archivage avec conservation du
lien ECUE. La CI et ce parcours E2E réel doivent encore être exécutés avant
fusion ; ce document sera mis à jour uniquement avec leurs résultats observés.

## Limites explicites

Ce lot ne déclare pas fonctionnels la compensation intra/inter-UE, les règles
de capitalisation configurables, les rattrapages, les jurys/délibérations, les
stages, les mémoires ou les diplômes. `ects_consistent` est un diagnostic : il
n'efface ni ne bloque les historiques lorsque la somme des ECUE diffère de
l'ECTS déclaré par l'UE. Les règles de validation feront l'objet d'un lot
séparé après validation métier guinéenne.
