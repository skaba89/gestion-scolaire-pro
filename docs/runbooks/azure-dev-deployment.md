# Runbook — Premier déploiement réel sur Azure (Container Apps, DEV)

Ce document est le mode d'emploi pas-à-pas pour la **toute première** exécution
réelle de `infra/azure/main.bicep` — jusqu'ici (2026-09-23), ce template n'a
jamais créé la moindre ressource Azure. Un `az deployment group what-if` a été
validé (13 ressources à créer, 0 erreur) ; ce runbook couvre ce qui vient après,
quand la décision d'engager le coût réel est prise. Voir `infra/azure/README.md`
pour l'architecture et `docs/NATIONAL_READINESS_2026.md` §7-9 pour l'historique
des corrections qui ont mené à ce `what-if` propre.

**Ne pas exécuter tant que le coût n'est pas assumé.** Dès l'étape 3
(`az deployment group create`), Postgres, Redis et les Container Apps sont
facturés en continu — voir `infra/azure/README.md` §Cost pour un ordre de
grandeur avant de lancer quoi que ce soit.

## 0. Prérequis (une seule fois)

- `az login` fait, sur le bon abonnement (`az account show` pour vérifier).
- `az group create --name rg-schoolflow-dev --location francecentral` déjà fait
  (confirmé le 2026-09-23).
- Accès push à `academyguineenneacr.azurecr.io` (ACR déjà existant, pas créé
  par ce template).

## 1. Construire et pousser les 2 images

