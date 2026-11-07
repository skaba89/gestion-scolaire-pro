# Lecture de l'emploi du temps d'un enseignant — 2026-11-07

## Défaut reproduit

Depuis la page d'administration des enseignants, sélectionner un enseignant
appelait le tableau de bord du compte connecté. Le paramètre `teacher_id`
envoyé par le frontend était ignoré par `GET /teachers/dashboard/` : un
administrateur voyait donc son propre tableau de bord, souvent vide, au lieu
de l'emploi du temps choisi. Un autre hook appelait déjà
`GET /teachers/{teacher_id}/schedule/`, mais cette route n'existait pas.

Avant correctif, 7 scénarios sur 10 échouaient. Les trois réponses attendues
en 404/401 étaient de faux verts possibles sur une route absente ; elles ne
prouvaient pas encore le cloisonnement.

## Contrat corrigé

- `GET /teachers/{teacher_id}/schedule/` renvoie les créneaux du compte choisi,
  triés par jour et heure, avec classe, matière et salle.
- Un enseignant non privilégié ne peut lire que son propre emploi du temps.
  Les rôles d'administration scolaire déjà reconnus par le périmètre
  enseignant peuvent consulter un enseignant du même établissement.
- Les rôles élève, parent et ancien élève restent explicitement refusés, même
  s'ils possèdent des permissions génériques de lecture utilisées ailleurs.
- Un identifiant inconnu ou appartenant à un autre tenant retourne 404, sans
  divulguer son existence. Une panne SQL retourne 503 au lieu d'un faux
  emploi du temps vide.
- Le hook réellement utilisé par la page appelle maintenant cette route pour
  un enseignant sélectionné. Le tableau de bord historique est conservé pour
  le compte enseignant connecté.

## Preuves locales avant PR

- Nouveau contrat, rôles, accès personnel, IDOR inter-tenant, absence,
  authentification et panne SQL : 10 tests réussis.
- Régressions ciblées emploi du temps/périmètre enseignant : 12 réussites et
  26 exclusions PostgreSQL documentées sous SQLite.
- Hook frontend et persistance offline : 29 tests réussis dans 2 fichiers.
- Compilation Python des fichiers backend touchés : réussie.
- Contrat OpenAPI : 654 opérations ; 37 écarts distincts contre 38 sur
  `main`, soit 39 occurrences et 21 URL dynamiques non vérifiables.
- Matrice statique inchangée : 11 pages DÉFECTUEUSES, 19 À VÉRIFIER,
  114 NON VÉRIFIÉES, 3 avec parcours E2E et 24 non routées.
- Suite frontend complète : 545 tests réussis dans 96 fichiers.
- Build de production Vite : réussi en 27,66 s ; seuls les avertissements de
  taille de chunks déjà connus restent présents.
- TypeScript : 173 erreurs préexistantes contre une référence de 173, aucune
  nouvelle erreur.
- ESLint : 0 erreur et 1 895 avertissements préexistants.
- i18n strict : le contrôle a révélé le libellé préexistant
  `profileSettings.currentPassword` absent. Il est désormais défini dans les
  cinq langues et le contrôle strict est vert.

Les six jobs CI du HEAD exact restent à confirmer avant de rendre la PR prête
pour revue.

## Limites et retour arrière

- Ce lot corrige la lecture de l'emploi du temps, pas les affectations
  classe/matière qui disposent d'un contrat distinct.
- La matrice est statique : elle ne remplace pas une recette fonctionnelle de
  toutes les pages ni un essai sur réseau intermittent.
- Aucun schéma ni migration. Retour arrière applicatif uniquement.
- Aucun déploiement de production n'est autorisé par ce lot.
