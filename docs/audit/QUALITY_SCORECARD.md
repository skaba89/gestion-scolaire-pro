## Lot lecture de l'emploi du temps enseignant — 2026-11-07, après #407

TEACHER-SCHEDULE-READ-01 (P1), **correctif proposé** : consultation ciblée,
isolation tenant/rôle et erreurs serveur visibles. Détail :
`TEACHER_SCHEDULE_READ_20261107.md`.

Mesures proposées : 37 écarts API distincts (38 avant), 11 pages statiquement
défectueuses, 19 À VÉRIFIER, 114 NON VÉRIFIÉES. Le score reste **60/100**,
non certifié : ce lot ciblé ne valide ni offline, ni charge, ni production.
CI en attente ; aucun déploiement.

---

## Lot modification/suppression des classes — 2026-11-07, après #406

CLASSROOM-CRUD-01 (P1), **correctif proposé** : contrats de modification et de
suppression des classes, isolation tenant et conservation de l'historique.
Détail : `CLASSROOM_CRUD_20261107.md`.

Mesures proposées : 38 écarts API distincts (40 avant), 11 pages statiquement
défectueuses, 19 À VÉRIFIER, 114 NON VÉRIFIÉES et référence TypeScript inchangée
à 173. Le score reste **60/100**, non certifié ; ce lot ne valide ni offline,
ni charge, ni production. CI en attente ; aucun déploiement.

---

## Lot lecture des liens parent-enfant — 2026-11-07, après #405

PARENT-LINKS-READ-01 (P1), **correctif proposé** : contrat GET des liens
familiaux, isolation tenant/parent et garde de rôle des rappels. Détail :
`STUDENT_PARENT_LINKS_READ_20261107.md`.

Mesures proposées : 40 écarts API distincts (41 avant), 11 pages statiquement
défectueuses, 24 À VÉRIFIER, 109 NON VÉRIFIÉES, 173 erreurs TypeScript avec
référence 173, 0 erreur et 1 895 avertissements ESLint. Le score reste
**60/100**, non certifié ; ce lot ciblé ne valide ni offline, ni charge, ni
production. CI en attente ; aucun déploiement.

---

## Lot inscription individuelle élève — 2026-11-05, après #383

ENROLLMENT-DETAIL-01 (P1), **correctif proposé** : contrat d'inscription
individuelle créé, isolation tenant/famille/élève testée, erreurs serveur
visibles et cache de la fiche enfant séparé par établissement. Détail :
`STUDENT_ENROLLMENT_DETAIL_20261105.md`.

Mesures proposées : 45 écarts API distincts (46 avant), 14 pages statiquement
défectueuses, 23 À VÉRIFIER, 107 NON VÉRIFIÉES, 174 erreurs TypeScript avec
référence abaissée à 174, 0 erreur et 1 899 avertissements ESLint. Le score
reste **60/100**, non certifié : aucun point n'est ajouté pour ce correctif
ciblé avant validation plus large. CI en attente ; aucun déploiement de
production.

---

## Lot relevé officiel parent — 2026-11-05, après #382

PARENT-TRANSCRIPT-01 (P1), **correctif proposé** : relevé PDF multi-années
calculé côté serveur, données client non fiables supprimées du contrat et
contrôle de propriété familiale. Détail : `PARENT_TRANSCRIPT_20261105.md`.

Mesures proposées : 46 écarts API distincts (47 avant), 14 pages statiquement
défectueuses (15 avant), 174 erreurs TypeScript préexistantes contre la
référence 178. Le score reste **60/100**, non certifié : un correctif ciblé et
ses tests ne justifient pas à eux seuls un point supplémentaire. CI en attente ;
aucun déploiement de production.

---

## Lot bulletins parents — 2026-11-05, après #381

PARENT-BUL-01 / PARENT-NOTES-01 (P1), **correctif proposé** : bulletin PDF
commun calculé sur le serveur, classe liée à l'année de la période, notes
paginées par famille/période, métadonnées réelles et cache par établissement.
Détail, tests et limites : `PARENT_REPORT_CARDS_20261105.md`.
Mesures proposées : 47 écarts API distincts (48 avant), 175 erreurs TS
préexistantes, 1 916 warnings ESLint (1 944 avant), 0 erreur ESLint.
Score interne conservé à 60/100, non certifié ; pas d'annonce de déploiement.
Les instantanés historiques suivants conservent leurs dates d'origine.

---

# Scorecard qualité — Gestion Scolaire Pro

