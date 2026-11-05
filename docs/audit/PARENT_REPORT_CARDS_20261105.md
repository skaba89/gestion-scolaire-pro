# Bulletins du portail parent — 2026-11-05

Base : `c32225ce1a26f5be5640a2014a1ecdb052664dbf` (PR #381 fusionnée).
CI main 42006016415 SUCCESS. Ce document décrit le lot proposé ; le HEAD exact
et ses résultats de CI sont consignés dans la PR de livraison.

## PARENT-BUL-01 / PARENT-NOTES-01 — P1 reproduits

La page envoyait des notes, une moyenne calculée localement et des libellés
à /parents/report-cards/generate/, alors que la requête serveur exigeait
student_id. Elle attendait ensuite du HTML d'une route qui ne produisait
qu'un agrégat JSON. Sa lecture d'inscription visait /parents/enrollments/
(inexistant). Même avec un corps valide, la route utilisait classrooms et
students.classroom_id, absents du schéma réellement utilisé (classes et
enrollments). Le bulletin parent ne pouvait pas être livré ainsi.

La liste des notes envoyait les UUID des enfants séparés par des virgules à
un paramètre UUID unique, ignorait la vraie pagination et attendait des objets
assessments/students absents du schéma de réponse. Le filtre de période
comparait des dates au lieu de l'identifiant de période de l'évaluation.

Le tableau de bord renvoie ses enfants à plat, alors que les pages les lisent
dans child.student. Le cache du hook ne comportait pas tenant_id. Le lien
parent_students ne suffit pas à lui seul à prouver le tenant de l'élève :
le JOIN du tableau de bord contrôle désormais les deux.

Avant correction : 10/15 premiers tests backend échouaient (4 réussis,
1 réservé à PostgreSQL), 6/7 premiers tests du service frontend, 3/4 de la
page et le test de changement de tenant. Un test supplémentaire reproduit
une classe explicitement rattachée à une mauvaise année (200 avant, 404 après).
Les tests de refus déjà verts sont conservés comme non-régression.

## Comportement du lot

- POST /parents/report-cards/generate/ reçoit uniquement student_id et term_id
  UUID obligatoires. Vérifie permission grades:read, lien au parent, tenant de
  l'élève, période du tenant et classe inscrite ACTIVE pour l'année de cette
  période. Aucune classe correspondante → 404 ; plusieurs classes → 409.
  Une classe portant explicitement une autre année est refusée ; un catalogue
  de classes sans année reste compatible avec l'année de l'inscription.
- Délègue au générateur PDF commun school_life.generate_report_card_pdf :
  notes, pondération, rang, absences et règles sont lus côté serveur. Les
  notes/moyenne/classe/mentions reçues en extra ne constituent aucune source.
  Aucun second algorithme de bulletin n'est introduit.
- Le navigateur reçoit un vrai Blob application/pdf et le télécharge, sans
  document.write ni fenêtre d'impression. Une erreur ne déclenche pas de
  message de réussite ou de fichier artificiel.
- GET /parents/grades/ fournit une projection paginée des notes de ses enfants,
  avec évaluation, matière, élève et période. Tous les JOIN et les filtres
  sont bornés au tenant, même avec un lien historique incohérent. student_id
  est un UUID unique facultatif ; absent = ses enfants côté serveur.
- Le filtre utilise Assessment.term_id. Une date de rattrapage hors des dates
  ordinaires ne déplace pas la note dans une autre période.
- Le service charge toutes les pages (100/page), échoue sur réponse invalide,
  panne intermédiaire ou volume supérieur à 200 pages : pas de troncature
  annoncée comme complète. Les données de la page et du hook sont mises en
  cache par compte ET établissement. Les enfants plats sont adaptés en
  conservant aussi leurs champs existants.
- GET /parents/terms/ utilise une jointure ORM vers l'année, compatible UUID
  SQLite/PostgreSQL, évite N+1 et renvoie 503 en cas de panne SQL, jamais une
  fausse liste vide. Les erreurs de notes et de bulletin restent explicites.

## Preuves et périmètre

24 nouveaux tests backend : propriété, tenant, lien incohérent, sélection de
l'année/classe, absence/ambiguïté, faux champs ignorés, autorisations,
validation, pagination inter-enfants, rattachement exact à la période,
pannes SQL et un rendu PDF réel PostgreSQL. Ce dernier vérifie une moyenne
11,40/20 avec coefficients 3 et 2, malgré average=20 envoyé par le client.
Les tests de sélection utilisent un rendu simulé sur SQLite ; cela ne vaut
pas preuve du rendu PDF ni de la RLS réelle.

15 nouveaux tests frontend : service (9), page (4), cache/adaptation (2).
Les sélecteurs sont simulés dans le test de page ; les parcours Playwright
existants restent une validation séparée, pas une nouvelle recette navigateur
complète de ce parcours.

Mesures proposées : 647 opérations OpenAPI ; 984 appels ; 50 occurrences
sans opération = **47 clés distinctes** (48 avant), 21 URL dynamiques non
vérifiables. Matrice : 171 pages, 15 défectueuses, 31 à vérifier, 99 non
vérifiées, 2 repérées E2E, 24 non routées. La page peut rester « À VÉRIFIER »
à cause de méthodes inutilisées du service partagé : le graphe statique ne
prouve pas quels appels sont joués par le navigateur.

## Livraison et limites

Aucune migration, dépendance, nouvelle permission ou écriture de production.
L'ancienne requête de bulletin ne fonctionnait pas ; sa réponse est désormais
application/pdf. Déployer l'API avant le frontend ; rollback applicatif au
commit de base, sans rollback de schéma. L'ancien HTML calculé côté client
n'est pas une solution de repli.

Le bulletin exige une inscription ACTIVE dans l'année visée : les inscriptions
closes/retirées et la politique de consentement pour les élèves majeurs restent
à préciser dans des lots dédiés. La politique de lecture reste fondée sur les
permissions et les liens parents existants ; le bandeau d'âge de l'interface
ne constitue pas une protection serveur. Le générateur commun n'est pas
recertifié dans son ensemble par ce lot (classe réutilisée sur plusieurs
années, délibérations et LMD restent à auditer).

Score interne **60/100 conservé**, non certifié : les améliorations restent
sur des axes déjà partiellement acquis ; aucun point automatique pour un test
ou une route ajoutée. Les seuils de charge, offline/appareils, revue ASVS,
recette pilote et sixième contrôle obligatoire ne sont toujours pas acquis.
Fusion après les six jobs SUCCESS et accord du propriétaire. Production
NO-GO sans son prévol, sauvegarde récente vérifiée et accord distinct.
