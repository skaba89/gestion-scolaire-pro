# Production sur VPS unique (VPS OVH, depuis octobre 2026)

La production tourne sur **un seul VPS** (Ubuntu) avec Docker Compose :
`docker-compose.yml` (services) + `deploy/vps/docker-compose.vps.yml` (images
de prod, aucun port exposé hors Caddy, limites mémoire). Caddy termine le TLS
(Let's Encrypt) et passe tout au frontend nginx, qui relaie `/api/` à l'API.

```
Internet ──443──▶ caddy ──▶ frontend (nginx) ──/api/──▶ api ──▶ postgres (RLS, rôle restreint)
                                                         │──▶ redis ◀── worker (ARQ)
                                                         └──▶ minio
db-backup : dump quotidien → infra/backups/ ; cron 3 h → copie chiffrée Backblaze B2
```

Azure (App Service / Container Apps, `infra/azure/`, workflows `deploy-*.yml`)
n'est plus utilisé : l'abonnement a pris fin. `build-images.yml` ne tourne
plus qu'à la main.

## Fichiers

| Fichier | Rôle |
|---|---|
| `docker-compose.vps.yml` | Overlay de production |
| `Caddyfile` | TLS + en-têtes de sécurité ; domaine lu dans `.env.docker` |
| `deploy.sh` | Mise à jour : pull → build → migrations → redémarrage → contrôle de santé |
| `scripts/configurer-smtp.sh` | Saisie des identifiants Gmail SMTP (interactif) |
| `scripts/configurer-sauvegarde-b2.sh` | Saisie des clés Backblaze B2 + création des clés de chiffrement (interactif) |
| `scripts/sauvegarde-distante.sh` | Copie chiffrée des dumps vers B2 (cron) |
| `schoolflow-offsite.cron` | Entrée cron à copier dans `/etc/cron.d/` |
| `scripts/mfa-compte.sh` | Secours MFA d'un compte directement en base (téléphone perdu) |
| `scripts/surveillance.py` | Contrôles toutes les 5 min (API, dump local, copie B2, disque) ; email à la panne et au rétablissement |
| `schoolflow-surveillance.cron` | Entrée cron de la surveillance |

## Variables propres au VPS (`.env.docker`)

En plus de `.env.docker.example` :

```
VPS_DOMAIN=academy-guineenne.org         # nom servi par Caddy
VPS_REDIRECT_HOSTS=www.academy-guineenne.org   # redirigés vers VPS_DOMAIN (plusieurs : séparés par des espaces)
VPS_PUBLIC_IP=203.0.113.10               # http://<IP> redirige vers le domaine
BACKEND_CORS_ORIGINS=https://academy-guineenne.org
FRONTEND_URL=https://academy-guineenne.org
ENFORCE_MFA=true
DEBUG=False
DATABASE_URL=...schoolflow_app...        # rôle restreint (NOBYPASSRLS)
DATABASE_URL_MIGRATIONS=...schoolflow... # rôle propriétaire, migrations uniquement
```

Sans nom de domaine, `<ip-avec-tirets>.sslip.io` (ex. `203-0-113-10.sslip.io`)
fonctionne avec Let's Encrypt. **Garder une copie de `.env.docker` hors du VPS**
(gestionnaire de mots de passe) : il n'existe nulle part ailleurs.

## Autres applications sur ce VPS (CodeRoute Guinée)

Le Caddy d'Academy est le **seul** point d'entrée public du VPS (80/443).
Il sert aussi CodeRoute Guinée, qui ne publie aucun port :

- `Caddyfile` se termine par `import /etc/caddy/sites/*.caddy` ; le dossier
  `CODEROUTE_CADDY_SITES_DIR` (par défaut
  `/home/ubuntu/CodeRouteGuinee/deploy/vps/generated`) est monté en lecture
  seule sur `/etc/caddy/sites`. Dossier vide ou absent : Academy fonctionne seul.
- Caddy rejoint le réseau `coderoute-edge`, **créé par ce projet** (nom fixe) ;
  CodeRoute s'y raccorde en `external`. Seul Caddy est sur ce réseau côté
  Academy : les conteneurs CodeRoute n'atteignent ni l'API, ni PostgreSQL,
  ni Redis d'Academy.
- Le `deploy.sh` de CodeRoute génère son bloc de site puis lance
  `caddy reload` (sans coupure pour Academy).

Retirer CodeRoute : vider le dossier monté puis `caddy reload`, ou retirer la
ligne `import`, le volume et le réseau, puis `./deploy/vps/deploy.sh`.

## Mise à jour courante

```bash
cd ~/gestion-scolaire-pro
sudo docker compose --env-file .env.docker -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml \
  exec -T postgres pg_dump -U schoolflow -d schoolflow -Fc > /tmp/predeploy.dump   # puis le ranger dans infra/backups/
./deploy/vps/deploy.sh
```

`deploy.sh` supprime aussi le cache de build Docker de plus de 7 jours
(il grossissait d'environ 14 Go par jour de déploiements). Il s'arrête en erreur si `/api/health/ready` (via Caddy, sur le vrai
domaine) ne répond pas `healthy`. Retour arrière : `git checkout <sha précédent>`
puis relancer les étapes build / up du script (pas de `git pull`) ; une
migration ne se défait qu'avec `alembic downgrade` explicite.

## Remise en route sur un nouveau VPS

1. Ubuntu à jour, Docker + plugin compose, `rclone`, `qrencode` ; pare-feu :
   `ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable`.
2. `git clone` du dépôt dans `~/gestion-scolaire-pro`, puis recréer
   `.env.docker` (copie de sauvegarde, ou à partir de `.env.docker.example` +
   la section ci-dessus) ; `chmod 600 .env.docker`.
3. Faire pointer le DNS du domaine (A/AAAA) vers le VPS.
4. Démarrer les données : `sudo docker compose --env-file .env.docker -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml up -d --wait postgres redis minio`.
5. **Restaurer la base** (sinon passer à 6) — voir ci-dessous.
6. Rôle restreint `schoolflow_app` : procédure de `docs/POSTGRES_APP_ROLE.md`
   (« Procédure »), si la base est neuve.
7. `./deploy/vps/deploy.sh` (applique les migrations manquantes).
8. Sauvegardes distantes : `sudo ./deploy/vps/scripts/configurer-sauvegarde-b2.sh`
   (en réutilisant les **mêmes** clés de chiffrement si l'on veut relire
   les anciennes sauvegardes, voir ci-dessous), puis
   `sudo install -m 644 deploy/vps/schoolflow-offsite.cron /etc/cron.d/schoolflow-offsite`.
9. Emails : `sudo ./deploy/vps/scripts/configurer-smtp.sh` puis `./deploy/vps/deploy.sh`.
10. Surveillance : `sudo ./deploy/vps/scripts/surveillance.py --test-email`
    (vérifier la réception), puis
    `sudo install -m 644 deploy/vps/schoolflow-surveillance.cron /etc/cron.d/schoolflow-surveillance`.
    Destinataire : `ALERT_EMAIL` dans `.env.docker` (sinon `SMTP_USER`).
    Ne couvre pas l'arrêt complet du VPS : pour cela, un moniteur externe
    (ex. UptimeRobot) sur `https://$VPS_DOMAIN/api/health/ready`.

### Restaurer depuis Backblaze B2

Il faut : la clé d'application B2, le nom du bucket et les deux clés de
chiffrement (`password`, `password2`) conservées hors du VPS.

```bash
# remotes rclone avec les clés EXISTANTES (pas de nouvelles clés aléatoires)
sudo rclone config create distant b2 account=<keyID> key=<applicationKey> hard_delete=true --non-interactive
sudo rclone config create distant-crypt crypt remote="distant:<bucket>/schoolflow" \
  password=<password> password2=<password2> --obscure --non-interactive
sudo rclone ls distant-crypt:daily            # choisir le dump le plus récent
sudo rclone copy distant-crypt:daily/schoolflow-AAAAMMJJ.sql.gz /tmp/restore/
zcat /tmp/restore/schoolflow-AAAAMMJJ.sql.gz | sudo docker compose --env-file .env.docker \
  -f docker-compose.yml -f deploy/vps/docker-compose.vps.yml exec -T postgres psql -U schoolflow -d schoolflow
```

Taper ces valeurs dans un terminal SSH (`rclone config` interactif évite
de les laisser dans l'historique du shell). Restaurer **avant** de créer de
nouvelles données ; vérifier ensuite `/api/health/ready` (`schema: up_to_date`).

## Contrôles utiles

```bash
curl -s https://$VPS_DOMAIN/api/health/ready     # status healthy, rls active, release_sha
sudo tail /var/log/schoolflow-offsite.log        # dernière copie B2
sudo tail /var/log/schoolflow-surveillance.log   # derniers contrôles (api, dump, distant, disque)
sudo rclone ls distant-crypt: | tail             # contenu distant (déchiffré)
```
