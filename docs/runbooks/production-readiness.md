# Runbook — Production readiness SchoolFlow Pro

Ce document sert de checklist avant toute mise en production réelle de SchoolFlow Pro.

## Statut actuel

- Démo avancée : oui.
- Pré-production locale Docker : oui si le smoke test passe.
- Production client réelle : uniquement après validation complète de cette checklist.

## 1. Validation Docker locale

Commande de référence :

```bash
bash scripts/smoke-docker.sh
```

Le smoke test doit valider :

- `docker compose config` ;
- démarrage de PostgreSQL, Redis, MinIO, API et frontend ;
- API `/health/ready` (DB, Redis et RLS actifs) ;
- API `/health/live` (processus disponible) ;
- frontend `http://localhost:3000/` ;
- une seule head Alembic ;
- login super admin si `ADMIN_DEFAULT_EMAIL` et `ADMIN_DEFAULT_PASSWORD` sont configurés.

## 2. Validation migrations Alembic

Avant merge ou déploiement :

```bash
docker compose --env-file .env.docker exec -T api alembic heads
```

Résultat attendu : une seule ligne contenant `(head)`.

Si plusieurs heads sont présentes, créer une migration de merge :

```bash
docker compose --env-file .env.docker exec -T api alembic merge -m "merge heads" HEAD1 HEAD2
```

Puis :

```bash
docker compose --env-file .env.docker exec -T api alembic upgrade head
```

## 3. Parcours E2E obligatoire

À valider manuellement avant prod :

1. Connexion super admin.
2. Création d’un établissement.
3. Création ou vérification de l’admin établissement.
4. Connexion sur l’URL tenant.
5. Dashboard tenant.
6. Paramètres établissement : nom, pays, devise `GNF`, timezone `Africa/Conakry`.
7. Création année académique.
8. Création niveau, classe, matière.
9. Création étudiant.
10. Création enseignant.
11. Admission ou inscription.
12. Finance : facture / paiement / état.
13. Reporting ministériel.
14. Export PDF/CSV.
15. Déconnexion/reconnexion.

## 4. Isolation multi-tenant

À vérifier :

- un utilisateur d’un établissement ne peut pas lire les données d’un autre établissement ;
- les endpoints sensibles rejettent les requêtes sans JWT ;
- les endpoints tenant rejettent les requêtes sans tenant identifié ;
- le rôle `SUPER_ADMIN` n’est pas confondu avec `TENANT_ADMIN` ;
- les exports sont filtrés par tenant sauf routes explicitement super admin.

## 5. Internationalisation et libellés

À vérifier sur chaque page principale :

- aucun libellé brut du type `dashboard.xxx`, `nav.xxx`, `messages.xxx` ;
- tous les menus sont en français ;
- la devise affichée pour la Guinée est `GNF` ;
- les messages de succès/erreur sont compréhensibles.

## 6. Sécurité production

Avant prod :

- remplacer tous les secrets `CHANGE_ME` ;
- `DEBUG=False` ;
- `SECRET_KEY` fort ;
- `BOOTSTRAP_SECRET` fort ;
- `ADMIN_DEFAULT_PASSWORD` changé après installation ;
- HTTPS obligatoire ;
- CORS limité au domaine réel ;
- Sentry ou outil équivalent configuré ;
- sauvegardes PostgreSQL atomiques avec checksum et copie hors site ;
- restauration PostgreSQL testée sur une base isolée, durée et résultat archivés ;
- accès MinIO/S3 sécurisé ;
- logs et monitoring activés.

## 7. Déploiement production recommandé

Services minimum :

- PostgreSQL managé ou sauvegardé ;
- Redis ;
- stockage objet S3/MinIO ;
- API derrière reverse proxy HTTPS ;
- frontend servi par Nginx/CDN ;
- jobs de backup ;
- monitoring CPU/RAM/disque ;
- alerting erreurs 5xx.

## 8. Commandes de validation avant merge

```bash
git status
npm ci --legacy-peer-deps
npm run lint
npm run type-check
npm run build
cd backend && python -m pytest tests/ -v
cd ..
bash scripts/smoke-docker.sh
```

## Verdict attendu

Le projet peut être considéré prêt pour une pré-production lorsque :

- le smoke test passe ;
- les checks CI passent ;
- le parcours E2E est validé ;
- aucun libellé technique visible n’est présent ;
- la sécurité multi-tenant est testée ;
- la restauration de backup est testée.

Commande de vérification non destructive :

```bash
scripts/restore-database.sh --backup /var/backups/schoolflow/schoolflow_backup_YYYYMMDDTHHMMSSZ.dump
```

La mise en production est bloquée si l’âge de la dernière sauvegarde dépasse le
RPO approuvé ou si aucun exercice de restauration récent n’est disponible.
