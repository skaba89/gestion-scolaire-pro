// Azure Cache for Redis — replaces the self-hosted `redis` container.
// Arq (app/core/jobs.py) and every other Redis-optional feature in this
// codebase already fail open if Redis is unreachable, so a managed cache
// outage degrades the app rather than taking it down — the same
// guarantee docker-compose's container gave, now without an
// self-managed instance to patch/restart.
param location string
param envName string
param skuName string = 'Basic'
param skuFamily string = 'C'
param skuCapacity int = 0

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
  }
}

output hostName string = redis.properties.hostName
output sslPort int = redis.properties.sslPort
@secure()
output primaryKey string = redis.listKeys().primaryKey
