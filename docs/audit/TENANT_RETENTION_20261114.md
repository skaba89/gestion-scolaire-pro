# TENANT-DELETE-01 — empêcher les pertes irréversibles

Référence de reproduction : `8461420` (#551), PostgreSQL 16.2 jetable migré.
Deux tests HTTP reproduisent la disparition d'un établissement avec pages,
comptes et élèves (200 au lieu de 409). Aucune opération sur la production.

## CORRIGÉ dans la branche : protection immédiate

L'API DELETE conserve sa vérification SUPER_ADMIN puis renvoie 409 pour tout
établissement existant, actif ou non, même vide. Elle n'exécute plus DELETE,
CASCADE ni commit. L'UI ne propose plus la suppression définitive ; la commande
existante de désactivation/réactivation reste disponible, avec sa confirmation
et ses avertissements sur les accès suspendus. Aucune migration nécessaire.

Cette décision protège aussi les données portées par les tables opérationnelles
et les futures dépendances : elle ne dépend pas d'une liste partielle de FK.
Les permissions négatives restent 403 ; un identifiant inconnu reste 404.
Il ne s'agit pas d'un archivage réglementaire certifié : les données restent dans
la base applicative et la durée de conservation n'est pas encore validée.

## Preuves

- `test_tenant_delete_orm_cascade.py` : pages publiques, comptes et élèves conservés.
- `test_tenant_delete_diagnostics.py` : 409 même si un commit déclencherait une
  erreur ; comptes sans autorisation refusés ; actif/inactif ; établissement
  inconnu ; désactivation puis réactivation conservant élève, facture, montant
  payé et paiement REVERSED ; autre établissement inchangé ; rôle PostgreSQL
  NOSUPERUSER NOBYPASSRLS avec RLS active.
- Ancien test plateforme RLS actualisé : aucun effacement ni faux audit DELETE.
  Ce fichier complet dépend de Redis : NON TESTÉ localement, exécuté par la CI.
- Local : **16 tests PostgreSQL réussis**, **15 SQLite réussis / 1 ignoré** ;
  **3 tests Vitest réussis** sur le tableau de bord superadministrateur.
- TypeScript : 146 erreurs historiques, référence 146, aucune nouvelle ; ESLint
  ciblé : 0 erreur / 6 avertissements. Il ne s’agit pas de zéro dette frontend.
- Six contrôles CI, fusion et déploiement : à confirmer pour cette PR.

## À CONFIRMER / NON TESTÉ : workflow d'archivage et purge

La purge demeure techniquement bloquée. Aucune confirmation de l'interface,
aucun export téléchargé, ni le statut inactif ne permet de la contourner.
Avant toute éventuelle réintroduction, il faut :

1. Valider avec les responsables métier et juridiques une matrice de conservation
   séparant dossiers scolaires, relevés LMD, justificatifs financiers, pièces et
   traces d'audit ; ne pas inventer une durée légale commune.
2. Exporter sous snapshot cohérent toutes les tables de l'établissement, ses
   relations et l'historique des schémas ; inclure les objets MinIO/Azure et pièces,
   pas seulement leurs URL. Vérifier les dépendances sans tenant_id direct.
3. Produire un manifeste de tables/objets, nombres de lignes, tailles, empreintes
   SHA-256, version Alembic, horodatage et établissement ; chiffrer les archives,
   contrôler l'accès, journaliser l'export sans PII dans les logs.
4. Restaurer en environnement isolé ; vérifier liens, inscriptions, notes,
   paiements annulés, bulletins, accès API et RLS ; mesurer RPO/RTO.
5. Faire approuver conservation, fin des délais, absence de gel d'audit et
   destruction par une procédure dédiée avec double confirmation côté serveur.
   Prévoir le traitement des copies et sauvegardes selon la politique validée.

Ce lot ne fournit pas cet export ni une purge certifiée. Ces éléments restent
au backlog, et le risque de gouvernance n'est pas déclaré entièrement clos.
Retour arrière : revert sans migration ; réactive une suppression dangereuse,
à éviter tant qu'aucun workflow de conservation vérifié n'existe.