Évaluation de reprise du **2026-11-05**, sur `main` à
`3ba915af9e7de796736f49dbf8d65309efc485de` (PR #379).
**Score argumenté : 60/100. Ce score interne n'est pas une certification.**
Le lot de correction proposé dans cette branche n'est pas comptabilisé comme livré.

## Barème conservé et recalcul

| Axe | Maximum | 2026-11-04 | 2026-11-05 | Justification / limite |
|---|---:|---:|---:|---|
| Fonctions scolaires et universitaires | 15 | 9 | 11 | +2 : contrats photos/devoirs/évaluations/inscriptions (#359–365), notes et relevés (#366–379), tests associés. Identité stable à harmoniser entre calculs (P2) ; compensation/jurys complets non validés. |
| Sécurité et isolation | 15 | 12 | 12 | #367 et #369 renforcent les contrôles de propriété ; pas de point sans audit transversal complémentaire. Tokens localStorage et revue ASVS restent ouverts. |
| Tests et fiabilité | 15 | 10 | 11 | +1 : 2 500 tests PostgreSQL, 473 Vitest, tests de précision/erreurs SQL/classement ajoutés. Seulement 5 contrôles obligatoires ; aucun résultat de charge ni essai offline sur appareil. |
| Architecture et qualité | 10 | 6 | 6 | 175 erreurs TS (178 avant), 1 944 warnings ESLint ; dette encore importante. |
| UX et accessibilité | 10 | 4 | 4 | 17 pages statiquement défectueuses ; aucune campagne accessibilité ni recette pilote attestée. |
| Performance | 10 | 2 | 2 | Plan existant ; P50/P95/P99 et capacité non mesurés. |
| Production, sauvegarde et supervision | 10 | 6 | 6 | Exercice B2 du 04/11 documenté ; état actuel du VPS et sauvegarde récente non vérifiés dans cette session. |
| Mobile et offline | 5 | 2 | 2 | PWA/Dexie présentes ; réseau intermittent et appareils non validés. |
| Finance et SaaS | 5 | 3 | 3 | Tests financiers existants ; sandbox fournisseurs et quotas incomplets. |
| Marchés africains | 5 | 3 | 3 | GNF/Mobile Money/langues ; validation terrain non démontrée. |
| **Total** | **100** | **57** | **60** | **+3 avec preuves, aucun point pour une fonctionnalité non testée.** |

## Mesures vérifiées

CI du **commit exact de main** :
[run 41993016973](https://github.com/skaba89/gestion-scolaire-pro/actions/runs/41993016973).
Les six jobs sont SUCCESS, journaux consultés. Ne pas réutiliser ces résultats
pour valider le nouveau HEAD de la branche.

| Indicateur | Résultat | Source |
|---|---|---|
| Backend PostgreSQL | 2 500 passed, 1 skipped ; couverture 72 % | job 127129499639 |
| Backend SQLite | 1 686 passed, 815 skipped ; couverture 56 % | job 127129499299 |
| Vitest | 473 passed, 82 fichiers | job 127129499230 ; reproduit localement |
| Browser Smoke | 3 passed | job 127129499471 |
| E2E Journeys | 15 passed | job 127129499360 |
| Sécurité CI | SUCCESS ; ne vaut pas audit de sécurité exhaustif | job 127129499292 |
| TypeScript strict | 175 erreurs ; référence 178 ; aucune nouvelle erreur | CI et `npm run type-check` local |
| ESLint | 0 erreur, 1 944 avertissements | CI et ESLint JSON local |
| Opérations OpenAPI | 645 | export local de l'application |
| Appels front sans opération | 52 occurrences, **49 clés distinctes** | 45 chemins absents + 7 méthodes ; `API_ROUTE_GAPS.md` |
| Appels entièrement dynamiques | 21 NON VÉRIFIÉS | même analyse statique |
| Écrans | 171 : 17 défectueux, 30 à vérifier, 98 non vérifiés, 2 détectés E2E, 24 non routés | `FEATURE_MATRIX.md` ; heuristique, pas recette utilisateur |
| i18n | 0 clé FR bloquante ; 4 clés secondaires manquantes | `npm run check:i18n` local |
| Build | Réussi | `npm run build` local |
| Migrations | Application et restauration CI réussies ; une head | run main ; aucune migration nouvelle dans ce lot |
| Contrôles requis | **5/6** | ruleset protect-main 24558312 lu le 05/11 |

La baisse des écarts 53 → 49 est celle des clés distinctes du cliquet ; ne pas
la comparer aux 52 occurrences brutes comme s'il s'agissait du même indicateur.
La référence est abaissée à 49 dans cette branche, sans suppression de fonction.

## Livraison et conditions restantes

**NO-GO production** pour ce lot : pas de fusion autorisée dans cette session,
CI du lot à vérifier sur son HEAD, prévol VPS/sauvegarde récente non effectué,
recette métier exhaustive et performances non démontrées.

Priorités : intégrité des moyennes homonymes (GRADE-ID-01), sixième contrôle
obligatoire, 49 écarts API, règles académiques par niveau et rattrapages,
tokens/sessions, paiements sandbox/quotas, offline, charge, accessibilité et
pilote terrain. Voir `BACKLOG_PRIORITIZED.md`.
L'objectif 99/100 exige des preuves sur tous ces axes. Le 100/100 requiert
une revue indépendante, un périmètre et une date explicites.
