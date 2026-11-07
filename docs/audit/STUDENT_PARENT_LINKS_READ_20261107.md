# Lecture des liens parent-enfant — 2026-11-07

## Défaut reproduit

Le composant partagé de rappels appelait `GET /student-parents/` pour retrouver
les enfants d'un parent avant de charger ses factures. Le routeur ne proposait
que POST et DELETE : les rappels de paiement ne pouvaient donc pas fonctionner.
Le même composant étant présent dans le tableau étudiant, celui-ci tentait
également une lecture familiale qui ne lui appartient pas.

Avant correctif : 7 échecs sur 8 tests backend ; le seul test vert vérifiait
l'authentification avant d'atteindre la route absente. Le test frontend ne
pouvait pas importer la garde de rôle inexistante.

## Contrat corrigé

- `GET /student-parents/` exige `students:read` et au moins `parent_id` ou
  `student_id` ; aucun annuaire complet du tenant n'est exposé.
- Toutes les requêtes filtrent `tenant_id`. Un parent est forcé sur son propre
  identifiant et reçoit 403 s'il tente celui d'un autre parent.
- Le filtre étudiant reste combiné au filtre du parent : un parent ne peut pas
  sortir de son périmètre familial.
- Le personnel habilité peut rechercher une relation du tenant ; une relation
  d'un autre établissement reste invisible.
- Les réponses réutilisent le schéma `ParentStudent` avec les résumés élève et
  parent. Une panne SQL renvoie 503, jamais un faux tableau vide.
- Les rappels de paiement ne sont désormais chargés que pour le rôle PARENT ;
  le portail étudiant n'émet plus cette requête.

## Preuves locales avant PR

- Route, tenant et autorisations : 8 tests réussis.
- Régression parent/identité/propriété : 30 réussites, 14 exclusions SQLite
  documentées.
- Garde frontend : 1 test réussi.
- Suite frontend complète : 543 tests réussis dans 95 fichiers.
- Build de production Vite : réussi en 21,03 s ; seuls les avertissements de
  taille de chunks déjà connus restent présents.
- Contrat OpenAPI : 651 opérations ; 40 écarts distincts contre 41 sur le
  `main` fusionné, 42 occurrences et 21 URL dynamiques non vérifiables.
- Le cliquet API passe de 45 à 40 : il enregistre cette correction et quatre
  corrections déjà présentes sur `main` mais pas encore abaissées dans la
  référence.
- Matrice statique : 11 pages DÉFECTUEUSES, 24 À VÉRIFIER, 109 NON VÉRIFIÉES,
  3 avec parcours E2E et 24 non routées.
- TypeScript : 173 erreurs préexistantes ; cliquet abaissé de 174 à 173 puis
  revérifié à 173/173, aucune nouvelle erreur.
- ESLint : 0 erreur, 1 895 avertissements préexistants.
- i18n : aucune clé française bloquante manquante.

Les six jobs CI du HEAD exact restent à confirmer avant de rendre la PR prête
pour revue.

## Limites et retour arrière

- Ce lot répare la sélection des enfants. Le calcul et l'affichage des rappels
  de facture dépendent toujours des contrats `/invoices/` existants.
- La matrice est statique : « NON VÉRIFIÉ » ne constitue pas une recette de la
  page complète.
- Aucun schéma ni migration. Retour arrière applicatif uniquement.
- Aucun déploiement de production n'est autorisé par ce lot.
