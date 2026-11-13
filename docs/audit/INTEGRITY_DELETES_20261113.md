# AUD-P0-INTEGRITY — écritures et suppressions (2026-11-13)

Base : `main` `d04d075` (PR #546). Audit réalisé sur une base PostgreSQL 16
jetable migrée jusqu'à `20261112_0002` (une seule head), jamais sur la production.

## Méthode

1. Lecture des contraintes réelles dans `pg_constraint` (pas dans les modèles) :
   **302 clés étrangères — 200 `ON DELETE CASCADE`, 71 `SET NULL`,
   30 `NO ACTION`, 1 `RESTRICT`**. 116 des cascades partent de `tenants`.
2. Inventaire des **63 routes `DELETE`** (`grep @router.delete`) et lecture de la
   fonction de suppression de chacune des tables portant des cascades ou des
   `SET NULL` vers de l'historique scolaire ou financier.
3. Reproduction par test HTTP (SQLite + PostgreSQL) avant correction.

## Suppressions déjà protégées (vérifiées dans le code, non modifiées)

| Ressource | Garde | Référence |
|---|---|---|
| Élève | 409 si note, inscription, présence, paiement, facture, lien parent ; verrou de ligne | `crud/student.py:119` |
| Utilisateur | 403 admin, 409 si élève ou parent lié | `endpoints/core/users.py:1021` |
| Facture | 400 si un paiement (même annulé) la référence | `endpoints/finance/payments.py:864` |
| Évaluation (2 routes) | 409 si notes, verrou | ASSESSMENT-DELETE-01 |
| Matière | 409 si toute référence réelle, verrou, 503 si catalogue illisible | `crud/academic.py` `delete_subject` |
| Salle, classe | 409 si utilisées | `RoomInUseError`, `ClassroomInUseError` |
| Salarié | 409 si contrats/paies/congés | EMPLOYEE-DELETE-01 |
| Commande | annulation, jamais suppression | #529 |
| Niveaux/matières à l'onboarding | jamais supprimés | #537 |

## Défauts constatés

| ID | Priorité | Route / fichier | Constat (reproduit) | Statut |
|---|---|---|---|---|
| PERIOD-DELETE-01 | **P0** | `DELETE /academic-years/{id}/` — `crud/academic.py` `delete_academic_year` | Aucun garde. `enrollments.academic_year_id` est `CASCADE` : **204 et toutes les inscriptions de l'année effacées** ; classes, évaluations, affectations, `class_subjects`, `exams` détachées (`SET NULL`). Atteignable par l'UI (`AcademicYears.tsx`) après suppression des trimestres | **Corrigé** (ce lot) |
| PERIOD-DELETE-02 | **P0** | `DELETE /terms/{id}/` — `delete_term` | `assessments.term_id` / `exams.term_id` sont `SET NULL` : **204 et toutes les notes du trimestre sortent de leur période** (bulletins vides) ; UI `Terms.tsx` | **Corrigé** (ce lot) |
| PERIOD-DELETE-03 | P2 | `DELETE /academic-years/{id}/` | Année avec trimestres : `ForeignKeyViolation` → **500** (SQL dans la réponse en DEBUG) | **Corrigé** : 409 |

Correction : verrou `FOR UPDATE` sur la ligne (sérialise avec les inscriptions,
classes, évaluations concurrentes qui prennent `KEY SHARE`), recherche de toute
référence réelle via le catalogue (fonction commune `_is_referenced`, déjà utilisée
par les matières), contrôle explicite de `grades.academic_year_id` ; 409 si la
période est utilisée, 503 si la vérification échoue, 404 hors établissement.
Une période vide reste supprimable. Pas de migration, pas de changement de
permissions.

Tests : `backend/tests/test_academic_period_delete_history.py` — 6 échecs
PostgreSQL / 5 SQLite avant correctif (`204 == 409`, `500 == 409`), 21 tests
après correctif dont concurrence PostgreSQL et 503.

## Risques relevés, non reproduits (lots suivants)

| ID | Priorité | Constat (lecture du schéma) | Piste |
|---|---|---|---|
| STRUCT-DELETE-01 | P1 | Niveau, campus, semestre, filière, faculté, département : suppression sans garde ; `classes.level_id`/`campus_id`/`program_id`, `subjects.semester_id`, `departments.faculty_id` passent à NULL ; campus → salles en cascade ; département → membres et alertes en cascade | Même garde `_is_referenced` |
| USER-DELETE-02 | P1 | Compte enseignant : `teacher_assignments` et `teacher_work_hours` (heures payables) en cascade ; annonces de l'auteur en cascade | 409 si historique, désactivation |
| INVOICE-DELETE-02 | P1 | Contrôle « aucun paiement » sans verrou de la facture : un paiement concurrent peut être orphelin (`payments.invoice_id` `SET NULL`) | `FOR UPDATE` avant contrôle + test de concurrence |
| TENANT-DELETE-01 | P1 (gouvernance) | `DELETE /tenants/{id}` (SUPER_ADMIN) efface toutes les données de l'établissement | Archivage + export obligatoire, double confirmation |
| SCHEMA-DRIFT-01 | P2 | `grades.academic_year_id` déclaré FK dans le modèle, absent de la base migrée | Migration additive après nettoyage |

## Non testé dans ce lot

Imports CSV, webhooks, tâches ARQ, `UPDATE` massifs, réinitialisations hors
onboarding : à couvrir dans les lots suivants.
