# Préparation et exercice de récupération

État au 2026-11-14 : **plan préparé, récupération réelle NON DÉMONTRÉE dans ce lot**.
Les accès au VPS, sauvegardes B2, clés de chiffrement, objets MinIO/Azure et état
courant de production n'ont pas été vérifiés. Aucun RPO/RTO réel n'est annoncé.

## Éléments vérifiés dans le dépôt

- `deploy/vps/README.md` décrit un VPS OVH unique, Docker Compose, PostgreSQL sous
  rôle restreint, Redis/worker ARQ, MinIO, proxy TLS partagé et copies chiffrées B2.
  C'est une description de code/documentation, pas une observation du serveur.
- `deploy/vps/scripts/exercice-restauration.sh` prépare un conteneur jetable sans
  réseau, récupère un dump local ou distant, teste RLS et mesure des durées.
  Il n'a pas été exécuté ici avec un dump de production.
- `scripts/backup-database.sh` et `scripts/restore-database.sh` ont passé le job
  PostgreSQL de la CI #1532 (#552) sur une base de runner jetable.
- Les workflows de déploiement Azure/App Service sont déclenchés manuellement ;
  aucun workflow de déploiement ni script VPS n'a été lancé par ce lot.

## Contrôles de préparation à effectuer en lecture seule

Relever commit/images déployés, configuration Compose sans divulguer les secrets,
santé API/frontend/DB/Redis/workers/objets, version Alembic, rôle API NOBYPASSRLS,
état RLS, capacité disque, dates/tailles/empreintes des dumps, copies distantes,
journaux d'erreur et dernier résultat de supervision. Consigner une date et une
preuve pour chaque ligne ; l'absence d'accès ne signifie pas une panne.

## Exercice isolé

1. Choisir une sauvegarde représentative avec provenance vérifiée et empreinte,
   sans changer les clés B2/chiffrement. Conserver les secrets hors des rapports.
2. Restaurer dans un environnement distinct sans accès applicatif à la production.
   Anonymiser avant toute ouverture aux testeurs ; ne pas diffuser de dump dans les PR.
3. Vérifier version Alembic, schéma, contraintes, références et nombres de lignes
   scolaires/financières. Inclure inscriptions, notes, factures et paiements annulés.
4. Restaurer aussi les documents/objets et leurs relations : un dump PostgreSQL
   seul ne démontre pas la récupération des pièces MinIO/Azure.
5. Recréer le rôle runtime sans BYPASSRLS, tester lecture/écriture inter-établissements,
   puis démarrer une API isolée et rejouer un parcours métier et un bulletin.
6. Mesurer RTO technique, RTO opérationnel et RPO à partir des horodatages sources,
   avec cohérence des montants et notes. Recueillir la validation métier.
7. Détruire uniquement les ressources jetables et conserver un rapport sans données
   personnelles, comprenant échecs, durées, limites, empreintes et décision.

## Migration des notes et retour arrière

Voir `SCHEMA_DRIFT_20261114.md` : la migration est additive, refuse les orphelins
et ne réécrit aucune note. Privilégier un rollback applicatif avec la protection
FK conservée ; tout retrait DDL nécessite comparaison des objets préexistants.
Ne pas restaurer un dump par-dessus la production pour traiter un échec de migration.

## Autorisations et architecture cible

Les tests de forte charge et toute modification de production demandent une
autorisation spécifique ; ce plan n'en constitue pas une. L'exercice isolé doit
être exécuté sur une infrastructure dont les accès sont disponibles et autorisés.

Le VPS unique décrit reste un point de défaillance unique. Évaluer, sans engager
de dépense ici, la séparation des sauvegardes/objets, une supervision externe et
un environnement de secours restaurable ; dimensionner les coûts après mesure
et objectifs de service convenus pour les établissements guinéens.
