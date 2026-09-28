# Architecture de stockage documentaire

Ce document couvre `app/core/storage.py` (backend) et
`infra/azure/modules/storage.bicep` (infrastructure) — le stockage des
fichiers persistants de la plateforme : bulletins/attestations générés en
PDF, pièces d'admission, documents RH, imports/exports, et tout autre
upload utilisateur (`POST /storage/upload`, `POST /admissions/public/
upload-document/`).

## Le problème que ceci résout

Avant ce changement, `StorageClient` ne choisissait qu'entre MinIO (si
configuré) et un repli sur disque local (`backend/uploads`, ou `/tmp` si
non inscriptible). Ni l'un ni l'autre ne survit à ce qu'une Azure
Container App fait normalement :

- un redémarrage de réplique perd tout fichier écrit sur son disque
  local ;
- une autre réplique du même Container App ne voit pas les fichiers
  écrits par la première (pas de disque partagé) ;
- un changement de révision (nouveau déploiement) recrée les
  conteneurs — tout fichier local est perdu ;
- le scaling horizontal devient incohérent dès qu'un document existe
  sur une réplique et pas sur une autre.

En clair : le filesystem d'un Container App n'est **pas** un stockage
documentaire durable. MinIO et le disque local restent parfaitement
valides en local (poste de développeur) et en tests (CI), mais jamais
comme backend réel d'un environnement Azure REC/PROD.

## Architecture cible

```
Application
    |
    v
StorageClient (app/core/storage.py)
    |
    +-- AzureBlobStorageClient   <- actif dès que configuré (priorité la plus haute)
    |       |
    |       v
    |   Azure Blob Storage (infra/azure/modules/storage.bicep)
    |
    +-- MinioClient              <- LOCAL/TEST uniquement
    |
    +-- LocalStorageClient       <- LOCAL/TEST uniquement (backend/uploads ou /tmp)
```

`StorageClient` choisit le backend actif dans cet ordre de priorité :
**Azure Blob Storage > MinIO > disque local**. Tous les appelants
existants (`storage_client.upload_file(...)`,
`storage_client.get_presigned_url(...)`) sont inchangés — c'est
`StorageClient` qui décide en interne quel backend sert la requête, pas
l'appelant.

### Interface commune

Chaque backend (`AzureBlobStorageClient`, `MinioClient`,
`LocalStorageClient`) expose désormais les mêmes cinq opérations :

- `upload_file(file_data, object_name, content_type=None)`
- `get_presigned_url(object_name, method="GET", expires=timedelta)`
- `exists(object_name) -> bool`
- `delete_file(object_name) -> bool` (idempotent — ne lève jamais si la
  clé n'existe déjà plus)
- `download_file(object_name) -> bytes`

`exists`/`delete_file`/`download_file` sont nouveaux sur MinIO et
Local (seuls `upload_file`/`get_presigned_url` existaient avant) — ajoutés
pour la parité d'interface, sans changer le comportement des deux
méthodes existantes.

## Comportement par environnement

| Environnement | `ENVIRONMENT` | Backend autorisé | Absence de config Azure Blob |
|---|---|---|---|
| LOCAL / tests (CI) | non défini / `development` | Local ou MinIO | OK — comportement normal, aucun test n'exige de compte Azure réel |
| Azure DEV | `development` (voir `container-apps.bicep`) | Azure Blob préféré s'il est configuré ; MinIO/Local encore tolérés | OK — dégradation silencieuse acceptée pour cet environnement uniquement |
| Azure REC | `staging` | **Azure Blob obligatoire** | **Échec explicite au démarrage** (`os._exit(1)`) |
| Azure PROD | `production` | **Azure Blob obligatoire** | **Échec explicite au démarrage** (`os._exit(1)`) |

La bascule REC/PROD réutilise exactement la même notion
d'« environnement strict » que la validation existante de `SECRET_KEY`
(`app.core.config.is_strict_environment()` — `ENVIRONMENT` dans
`production`/`prod`/`staging`), pour ne pas faire dériver deux
définitions différentes de « c'est de la prod » dans le même fichier.

### Comportement fail-closed — interdiction absolue

En REC/PROD, si `AZURE_STORAGE_ACCOUNT_URL` (ni
`AZURE_STORAGE_CONNECTION_STRING`) n'est pas configuré, ou si
l'initialisation du client Azure échoue, le processus (`api` **et**
`worker` — les deux importent `app.core.storage` au démarrage) appelle
`os._exit(1)` immédiatement, avec un message `CRITICAL` explicite dans les
logs. **Aucun repli silencieux vers MinIO ou le disque local n'est
possible dans ces deux environnements** — même si MinIO est par ailleurs
parfaitement configuré (testé explicitement dans
`test_storage_provider_selection_2026_09_28.py::
test_production_without_azure_blob_never_falls_back_to_minio_or_local`).

