using '../main.bicep'

param envName = 'rec'
param location = 'francecentral'
param acrLoginServer = 'academyguineenneacr.azurecr.io'

// postgresAdminPassword: pass at deploy time (see dev.bicepparam's comment).

param postgresSkuName = 'Standard_B1ms'
param postgresSkuTier = 'Burstable'
param postgresHighAvailability = false

param redisSkuName = 'Basic'
param redisSkuCapacity = 0

param apiMinReplicas = 1
param apiMaxReplicas = 3

// Never hardcode a real password here — pulled from the deploying
// shell's environment at build time.
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD_REC')