Le workflow **Build and push images to ACR**
(`.github/workflows/build-push-acr.yml`) construit maintenant `schoolflow-api`
ET `schoolflow-frontend` (corrigé le 2026-09-23 — avant cette date, l'image
frontend n'avait jamais été poussée).

**Option A — via GitHub Actions (recommandé)** : onglet Actions → "Build and
push images to ACR" → *Run workflow* sur `main`.

**Option B — en local :**
```bash
az acr login --name academyguineenneacr

docker build -t academyguineenneacr.azurecr.io/schoolflow-api:latest -f backend/Dockerfile backend/
docker push academyguineenneacr.azurecr.io/schoolflow-api:latest

docker build -t academyguineenneacr.azurecr.io/schoolflow-frontend:latest -f Dockerfile .
docker push academyguineenneacr.azurecr.io/schoolflow-frontend:latest
```

Vérifier que les deux images existent avant de continuer :
```bash
az acr repository show-tags --name academyguineenneacr --repository schoolflow-api
az acr repository show-tags --name academyguineenneacr --repository schoolflow-frontend
```

## 2. Revalider avec what-if (recommandé, gratuit, avant le vrai create)

```bash
export POSTGRES_ADMIN_PASSWORD_DEV="<générer un mot de passe fort>"
az deployment group what-if \
  --resource-group rg-schoolflow-dev \
  --template-file infra/azure/main.bicep \
  --parameters infra/azure/parameters/dev.bicepparam
```
Attendu : `Resource changes: 13 to create, 1 unsupported.` — le `1 unsupported`
est une limite connue et bénigne du what-if (attribution de rôle Key Vault
dont l'ID dépend d'un `guid()` résolu à l'exécution), pas une erreur.

## 3. Le vrai déploiement — POINT DE NON-RETOUR FINANCIER

```bash
az deployment group create \
  --resource-group rg-schoolflow-dev \
  --template-file infra/azure/main.bicep \
  --parameters infra/azure/parameters/dev.bicepparam \
  --query "properties.outputs"
```

Ça prend plusieurs minutes (Postgres Flexible Server est la ressource la plus
lente à provisionner). Notez les 5 valeurs de sortie affichées à la fin
(`apiUrl`, `frontendUrl`, `keyVaultName`, `postgresServerFqdn`,
`redisHostName`) — elles servent à l'étape 4.

**À ce stade, les 3 Container Apps existent mais ne démarreront PAS
correctement** : Key Vault est vide, donc `secret-key`/`bootstrap-secret`/
`database-url`/etc. n'existent pas encore. C'est attendu — c'est l'étape 4 qui
les fait fonctionner.

## 4. Seeder les secrets dans le Key Vault créé

```bash
KV=kv-schoolflow-dev   # ou la valeur exacte de l'output keyVaultName

az keyvault secret set --vault-name $KV --name secret-key --value "$(openssl rand -hex 32)"
az keyvault secret set --vault-name $KV --name bootstrap-secret --value "$(openssl rand -hex 32)"

# <postgres-fqdn> = output postgresServerFqdn de l'étape 3 ; <mot-de-passe> = POSTGRES_ADMIN_PASSWORD_DEV de l'étape 2
az keyvault secret set --vault-name $KV --name database-url \
  --value "postgresql://schoolflow_admin:<mot-de-passe>@<postgres-fqdn>/schoolflow"
az keyvault secret set --vault-name $KV --name database-url-sync \
  --value "postgresql+psycopg://schoolflow_admin:<mot-de-passe>@<postgres-fqdn>/schoolflow"

# <redis-hostname> = output redisHostName ; la clé primaire n'est pas dans les outputs (marquée @secure()) :
az redis list-keys --name redis-schoolflow-dev --resource-group rg-schoolflow-dev --query primaryKey -o tsv
az keyvault secret set --vault-name $KV --name redis-url \
  --value "rediss://:<redis-primary-key>@<redis-hostname>:6380"

az keyvault secret set --vault-name $KV --name resend-api-key --value "<votre clé Resend>"
```

**Notez le mot de passe Postgres et les deux secrets générés quelque part de
sûr** (gestionnaire de secrets d'équipe) — ils ne sont stockés nulle part
d'autre que dans ce Key Vault.

## 5. Redémarrer les révisions pour prendre en compte les secrets

Les Container Apps résolvent les secrets Key Vault au démarrage du conteneur,
pas en continu — un restart est nécessaire après tout premier seeding ou toute
rotation :
```bash
az containerapp revision restart --name ca-schoolflow-api-dev --resource-group rg-schoolflow-dev
az containerapp revision restart --name ca-schoolflow-worker-dev --resource-group rg-schoolflow-dev
```

## 6. Vérifier que ça tourne réellement

```bash
# Santé de l'API (doit renvoyer 200, DB + Redis + RLS actifs)
curl -sS https://<apiUrl-de-l-etape-3>/health/ready

# Le frontend charge (200, pas une erreur nginx)
curl -sSI https://<frontendUrl-de-l-etape-3>/

# Logs si quelque chose ne démarre pas
az containerapp logs show --name ca-schoolflow-api-dev --resource-group rg-schoolflow-dev --follow
az containerapp logs show --name ca-schoolflow-worker-dev --resource-group rg-schoolflow-dev --follow
```

Si l'api ou le worker boucle en crash : la cause la plus probable est un
secret Key Vault mal nommé ou absent (revoir l'étape 4) — le message dans les
logs est explicite (`"SECRET_KEY not set or too short. Refusing to start."` ou
équivalent pour `BOOTSTRAP_SECRET`/`BACKEND_CORS_ORIGINS`, voir
`backend/app/core/config.py` et `backend/app/main.py`).

## 7. Créer le premier compte admin (bootstrap)

```bash
curl -sS -X POST https://<apiUrl>/api/v1/auth/bootstrap/ \
  -H "Content-Type: application/json" \
  -d "{\"bootstrap_key\": \"<la valeur exacte de bootstrap-secret dans Key Vault>\", \"new_password\": \"<un mot de passe fort>\"}"
```
Renvoie les identifiants du premier `SUPER_ADMIN`. Cet endpoint se refuse
ensuite tout seul dès qu'un `SUPER_ADMIN` existe (voir
`backend/app/api/v1/endpoints/core/auth.py`) — pas besoin de le désactiver
manuellement après usage.

## 8. Pour arrêter les frais (nettoyage complet)

Supprime tout ce que ce runbook a créé, d'un coup :
```bash
az group delete --name rg-schoolflow-dev --yes --no-wait
```
Irréversible — Postgres et Key Vault ont un soft-delete de quelques jours
côté Azure (récupérable via `az postgres flexible-server list-deleted` /
`az keyvault list-deleted` dans la fenêtre de rétention), mais ne pas compter
dessus comme sauvegarde.

## Notes pour REC et PROD

Même séquence, en remplaçant `dev` par `rec`/`prod` partout (resource group,
nom du Key Vault, `parameters/{rec,prod}.bicepparam`,
`POSTGRES_ADMIN_PASSWORD_{REC,PROD}`). `prod` a une HA Postgres activée et des
SKU plus gros (voir `parameters/prod.bicepparam`) — coût sensiblement plus
élevé, à chiffrer avant de lancer l'étape 3 pour cet environnement.
