# Matrice des types, modules et rôles

Source : catalogue exécutable et ROLE_PERMISSIONS, 2026-11-14. Les valeurs sont des profils initiaux personnalisables, pas des normes réglementaires. Les périodes proposées restent des métadonnées : elles ne recalculent pas les bulletins ni les crédits.

S = socle obligatoire ; A = activé par défaut ; O = option désactivée ; — = service absent, activation interdite.

| Module | Maternelle | Primaire | Collège | Lycée | Université | École supérieure | Centre de formation | Formation professionnelle | Établissement mixte multi-cycles |
|---|---|---|---|---|---|---|---|---|---|
| Authentification | S | S | S | S | S | S | S | S | S |
| Utilisateurs | S | S | S | S | S | S | S | S | S |
| Établissements | S | S | S | S | S | S | S | S | S |
| Sécurité | S | S | S | S | S | S | S | S | S |
| Finances | S | S | S | S | S | S | S | S | S |
| Notifications et communication | S | S | S | S | S | S | S | S | S |
| Audit | S | S | S | S | S | S | S | S | S |
| Reporting | S | S | S | S | S | S | S | S | S |
| Scolarité | A | A | A | A | A | A | A | A | A |
| Admissions | A | A | A | A | A | A | A | A | A |
| Notes et évaluations | O | A | A | A | A | A | A | A | A |
| Présences | A | A | A | A | A | A | A | A | A |
| Emploi du temps | A | A | A | A | A | A | A | A | A |
| Devoirs | O | A | A | A | A | A | A | A | A |
| Semestres et crédits LMD | O | O | O | O | A | A | O | O | A |
| Cours en ligne | O | A | A | A | A | A | A | A | A |
| Bibliothèque | A | A | A | A | A | A | A | A | A |
| Vie scolaire | A | A | A | A | A | A | A | A | A |
| Ressources humaines | A | A | A | A | A | A | A | A | A |
| Stocks et commandes | A | A | A | A | A | A | A | A | A |
| Assistance IA | O | A | A | A | A | A | A | A | A |
| Référentiels et évaluations par compétences | — | — | — | — | — | — | — | — | — |

## Rôles et configuration

| Rôle | Lire sa configuration | Aperçu et modification | Accès métier |
|---|---|---|---|
| SUPER_ADMIN | Oui, établissement résolu | Oui, avec settings:write | Permissions existantes ci-dessous ∩ modules actifs ∩ périmètre tenant |
| TENANT_ADMIN | Oui, établissement résolu | Oui, avec settings:write | Permissions existantes ci-dessous ∩ modules actifs ∩ périmètre tenant |
| DIRECTOR | Oui, établissement résolu | Non | Permissions existantes ci-dessous ∩ modules actifs ∩ périmètre tenant |
| SECRETARY | Oui, établissement résolu | Non | Permissions existantes ci-dessous ∩ modules actifs ∩ périmètre tenant |
| TEACHER | Oui, établissement résolu | Non | Permissions existantes ci-dessous ∩ modules actifs ∩ périmètre tenant |
| ACCOUNTANT | Oui, établissement résolu | Non | Permissions existantes ci-dessous ∩ modules actifs ∩ périmètre tenant |
| DEPARTMENT_HEAD | Oui, établissement résolu | Non | Permissions existantes ci-dessous ∩ modules actifs ∩ périmètre tenant |
| STUDENT | Oui, établissement résolu | Non | Permissions existantes ci-dessous ∩ modules actifs ∩ périmètre tenant |
| PARENT | Oui, établissement résolu | Non | Permissions existantes ci-dessous ∩ modules actifs ∩ périmètre tenant |
| ALUMNI | Oui, établissement résolu | Non | Permissions existantes ci-dessous ∩ modules actifs ∩ périmètre tenant |

Les rôles ne changent pas avec le profil. Aucun compte administratif ou familial n’est dupliqué. Le profil mixte regroupe les capacités existantes ; les restrictions par cycle ne sont pas activables dans ce lot (`cycle_policy_available=false`). Les permissions par utilisateur restent celles des rôles enregistrés en base ; une activation n’accorde aucun privilège.

## Permissions serveur exactes par rôle

### SUPER_ADMIN

`*`

### TENANT_ADMIN

