# Sauvegarde et restauration PostgreSQL

Ce runbook décrit la sauvegarde vérifiable de SchoolFlow Pro et l’exercice de
restauration obligatoire avant une mise en production. Une sauvegarde qui n’a
jamais été restaurée ne doit pas être considérée comme exploitable.

## Garanties fournies par les scripts

`scripts/backup-database.sh` :

- utilise le format personnalisé PostgreSQL (`pg_dump --format=custom`) ;
- écrit d’abord dans un fichier temporaire puis publie par renommage atomique ;
- échoue si `pg_dump` ou la lecture par `pg_restore` échoue ;
- produit un checksum SHA-256 dans un fichier `.sha256` ;
- empêche deux sauvegardes simultanées avec un verrou `flock` ;
- applique des permissions privées (`umask 077`) ;
- conserve les sauvegardes locales selon `RETENTION_DAYS` ;
- peut envoyer l’archive et son checksum vers S3 avec chiffrement serveur.

`scripts/restore-database.sh` vérifie le checksum et l’archive par défaut. Une
restauration réelle exige `--execute` et une confirmation égale au nom exact de
la base cible. La restauration en place est bloquée par défaut.

## Objectifs d’exploitation à décider

Avant le pilote, l’exploitant et le responsable métier doivent approuver :

| Décision | Point de départ conseillé | Validation requise |
|---|---:|---|
| RPO (perte de données maximale) | 24 h au pilote | à réduire pour paiements et inscriptions |
| RTO (temps maximal de reprise) | 4 h au pilote | mesuré pendant un exercice |
| Rétention locale | 30 jours | capacité disque surveillée |
| Copie hors site | obligatoire | autre compte ou autre région |
| Exercice de restauration | mensuel | preuve horodatée et contrôles métier |

Pour une exploitation nationale, utiliser de préférence PostgreSQL managé avec
PITR/WAL en complément des exports quotidiens. Le script ne remplace pas le PITR.

## Prérequis

- outils clients PostgreSQL compatibles avec la version du serveur ;
- `pg_dump`, `pg_restore`, `sha256sum`, `flock`, `df` et `find` ;
- AWS CLI uniquement si `BACKUP_S3_URI` est configuré ;
- un compte PostgreSQL dédié disposant des droits de lecture nécessaires ;
- un dossier non servi par le web et accessible uniquement à l’exploitant.

## Configuration

Créer `/etc/schoolflow/backup.env`, permission `600` :

```bash
DB_HOST=postgres.internal
DB_PORT=5432
DB_NAME=schoolflow
DB_USER=schoolflow_backup

# Choisir une seule méthode. Le fichier secret est préférable.
DB_PASSWORD_FILE=/run/secrets/schoolflow_backup_password
# DB_PASSWORD=valeur-secrete

BACKUP_DIR=/var/backups/schoolflow
RETENTION_DAYS=30
MIN_FREE_SPACE_MB=5120

ALERT_EMAIL=ops@example.gn
ALERT_WEBHOOK=

# Copie hors site recommandée. Appliquer aussi une politique de cycle de vie S3.
BACKUP_S3_URI=s3://schoolflow-prod-backups/database
S3_SSE=aws:kms
S3_KMS_KEY_ID=alias/schoolflow-backups
```

Ne pas conserver un mot de passe par défaut dans le dépôt. Restreindre le
bucket à l’identité de backup, activer le versioning/immutabilité si disponible
et empêcher cette identité de supprimer les sauvegardes hors site.

## Installation systemd

Les unités de référence se trouvent dans `scripts/schoolflow-backup.service` et
`scripts/schoolflow-backup.timer`.

```bash
sudo install -m 0755 scripts/backup-database.sh /opt/schoolflow-pro/scripts/
sudo install -m 0755 scripts/restore-database.sh /opt/schoolflow-pro/scripts/
sudo install -m 0644 scripts/schoolflow-backup.service /etc/systemd/system/
sudo install -m 0644 scripts/schoolflow-backup.timer /etc/systemd/system/
sudo install -d -m 0700 -o postgres -g postgres /var/backups/schoolflow
sudo systemctl daemon-reload
sudo systemctl enable --now schoolflow-backup.timer
sudo systemctl list-timers schoolflow-backup.timer
```

Le timer s’exécute vers 02:00 avec un décalage aléatoire maximal de dix minutes
et rattrape une exécution manquée après redémarrage.

## Exécution et vérification manuelles

```bash
sudo -u postgres bash -c '
  set -a
  source /etc/schoolflow/backup.env
  set +a
  /opt/schoolflow-pro/scripts/backup-database.sh
'

latest="$(find /var/backups/schoolflow -name "schoolflow_backup_*.dump" \
  -type f -printf "%T@ %p\n" | sort -n | tail -1 | cut -d" " -f2-)"

sudo -u postgres bash -c '
  set -a; source /etc/schoolflow/backup.env; set +a
  /opt/schoolflow-pro/scripts/restore-database.sh --backup "'"$latest"'"
'
```

Le second appel reste en mode vérification et ne modifie aucune base.

## Exercice mensuel de restauration

Effectuer cet exercice sur un serveur isolé ou une base dédiée, jamais sur la
base de production :

```bash
export TARGET_DB=schoolflow_restore_drill
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TARGET_DB"

scripts/restore-database.sh \
  --backup "$latest" \
  --target-db "$TARGET_DB" \
  --execute \
  --confirm "$TARGET_DB"
```

Après restauration, contrôler au minimum :

```bash
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" -c '\dt'
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" \
  -c 'SELECT count(*) AS tenants FROM tenants;'
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" \
  -c 'SELECT count(*) AS users FROM users;'
```

Valider ensuite un échantillon par établissement : utilisateurs, inscriptions,
notes, factures, paiements, pièces jointes et journaux d’audit. Mesurer la durée
totale, archiver le résultat de l’exercice, puis supprimer la base de test :

```bash
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TARGET_DB"
```

## Restauration en place après sinistre

Une restauration en place est destructive. Elle exige une décision d’incident,
l’arrêt des écritures applicatives et un snapshot préalable si le serveur le
permet. Une fois ces conditions remplies :

```bash
export ALLOW_IN_PLACE_RESTORE=true
scripts/restore-database.sh \
  --backup "$latest" \
  --target-db "$DB_NAME" \
  --execute \
  --confirm "$DB_NAME"
```

Appliquer ensuite `alembic upgrade head`, redémarrer l’API, vérifier `/health/`,
les parcours critiques et la cohérence des paiements avant de rouvrir le trafic.

## Surveillance et alertes

Surveiller au minimum :

- le code de sortie et la présence de `Backup process completed successfully` ;
- l’âge de la dernière archive locale et de la dernière copie hors site ;
- l’espace disque et le nombre d’archives ;
- les erreurs `SchoolFlow backup failed` ;
- la date, la durée et le résultat du dernier exercice de restauration.

```bash
journalctl -u schoolflow-backup.service --since "2 days ago"
systemctl status schoolflow-backup.timer
find /var/backups/schoolflow -name 'schoolflow_backup_*.dump' -type f -ls
```

La rétention du stockage hors site doit être gérée par une politique de cycle de
vie du bucket. Ne pas utiliser une synchronisation avec suppression qui pourrait
propager une suppression ou un chiffrement malveillant vers toutes les copies.

## Docker Compose

Le service `db-backup` de Docker Compose utilise une image spécialisée et une
configuration distincte. Pour un pilote Docker, vérifier réellement un fichier
exporté et effectuer le même exercice de restauration. Pour une production
critique, préférer un service PostgreSQL managé avec PITR et une copie hors site
indépendante du nœud Docker.
