// Azure Database for PostgreSQL — Flexible Server. Replaces the
// self-hosted `postgres` container from docker-compose.yml for anything
// beyond local dev: managed backups/PITR, no single point of failure
// tied to the Container Apps host.
//
// SECURITY (private networking pass): VNet-integrated (delegated subnet
// — Flexible Server's own network interface lives directly in the VNet,
// see modules/network.bicep) instead of the public endpoint + "allow all
// Azure services" firewall rule this used before. A VNet-integrated
// server has NO public endpoint at all — only the Container Apps
// environment (itself VNet-integrated onto the same VNet) can reach it.
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

@description('Delegated subnet (Microsoft.DBforPostgreSQL/flexibleServers) from modules/network.bicep.')
param delegatedSubnetId string
@description('The "privatelink.postgres.database.azure.com" private DNS zone from modules/network.bicep — required by Flexible Server VNet integration for name resolution.')
param privateDnsZoneId string

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
    network: {
      delegatedSubnetResourceId: delegatedSubnetId
      privateDnsZoneArmResourceId: privateDnsZoneId
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

// No firewall rule here anymore — a VNet-integrated Flexible Server has
// no public endpoint to put one on. The old "AllowAllAzureServices"
// (0.0.0.0-0.0.0.0, Azure's special "any Azure service, any tenant" rule)
// is gone entirely, not just tightened, since this connectivity mode
// doesn't have IP-based firewall rules at all.

output serverFqdn string = postgres.properties.fullyQualifiedDomainName
output databaseName string = database.name
