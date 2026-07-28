# État de préparation — Import de données (pilote payant)

Audit réel du code (`backend/app/api/v1/endpoints/core/imports.py`) et des
tests (`backend/tests/test_import_parents.py`,
`backend/tests/test_import_teachers.py`, en plus des tests élèves déjà
existants). **Trois types d'import existent réellement et sont testés :
élèves, parents, enseignants.**

## État actuel — ce qui fonctionne (vérifié par tests)

### Import Élèves — ✅ prêt et testé

| Capacité | État | Détail |
|---|---|---|
| Modèle CSV téléchargeable | ✅ | `GET /import/students/template/` |
| Preview avant import | ✅ | `POST /import/students/preview/` |
| Validation ligne par ligne | ✅ | nom/prénom/date de naissance requis, dates multi-format, genre normalisé (FR/EN) |
| Mapping colonnes flexible | ✅ | alias français ET anglais (`STUDENT_COLUMN_MAP`) |
| Détection de doublons | ✅ | matricule existant, génération automatique si absent/en conflit |
| Vérification tenant_id | ✅ | scopé au tenant de l'utilisateur authentifié |
| Import partiel si erreurs | ✅ | `skip_errors=true` |
| Audit log | ✅ | `IMPORT_STUDENTS` |
| Gate plan tarifaire | ✅ | `require_plan("pro")` |

### Import Parents — ✅ disponible, testé

| Capacité | État | Détail |
|---|---|---|
| Modèle CSV téléchargeable | ✅ | `GET /import/parents/template/` |
| Preview avant import | ✅ | `POST /import/parents/preview/` — détecte le mapping de colonnes, signale email/matricule élève manquant **avant** confirmation |
| Confirmation | ✅ | `POST /import/parents/confirm/` |
| Vrai compte lié | ✅ | crée un `User` (rôle `PARENT` via `user_roles`) — jamais du texte libre |
| Lien élève | ✅ | crée une ligne `parent_students` par élève référencé (matricule ou email élève, séparés par virgule pour plusieurs enfants) |
| Réutilisation même lot | ✅ | même email sur plusieurs lignes du même fichier → un seul compte, plusieurs liens |
| Réutilisation inter-import | ✅ | parent déjà existant dans le même tenant (avec rôle PARENT) → réutilisé, jamais dupliqué |
| Isolation tenant sur l'email | ✅ | un email déjà utilisé par un compte d'un **autre** tenant est **refusé explicitement** (`"Email … déjà utilisé par un compte d'un autre établissement"`), jamais réutilisé ni écrasé silencieusement |
| Isolation tenant sur le lien | ✅ | un parent ne peut jamais être lié à un élève d'un autre tenant (le matricule est résolu uniquement dans le tenant courant) |
| Pas de doublon de lien | ✅ | réimporter la même ligne ne recrée pas le lien (`skipped_links`) |
| Audit log | ✅ | `IMPORT_PARENTS` |
| Gate plan tarifaire | ✅ | `require_plan("pro")` |

**Tests** : `backend/tests/test_import_parents.py` (16 tests) — template, preview (mapping, email manquant, élève manquant), création de compte réel + rôle + lien, réutilisation intra/inter-lot, refus email cross-tenant, isolation tenant du lien, audit log.

### Import Enseignants — ✅ disponible, testé

| Capacité | État | Détail |
|---|---|---|
| Modèle CSV téléchargeable | ✅ | `GET /import/teachers/template/` |
| Preview avant import | ✅ | `POST /import/teachers/preview/` — détecte le mapping (y compris matières/département/contrat), signale email manquant |
| Confirmation | ✅ | `POST /import/teachers/confirm/` |
| Vrai compte créé | ✅ | crée un `User` (rôle `TEACHER` via `user_roles`) |
| Doublon email dans le fichier | ✅ refusé | jamais deux comptes pour le même email dans un lot |
| Email déjà existant en base | ✅ refusé | jamais d'écrasement silencieux, même par un compte d'un autre rôle |
| Isolation tenant | ✅ | compte créé strictement dans le tenant de l'utilisateur authentifié |
| Audit log | ✅ | `IMPORT_TEACHERS` |
| Gate plan tarifaire | ✅ | `require_plan("pro")` |

**Tests** : `backend/tests/test_import_teachers.py` (14 tests) — template, preview (mapping avec matières, email manquant), création de compte réel + rôle, doublon fichier/base refusé, non-persistance des champs matières/département/contrat (verrouillée par test dédié), isolation tenant, audit log.

⚠️ **Limite connue et assumée** (voir ci-dessous) : matières, département,
type de contrat, diplôme, date d'embauche et salaire sont **lus et
validés** par l'import (visibles dans la preview) mais **ne sont pas
encore persistés automatiquement**. Le compte `TEACHER` est bien créé et
utilisable immédiatement (connexion, permissions) ; l'affectation
matière/classe/contrat se fait ensuite manuellement via les écrans RH et
`teacher_assignments` existants — un choix délibéré, pas un oubli
silencieux (voir `backend/app/api/v1/endpoints/core/imports.py`,
docstring de `confirm_teacher_import`, et
`backend/tests/test_import_teachers.py::TestFieldsNotYetPersisted`).

## Ce qui manque

