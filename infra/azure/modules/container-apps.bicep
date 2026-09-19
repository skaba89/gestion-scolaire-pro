// Container Apps Environment + the 3 apps this stack actually ships
// (api, worker, frontend — mirroring docker-compose.yml's services of
// the same names). Secrets are pulled straight from Key Vault via the
// apps' own user-assigned managed identity — never set as plain env var
// values in this template or in the Container App's own config.
param location string
param envName string
param logAnalyticsCustomerId string
@secure()
param logAnalyticsSharedKey string
param acrLoginServer string
param keyVaultUri string
param appInsightsConnectionString string

@description('Resource ID and principal ID of the shared user-assigned identity created by modules/identity.bicep — passed in rather than created here so Key Vault access can be granted to it before these apps exist (breaks a circular module dependency).')
param identityResourceId string
param identityPrincipalId string

@description('Image tags to deploy — set by the CI/CD workflow, defaults to "latest" for a first manual deploy.')
param apiImageTag string = 'latest'
param workerImageTag string = 'latest'
param frontendImageTag string = 'latest'

@description('Replica/scale settings — deliberately small for dev/rec, raised for prod via the environment-specific .bicepparam file, never hardcoded per-service here.')
param apiMinReplicas int = 1
param apiMaxReplicas int = 3
param workerMinReplicas int = 1
param workerMaxReplicas int = 1
param frontendMinReplicas int = 1
param frontendMaxReplicas int = 2

param apiCpu string = '0.5'
param apiMemory string = '1Gi'
param workerCpu string = '0.5'
param workerMemory string = '1Gi'
param frontendCpu string = '0.25'
param frontendMemory string = '0.5Gi'

var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: split(acrLoginServer, '.')[0]
}
resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, identityResourceId, acrPullRoleId)
  scope: acr
  properties: {
    roleDefinitionId: acrPullRoleId
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2023-11-02-preview' = {
  name: 'cae-schoolflow-${envName}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
  }
}

// Every secret an app needs is a Key Vault reference resolved at
// runtime by the app's managed identity — the vault access policy this
// relies on is granted in modules/keyvault.bicep by passing this
// identity's principalId into secretsReaderPrincipalIds.
var commonSecrets = [
  { name: 'database-url', keyVaultUrl: '${keyVaultUri}secrets/database-url', identity: identityResourceId }
  { name: 'database-url-sync', keyVaultUrl: '${keyVaultUri}secrets/database-url-sync', identity: identityResourceId }
  { name: 'redis-url', keyVaultUrl: '${keyVaultUri}secrets/redis-url', identity: identityResourceId }
  { name: 'jwt-secret-key', keyVaultUrl: '${keyVaultUri}secrets/jwt-secret-key', identity: identityResourceId }
  { name: 'resend-api-key', keyVaultUrl: '${keyVaultUri}secrets/resend-api-key', identity: identityResourceId }
]

resource apiApp 'Microsoft.App/containerApps@2023-11-02-preview' = {
  name: 'ca-schoolflow-api-${envName}'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityResourceId}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
      }
      registries: [
        {
          server: acrLoginServer
          identity: identityResourceId
        }
      ]
      secrets: commonSecrets
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${acrLoginServer}/schoolflow-api:${apiImageTag}'
          resources: {
            cpu: json(apiCpu)
            memory: apiMemory
          }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'DATABASE_URL_SYNC', secretRef: 'database-url-sync' }
            { name: 'REDIS_URL', secretRef: 'redis-url' }
            { name: 'JWT_SECRET_KEY', secretRef: 'jwt-secret-key' }
            { name: 'RESEND_API_KEY', secretRef: 'resend-api-key' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            { name: 'DEBUG', value: envName == 'prod' ? 'false' : 'true' }
          ]
        }
      ]
      scale: {
        minReplicas: apiMinReplicas
        maxReplicas: apiMaxReplicas
      }
    }
  }
  dependsOn: [
    acrPullAssignment
  ]
}

resource workerApp 'Microsoft.App/containerApps@2023-11-02-preview' = {
  name: 'ca-schoolflow-worker-${envName}'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityResourceId}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      // No ingress — the worker (arq app.workers.tasks.WorkerSettings)
      // consumes jobs from Redis, it never serves HTTP, matching
      // docker-compose.yml's `worker` service (also port-less).
      registries: [
        {
          server: acrLoginServer
          identity: identityResourceId
        }
      ]
      secrets: commonSecrets
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: '${acrLoginServer}/schoolflow-api:${workerImageTag}'
          command: [ 'python', '-m', 'arq', 'app.workers.tasks.WorkerSettings' ]
          resources: {
            cpu: json(workerCpu)
            memory: workerMemory
          }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'DATABASE_URL_SYNC', secretRef: 'database-url-sync' }
            { name: 'REDIS_URL', secretRef: 'redis-url' }
            { name: 'RESEND_API_KEY', secretRef: 'resend-api-key' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
          ]
        }
      ]
      scale: {
        minReplicas: workerMinReplicas
        maxReplicas: workerMaxReplicas
      }
    }
  }
  dependsOn: [
    acrPullAssignment
  ]
}

resource frontendApp 'Microsoft.App/containerApps@2023-11-02-preview' = {
  name: 'ca-schoolflow-frontend-${envName}'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityResourceId}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
      }
      registries: [
        {
          server: acrLoginServer
          identity: identityResourceId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: '${acrLoginServer}/schoolflow-frontend:${frontendImageTag}'
          resources: {
            cpu: json(frontendCpu)
            memory: frontendMemory
          }
          env: [
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
          ]
        }
      ]
      scale: {
        minReplicas: frontendMinReplicas
        maxReplicas: frontendMaxReplicas
      }
    }
  }
  dependsOn: [
    acrPullAssignment
  ]
}

output apiFqdn string = apiApp.properties.configuration.ingress.fqdn
output frontendFqdn string = frontendApp.properties.configuration.ingress.fqdn
