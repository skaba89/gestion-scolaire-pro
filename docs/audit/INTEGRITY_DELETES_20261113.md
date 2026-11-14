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
| STRUCT-DELETE-01 | ~~P1~~ corrigé | Niveau, campus, programme, semestre, faculté, département : 204 en détachant classes/matières/départements, salles d'un campus et membres/alertes d'un département effacés (reproduit : 16 échecs PostgreSQL, 14 SQLite) | **Corrigé** (PR fix/structure-delete-history) : verrou + `_is_referenced` ; seuls les liens de catalogue `subject_levels` / `subject_departments` peuvent partir avec la structure ; 409 si utilisé (y compris candidature ou cours en ligne sur un niveau, auparavant 500), 503 si vérification impossible |
| USER-DELETE-02 | P1 | Compte enseignant : `teacher_assignments` et `teacher_work_hours` (heures payables) en cascade ; annonces de l'auteur en cascade | 409 si historique, désactivation |
| INVOICE-DELETE-02 | P1 | Contrôle « aucun paiement » sans verrou de la facture : un paiement concurrent peut être orphelin (`payments.invoice_id` `SET NULL`) | `FOR UPDATE` avant contrôle + test de concurrence |
| TENANT-DELETE-01 | P1 (gouvernance) | `DELETE /tenants/{id}` (SUPER_ADMIN) efface toutes les données de l'établissement | Archivage + export obligatoire, double confirmation |
| SCHEMA-DRIFT-01 | P2 | `grades.academic_year_id` déclaré FK dans le modèle, absent de la base migrée | Migration additive après nettoyage |

## Non testé dans ce lot

Imports CSV, webhooks, tâches ARQ, `UPDATE` massifs, réinitialisations hors
onboarding : à couvrir dans les lots suivants.

## Lot 2 — STRUCT-DELETE-01 (2026-11-13)

Base `main` `dc071b6` (#549). Fonction commune `_delete_unused_structure`
(`crud/academic.py`) et correspondance HTTP partagée
(`endpoints/academic/_structure_delete.py`) pour les six routes. Tests :
`backend/tests/test_structure_delete_history.py` (35 tests, dont concurrence
PostgreSQL : une classe créée en parallèle bloque la suppression de son niveau).
Les règles de notation par niveau stockées dans les paramètres de l'établissement
ne sont pas modifiées (une entrée orpheline après suppression d'un niveau vide est
sans effet).


## Lot 3 — USER-DELETE-02 (2026-11-14)

Base vérifiée : `8461420cc713bf2f7b668cf125cafbeb7a036806` (#551).

**VÉRIFIÉ** : sur une copie du code de ce commit et PostgreSQL 16.2 jetable,
les six tests HTTP (TENANT_ADMIN / SUPER_ADMIN × affectation, heures travaillées,
annonce) échouent : suppression autorisée au lieu de 409. Les rôles courants sont
retirés avant l'appel pour démontrer que la présence d'historique, et non le rôle
TEACHER actuel, doit gouverner la conservation. Un test transactionnel reproduit
la disparition des trois dépendances par CASCADE puis annule la transaction et
vérifie la restitution des lignes.

**CORRIGÉ dans cette branche, non déployé** : verrou du compte `FOR UPDATE`
avant les vérifications, recherche de toute FK réelle vers `users` par le
catalogue existant `_is_referenced`. Seuls `user_roles` et `profiles`, configuration
d'identité sans historique métier, sont retirés explicitement avec un compte
inutilisé. Toute autre référence, y compris opérationnelle sans modèle ORM,
provoque 409 avec invitation à désactiver ; catalogue indisponible : 503.
Les gardes parent/élève et administrateur sont conservées.

La désactivation existante conserve les liens et heures, révoque les sessions,
et reste réversible. Les UUID sont maintenant liés avec le type GUID réel
(correction des faux 404 SQLite). Un administrateur d'établissement ne peut plus
changer le statut d'un compte privilégié. Aucune migration / suppression de données.

Preuves : `backend/tests/test_user_delete_teacher_history.py` et tests de gardes
utilisateur existants. Après correction : **38 tests ciblés PostgreSQL réussis**,
dont attente de verrou observée avec `pg_blocking_pids` et deux scénarios sous
rôle `NOSUPERUSER NOBYPASSRLS` avec RLS active (établissement courant / étranger).
Suite SQLite complète : **2346 réussis, 928 ignorés**, couverture **60,15 %**
(seuil requis 43 %). Les six contrôles GitHub restent à confirmer dans la PR ; ne pas confondre validation du code et déploiement.

Impact : suppression physique plus restrictive sur les comptes référencés ;
les comptes inutilisés restent supprimables, rôles compris. Retour arrière :
revert du commit, sans migration, réintroduisant le risque de pertes.


## Lot 4 — INVOICE-DELETE-02 (2026-11-14)

#552 est fusionnée en `03084c6`, CI #1532 6/6. Sur la référence `8461420`, deux
courses reproduites (route facture et alias). Correctif : verrou FOR UPDATE avant
la recherche des paiements, alias délégué à la route canonique, UUID typés.
33 tests PostgreSQL réussis, dont les deux ordres de concurrence et quatre cas
sous RLS sans BYPASSRLS ; 39 SQLite réussis / 8 ignorés. Détail :
`INVOICE_DELETE_CONCURRENCY_20261114.md`. Correctif de ce lot non déployé ; CI/fusion à vérifier.
