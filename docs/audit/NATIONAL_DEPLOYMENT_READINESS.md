# Préparation au déploiement national — décision fondée sur preuves

Date : 2026-11-14. Référence vérifiée de main : `03084c6` (#552).
Décision sur les preuves de ce lot : **NO-GO pour une généralisation nationale**.
Aucune décision défavorable sur un pilote précis n'est déduite sans sa recette.

## État démontré et limites

| Domaine | État | Preuve / reste à démontrer |
|---|---|---|
| Historiques des enseignants | CORRIGÉ, fusionné, non déployé | #552, CI #1532 : six contrôles réussis |
| Facture et paiement concurrents | CORRIGÉ en PR, non déployé | #554 ; deux ordres de concurrence, RLS ; CI/fusion à vérifier |
| Effacement des établissements | Protection immédiate en PR | #553 ; purge refusée, désactivation conservatrice ; archivage/export complet restant |
| FK notes/année scolaire | Migration préparée en PR | #555 ; orphelins bloquants, 25 tests PostgreSQL ; copie anonymisée réelle NON TESTÉE |
| Intégration des quatre correctifs | VÉRIFIÉ localement | 168 tests PostgreSQL réussis / 1 ignoré ; données synthétiques, pas production |
| Recette par rôle | Couverture CI existante | Parcours E2E et crawls réussis sur #552 ; actions exhaustives de tous les rôles NON TESTÉES dans ce lot |
| Capacité nationale | NON TESTÉ | Campagne récente graduelle 5 → 20 → 50 → 100 → 500 → 1000 établissements manquante |
| PRA réel | NON TESTÉ ici | Exercice CI sur base jetable réussi ; sauvegarde B2 réelle, objets et RTO opérationnel non vérifiés |
| Android et réseau terrain | NON TESTÉ | Appareils réels, PWA installée/rechargée offline et conflits de synchronisation à valider |
| Mobile Money réel | À CONFIRMER | Sandboxes et premier encaissement réel pilote ; tests unitaires/webhooks ne valent pas recette opérateur |
| Formation, assistance et contrats | À CONFIRMER | Guides, SLA, conservation, support et PV de recette à approuver |

Les preuves des tests locaux sont tracées dans `INTEGRITY_DELETES_20261113.md`,
`INVOICE_DELETE_CONCURRENCY_20261114.md`, `TENANT_RETENTION_20261114.md` et
`SCHEMA_DRIFT_20261114.md`. Ne pas confondre PR ouverte, fusion et déploiement.

## Paliers et conditions de passage

1. **Pilote 2 à 5 établissements** : choisir les établissements et responsables,
   reprise de données vérifiée, recette métier signée par rôle, support opérationnel,
   sauvegarde/restauration démontrée, suivi quotidien et capacité de rollback.
2. **Extension 10 à 30** : incidents du pilote résolus et mesurés, imports et
   rapprochements financiers vérifiés, formation reproductible, capacité mesurée.
3. **Régions** : établissements primaires, secondaires, techniques et universitaires
   représentés ; charge réaliste et réseau terrain testés ; astreinte/support adaptés.
4. **National** : GO formel avec engagements de service, budgets, gestion des données,
   PRA/PCA, capacité et preuves de recette ; surveillance et critères d'arrêt définis.

Les seuils de latence, taux d'erreur, disponibilité, RPO/RTO, durée de pilote et
acceptation des incidents doivent être convenus avant les campagnes. Aucun seuil
commercial n'est déclaré respecté sans mesure et accord métier.

## Score

60/100 est le score formel historique au commit `7b072ea`, pas celui de cette
référence. 73/100 était une estimation de suivi. **Score actuel non recalculé** :
reprendre les neuf domaines de la grille et associer chaque point à une preuve.
Les 76,87 % de couverture backend PostgreSQL CI ne sont pas un score de maturité.
