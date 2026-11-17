# Registre des risques sécurité et intégrité

Document vivant, créé le 2026-11-13. Une ligne = un risque constaté dans le code
ou le schéma, avec sa preuve. Statuts : **VÉRIFIÉ**, **CORRIGÉ**, **À CONFIRMER**,
**NON TESTÉ**, **BLOQUANT**. Les correctifs antérieurs sont tracés dans
`MISSION_MASTER_20261107.md`, `REMAINING_WORK.md` et l'historique Git.

| ID | Priorité | Domaine | Risque | Preuve | Statut | PR |
|---|---|---|---|---|---|---|
| PERIOD-DELETE-01 | P0 | Intégrité scolaire | Suppression d'une année scolaire = inscriptions de l'année effacées | `test_academic_period_delete_history.py` | CORRIGÉ (non déployé) | #548 |
| PERIOD-DELETE-02 | P0 | Intégrité scolaire | Suppression d'un trimestre = notes détachées de leur période | idem | CORRIGÉ (non déployé) | #548 |
| PERIOD-DELETE-03 | P2 | Robustesse | 500 (SQL exposé en DEBUG) sur année avec trimestres | idem | CORRIGÉ (non déployé) | #548 |
| STRUCT-DELETE-01 | P1 | Intégrité scolaire | Niveaux, campus, semestres, programmes, facultés, départements supprimables en détachant classes/matières, salles et membres effacés | `test_structure_delete_history.py` | CORRIGÉ (non déployé) | fix/structure-delete-history |
| USER-DELETE-02 | P1 | Intégrité RH/finance | Compte enseignant : affectations et heures travaillées supprimées en cascade | 6 reproductions HTTP PostgreSQL sur 8461420 ; test_user_delete_teacher_history.py (FK, concurrence, RLS, désactivation) | CORRIGÉ, fusionné, CI 6/6 (non déployé) | #552 |
| INVOICE-DELETE-02 | P1 | Finance | Course entre suppression de facture et paiement concurrent (paiement orphelin) | Deux courses reproduites sur 8461420 ; test_invoice_delete_concurrency.py, 33 tests PostgreSQL réussis | CORRIGÉ, fusionné, CI 6/6 (non déployé) | #554 |
| TENANT-DELETE-01 | P1 | Gouvernance | Suppression définitive d'un établissement sans archivage | Deux reproductions ; rétention et RLS ; CI #1541 6/6 | CORRIGÉ contre l'effacement, fusionné (non déployé) ; export/archivage restant | #553 |
| SCHEMA-DRIFT-01 | P2 | Schéma | FK `grades.academic_year_id` absente en base | Catalogue sur 8461420 ; migration et données retenues testées | CORRIGÉ dans #555, CI à confirmer après intégration de #553 (non déployé) | #555 |
| TENANT-SECRETS-03 | P0 | Secrets / confidentialité | `GET /tenants/{tenant_id}/` (garde `get_current_user` seule) renvoyait `tenant.settings` en clair à tout compte de l'établissement, parents et élèves compris : clés CinetPay/PayTech, mot de passe SMTP, jetons WhatsApp, OneSignal, passerelles SMS. Présent en production (`d04d075`) | Relecture RBAC du lot B2a ; `test_tenant_settings_secret_redaction.py::TestTenantDetailSecretRedaction` (5 échecs sans correctif) | CORRIGÉ (non déployé) — rotation des secrets configurés recommandée | #564 |
| SEARCH-STUDENTS-01 | P1 | Recherche / confidentialité | Recherche globale d'élèves cassée (colonne `student_number` inexistante, transaction PostgreSQL avortée pour les types suivants) et sans contrôle de rôle : la corriger seule aurait ouvert la recherche dans tous les élèves aux élèves, parents et anciens élèves | `test_search_students_and_enrollment_counts.py` (12 échecs sans correctif) | CORRIGÉ (non déployé) : `registration_number`, type réservé au personnel, SAVEPOINT par type | à venir |
| COUNTS-STATUS-01 | P2 | Fonctionnel | `/infrastructure/enrollments/counts/` comparait `status = 'active'` (stocké `ACTIVE`) : effectifs toujours vides | idem | CORRIGÉ (non déployé) | à venir |
| IMPORT-WEBHOOK-ARQ | — | Intégrité | Imports CSV, webhooks, tâches asynchrones non audités dans ce lot | — | NON TESTÉ | — |
