// Azure Database for PostgreSQL — Flexible Server. Replaces the
// self-hosted `postgres` container from docker-compose.yml for anything
// beyond local dev: managed backups/PITR, no single point of failure
// tied to the Container Apps host.
param location string
param envName string
param administratorLogin string
@secure()
param administratorPassword string
param skuName string = 'Standard_B1ms'
param skuTier string = 'Burstable'
param storageSizeGb int = 32
param highAvailability bool = false
param backupRetentionDays int = 7

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: 'psql-schoolflow-${envName}'
  location: location
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: '16'
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    storage: {
      storageSizeGB: storageSizeGb
    }
    backup: {
      backupRetentionDays: backupRetentionDays
      geoRedundantBackup: envName == 'prod' ? 'Enabled' : 'Disabled'
    }
    highAvailability: {
      mode: highAvailability ? 'ZoneRedundant' : 'Disabled'
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgres
  name: 'schoolflow'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Container Apps reach Postgres over the public endpoint via Azure
// service firewall rules rather than a private VNet integration — the
// same trade-off already made for this repo's Container Apps target (no
// VNet in scope yet). Tightening this to a private endpoint is a natural
// next step once the app is actually running in Azure, not before.
resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgres
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

output serverFqdn string = postgres.properties.fullyQualifiedDomainName
output databaseName string = database.name