C'est le même contrat qu'ont déjà `SECRET_KEY` et `BOOTSTRAP_SECRET` dans
`app/core/config.py` : une configuration manquante doit être un échec de
déploiement bruyant, jamais un piège silencieux de perte de données
découvert après le premier redémarrage de réplique.

## Authentification Azure — Managed Identity + RBAC

`AzureBlobStorageClient` privilégie l'authentification par identité
managée :

- **`AZURE_STORAGE_ACCOUNT_URL`** défini, `AZURE_STORAGE_CONNECTION_STRING`
  absent → `azure.identity.DefaultAzureCredential` (identité managée sur
  Azure ; `az login` en local). **Aucune clé de compte de stockage
  n'existe jamais dans ce process.** C'est le mode obligatoire pour Azure
  DEV/REC/PROD.
- **`AZURE_STORAGE_CONNECTION_STRING`** défini → authentification par clé
  partagée, réservée aux tests locaux contre un émulateur Azurite. Ne
  jamais définir cette variable dans un environnement Azure déployé — le
  compte de stockage réel a d'ailleurs `allowSharedKeyAccess: false`
  (voir `storage.bicep`), donc une clé y serait de toute façon refusée.

### Génération d'URL signée (SAS)

Le conteneur Blob n'autorise aucun accès public
(`allowBlobPublicAccess: false` au niveau du compte, `publicAccess: None`
sur le conteneur — voir `storage.bicep`). Pour donner malgré tout au
frontend un lien de téléchargement direct, `get_presigned_url()` génère un
**SAS utilisateur délégué** (`user delegation SAS`) : l'identité managée
obtient une clé de délégation temporaire via
`BlobServiceClient.get_user_delegation_key()`, puis signe l'URL avec
`generate_blob_sas()` — sans jamais détenir ni manipuler de clé de compte.

### Rôles RBAC accordés (le minimum nécessaire)

L'identité managée partagée (`modules/identity.bicep`, la même que
`api`/`worker` utilisent déjà pour Key Vault et l'ACR) reçoit exactement
deux rôles intégrés Azure, scopés au compte de stockage créé par
`storage.bicep` :

| Rôle | Rôle ID | Pourquoi |
|---|---|---|
| **Storage Blob Data Contributor** | `ba92f5b4-2d11-453d-a403-e96b0029c9fe` | Lire/écrire/supprimer des blobs — les opérations réellement utilisées (`upload_file`, `exists`, `delete_file`, `download_file`). |
| **Storage Blob Delegator** | `db58b8e5-c6ad-4a2a-8342-4190687cbf4a` | Émettre des SAS utilisateur délégué (`get_presigned_url`) sans détenir de clé de compte. |

Aucun rôle de gestion du compte (clés, règles réseau, SKU) n'est accordé —
cette identité ne peut agir que sur le contenu des blobs, jamais sur la
configuration de la ressource elle-même.

## Ressources créées par `infra/azure/modules/storage.bicep`

Par environnement (`dev`/`rec`/`prod`, un groupe de ressources par
environnement comme le reste de la stack) :

- **Storage Account** (`stschoolflow<env>`, `StorageV2`) —
  `Standard_LRS` (dev/rec) ou `Standard_ZRS` (prod, résiste à une panne de
  zone de disponibilité). HTTPS obligatoire
  (`supportsHttpsTrafficOnly: true`), TLS 1.2 minimum, accès blob public
  désactivé, authentification par clé de compte désactivée
  (`allowSharedKeyAccess: false`).
- **Blob container** dédié (`schoolflow-documents` par défaut,
  configurable via `AZURE_STORAGE_CONTAINER`), `publicAccess: None`.
- **Soft delete** sur les blobs et les conteneurs (30 jours en prod, 7
  ailleurs) — un filet de sécurité contre une suppression ou un écrasement
  accidentel (`upload_file` écrase toujours par `object_name`), pas un
  substitut à une confirmation de suppression côté application.
