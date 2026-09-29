using '../main.bicep'

// One resource group per environment (rg-schoolflow-dev), never shared
// with rec/prod — see the deploy workflow's --resource-group argument.
param envName = 'dev'
param location = 'francecentral'

// Existing ACR (see .github/workflows/build-images.yml) — same registry
// across all 3 environments; only the digest each promotes differs.
param acrLoginServer = 'academyguineenneacr.azurecr.io'

// BUILD ONCE, PROMOTE MANY (docs/IMMUTABLE_RELEASES.md): required,
// no-default digest references. A .bicepparam file must assign every
// no-default parameter itself — Bicep validates this file's own
// completeness independently of any `--parameters key=value` the CLI
// might also pass, so a same-CLI-line override for these two (the
// pattern this template used before for the apiImageTag/workerImageTag/
// frontendImageTag it replaced) is not reliable; readEnvironmentVariable
// is the same mechanism already used below for postgresAdminPassword.
// The deploy workflow (.github/workflows/deploy-azure.yml) sets
// BACKEND_IMAGE/FRONTEND_IMAGE from the release manifest it resolves —
// never a literal value committed here.
param backendImage = readEnvironmentVariable('BACKEND_IMAGE')
param frontendImage = readEnvironmentVariable('FRONTEND_IMAGE')

param postgresSkuName = 'Standard_B1ms'
param postgresSkuTier = 'Burstable'
param postgresHighAvailability = false

param redisSkuName = 'Basic'
param redisSkuCapacity = 0

param apiMinReplicas = 1
param apiMaxReplicas = 2

// Never hardcode a real password here — pulled from the deploying
// shell's environment at build time. Set it locally (`export
// POSTGRES_ADMIN_PASSWORD=...`) or in the CI job's env before running
// `az deployment group create`.
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD_DEV')
