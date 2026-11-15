# Vérification — héritage des règles académiques par cycle

## Portée livrée

Le moteur existant `services/academic_rules.py` reste l'unique source de vérité
pour la moyenne de passage et les mentions sur 20. Il n'est pas dupliqué.

L'ordre d'héritage est désormais :

1. règle propre au niveau ;
2. règle du cycle auquel le niveau est réellement rattaché ;
3. règle de l'établissement ;
4. valeurs historiques 10, 12, 14, 16 et 18.

Les bulletins qui transmettent déjà le niveau bénéficient automatiquement de
cet héritage. Un calcul portant directement sur un cycle peut fournir son
identifiant, contrôlé dans le tenant.

## Compatibilité et intégrité

- stockage additif dans `tenants.settings.academic_rules.cycles` : aucune
  migration ni réécriture des historiques ;
- les anciennes règles `default` et `levels` restent inchangées ;
- un ancien client qui omet `cycles` ne peut pas effacer ces règles ;
- un objet `cycles: {}` explicite supprime seulement les surcharges par cycle ;
- un cycle étranger est refusé avec 404 et un identifiant invalide avec 400 ;
- les cycles archivés et leurs règles restent visibles afin de préserver les
  calculs et historiques associés ; seuls les cycles actifs peuvent recevoir
  une nouvelle surcharge depuis l'interface ;
- la route générique de paramètres ne peut toujours pas contourner la validation.

## Interface

La page **Règles académiques** affiche trois niveaux de configuration :
établissement, cycles, puis niveaux. Lors de l'ajout d'une règle de niveau,
l'éditeur copie la règle du cycle si elle existe, sinon celle de l'établissement.

## Limites explicites

Ce lot ne prétend pas fournir la compensation LMD, les ECUE, les jurys, la
délibération, les compétences ni les diplômes. Les relevés et la progression
qui ne disposent pas encore d'un niveau ou cycle explicite continuent d'utiliser
la règle de l'établissement.

## Preuves attendues

- tests unitaires de priorité niveau/cycle/établissement et de repli sûr ;
- tests API d'isolation inter-tenant et de compatibilité des anciens clients ;
- test de bulletin utilisant la règle dérivée du cycle ;
- PostgreSQL réel sous rôle sans `BYPASSRLS` ;
- parcours Playwright création de cycle → règle → interface → affectation →
  archivage, avec restauration en `finally`.
