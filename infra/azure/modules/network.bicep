// VNet + private DNS for PostgreSQL and Redis — closes the gap
// infra/azure/README.md flagged as "deliberately out of scope for this
// pass" (both were reachable only over their public endpoint, gated by
// Azure-service firewall rules, not real network isolation).
//
// PostgreSQL Flexible Server uses "VNet integration" (its own delegated
// subnet — the server's network interface lives directly in the VNet,
// no separate Private Endpoint resource, and no public endpoint exists
// at all once this is set). Redis (Basic/Standard SKU, no Premium-tier
// VNet injection) uses a Private Endpoint instead — Private Link is the
// only private-connectivity option below Premium.
//
// The Container Apps managed environment is VNet-integrated too (its own
// delegated subnet) so it can actually reach either privately-connected
// resource — nothing in this VNet is directly public to anything outside
// it once this module is used. External ingress on the api/frontend
// Container Apps is UNCHANGED (still publicly reachable — VNet
// integration for a Consumption Container Apps environment supports
// external ingress with a platform-managed public IP; this only changes
// how the environment reaches Postgres/Redis, not who can reach it).
param location string
param envName string

// Consumption Container Apps environments require a delegated subnet of
// at least /23 (Microsoft's documented minimum) — sized generously here
// since re-sizing a deployed subnet is disruptive.
param infraSubnetPrefix string = '10.20.0.0/23'
// PostgreSQL Flexible Server's own delegated subnet — no other resource
// can share it (the delegation is exclusive to
// Microsoft.DBforPostgreSQL/flexibleServers).
param postgresSubnetPrefix string = '10.20.2.0/24'
// Plain subnet for Private Endpoints (Redis today; the Storage Account
// added in a prior PR could get one here too in a future pass — not
// added now, to keep this change scoped to the Postgres/Redis gap this
// module exists to close).
param privateEndpointSubnetPrefix string = '10.20.3.0/24'

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: 'vnet-schoolflow-${envName}'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [ '10.20.0.0/16' ]
    }
    subnets: [
      {
        name: 'snet-infra'
        properties: {
          addressPrefix: infraSubnetPrefix
          delegations: [
            {
              name: 'container-apps-delegation'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: 'snet-postgres'
        properties: {
          addressPrefix: postgresSubnetPrefix
          delegations: [
            {
              name: 'postgres-delegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
      {
        name: 'snet-private-endpoints'
        properties: {
          addressPrefix: privateEndpointSubnetPrefix
          // Required for Private Endpoints to be placeable in this subnet.
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

// Azure DB for PostgreSQL Flexible Server's VNet-integration mode needs
// this exact zone name (Microsoft-mandated, not a free choice) linked to
// the VNet — the platform resolves the server's FQDN through it instead
// of a public DNS record.
resource postgresPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.postgres.database.azure.com'
  location: 'global'
}

resource postgresPrivateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: postgresPrivateDnsZone
  name: 'link-vnet-schoolflow-${envName}'
  location: 'global'
  properties: {
    virtualNetwork: {
      id: vnet.id
    }
    registrationEnabled: false
  }
}

// Same story for Redis's Private Endpoint — this zone name is also
// Microsoft-mandated for Azure Cache for Redis private link records.
resource redisPrivateDnsZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.redis.cache.windows.net'
  location: 'global'
}

resource redisPrivateDnsZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: redisPrivateDnsZone
  name: 'link-vnet-schoolflow-${envName}'
  location: 'global'
  properties: {
    virtualNetwork: {
      id: vnet.id
    }
    registrationEnabled: false
  }
}

// Built explicitly by name rather than indexing vnet.properties.subnets[n]
// — an index is silently wrong if the subnets array above is ever
// reordered; a name-based resourceId() cannot be.
output vnetId string = vnet.id
output infraSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, 'snet-infra')
output postgresSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, 'snet-postgres')
output privateEndpointSubnetId string = resourceId('Microsoft.Network/virtualNetworks/subnets', vnet.name, 'snet-private-endpoints')
output postgresPrivateDnsZoneId string = postgresPrivateDnsZone.id
output redisPrivateDnsZoneId string = redisPrivateDnsZone.id
