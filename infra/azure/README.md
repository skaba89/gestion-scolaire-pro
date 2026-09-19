# Azure infrastructure (Container Apps, Key Vault, Application Insights)

national-readiness audit, 2026-09: this closes the gap between
`docs/DEPLOIEMENT_PRODUCTION.md`'s target architecture and what actually
existed — a manual `docker build && push` to ACR
(`.github/workflows/build-push-acr.yml`) with nothing deploying it. This
directory is real, Bicep-compiled infrastructure-as-code. **Nothing here
has been deployed or applied.** Every resource it describes is created
only when a human explicitly runs `az deployment group create` or
triggers `.github/workflows/deploy-azure.yml` — never automatically, and
never on a plain `git push`.

## What this creates, per environment

One resource group (`rg-schoolflow-dev` / `-rec` / `-prod`), each with:

- **Container Apps Environment** + 3 Container Apps (`api`, `worker`,
  `frontend`) — mirrors `docker-compose.yml`'s services of the same name.
  `worker` runs `python -m arq app.workers.tasks.WorkerSettings`, same
  entrypoint as the Docker Compose `worker` service, no ingress.
- **Key Vault** — every secret (`DATABASE_URL`, `REDIS_URL`,
  `JWT_SECRET_KEY`, `RESEND_API_KEY`) is a Key Vault reference the
  Container Apps resolve via their own user-assigned managed identity.
  No secret is ever a plain Container App environment variable or a
  value in this repo.
- **Log Analytics workspace + Application Insights** — one per
  environment, wired into the Container Apps Environment's own platform
  logs as well as `APPLICATIONINSIGHTS_CONNECTION_STRING` on each app.
- **Azure Database for PostgreSQL (Flexible Server)** and **Azure Cache
  for Redis** — managed replacements for the `postgres`/`redis`
  containers in `docker-compose.yml`. Sizing (SKU, HA) differs per
  environment — see `parameters/*.bicepparam`.

Not created here (deliberately out of scope for this pass): a VNet /
private endpoints for Postgres and Redis (currently reachable over their
public endpoint with Azure-service firewall rules only — see
`modules/postgres.bicep`'s comment), a managed replacement for the
`minio` object-storage container, and the Azure Container Registry
itself (`academyguineenneacr.azurecr.io` already exists and is reused,
not recreated).

## One-time setup before this can ever run for real

1. **Federated OIDC credential** on an Azure AD App Registration, scoped
   to this repo (`skaba89/gestion-scolaire-pro`) and to
   `.github/workflows/deploy-azure.yml` — no client secret is stored
   anywhere; `azure/login@v2` in the workflow authenticates via GitHub's
   OIDC token. See
   https://learn.microsoft.com/azure/developer/github/connect-from-azure-openid-connect
2. Grant that App Registration's service principal `Contributor` (or a
   narrower custom role) on the target subscription or resource group.
3. For **each** of the 3 GitHub Environments (`dev`, `rec`, `prod` —
   create them under Settings → Environments):
   - Add required reviewers (at minimum for `prod`; recommended for all
     three) — this is what makes `workflow_dispatch` actually gate on a
     human, not just require someone to click "Run workflow".
   - Add secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
     `AZURE_SUBSCRIPTION_ID`, `POSTGRES_ADMIN_PASSWORD` (a strong,
     generated value — this becomes the Flexible Server admin password
     for that environment only).
4. **After** the first successful deploy to an environment, seed its Key
   Vault with the actual secret values the apps need (this template
   creates the vault, but deliberately does not — and should not — set
   secret values itself, since that would mean committing them to a
   `.bicepparam` file):
   ```bash
   az keyvault secret set --vault-name kv-schoolflow-dev --name database-url \
     --value "postgresql://schoolflow_admin:<password>@<postgres-fqdn>/schoolflow"
   az keyvault secret set --vault-name kv-schoolflow-dev --name database-url-sync \
     --value "postgresql+psycopg://schoolflow_admin:<password>@<postgres-fqdn>/schoolflow"
   az keyvault secret set --vault-name kv-schoolflow-dev --name redis-url \
     --value "rediss://:<redis-primary-key>@<redis-hostname>:6380"
   az keyvault secret set --vault-name kv-schoolflow-dev --name jwt-secret-key --value "<generate a real random secret>"
   az keyvault secret set --vault-name kv-schoolflow-dev --name resend-api-key --value "<your Resend API key>"
   ```
   Then restart the Container Apps revision so it picks up the new
   secret values (`az containerapp revision restart`).

## Deploying

Preferred: trigger **Deploy to Azure (Container Apps)** from the Actions
tab, choose an environment and image tag. It runs `az deployment group
what-if` first (shown in the job log, no changes applied), then the real
`az deployment group create` — gated by the GitHub Environment's required
reviewers from step 3 above.

Manual (from a machine already `az login`-ed to the right subscription):

```bash
export POSTGRES_ADMIN_PASSWORD_DEV="<a strong password>"
az deployment group create \
  --resource-group rg-schoolflow-dev \
  --template-file infra/azure/main.bicep \
  --parameters infra/azure/parameters/dev.bicepparam
```

## Cost

None of this is free. A `dev` environment at the SKUs in
`parameters/dev.bicepparam` (Postgres `Standard_B1ms` Burstable, Redis
`Basic C0`, Container Apps at 1 replica each) is the cheapest
configuration this template supports and still incurs real, ongoing
Azure charges the moment it's deployed — estimate with the
[Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/)
for your target region before running this against a real subscription.
`prod`'s parameters (zone-redundant HA Postgres, `Standard` tier Redis,
2–10 API replicas) cost substantially more. Nothing in this repository
deploys any of this automatically — that decision, and its cost, is
always a human's to make explicitly.