`academic_years:read`, `academic_years:write`, `admissions:read`, `admissions:write`, `ai:audit`, `analytics:read`, `assessments:read`, `assessments:write`, `attendance:read`, `attendance:write`, `audit:read`, `audit:write`, `auth:manage`, `campuses:read`, `campuses:write`, `certificates:read`, `certificates:write`, `classrooms:read`, `classrooms:write`, `clubs:read`, `clubs:write`, `communications:read`, `communications:write`, `departments:read`, `departments:write`, `enrollments:read`, `enrollments:write`, `faculties:read`, `faculties:write`, `fees:read`, `fees:write`, `grades:read`, `grades:write`, `homework:read`, `homework:write`, `hr:read`, `hr:write`, `incidents:read`, `incidents:write`, `inventory:read`, `inventory:write`, `invoices:read`, `invoices:write`, `levels:read`, `levels:write`, `library:read`, `library:write`, `mfa:manage`, `notifications:read`, `notifications:write`, `parents:read`, `parents:write`, `payments:read`, `payments:write`, `programs:read`, `programs:write`, `rooms:read`, `rooms:write`, `schedule:read`, `schedule:write`, `school_life:read`, `school_life:write`, `settings:read`, `settings:write`, `students:delete`, `students:read`, `students:write`, `subjects:read`, `subjects:write`, `surveys:read`, `surveys:write`, `teacher_progress:read`, `teacher_progress:write`, `terms:read`, `terms:write`, `users:delete`, `users:read`, `users:write`

### DIRECTOR

`academic_years:read`, `academic_years:write`, `admissions:read`, `admissions:write`, `ai:audit`, `analytics:read`, `attendance:read`, `attendance:write`, `audit:read`, `audit:write`, `classrooms:read`, `classrooms:write`, `clubs:read`, `communications:read`, `communications:write`, `departments:read`, `departments:write`, `enrollments:read`, `enrollments:write`, `faculties:read`, `faculties:write`, `finance:read`, `grades:read`, `grades:write`, `homework:read`, `hr:read`, `hr:write`, `inventory:read`, `inventory:write`, `levels:read`, `levels:write`, `parents:read`, `payments:read`, `programs:read`, `programs:write`, `reports:read`, `rgpd:read`, `rgpd:write`, `rooms:read`, `rooms:write`, `schedule:read`, `schedule:write`, `school_life:read`, `school_life:write`, `settings:read`, `settings:write`, `students:read`, `students:write`, `subjects:read`, `subjects:write`, `teacher_progress:read`, `teacher_progress:write`, `terms:read`, `terms:write`, `users:read`, `users:write`

### DEPARTMENT_HEAD

`admissions:read`, `attendance:read`, `attendance:write`, `departments:read`, `enrollments:read`, `faculties:read`, `grades:read`, `grades:write`, `homework:read`, `schedule:read`, `schedule:write`, `school_life:read`, `school_life:write`, `settings:read`, `students:read`, `subjects:read`, `subjects:write`, `teacher_progress:read`, `teacher_progress:write`, `users:read`

### TEACHER

`attendance:read`, `attendance:write`, `grades:read`, `grades:write`, `homework:read`, `homework:write`, `schedule:read`, `school_life:read`, `school_life:write`, `settings:read`, `students:read`, `subjects:read`, `users:read`

### STUDENT

`attendance:read`, `grades:read`, `homework:read`, `me:read`, `schedule:read`, `settings:read`

### PARENT

`admissions:reenroll`, `attendance:read`, `grades:read`, `homework:read`, `me:read`, `payments:read`, `settings:read`, `students:read`

### ALUMNI

`grades:read`, `schedule:read`, `subjects:read`

### STAFF

`admissions:read`, `admissions:write`, `analytics:read`, `attendance:read`, `communications:read`, `communications:write`, `departments:read`, `enrollments:read`, `enrollments:write`, `hr:read`, `hr:write`, `inventory:read`, `inventory:write`, `parents:read`, `schedule:read`, `schedule:write`, `school_life:read`, `school_life:write`, `settings:read`, `students:read`, `students:write`, `teacher_progress:read`, `teacher_progress:write`, `users:read`

### ACCOUNTANT

`analytics:read`, `communications:read`, `communications:write`, `finance:read`, `finance:write`, `hr:read`, `hr:write`, `inventory:read`, `payments:read`, `payments:write`, `settings:read`, `students:read`

### SECRETARY

`admissions:read`, `admissions:write`, `analytics:read`, `attendance:read`, `attendance:write`, `certificates:read`, `certificates:write`, `communications:read`, `communications:write`, `departments:read`, `enrollments:read`, `enrollments:write`, `grades:read`, `hr:read`, `hr:write`, `inventory:read`, `inventory:write`, `parents:read`, `schedule:read`, `schedule:write`, `school_life:read`, `school_life:write`, `settings:read`, `students:read`, `students:write`, `teacher_progress:read`, `teacher_progress:write`, `users:read`

### MINISTRY_ADMIN

`ministry:read`

### NATIONAL_INSPECTOR

`ministry:read`

### REGIONAL_DIRECTOR

`ministry:read`

### PREFECTURE_ADMIN

`ministry:read`

### COMMUNE_ADMIN

`ministry:read`

