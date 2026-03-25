# Phase 7 — Préparation de la migration JWT native

## Ce qui a été préparé dans cette branche
- ajout du champ `password_hash` au modèle `User`
- ajout d'une migration Alembic pour créer ce champ dans `users`
- cadrage technique de la suite pour remplacer Keycloak par une authentification JWT native

## Pourquoi ce lot est isolé
Le dépôt actuel est encore couplé à Keycloak à plusieurs niveaux :
- backend (`auth.py`, `security.py`, reset password)
- frontend (`AuthContext`, `api client`, page `/auth`)
- déploiement Render (`render.yaml`, proxy nginx, variables `VITE_KEYCLOAK_*`)

Avant de basculer proprement en JWT natif, il fallait d'abord préparer le schéma utilisateur afin de stocker un hash local de mot de passe.

## Suite immédiate prévue
1. réécrire `backend/app/core/security.py` pour valider un JWT HS256 natif
2. réécrire `backend/app/api/v1/endpoints/core/auth.py` pour login / logout / me sans Keycloak
3. adapter `backend/app/api/v1/endpoints/core/users.py` pour générer / reset les mots de passe localement
4. remplacer `react-oidc-context` côté frontend par un contexte auth natif
5. supprimer Keycloak du blueprint Render

## Risques à surveiller
- cohérence entre `users.id`, `user_roles.user_id` et `tenant_id`
- compatibilité des utilisateurs déjà créés sans `password_hash`
- parcours admin de création / conversion / reset de comptes
- redirections frontend post-login

## Recommandation d'exécution
Après merge de cette base :
- lancer la migration Alembic
- créer une branche dédiée au remplacement du backend auth
- puis une branche dédiée au frontend / Render pour limiter les régressions
