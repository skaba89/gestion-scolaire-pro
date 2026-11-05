# Remises de devoirs — lot du 2026-11-05

Référence : `main` à `828a6f7158e555290c4c71b6beee28e7c213dc0c`
(PR #380 fusionnée, CI main 42002181761 SUCCESS).

## Défauts reproduits (HW-SUB-01, P1)

- Le portail élève faisait `POST /homework-submissions/` : cette route ne
  possède qu'un GET (création impossible, HTTP 405).
- Pour modifier son travail, il utilisait `PUT /homework-submissions/{id}`,
  une route de notation réservée à `homework:write`, dont le corps attendu
  n'est pas un contenu d'élève. Le portail élève ne pouvait pas modifier sa remise.
- Le contenu du dialogue restait celui du devoir précédemment ouvert.
- La route de création ne vérifiait ni l'existence du devoir dans le tenant,
  ni celle de l'élève pour un professeur dispensé du contrôle de propriété.
  Les colonnes homework_id/student_id de homework_submissions ne possèdent
  pas de FK ; une simple vérification RLS de tenant_id ne suffit pas.

Reproduction avant correctif : 3/7 nouveaux tests frontend et 9/11 premiers
nouveaux tests backend échouent (fixtures corrigées et authentifiées).
Les cas de refus/non-régression qui passent avant correction restent conservés.

## Comportement proposé

Création : route existante `POST /homework/{homework_id}/submit/` ; corps
`{homework_id, student_id, content}`. Vérifie propriété (élève lié, parent lié
ou homework:write), devoir et élève du tenant courant, concordance URL/corps.
La date est celle du serveur. Le contenu seul n'accorde aucun droit de notation.

Modification : nouvelle route `PUT /homework/{homework_id}/submissions/{id}/`
avec `{content}`. Permission homework:read existante, même propriété et contrôle des références, identité de remise
et établissement imposés par le serveur. La requête UPDATE ne touche que
content/submitted_at et refuse toute remise possédant grade, graded_at ou
graded_by. Ce prédicat fait partie de l'écriture pour couvrir une note enregistrée
entre la lecture et la modification. Réponses : 401, 403, 404, 409, 422 ; SQL
indisponible → 503 avec rollback et sans réussite fictive. Audit UPDATE sans
copie du travail de l'élève dans les détails.

Le dialogue réutilise le service, garde la saisie et reste ouvert en erreur,
ne retente pas une création après un échec de modification, réinitialise son
texte quand le devoir change et invalide student-submissions après réussite.

## Validation

- 20 nouveaux tests HTTP backend, exécutables sur SQLite isolé et sur PostgreSQL
  avec les tables migrées : contenu, identité/note non falsifiables, propriétaire,
  parent lié, établissement, mauvais devoir, grade 0/15, métadonnées de notation,
  corps invalide, concurrence lecture/notation/écriture, panne SQL, création,
  références inter-tenant et absence d'authentification.
- 7 nouveaux tests de dialogue : création, modification, erreurs 403/409/500,
  note zéro et changement de devoir. Le service de création conserve ses
  tests de contrat existants.
- Les trois anciens tests PostgreSQL de création autorisée utilisaient des
  identifiants de devoir aléatoires sans devoir existant. Leurs fixtures créent
  désormais un vrai devoir du tenant et gardent leurs assertions 201 et leurs
  rôles/propriétés d'origine.
- Les résultats complets de CI sont consignés dans la PR du lot, sur son HEAD
  exact ; pas de validation d'un nouveau commit par un ancien run.

Mesures statiques du lot : 646 opérations OpenAPI ; 985 appels détectés ;
51 occurrences sans opération = **48 clés distinctes** (49 avant),
21 URL dynamiques non vérifiées. Cliquet abaissé après correction réelle,
sans suppression de fonction. Matrice : 171 pages, 16 défectueuses,
30 à vérifier, 99 non vérifiées, 2 repérées par les parcours, 24 non routées.

## Livraison et limites

Aucune migration, dépendance, règle RBAC ni modification de production.
L'autorisation réutilise la politique de propriété existante ; pas de nouveau
rôle. Les routes de notation des enseignants restent distinctes.
Rollback applicatif : revenir au commit de référence, sans rollback de schéma.
La nouvelle route doit être disponible avant de servir le nouveau frontend.

L'idempotence de création, la déduplication des remises historiques et la
politique d'affectation des devoirs par classe ne sont pas certifiées par ce lot.
Le schéma SQLite de test ne démontre pas la RLS : cette preuve dépend de la CI
PostgreSQL et des tests RLS existants. Offline/appareils/charge/sandbox paiements
et prévol VPS restent hors validation.

Score interne conservé à **60/100**, non certifié. Pas de point attribué avant
fusion et nouvelle évaluation. Fusion soumise à l'accord du propriétaire après
les six jobs SUCCESS ; production NO-GO sans son dossier et son accord distincts.
