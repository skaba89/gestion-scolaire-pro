# Réseau privé Azure — PostgreSQL et Redis

Ce document couvre `infra/azure/modules/network.bicep` et les changements
associés dans `postgres.bicep`, `redis.bicep` et `container-apps.bicep` —
la fermeture d'un écart explicitement documenté depuis la première
version de `infra/azure/` (`infra/azure/README.md` le listait comme
« deliberately out of scope for this pass »).

## Le problème que ceci résout

Avant ce changement, PostgreSQL et Redis étaient joignables sur leur
**point de terminaison public**, protégés uniquement par :

- PostgreSQL : une règle de pare-feu `AllowAllAzureServices`
  (`0.0.0.0`-`0.0.0.0`, la valeur spéciale Azure signifiant « autoriser
  tout service Azure, y compris ceux d'autres abonnements/tenants »)  —
  l'authentification par mot de passe restait la seule protection réelle.
- Redis : accès public standard, sécurisé par TLS + clé d'accès
  uniquement.

Ce n'est pas une isolation réseau — c'est une exposition publique dont
seule l'authentification applicative limite l'usage. `postgres.bicep`
documentait déjà explicitement ce compromis comme temporaire.

## Architecture après

```
VNet (vnet-schoolflow-<env>, 10.20.0.0/16)
    |
    +-- snet-infra (10.20.0.0/23)
    |       délégué à Microsoft.App/environments
    |       <- Container Apps Environment (VNet-intégré)
    |
    +-- snet-postgres (10.20.2.0/24)
    |       délégué à Microsoft.DBforPostgreSQL/flexibleServers
    |       <- PostgreSQL Flexible Server (VNet-intégré, PAS de point
    |          de terminaison public du tout)
    |
    +-- snet-private-endpoints (10.20.3.0/24)
            <- Private Endpoint Redis (Basic/Standard, pas d'injection
               VNet directe possible à ce niveau de SKU — Private Link
               est la seule option de connectivité privée disponible)
```

Deux zones DNS privées (noms imposés par Azure, liées au VNet) :
`privatelink.postgres.database.azure.com` et
`privatelink.redis.cache.windows.net` — sans elles, un client dans le
VNet résoudrait toujours le nom public du serveur (devenu injoignable),
pas son adresse privée.

**Ce qui NE change PAS** : l'ingress public des Container Apps `api` et
`frontend` reste identique — une Consumption Environment intégrée à un
VNet continue de recevoir une IP publique gérée par la plateforme pour
les apps en `external: true`. Seul le chemin **sortant** vers
PostgreSQL/Redis change, pas ce qui est joignable depuis l'extérieur.

## Pourquoi deux mécanismes différents (VNet-intégration vs Private Endpoint)

- **PostgreSQL Flexible Server** supporte nativement le mode « VNet
  integration » : le serveur reçoit une interface réseau directement dans
  un sous-réseau dédié et délégué. Aucune ressource Private Endpoint
  séparée n'est nécessaire, et ce mode **supprime purement et simplement
  le point de terminaison public** — il n'y a plus de règle de pare-feu
  à gérer parce qu'il n'y a plus d'IP publique du tout.
- **Azure Cache for Redis**, au niveau SKU utilisé ici (`Basic`/`Standard`
  — voir `parameters/*.bicepparam`), ne supporte l'injection VNet directe
  qu'à partir du tier `Premium`. Private Link/Private Endpoint reste
  disponible à tous les tiers, donc c'est le mécanisme utilisé — le cache
  garde techniquement un « point de terminaison », mais
  `publicNetworkAccess: 'Disabled'` le ferme complètement côté réseau
  public ; seul le trafic passant par le Private Endpoint (donc depuis le
  VNet) est accepté.

## Ce qui reste hors périmètre

- **Le compte de stockage** (`infra/azure/modules/storage.bicep`, ajouté
  dans une PR précédente) garde son point de terminaison public —
  l'authentification par identité managée + l'absence d'accès blob
  public/de clé de compte (voir `docs/STORAGE_ARCHITECTURE.md`) restent
  les contrôles en place. Lui ajouter un Private Endpoint est une
  amélioration possible future, volontairement laissée hors de cette PR
  pour rester strictement scopée au sujet PostgreSQL/Redis.
- Aucun nouveau rôle PostgreSQL, aucune modification du job de migration,
  aucune fonctionnalité applicative — cette PR est infrastructure réseau
  uniquement.

## Coût

Cette PR ajoute des ressources facturées dès qu'elles sont **réellement
déployées** (jamais automatiquement — voir `infra/azure/README.md`) :

- Un VNet lui-même est gratuit.
- Un Private Endpoint (Redis) : un petit coût horaire + traitement des
  données qui y transitent.
- Deux zones DNS privées : un petit coût mensuel + coût par requête de
  résolution.

Ces coûts s'ajoutent à ceux déjà documentés dans
`infra/azure/README.md` (section « Cost ») pour Postgres/Redis/Container
Apps/Storage — ils ne les remplacent pas.

## Validation effectuée

- `bicep build` sur `main.bicep` : succès, 0 erreur, 0 warning
  (`bicep lint` également propre).
- `bicep build-params` sur les trois fichiers `.bicepparam` : succès.
- Vérification du graphe de dépendances du template ARM compilé :
  `postgres`, `redis` et `containerApps` dépendent bien du module
  `network` (Bicep infère cette dépendance automatiquement dès qu'un
  module consomme la sortie d'un autre — vérifié explicitement plutôt que
  supposé).
- **Aucun déploiement Azure réel n'a été effectué** — comme pour le reste
  de `infra/azure/`, ceci reste du code non appliqué tant qu'un humain ne
  lance pas explicitement `az deployment group create` ou le workflow
  `deploy-azure.yml`. Les schémas de ressources (VNet, Private Endpoint,
  zones DNS privées, propriété `network` de PostgreSQL Flexible Server)
  n'ont donc pu être validés que par la vérification de schéma statique
  de `bicep build`, pas par un déploiement réel — un premier déploiement
  en `dev` reste la seule validation qui vaille avant `rec`/`prod`.

## Procédure de diagnostic (une fois déployé)

1. Un Container App ne parvient pas à joindre PostgreSQL/Redis → vérifier
   que son environnement (`containerAppsEnv`) est bien listé comme
   utilisant `snet-infra` (`az containerapp env show`), et que les
   sous-réseaux `snet-postgres`/`snet-private-endpoints` existent bien
   dans le même VNet.
2. Résolution DNS incorrecte depuis un Container App → vérifier que les
   deux liaisons de zone DNS privée (`az network private-dns link vnet
   list`) pointent bien vers ce VNet précis, pas un VNet d'un autre
   environnement.
3. Redis spécifiquement injoignable → vérifier l'état du Private Endpoint
   (`az network private-endpoint show`) et que
   `publicNetworkAccess: Disabled` n'a pas été modifié manuellement dans
   le portail (ce qui rouvrirait l'accès public sans passer par cette
   IaC).
