# Modification et suppression des classes — 2026-11-07

## Défaut reproduit

L'écran d'administration des classes appelait déjà
`PUT /infrastructure/classrooms/{id}/` et
`DELETE /infrastructure/classrooms/{id}/`, mais le backend n'exposait que la
lecture et la création. Modifier ou supprimer une classe retournait donc 404.

Avant correctif : 6 échecs sur 9 tests. Trois résultats étaient de faux verts
car une route absente retourne également 404 dans les scénarios inter-tenant.

## Contrat corrigé

- Les deux opérations exigent `classrooms:write` et résolvent le tenant à
  partir du contexte authentifié.
- La modification recherche la classe dans le tenant et valide niveau,
  campus, filière, année, salle et départements dans ce même tenant avant
  toute écriture.
- La liste des départements n'est remplacée que lorsqu'elle est fournie. La
  modification de la classe et des associations utilise une seule validation
  métier ; une erreur SQL provoque un rollback et une réponse 503.
- Une classe étrangère reste indistinguable d'une classe absente (404).
- La suppression est autorisée uniquement pour une classe jamais utilisée.
  Toute inscription, séance d'emploi du temps, évaluation ou présence bloque
  la suppression avec 409 afin de conserver l'historique scolaire. La ligne
  classe est verrouillée pendant ce contrôle sur PostgreSQL pour empêcher une
  inscription concurrente d'être supprimée par cascade.
- Un rôle élève ne peut ni modifier ni supprimer une classe.

## Preuves locales avant PR

- Contrat, permissions, tenant, références, historique et panne SQL : 9 tests
  réussis.
- Régression infrastructure/inscriptions/propriété : 33 réussites et 14
  exclusions SQLite documentées.
- Compilation Python des trois fichiers touchés : réussie.
- Contrat OpenAPI : 653 opérations ; 38 écarts distincts contre 40 sur
  `main`, 40 occurrences et 21 URL dynamiques non vérifiables.
- Matrice statique : 11 pages DÉFECTUEUSES, 19 À VÉRIFIER, 114 NON VÉRIFIÉES,
  3 avec parcours E2E et 24 non routées.
- Suite frontend complète : 543 tests réussis dans 95 fichiers.
- Build de production Vite : réussi en 26,69 s ; seuls les avertissements de
  taille de chunks déjà connus restent présents.
- TypeScript : 173 erreurs préexistantes contre une référence de 173, aucune
  nouvelle erreur.
- ESLint : 0 erreur et 1 895 avertissements préexistants.

Les six jobs CI du HEAD exact restent à confirmer avant de rendre la PR prête
pour revue.

## Limites et retour arrière

- Le modèle ne possède pas encore d'état d'archivage de classe. Une classe
  utilisée doit donc être renommée ou conservée ; son effacement est refusé.
- La matrice est statique : « NON VÉRIFIÉ » ne constitue pas une recette de la
  page complète.
- Aucun schéma ni migration. Retour arrière applicatif uniquement.
- Aucun déploiement de production n'est autorisé par ce lot.
