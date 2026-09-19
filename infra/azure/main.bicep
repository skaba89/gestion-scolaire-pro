// Academy Guinéenne / gestion-scolaire-pro — Azure deployment target.
//
// national-readiness audit, 2026-09: the CI/CD gap this closes is "no
// Container Apps, no Key Vault, no Application Insights, no separate
// DEV/REC/PROD environments" — the current pipeline (build-push-acr.yml)
// only builds and pushes an image; nothing here has ever been deployed.
// This file is infrastructure-as-code, reviewed and versioned like any
// other change, but NOT applied by any automated workflow in this repo —
// see .github/workflows/deploy-azure.yml, which is workflow_dispatch-only
// and requires an approved GitHub Environment before it can run `az
// deployment group create` against real Azure credentials.
//
// Usage (manual, from a machine with `az` logged in to the target
// subscription):
//   az deployment group create \
//     --resource-group rg-schoolflow-dev \
//     --template-file infra/azure/main.bicep \
//     --parameters infra/azure/parameters/dev.bicepparam
//
// Secrets referenced by the Container Apps (database-url, redis-url,
// jwt-secret-key, resend-api-key) are NOT set by this template — seed
// them into the created Key Vault once, out of band, the same way any
// other production credential is handled:
//   az keyvault secret set --vault-name kv-schoolflow-dev --name database-url --value "postgresql://..."
targetScope = 'resourceGroup'

@description('Environment name — drives resource naming and sizing (see parameters/*.bicepparam). One resource group per environment, never shared.')
@allowed(['dev', 'rec', 'prod'])
param envName string

param location string = resourceGroup().location

@description('Login server of the existing Azure Container Registry (already provisioned — see docs/DEPLOIEMENT_PRODUCTION.md). This template does not create the registry, only grants the Container Apps identity pull access to it.')
param acrLoginServer string

@secure()
@description('PostgreSQL Flexible Server administrator password. Pass via --parameters administratorPassword=$POSTGRES_ADMIN_PASSWORD at deploy time — never commit a real value in a .bicepparam file.')
param postgresAdminPassword string

param postgresAdminLogin string = 'schoolflow_admin'

param postgresSkuName string = envName == 'prod' ? 'Standard_D2ds_v4' : 'Standard_B1ms'
param postgresSkuTier string = envName == 'prod' ? 'GeneralPurpose' : 'Burstable'
param postgresHighAvailability bool = envName == 'prod'

param redisSkuName string = envName == 'prod' ? 'Standard' : 'Basic'
param redisSkuCapacity int = envName == 'prod' ? 1 : 0

param apiImageTag string = 'latest'
param workerImageTag string = 'latest'
param frontendImageTag string = 'latest'

param apiMinReplicas int = envName == 'prod' ? 2 : 1
param apiMaxReplicas int = envName == 'prod' ? 10 : 3

module identity 'modules/identity.bicep' = {
  name: 'identity-${envName}'
  params: {
    location: location
    envName: envName
  }
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring-${envName}'
  params: {
    location: location
    envName: envName
  }
}

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyvault-${envName}'
  params: {
    location: location
    envName: envName
    tenantId: subscription().tenantId
    secretsReaderPrincipalIds: [
      identity.outputs.principalId
    ]
  }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres-${envName}'
  params: {
    location: location
    envName: envName
    administratorLogin: postgresAdminLogin
    administratorPassword: postgresAdminPassword
    skuName: postgresSkuName
    skuTier: postgresSkuTier
    highAvailability: postgresHighAvailability
  }
}

module redis 'modules/redis.bicep' = {
  name: 'redis-${envName}'
  params: {
    location: location
    envName: envName
    skuName: redisSkuName
    skuCapacity: redisSkuCapacity
  }
}

module containerApps 'modules/container-apps.bicep' = {
  name: 'container-apps-${envName}'
  params: {
    location: location
    envName: envName
    identityResourceId: identity.outputs.id
    identityPrincipalId: identity.outputs.principalId
    logAnalyticsCustomerId: monitoring.outputs.logAnalyticsCustomerId
    logAnalyticsSharedKey: monitoring.outputs.logAnalyticsSharedKey
    acrLoginServer: acrLoginServer
    keyVaultUri: keyVault.outputs.keyVaultUri
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    apiImageTag: apiImageTag
    workerImageTag: workerImageTag
    frontendImageTag: frontendImageTag
    apiMinReplicas: apiMinReplicas
    apiMaxReplicas: apiMaxReplicas
  }
}

output apiUrl string = 'https://${containerApps.outputs.apiFqdn}'
output frontendUrl string = 'https://${containerApps.outputs.frontendFqdn}'
output keyVaultName string = keyVault.outputs.keyVaultName
output postgresServerFqdn string = postgres.outputs.serverFqdn
output redisHostName string = redis.outputs.hostName
