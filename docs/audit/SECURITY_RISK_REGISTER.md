# Registre des risques sécurité et intégrité

Document vivant, créé le 2026-11-13. Une ligne = un risque constaté dans le code
ou le schéma, avec sa preuve. Statuts : **VÉRIFIÉ**, **CORRIGÉ**, **À CONFIRMER**,
**NON TESTÉ**, **BLOQUANT**. Les correctifs antérieurs sont tracés dans
`MISSION_MASTER_20261107.md`, `REMAINING_WORK.md` et l'historique Git.

| ID | Priorité | Domaine | Risque | Preuve | Statut | PR |
|---|---|---|---|---|---|---|
| PERIOD-DELETE-01 | P0 | Intégrité scolaire | Suppression d'une année scolaire = inscriptions de l'année effacées | `test_academic_period_delete_history.py` | CORRIGÉ (non déployé) | fix/period-delete-history |
| PERIOD-DELETE-02 | P0 | Intégrité scolaire | Suppression d'un trimestre = notes détachées de leur période | idem | CORRIGÉ (non déployé) | fix/period-delete-history |
| PERIOD-DELETE-03 | P2 | Robustesse | 500 (SQL exposé en DEBUG) sur année avec trimestres | idem | CORRIGÉ (non déployé) | fix/period-delete-history |
| STRUCT-DELETE-01 | P1 | Intégrité scolaire | Niveaux, campus, semestres, filières, facultés, départements supprimables en détachant classes/matières | Schéma (`INTEGRITY_DELETES_20261113.md`) | À CONFIRMER | — |
| USER-DELETE-02 | P1 | Intégrité RH/finance | Compte enseignant : affectations et heures travaillées supprimées en cascade | Schéma | À CONFIRMER | — |
| INVOICE-DELETE-02 | P1 | Finance | Course entre suppression de facture et paiement concurrent (paiement orphelin) | Lecture de code | À CONFIRMER | — |
| TENANT-DELETE-01 | P1 | Gouvernance | Suppression définitive d'un établissement sans archivage | Lecture de code | À CONFIRMER | — |
| SCHEMA-DRIFT-01 | P2 | Schéma | FK `grades.academic_year_id` absente en base | `pg_constraint` | VÉRIFIÉ | — |
| IMPORT-WEBHOOK-ARQ | — | Intégrité | Imports CSV, webhooks, tâches asynchrones non audités dans ce lot | — | NON TESTÉ | — |
