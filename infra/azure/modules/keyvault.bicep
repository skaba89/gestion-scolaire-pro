// Key Vault holds every secret Container Apps reference at runtime
// (DATABASE_URL, REDIS password, JWT signing key, RESEND_API_KEY, etc.)
// instead of them being set as plain Container App env vars — the gap the
// national-readiness audit flagged (no Key Vault in the target
// architecture). Container Apps pull secrets via managed identity, not a
// vault access key, so no vault credential is ever itself a secret to manage.
param location string
param envName string
param tenantId string

@description('Object IDs (Azure AD) of the managed identities that need get/list on secrets — the Container Apps\' user-assigned identity, and optionally a human/CI principal for initial seeding.')
param secretsReaderPrincipalIds array = []

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-schoolflow-${envName}'
  location: location
  properties: {
    tenantId: tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    // PROD only: consider purge protection once the vault holds real
    // production secrets — left off by default so a throwaway dev/rec
    // vault can be deleted cleanly during iteration.
    enablePurgeProtection: envName == 'prod' ? true : null
  }
}

// "Key Vault Secrets User" built-in role — read-only access to secret
// values, nothing else (no create/delete/manage). One assignment per
// principal passed in, e.g. each Container App's user-assigned identity.
var secretsUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

resource secretsReaderAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for principalId in secretsReaderPrincipalIds: {
  name: guid(keyVault.id, principalId, secretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: secretsUserRoleId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}]

output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
