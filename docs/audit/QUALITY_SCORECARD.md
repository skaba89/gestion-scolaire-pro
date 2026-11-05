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
