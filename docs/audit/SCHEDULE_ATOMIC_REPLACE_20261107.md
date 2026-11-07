# Remplacement atomique de l'emploi du temps — 2026-11-07

## Défaut reproduit

L'assistant de génération exécutait deux requêtes incompatibles avec l'API :

1. `DELETE /schedule/?class_id=...`, méthode absente ;
2. `POST /schedule/` avec une liste, alors que le backend attend un seul
   créneau.

La génération échouait donc avant ou pendant le remplacement. Ajouter
uniquement la suppression aurait créé un risque plus grave : une panne de la
seconde requête aurait laissé la classe sans ancien ni nouvel emploi du temps.

Avant correctif : 6 échecs sur 10 tests backend, 4 faux verts possibles sur
les réponses 404/401 d'une route absente, et le test frontend confirmait
l'absence d'appel atomique.

## Contrat corrigé

- Le frontend calcule toujours les créneaux localement, mais envoie une seule
  requête `PUT /schedule/classes/{class_id}/replace/`.
- Le backend limite le lot à 200 créneaux et refuse une liste vide, un jour
  invalide ou une heure de fin antérieure à l'heure de début.
- La classe, toutes les matières et salles, ainsi que les comptes portant
  réellement le rôle `TEACHER`, sont validés dans le tenant authentifié avant
  toute suppression.
- Les chevauchements internes à la classe et les conflits de salle ou
  d'enseignant avec d'autres classes retournent 409.
- La classe est verrouillée, puis l'ancien planning est supprimé et le nouveau
  inséré dans une seule transaction. Toute panne SQL déclenche un rollback et
  conserve l'ancien planning.
- L'opération exige `schedule:write` et écrit une trace d'audit avec le nombre
  de créneaux remplacés.
- La détection commune des conflits utilise désormais l'ORM typé au lieu d'un
  SQL brut fragile avec les UUID et heures sous SQLite.

## Preuves locales avant PR

- Remplacement réussi, références inter-tenant, rôle enseignant, classe
  étrangère, chevauchements internes/externes, permission, authentification,
  corps vide et rollback SQL : 13 tests réussis.
- Régressions emploi du temps, salles, kiosques, lecture enseignant et
  permissions : 30 réussites et 43 exclusions PostgreSQL documentées sous
  SQLite.
- Contrat frontend atomique et persistance offline : 28 tests réussis dans
  2 fichiers.
- Suite frontend complète : 546 tests réussis dans 97 fichiers ; build Vite
  réussi, i18n strict sans clé FR bloquante, lint sans erreur (1 893
  avertissements historiques, sous le budget CI) et dette TypeScript stable
  à 173 sans nouvelle erreur.
- Suite backend SQLite complète sur une base neuve : 1 905 tests réussis,
  818 exclusions documentées et aucun échec.
- Contrat OpenAPI : 657 opérations, 983 appels, 21 URL dynamiques et
  35 écarts distincts contre 36 réellement présents sur `main` (la référence
  CI encore à 37 incluait aussi la salle corrigée par #409).
- Matrice statique : 9 pages DÉFECTUEUSES, 19 À VÉRIFIER,
  116 NON VÉRIFIÉES, 3 avec parcours E2E et 24 non routées.

Les six jobs CI du HEAD exact restent à confirmer avant de rendre la PR prête
pour revue.

## Limites et retour arrière

- L'algorithme d'équilibrage reste exécuté côté frontend ; le serveur valide
  et persiste le résultat, mais ne choisit pas encore les créneaux.
- Le verrou protège les remplacements concurrents de la même classe. Les
  contraintes d'exclusion temporelle ne sont pas encore matérialisées au
  niveau PostgreSQL pour toutes les autres écritures historiques.
- Aucun schéma ni migration. Retour arrière applicatif uniquement.
- Aucun déploiement de production n'est autorisé par ce lot.
