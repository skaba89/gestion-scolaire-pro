using '../main.bicep'

param envName = 'prod'
param location = 'francecentral'
param acrLoginServer = 'academyguineenneacr.azurecr.io'

// postgresAdminPassword: pass at deploy time (see dev.bicepparam's comment)
// — for prod specifically, this MUST come from a secret store (GitHub
// Environment secret, Key Vault reference in the pipeline, etc.), never
// from a value typed into a terminal that ends up in shell history.

param postgresSkuName = 'Standard_D2ds_v4'
param postgresSkuTier = 'GeneralPurpose'
param postgresHighAvailability = true

param redisSkuName = 'Standard'
param redisSkuCapacity = 1

param apiMinReplicas = 2
param apiMaxReplicas = 10

// Never hardcode a real password here — pulled from the deploying
// shell's environment at build time, sourced from a secret store for prod.
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD_PROD')