| Manque | Priorité | Impact |
|---|---|---|
| **Import Classes/Niveaux** | P2 | Pas d'endpoint dédié ; création manuelle via les écrans classes/niveaux existants. |
| **Import Notes** | P2 | Pas d'endpoint — la saisie de notes est déjà bien couverte par l'UI existante. |
| **Import Paiements historiques** | P2 | Pas d'endpoint — une école migrant en cours d'année doit recréer son historique d'impayés manuellement via `/payments/register/`. |
| **Affectation matière/classe/contrat automatique depuis l'import enseignants** | P2 | Voir limite ci-dessus — nécessite une décision produit sur la résolution des noms de matières en doublon/ambigus, hors périmètre de cette phase. |
| **Mode strict tout-ou-rien** | P2 | Toujours pas disponible. Chaque ligne est traitée indépendamment (`try/except` par ligne) — un import de 200 lignes où 190 réussissent et 10 échouent laisse les 190 en base. C'est le comportement "import partiel" voulu, **pas** un rollback atomique. À clarifier avec le premier client pilote si un mode tout-ou-rien est attendu légalement/comptablement. |

## Règles déjà respectées (élèves, parents, enseignants)

- ✅ Jamais d'import dans le mauvais tenant (scopé par `current_user.tenant_id`, jamais par un champ du fichier).
- ✅ Jamais d'écrasement silencieux d'un compte/élève existant.
- ✅ Jamais de doublon silencieux créé (email/matricule vérifiés avant insertion).
- ✅ Un email déjà utilisé par un autre tenant est refusé, jamais réattribué.
- ✅ Rapport d'import toujours produit, même en cas d'échecs partiels.
- ✅ Chaque ligne en échec indique la raison précise.
- ✅ Audit log systématique (`IMPORT_STUDENTS`/`IMPORT_PARENTS`/`IMPORT_TEACHERS`), consultable aussi via `GET /platform/tenants/{id}/health/` (support SUPER_ADMIN).

## Endpoints complets

```
GET  /import/students/template/    modèle CSV élèves
POST /import/students/preview/     aperçu + validation, aucune écriture
POST /import/students/confirm/     import réel élèves

GET  /import/parents/template/     modèle CSV parents
POST /import/parents/preview/      aperçu + validation, aucune écriture
POST /import/parents/confirm/      import réel parents (comptes + liens)

GET  /import/teachers/template/    modèle CSV enseignants
POST /import/teachers/preview/     aperçu + validation, aucune écriture
POST /import/teachers/confirm/     import réel enseignants (comptes)
```

## Format recommandé (élèves)

| Colonne (FR) | Alias acceptés | Obligatoire | Format |
|---|---|---|---|
| `prenom` | first_name, firstname | ✅ | texte |
| `nom` | last_name, surname | ✅ | texte |
| `date_naissance` | dob, naissance, birth_date | ✅ | `JJ/MM/AAAA` ou `AAAA-MM-JJ` |
| `sexe` | gender, genre | recommandé | `M`/`F`/`H`/`Homme`/`Femme`... |
| `matricule` | registration_number, numero | optionnel — généré automatiquement sinon | texte unique |
| `niveau` | level | optionnel | texte libre |
| `classe` | class_name, classe | optionnel | texte libre |
| `annee_scolaire` | academic_year, annee | optionnel | ex. `2026-2027` |
| `email`, `telephone`, `adresse`, `ville` | — | optionnel | texte |

## Format recommandé (parents)

| Colonne (FR) | Alias acceptés | Obligatoire | Format |
|---|---|---|---|
| `prenom` | first_name | ✅ | texte |
| `nom` | last_name, surname | ✅ | texte |
| `email` | courriel, mail | ✅ | email unique plateforme |
| `matricule_eleve` | matricule, registration_number | ✅ (ou `email_eleve`) | matricule(s) de l'élève, séparés par virgule si plusieurs enfants |
| `email_eleve` | student_email | optionnel (alternative au matricule) | email élève |
| `telephone`, `profession`, `adresse` | — | optionnel | texte |
| `lien` | relation, lien_parente | optionnel | ex. `FATHER`/`MOTHER` |
| `contact_principal` | principal | optionnel | `oui`/`non` |

## Format recommandé (enseignants)

| Colonne (FR) | Alias acceptés | Obligatoire | Format |
|---|---|---|---|
| `prenom` | first_name | ✅ | texte |
| `nom` | last_name, surname | ✅ | texte |
| `email` | courriel, mail | ✅ | email unique plateforme |
| `telephone`, `sexe`, `date_naissance` | — | optionnel | texte/date |
| `matieres` | subjects, discipline | optionnel — **lu mais non persisté** (voir limite ci-dessus) | texte libre, séparé par virgule |
| `departement` | department | optionnel — **lu mais non persisté** | texte libre |
| `type_contrat` | contrat | optionnel — **lu mais non persisté** | ex. `CDI`/`CDD` |
| `diplome`, `date_embauche` | qualification, hire_date | optionnel — **lu mais non persisté** | texte/date |

Fichiers d'exemple téléchargeables directement via `GET /import/{students,parents,teachers}/template/`.

## Parcours utilisateur (identique pour les trois types)

1. Télécharger le modèle (`/import/{type}/template/`).
2. Remplir le fichier dans Excel/LibreOffice/Google Sheets.
3. Envoyer à `/import/{type}/preview/` → aperçu des 10 premières lignes, liste des erreurs, colonnes détectées.
4. Corriger le fichier si nécessaire.
5. Envoyer à `/import/{type}/confirm/` → import réel, rapport final, audit log enregistré.

## Recommandation pilote payant

Élèves, parents et enseignants sont **prêts et testés** pour un pilote
payant. Avant d'annoncer un "import massif" plus large, prioriser :
1. Clarifier avec le premier client pilote si le comportement "import
   partiel" actuel est acceptable ou si un mode strict tout-ou-rien est
   attendu.
2. Import Classes/Niveaux et Notes, si un client migrant en cours d'année
   scolaire en a besoin — actuellement hors périmètre.
