// Deploy to Azure template for Postbase.
// Provisions: Azure Container Registry (image built via ACR Tasks from GitHub),
// PostgreSQL Flexible Server, and a Container App running the built image.
@description('Shared secret for NEXTAUTH_SECRET / POSTBASE_JWT_SECRET. Generate with: openssl rand -base64 32')
@secure()
@minLength(16)
param authSecret string

@description('GitHub repo to build from.')
param githubRepoUrl string = 'https://github.com/harshalone/postbase.git'

@description('Branch to build.')
param githubBranch string = 'main'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Postgres administrator password (separate from authSecret so DB creds can rotate independently).')
@secure()
@minLength(12)
param dbAdminPassword string = newGuid()

param containerAppCpu string = '1.0'
param containerAppMemory string = '2Gi'
param postgresSkuName string = 'Standard_B1ms'
param postgresStorageGb int = 32

var namePrefix = 'postbase${uniqueString(resourceGroup().id)}'
var acrName = replace('${namePrefix}acr', '-', '')
var dbServerName = '${namePrefix}-db'
var dbName = 'postbase'
var dbAdminUser = 'postbase'
var containerAppEnvName = '${namePrefix}-env'
var containerAppName = '${namePrefix}-app'
var logAnalyticsName = '${namePrefix}-logs'

// ── Identity used by the deployment scripts to run `az acr task run` /
//    `az containerapp update` against resources in this resource group ──────
resource deployScriptIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-deployscript-id'
  location: location
}

resource deployScriptContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deployScriptIdentity.id, 'Contributor')
  scope: resourceGroup()
  properties: {
    principalId: deployScriptIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c') // Contributor
  }
}

// ── Container Registry ──────────────────────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

// ── ACR Task: build Dockerfile.railway from GitHub on deploy ──────────────
resource acrBuild 'Microsoft.ContainerRegistry/registries/tasks@2019-06-01-preview' = {
  parent: acr
  name: 'postbase-build'
  location: location
  properties: {
    status: 'Enabled'
    platform: { os: 'Linux', architecture: 'amd64' }
    step: {
      type: 'Docker'
      contextPath: githubRepoUrl
      contextAccessToken: ''
      branch: githubBranch
      dockerFilePath: 'Dockerfile.railway'
      imageNames: ['postbase:latest']
    }
  }
}

// Triggers the ACR task once via a deployment script, since Bicep can't invoke
// tasks directly — mirrors the CodeBuild "trigger + wait" pattern used in the
// AWS CloudFormation template.
resource triggerBuild 'Microsoft.Resources/deploymentScripts@2023-08-01' = {
  name: 'trigger-postbase-build'
  location: location
  kind: 'AzureCLI'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${deployScriptIdentity.id}': {} }
  }
  properties: {
    azCliVersion: '2.60.0'
    timeout: 'PT30M'
    retentionInterval: 'PT1H'
    scriptContent: 'az acr task run --registry ${acr.name} --name ${acrBuild.name} --resource-group ${resourceGroup().name}'
  }
  dependsOn: [acrBuild, deployScriptContributorRole]
}

// ── PostgreSQL Flexible Server ──────────────────────────────────────────────
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: dbServerName
  location: location
  sku: { name: postgresSkuName, tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: dbAdminUser
    administratorLoginPassword: dbAdminPassword
    storage: { storageSizeGB: postgresStorageGb }
    backup: { backupRetentionDays: 7 }
    network: { publicNetworkAccess: 'Enabled' }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgres
  name: dbName
}

resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgres
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ── Container Apps environment ──────────────────────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: { sku: { name: 'PerGB2018' } }
}

resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerAppEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

var databaseUrl = 'postgresql://${dbAdminUser}:${dbAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${dbName}?sslmode=require'

resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  dependsOn: [triggerBuild, postgresDb, allowAzureServices]
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
        { name: 'auth-secret', value: authSecret }
        { name: 'database-url', value: databaseUrl }
      ]
    }
    template: {
      containers: [
        {
          name: 'postbase'
          image: '${acr.properties.loginServer}/postbase:latest'
          resources: {
            cpu: json(containerAppCpu)
            memory: containerAppMemory
          }
          env: [
            { name: 'HOSTNAME', value: '0.0.0.0' }
            { name: 'PORT', value: '3000' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'NEXTAUTH_SECRET', secretRef: 'auth-secret' }
            { name: 'POSTBASE_JWT_SECRET', secretRef: 'auth-secret' }
          ]
          probes: [
            {
              type: 'Readiness'
              httpGet: { path: '/api/health', port: 3000 }
              periodSeconds: 10
              failureThreshold: 6
            }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// NEXTAUTH_URL needs the Container App's assigned FQDN, which only exists after
// the app resource is created — patched in as a second deployment script.
resource setNextAuthUrl 'Microsoft.Resources/deploymentScripts@2023-08-01' = {
  name: 'set-nextauth-url'
  location: location
  kind: 'AzureCLI'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${deployScriptIdentity.id}': {} }
  }
  properties: {
    azCliVersion: '2.60.0'
    timeout: 'PT10M'
    retentionInterval: 'PT1H'
    scriptContent: 'az containerapp update --name ${containerApp.name} --resource-group ${resourceGroup().name} --set-env-vars NEXTAUTH_URL=https://${containerApp.properties.configuration.ingress.fqdn}'
  }
  dependsOn: [containerApp, deployScriptContributorRole]
}

output serviceUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output acrLoginServer string = acr.properties.loginServer
