using '../main.bicep'

// One resource group per environment (rg-schoolflow-dev), never shared
// with rec/prod — see the deploy workflow's --resource-group argument.
param envName = 'dev'
param location = 'francecentral'

// Existing ACR (see build-push-acr.yml) — same registry across all 3
// environments, only the deployed image *tag* differs per environment.
param acrLoginServer = 'academyguineenneacr.azurecr.io'

// postgresAdminPassword is intentionally NOT set here — pass it at
// deploy time: az deployment group create ... --parameters postgresAdminPassword=$POSTGRES_ADMIN_PASSWORD_DEV

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
