// Azure Blob Storage — durable document storage for Azure DEV/REC/PROD.
//
// Closes the gap this repo's own README called out ("not created here:
// ... a managed replacement for the minio object-storage container").
// A Container App's filesystem is ephemeral — per-replica, lost on
// restart/revision change/scale-out — so the local-disk fallback in
// app/core/storage.py (LocalStorageClient) is safe only for local dev and
// tests. This module is what app/core/storage.py::AzureBlobStorageClient
// talks to once AZURE_STORAGE_ACCOUNT_URL is set (see
// modules/container-apps.bicep and docs/STORAGE_ARCHITECTURE.md).
//
// Auth: Managed Identity + Azure RBAC only. No account key is ever
// generated, stored, or referenced by this template or the app — the
// Container Apps' shared user-assigned identity (modules/identity.bicep)
// is granted exactly two built-in roles, scoped to this storage account:
//   - Storage Blob Data Contributor — read/write/delete blob data.
//   - Storage Blob Delegator — mint short-lived user-delegation SAS URLs
//     (app/core/storage.py's get_presigned_url) without ever holding an
//     account key.
// Neither role grants account management (keys, firewall rules, SKU
// changes) — that stays under the deploying principal's own RBAC.
param location string
param envName string

@description('Principal ID of the shared user-assigned identity (modules/identity.bicep) — granted exactly the two roles above, nothing else.')
param identityPrincipalId string

@description('Storage account SKU — zone-redundant for prod (survives an AZ outage), locally-redundant elsewhere to keep dev/rec cost down.')
param skuName string = envName == 'prod' ? 'Standard_ZRS' : 'Standard_LRS'

@description('Blob container documents are written to — must match AZURE_STORAGE_CONTAINER on the api/worker Container Apps.')
param containerName string = 'schoolflow-documents'

@description('Soft-delete retention (days) for accidentally deleted/overwritten blobs — a safety net for the "overwrite accidentel" case called out in the storage security review, not a substitute for the application\'s own delete-confirmation UX.')
param blobSoftDeleteRetentionDays int = envName == 'prod' ? 30 : 7

// Storage account names must be globally unique, lowercase, 3-24 chars,
// no hyphens — unlike every other resource in this stack ('id-schoolflow-
// ${envName}', 'kv-schoolflow-${envName}', etc.). 'stschoolflow' + envName
// fits within 24 chars for all three envs (dev/rec/prod).
var storageAccountName = 'stschoolflow${envName}'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: skuName
  }
  kind: 'StorageV2'
  properties: {
    // SECURITY: HTTPS only, no anonymous blob access, TLS 1.2 minimum —
    // the three non-negotiables from the storage hardening brief.
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    // SECURITY: disable account-key (shared-key) auth entirely on this
    // real Azure resource — Managed Identity/Azure AD is the only way in.
    // app/core/storage.py's AZURE_STORAGE_CONNECTION_STRING path (which
    // needs a key) is for local dev against an Azurite emulator only and
    // is never pointed at a deployed environment's account, so this
    // costs nothing functionally and closes off key-based access entirely
    // — even a leaked key would be refused by the account itself.
    allowSharedKeyAccess: false
    // No private networking / VNet integration in this pass — matches
    // postgres.bicep and redis.bicep, both still on their public endpoint
    // with Azure-service firewall rules only (see infra/azure/README.md's
    // "deliberately out of scope for this pass"). Revisit alongside those
    // two together, not as a one-off here.
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    // Soft delete: an accidental overwrite (upload_file always overwrites
    // by object_name — see AzureBlobStorageClient.upload_file) or a
    // delete_file call keeps the prior blob version recoverable for the
    // retention window instead of losing it immediately.
    deleteRetentionPolicy: {
      enabled: true
      days: blobSoftDeleteRetentionDays
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: blobSoftDeleteRetentionDays
    }
  }
}

resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: containerName
  properties: {
    // SECURITY: never public — every read goes through a time-limited
    // user-delegation SAS URL (AzureBlobStorageClient.get_presigned_url)
    // or an authenticated backend call, matching the "ne pas rendre un
    // container public pour simplifier les téléchargements" requirement.
    publicAccess: 'None'
  }
}

var storageBlobDataContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var storageBlobDelegatorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'db58b8e5-c6ad-4a2a-8342-4190687cbf4a')

resource blobDataContributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, identityPrincipalId, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: storageBlobDataContributorRoleId
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource blobDelegatorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, identityPrincipalId, storageBlobDelegatorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: storageBlobDelegatorRoleId
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output storageAccountName string = storageAccount.name
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob
output containerName string = documentsContainer.name