- **Pas de VNet / private endpoint** dans cette passe — même posture que
  PostgreSQL et Redis existants (`infra/azure/README.md` documente déjà ce
  choix pour ces deux ressources ; à revisiter ensemble, pas au cas par
  cas).

Rien n'est déployé automatiquement : comme pour le reste de
`infra/azure/`, ces ressources ne sont créées que par un `az deployment
group create` explicite ou un déclenchement manuel de
`.github/workflows/deploy-azure.yml`.

## Diagnostic

### `/health/ready` (sonde de disponibilité, non authentifiée)

Le composant `storage` distingue trois états :

- `"disabled"` — le backend actif est Local (rien à vérifier, ce n'est
  pas un échec).
- `"connected"` — le backend actif (Azure Blob ou MinIO) répond.
- `"unreachable"` — le backend actif est configuré mais ne répond pas
  (panne réseau, identité managée révoquée, conteneur supprimé). Dans un
  environnement REC/PROD, si ce composant était mal configuré au
  démarrage, le processus ne serait de toute façon jamais arrivé jusqu'à
  servir une requête (`os._exit(1)` au démarrage) — donc `"unreachable"`
  ici signale toujours une panne survenue APRÈS un démarrage réussi,
  jamais un trou de configuration.

Le champ `storage_backend` (`"azure_blob"` / `"minio"` / `"local"`)
accompagne ce statut — jamais de clé, jeton SAS, chaîne de connexion ou
identifiant dans cette réponse, ni dans `/health/deep` (protégé par
`HEALTH_DEEP_SECRET`, mais soumis à la même règle par prudence).

### Procédure de diagnostic

1. `GET /health/ready` → vérifier `components.storage` et
   `components.storage_backend`.
2. `storage_backend` inattendu (ex. `"local"` en PROD) → la variable
   `AZURE_STORAGE_ACCOUNT_URL` n'a pas été prise en compte au démarrage ;
   vérifier les logs de démarrage du Container App (un `CRITICAL`
   explicite y aurait normalement empêché le démarrage — si le service
   répond quand même en `"local"`, c'est qu'il ne s'agit pas réellement
   d'un environnement REC/PROD au sens de `ENVIRONMENT`).
3. `storage == "unreachable"` avec `storage_backend == "azure_blob"` →
   vérifier que l'identité managée a toujours ses deux rôles RBAC sur le
   compte de stockage (`az role assignment list --scope
   <storageAccountId>`), et que le compte/conteneur existe toujours.
4. Jamais de secret à chercher dans ces réponses — l'authentification
   étant par identité managée, il n'y a structurellement aucune clé à
   faire tourner ou à vérifier côté application.

## Migration des fichiers locaux historiques

Cette PR ne migre aucun fichier existant automatiquement — un
environnement déjà en production sur MinIO ou disque local avant ce
changement doit migrer ses objets manuellement avant de basculer
`AZURE_STORAGE_ACCOUNT_URL` :

1. Lister les clés existantes (MinIO : `mc ls --recursive
   <alias>/<bucket>` ; disque local : `find backend/uploads -type f`).
2. Copier chaque objet vers le conteneur Azure Blob en conservant
   exactement le même `object_name` (chemin relatif) — les deux
   conventions de clé existantes dans ce code (`{user_id}/{uuid}.ext` et
   `admissions/{tenant_id}/{uuid}.ext`) doivent être préservées à
   l'identique : ce sont ces mêmes clés qui sont stockées en base
   (`documents.key`, etc.) et référencées par le frontend.
3. Ne basculer `AZURE_STORAGE_ACCOUNT_URL` qu'une fois la copie terminée
   et vérifiée (comparaison de taille/nombre d'objets), pour éviter une
   fenêtre où un document existe en base mais pas dans le nouveau
   backend.
4. `azcopy` (outil officiel Microsoft) est l'outil recommandé pour cette
   copie en masse — hors périmètre de cette PR (aucun compte Azure réel
   n'existe encore à ce stade).

## Hors périmètre de cette PR

- Private networking / VNet pour PostgreSQL ou pour ce compte de
  stockage.
- Nouveaux rôles PostgreSQL.
- Un job de migration automatisé des fichiers historiques (voir
  ci-dessus — procédure manuelle documentée, non implémentée).
- Refonte CI/CD.
- Toute fonctionnalité métier nouvelle (les endpoints existants sont
  inchangés).
