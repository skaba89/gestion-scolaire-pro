# INVOICE-DELETE-02 — sérialiser suppression et paiement

Référence de reproduction : `8461420cc713bf2f7b668cf125cafbeb7a036806` (#551).
Base PostgreSQL 16.2 jetable, schéma Alembic `20261112_0002`. Aucun accès production.

## VÉRIFIÉ : deux chemins exposaient la même course

`DELETE /payments/invoices/{id}/` et son alias `DELETE /invoices/{id}/`
cherchaient des paiements sans verrouiller la facture. Un paiement inséré dans
une transaction encore ouverte tient KEY SHARE sur la facture : la vérification
ne voit pas la ligne, puis DELETE attend la transaction et efface la facture.
`payments.invoice_id ON DELETE SET NULL` détache alors le paiement validé.
Les deux tests de concurrence échouent sur le code initial (204 au lieu de 400).

## CORRIGÉ dans la branche, non déployé

- Verrou `SELECT ... FOR UPDATE` avant le contrôle. Sous READ COMMITTED (niveau
  par défaut), une insertion qui précédait le verrou devient visible après
  l'attente ; toute nouvelle insertion FK doit attendre la fin de la suppression.
- Toute référence paiement reste bloquante, dont PENDING et REVERSED.
- L'alias délègue à l'implémentation canonique pour conserver la même protection.
- Requêtes typées ORM/Core : UUID PostgreSQL/SQLite cohérents ; identifiant
  malformé → 404. Permissions et codes historiques 400/404/204 conservés.
- Aucune migration, aucun paiement ni historique modifié par ce correctif.

## Tests exécutés

`backend/tests/test_invoice_delete_concurrency.py` : deux URL, trois statuts,
permissions négatives, établissement étranger, suppression d'une facture inutilisée.
Les deux ordres de concurrence sont vérifiés avec attente observable dans
`pg_blocking_pids` : paiement premier → suppression refusée et lien conservé ;
suppression première → insertion tardive rejetée par FK, aucun paiement orphelin.
Quatre cas RLS utilisent un rôle NOSUPERUSER NOBYPASSRLS avec RLS active.

PostgreSQL : **33 réussis** (nouveaux tests et suites existantes
`test_invoice_deletion_payment_history.py`, `test_invoice_alias_business_rules.py`).
SQLite : **39 réussis, 8 ignorés** ; inclut `test_finance_extended.py`.
Une exécution sur base PostgreSQL réutilisée a heurté deux numéros de facture
fixes de tests existants ; la reprise sur base recréée et migrée a réussi.
Les six contrôles CI de la PR doivent encore être vérifiés.

## Risques résiduels et récupération

Le protocole suppose READ COMMITTED (configuration réelle testée). Les autres
écritures de factures/imports/webhooks font partie de l'audit transversal restant.
Le modèle FK reste SET NULL : une suppression SQL administrative hors API n'est
pas couverte par ce verrou applicatif. Les accès directs doivent respecter les
procédures de conservation. Retour arrière : revert, sans migration ; réintroduit
la course. Aucun point de maturité supplémentaire accordé sans grille complète.
