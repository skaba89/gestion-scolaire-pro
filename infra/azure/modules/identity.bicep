// Single user-assigned managed identity shared by the 3 Container Apps
// (api, worker, frontend). Created before Key Vault/ACR role assignments
// so main.bicep can wire "grant this identity access" into those modules
// without a circular module dependency (Key Vault needs the identity's
// principalId to grant access; the Container Apps need the vault's URI
// to reference secrets — this module breaks that cycle by existing
// independently of both).
param location string
param envName string

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-schoolflow-${envName}'
  location: location
}

output id string = identity.id
output principalId string = identity.properties.principalId
