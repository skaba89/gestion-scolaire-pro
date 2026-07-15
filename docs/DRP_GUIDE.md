# Plan de Reprise d'Activité (DRP) — SchoolFlow Pro

Ce document définit les objectifs de reprise et les procédures opérationnelles
en cas de sinistre technique majeur. Il s'appuie exclusivement sur les scripts
versionnés dans `scripts/` — chaque procédure décrite ici est exercée
automatiquement en CI à chaque push (drill backup → restauration → contrôle).

## 1. Objectifs de reprise

| Objectif | Cible | Justification |
|---|---|---|
| **RPO** (perte de données max) | **≤ 24 h** | Sauvegarde quotidienne à 02:00 UTC via timer systemd. Réduire à 1 h nécessiterait l'archivage WAL (voir §7). |
| **RTO** (durée d'indisponibilité max) | **≤ 4 h** | Restauration testée en CI ; la procédure §5 est exécutable par une personne technique seule. |
| Vérifiabilité | Chaque sauvegarde | Archive atomique + somme SHA-256 ; toute restauration commence par une vérification à blanc. |

## 2. Stratégie de sauvegarde

### Base de données (PostgreSQL)

Script : [`scripts/backup-database.sh`](../scripts/backup-database.sh)

- **Format** : archive `pg_dump` custom (`schoolflow_backup_<UTC>.dump`) écrite
  de façon **atomique** (fichier `.partial` renommé seulement si le dump et le
  checksum réussissent) + sidecar **SHA-256**.
- **Pré-vols** : espace disque minimal (`MIN_FREE_SPACE_MB`, défaut 5 Go).
- **Rétention** : `RETENTION_DAYS` (défaut 30 jours) — rotation automatique des
  archives et checksums expirés.
- **Alerting** : échec notifié par `ALERT_EMAIL` (via `mail`) et/ou
  `ALERT_WEBHOOK` (payload JSON, compatible Slack/Discord/Mattermost).
- **Copie hors-site** : `BACKUP_S3_URI` (S3 ou compatible — MinIO distant,
  Backblaze B2, Wasabi) avec chiffrement côté serveur (`S3_SSE`, défaut
  AES256, ou KMS via `S3_KMS_KEY_ID`). Un échec d'upload hors-site n'invalide
  pas la sauvegarde locale vérifiée.

Planification (au choix) :

```bash
# systemd (recommandé) — timers fournis
sudo cp scripts/schoolflow-backup.service scripts/schoolflow-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now schoolflow-backup.timer
# → tous les jours à 02:00 UTC (+ jitter 10 min), rattrapage si machine éteinte

# cron — voir scripts/crontab_example.txt
```

### Fichiers uploadés (MinIO / stockage local)

- MinIO : répliquer le bucket vers un site distant (`mc mirror --watch`) ou
  sauvegarder le volume Docker `minio-data`.
- Fallback stockage local : inclure `backend/uploads/` dans une synchronisation
  `rsync` quotidienne vers le site distant.

### Secrets

Le fichier `.env` de production n'est **jamais** dans Git. Conserver une copie
chiffrée (gestionnaire de mots de passe d'équipe ou coffre) contenant :
`SECRET_KEY`, `BOOTSTRAP_SECRET`, `DATABASE_URL`, `REDIS_URL`, `MINIO_*`,
`METRICS_SECRET`, clés des passerelles de paiement. **Sans `SECRET_KEY`, les
mots de passe survivent mais tous les JWT et tokens en cours sont invalidés.**

## 3. Vérification d'une sauvegarde (sans risque)

```bash
DB_HOST=... DB_USER=... DB_PASSWORD=... \
scripts/restore-database.sh --backup /var/backups/schoolflow/schoolflow_backup_<ts>.dump
```

Mode par défaut = **vérification seule** : checksum SHA-256 + lecture complète
de l'archive (`pg_restore --list`). Aucune écriture en base.

## 4. Restauration réelle

```bash
# 1. Créer une base de destination NEUVE (jamais la base de prod directement)
createdb -h $DB_HOST -U $DB_USER schoolflow_restore

# 2. Restaurer avec confirmation explicite du nom de la base cible
scripts/restore-database.sh \
  --backup /var/backups/schoolflow/schoolflow_backup_<ts>.dump \
  --target-db schoolflow_restore \
  --execute \
  --confirm schoolflow_restore

# 3. Contrôler l'intégrité
psql -h $DB_HOST -U $DB_USER -d schoolflow_restore \
  -c "SELECT count(*) FROM alembic_version;" \
  -c "SELECT count(*) FROM tenants;" \
  -c "SELECT count(*) FROM users;"

# 4. Basculer l'application sur la base restaurée (DATABASE_URL) puis redémarrer
```

Garde-fous du script : restauration en une seule transaction (`--single-transaction
--clean --if-exists`), et **refus** de restaurer dans la base définie par
`DB_NAME` sauf si `ALLOW_IN_PLACE_RESTORE=true` est posé explicitement.

## 5. Sinistre majeur — perte totale du serveur (VPS Docker)

1. **Provisionner** un serveur Linux propre (Docker + Docker Compose).
2. **Cloner** le dépôt : `git clone https://github.com/skaba89/gestion-scolaire-pro.git`
3. **Restaurer les secrets** : recréer `.env.docker` depuis la copie chiffrée (§2).
4. **Démarrer l'infrastructure** :
   ```bash
   docker compose --env-file .env.docker up -d postgres redis minio
   ```
5. **Restaurer la base** : procédure §4 (récupérer l'archive depuis le site
   hors-site si le disque local est perdu).
6. **Restaurer les fichiers** : re-synchroniser `minio-data`/`backend/uploads/`.
7. **Démarrer l'API et le frontend** :
   ```bash
   docker compose --env-file .env.docker up -d
   ```
8. **Vérifier** :
   ```bash
   bash scripts/smoke-docker.sh          # santé complète de la stack
   curl -s localhost:8000/health/ready    # DB + Redis + RLS actifs
   ```
9. **Re-pointer le DNS** vers le nouveau serveur.

Variante **Render + Netlify** : recréer les services depuis le blueprint,
reconfigurer les variables d'environnement depuis la copie chiffrée, restaurer
la base gérée via §4, redéployer depuis `main`.

## 6. Exercices (drills)

| Exercice | Fréquence | Automatisation |
|---|---|---|
| Backup + vérification + restauration dans une base jetable | À chaque push | Job CI `backend-tests` (`.github/workflows/ci.yml`) |
| Restauration complète sur serveur vierge (§5) | Trimestriel | Manuel — chronométrer et comparer au RTO de 4 h |
| Récupération de la copie hors-site | Semestriel | Manuel — vérifier le SHA-256 après téléchargement |

## 7. Améliorations futures (hors périmètre actuel)

- **RPO < 1 h** : archivage WAL continu (`wal-g`/`pgBackRest`) vers le stockage hors-site.
- **Haute disponibilité** : réplica PostgreSQL hot-standby + bascule documentée.
- **Alerting proactif** : brancher les règles PromQL de
  [`docs/runbooks/metrics.md`](runbooks/metrics.md) sur un Prometheus/Grafana.

## 8. Contacts d'urgence

| Rôle | Contact |
|---|---|
| Responsable technique | _à compléter_ |
| Hébergeur (VPS/Render) | _à compléter_ |
| Astreinte établissement pilote | _à compléter_ |
