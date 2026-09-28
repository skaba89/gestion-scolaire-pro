// Azure Cache for Redis — replaces the self-hosted `redis` container.
// Arq (app/core/jobs.py) and every other Redis-optional feature in this
// codebase already fail open if Redis is unreachable, so a managed cache
// outage degrades the app rather than taking it down — the same
// guarantee docker-compose's container gave, now without an
// self-managed instance to patch/restart.
//
// SECURITY (private networking pass): public network access disabled,
// reachable only via a Private Endpoint into modules/network.bicep's
// snet-private-endpoints subnet. The Basic/Standard SKU used here (no
// Premium tier) can't do direct VNet injection the way Postgres Flexible
// Server does above — Private Link is the only private-connectivity
// option at this tier, and it works fine for a Container Apps client
// reaching it from the same VNet.
param location string
param envName string
param skuName string = 'Basic'
param skuFamily string = 'C'
param skuCapacity int = 0

@description('Private Endpoint subnet (plain, no delegation) from modules/network.bicep.')
param privateEndpointSubnetId string
@description('The "privatelink.redis.cache.windows.net" private DNS zone from modules/network.bicep.')
param privateDnsZoneId string

resource redis 'Microsoft.Cache/redis@2023-08-01' = {
  name: 'redis-schoolflow-${envName}'
  location: location
  properties: {
    sku: {
      name: skuName
      family: skuFamily
      capacity: skuCapacity
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Disabled'
  }
}

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: 'pe-redis-schoolflow-${envName}'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'pe-redis-schoolflow-${envName}-connection'
        properties: {
          privateLinkServiceId: redis.id
          groupIds: [ 'redisCache' ]
        }
      }
    ]
  }
}

// Auto-creates the A record for the cache's hostname in the private DNS
// zone the moment the Private Endpoint's NIC gets its IP — without this,
// a client inside the VNet would still resolve the cache's public FQDN
// (now unreachable, since publicNetworkAccess is Disabled above) instead
// of the private IP.
resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-redis-cache-windows-net'
        properties: {
          privateDnsZoneId: privateDnsZoneId
        }
      }
    ]
  }
}

output hostName string = redis.properties.hostName
output sslPort int = redis.properties.sslPort
@secure()
output primaryKey string = redis.listKeys().primaryKey
