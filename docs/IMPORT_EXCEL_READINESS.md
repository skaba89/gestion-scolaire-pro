# État de préparation — Import de données (Phase 2 commercialisation)

Audit réel du code (`backend/app/api/v1/endpoints/core/imports.py`) et des
tests. Un seul type d'import existe réellement : **élèves**. Ce document
distingue clairement ce qui est prêt de ce qui reste à construire.

## État actuel — ce qui fonctionne (vérifié par tests)

| Capacité | État | Détail |
|---|---|---|
| Modèle CSV téléchargeable | ✅ | `GET /import/students/template/` — en-têtes français, 3 lignes d'exemple, encodage Excel-compatible |
| Preview avant import | ✅ | `POST /import/students/preview/` — 10 premières lignes affichées, 50 validées |
| Validation ligne par ligne | ✅ | nom/prénom/date de naissance requis, dates multi-format (`%Y-%m-%d`, `%d/%m/%Y`, etc.), genre normalisé (FR/EN) |
| Liste des erreurs claire | ✅ | chaque erreur référence son numéro de ligne exact |
| Mapping colonnes flexible | ✅ | détection insensible à la casse, alias français ET anglais (`STUDENT_COLUMN_MAP`) — un fichier "prenom;nom" ou "first_name;last_name" fonctionne sans configuration |
| Détection de doublons | ✅ | numéros de matricule existants pré-chargés, génération automatique d'un matricule unique si absent ou en conflit |
| Vérification tenant_id | ✅ | chaque ligne insérée est scopée au tenant de l'utilisateur authentifié, vérifié par isolation testée sur l'ensemble du projet |
| Import partiel si erreurs | ✅ | `skip_errors=true` — les lignes invalides sont ignorées, les valides sont importées quand même |
| Rapport d'import | ✅ | `{created, skipped, errors, total, message}` retourné à chaque appel |
| Audit log de l'import | ✅ **ajouté cette phase** | `log_audit()` sur `IMPORT_STUDENTS` — qui, quand, combien, nom du fichier |
| Gestion des encodages | ✅ | UTF-8 avec BOM, repli Latin-1 (exports Excel Windows courants), 400 propre si aucun des deux ne fonctionne |
| Détection automatique du délimiteur | ✅ | `;` ou `,` détecté sur l'échantillon du fichier |
| Limite de taille | ✅ | 5 Mo max, rejet propre au-delà |
| Gate plan tarifaire | ✅ | `require_plan("pro")` — l'import est une fonctionnalité Pro, cohérent avec le positionnement commercial |

## Ce qui manque

| Manque | Priorité | Impact |
|---|---|---|
| **Import Parents** (endpoint dédié) | P1 pour la promesse "élèves + parents liés" | Le modèle Excel élèves capture déjà `parent_name`/`parent_phone`/`parent_email`, mais ces valeurs sont stockées comme texte libre sur la fiche élève — elles ne créent PAS de compte parent lié (`parent_students`). Une école migrant depuis un autre système attend des comptes parents actifs, pas juste des champs texte. |
| **Import Enseignants** | P1 pour la promesse commerciale complète | `TEACHER_COLUMN_MAP` est déjà défini dans le code mais **jamais utilisé** — aucun endpoint preview/confirm n'existe pour les enseignants. C'est du code mort en l'état, pas une fonctionnalité à moitié construite. |
| **Import Classes/Niveaux** | P2 | Pas d'endpoint dédié ; la création reste manuelle via les écrans classes/niveaux existants (rapide pour un petit établissement, pénible pour un lycée avec 40 classes). |
| **Import Notes** | P2 | Pas d'endpoint — cohérent avec le fait que la saisie de notes est déjà un flux fréquent bien couvert par l'UI existante, moins prioritaire pour une migration initiale. |
| **Import Paiements historiques** | P2 | Pas d'endpoint — une école migrant en cours d'année veut souvent réimporter son historique d'impayés ; actuellement, il faudrait les recréer manuellement via `/payments/register/`. |
| **Rollback transactionnel strict** | P2 | Le comportement actuel est "au mieux" : chaque ligne est insérée indépendamment (`try/except` par ligne), pas un `BEGIN`/`COMMIT` unique pour tout le lot. Un import de 200 lignes où 190 réussissent et 10 échouent laisse les 190 en base — c'est le comportement "import partiel" voulu, mais ce n'est PAS un rollback atomique si l'utilisateur voulait vraiment tout-ou-rien. Pas un bug, mais un choix de comportement à clarifier avec les clients pilotes. |

## Règles déjà respectées

- ✅ Jamais d'import dans le mauvais tenant (scopé par `current_user.tenant_id`, jamais par un champ du fichier).
- ✅ Jamais d'écrasement silencieux (`ON CONFLICT (registration_number) DO NOTHING` — un doublon est ignoré, pas écrasé).
- ✅ Jamais de doublon silencieux créé (matricule vérifié contre l'existant avant insertion).
- ✅ Rapport d'import toujours produit, même en cas d'échecs partiels.
- ✅ Chaque ligne en échec indique la raison précise (nom du champ manquant, format de date invalide, etc.).

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
| `nom_parent`, `tel_parent`, `email_parent` | — | optionnel — **texte libre, ne crée pas de compte parent** (voir gap ci-dessus) | texte |

Fichier d'exemple téléchargeable directement via `GET /import/students/template/`.

## Parcours utilisateur (élèves, tel qu'implémenté)

1. Télécharger le modèle (`/import/students/template/`).
2. Remplir le fichier dans Excel/LibreOffice/Google Sheets.
3. Envoyer le fichier à `/import/students/preview/` → aperçu des 10 premières lignes, liste des erreurs de validation, colonnes détectées.
4. Corriger le fichier si nécessaire, ou cocher "ignorer les lignes en erreur".
5. Envoyer à `/import/students/confirm/` → import réel, rapport final, audit log enregistré.

## Recommandation avant promesse commerciale "import massif"

Le module élèves seul est **prêt et testé**. Avant d'annoncer un "import
Excel complet" à un client pilote, prioriser dans l'ordre :
1. Import Parents (crée réellement des comptes liés) — le plus gros écart avec l'attente client.
2. Import Enseignants (le code de mapping existe déjà, il "manque" juste les deux endpoints preview/confirm, suivant exactement le même patron que students).
3. Clarifier avec le premier client pilote si le comportement "import partiel" actuel est acceptable ou si un mode strict tout-ou-rien est attendu.
