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

// api and frontend each need the other's public URL (api for CORS,
// frontend to reach the backend — see their env blocks below). Referencing
// `apiApp.properties.configuration.ingress.fqdn` from frontendApp AND
// `frontendApp...fqdn` from apiApp would be a circular resource
// dependency, which ARM rejects outright. A Container App's ingress FQDN
// is deterministic (app name + its environment's default domain, itself
// known as soon as containerAppsEnv exists — before either app is
// deployed), so both are computed here from that instead, breaking the
// cycle without needing a two-pass deployment.
var apiAppName = 'ca-schoolflow-api-${envName}'
var frontendAppName = 'ca-schoolflow-frontend-${envName}'
var apiFqdn = '${apiAppName}.${containerAppsEnv.properties.defaultDomain}'
var frontendFqdn = '${frontendAppName}.${containerAppsEnv.properties.defaultDomain}'

// Every secret an app needs is a Key Vault reference resolved at
// runtime by the app's managed identity — the vault access policy this
// relies on is granted in modules/keyvault.bicep by passing this
// identity's principalId into secretsReaderPrincipalIds.
var commonSecrets = [
  { name: 'database-url', keyVaultUrl: '${keyVaultUri}secrets/database-url', identity: identityResourceId }
  { name: 'database-url-sync', keyVaultUrl: '${keyVaultUri}secrets/database-url-sync', identity: identityResourceId }
  { name: 'redis-url', keyVaultUrl: '${keyVaultUri}secrets/redis-url', identity: identityResourceId }
  { name: 'secret-key', keyVaultUrl: '${keyVaultUri}secrets/secret-key', identity: identityResourceId }
  { name: 'bootstrap-secret', keyVaultUrl: '${keyVaultUri}secrets/bootstrap-secret', identity: identityResourceId }
  { name: 'resend-api-key', keyVaultUrl: '${keyVaultUri}secrets/resend-api-key', identity: identityResourceId }
]

// api/worker both import app.core.config at process startup, which
// os._exit(1)s immediately if SECRET_KEY (or BOOTSTRAP_SECRET, in a
// non-DEBUG process) is missing or too short — confirmed by actually
// running `python3 -c "import app.core.config"` with the env this
// template used to set (no DEBUG, no SECRET_KEY) before this fix: it
// printed "SECRET_KEY not set or too short. Refusing to start." and
// exited. Both containers need DEBUG, SECRET_KEY and BOOTSTRAP_SECRET
// wired for exactly this reason (worker previously had none of the
// three — it would have crash-looped in every environment, not just prod).
var debugEnvValue = envName == 'prod' ? 'false' : 'true'
// Sets the ENVIRONMENT var config.py's SECRET_KEY validator also checks
// (`env in ("production","prod","staging")` forces the strict branch even
// if DEBUG were ever misconfigured back to 'true' for rec/prod) — defense
// in depth alongside DEBUG, not a replacement for it.
var environmentEnvValue = envName == 'prod' ? 'production' : (envName == 'rec' ? 'staging' : 'development')

resource apiApp 'Microsoft.App/containerApps@2023-11-02-preview' = {
  name: apiAppName
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
            // Was 'JWT_SECRET_KEY' — a name app/core/config.py never reads
            // (it reads SECRET_KEY). Confirmed: SECRET_KEY would have been
            // empty at runtime, either crash-looping the container (prod:
            // DEBUG=false) or silently regenerating a random key on every
            // restart (dev/rec: DEBUG=true), invalidating every issued JWT
            // on each scale event or redeploy.
            { name: 'SECRET_KEY', secretRef: 'secret-key' }
            { name: 'BOOTSTRAP_SECRET', secretRef: 'bootstrap-secret' }
            { name: 'RESEND_API_KEY', secretRef: 'resend-api-key' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            { name: 'DEBUG', value: debugEnvValue }
            { name: 'ENVIRONMENT', value: environmentEnvValue }
            // main.py:430 — os._exit(1)s in prod (DEBUG=false) if this is
            // empty; falls back to a hardcoded localhost list otherwise,
            // which would silently CORS-block every request from the real
            // deployed frontend in dev/rec too. Points at the frontend
            // Container App's own FQDN, computed above from the shared
            // environment's default domain (not a direct reference to the
            // frontendApp resource — that would make this resource depend
            // on frontendApp, which depends back on apiApp for
            // SCHOOLFLOW_API_URL below: a circular dependency ARM rejects).
            { name: 'BACKEND_CORS_ORIGINS', value: 'https://${frontendFqdn}' }
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
            // The worker imports app.core.config on startup too (arq
            // WorkerSettings pulls in the same app package as the API) —
            // without DEBUG/SECRET_KEY it hit the exact same fatal
            // "SECRET_KEY not set or too short. Refusing to start." exit,
            // in every environment (DEBUG defaults to unset/false when
            // absent, which is the strict, non-DEBUG validation branch —
            // confirmed by reproducing it locally with the worker's
            // previous env). BOOTSTRAP_SECRET is unused by the worker
            // itself but the same config module also os._exit(1)s on it
            // when empty and DEBUG is false, so it needs it too.
            { name: 'SECRET_KEY', secretRef: 'secret-key' }
            { name: 'BOOTSTRAP_SECRET', secretRef: 'bootstrap-secret' }
            { name: 'RESEND_API_KEY', secretRef: 'resend-api-key' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            { name: 'DEBUG', value: debugEnvValue }
            { name: 'ENVIRONMENT', value: environmentEnvValue }
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
  name: frontendAppName
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
            // docker/nginx.conf's /api/ and /api-proxy/ locations both
            // proxy_pass to the literal hostname "api" — a Docker Compose
            // service name that does not resolve inside a Container Apps
            // environment. docker-entrypoint.sh writes this into
            // dist/config.js as window.__SCHOOLFLOW_CONFIG__.API_URL at
            // container start (no rebuild needed), which src/api/client.ts
            // reads BEFORE the build-time '/api' default that would
            // otherwise route through the broken nginx proxy — so this is
            // the only way this image can reach the backend once deployed
            // here. Points straight at the api Container App's own public
            // FQDN, bypassing nginx's proxy entirely.
            { name: 'SCHOOLFLOW_API_URL', value: 'https://${apiFqdn}' }
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
