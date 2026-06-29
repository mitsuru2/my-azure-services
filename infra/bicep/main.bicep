@description('The base name for Azure resources used by Tech Portfolio project.')
param accountNameBase string = uniqueString(resourceGroup().id)

@description('Location for all resources.')
param location string = resourceGroup().location

@description('User object ID for the application. This should be a valid Azure AD user or service principal object ID.')
param appPrincipalId string

// @description('The object ID of the owner principal. This should be a valid Azure AD user or service principal object ID.')
// param ownerPrincipalId string


//------------------------------------------------------------------------------
// Storage Account for Function App
//------------------------------------------------------------------------------
resource storageAccount 'Microsoft.Storage/storageAccounts@2026-04-01' = {
  name: '${accountNameBase}storage'
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2026-04-01' = {
  parent: storageAccount
  name: 'default'
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2026-04-01' = {
  parent: blobService
  name: 'deployments'
  properties: {
    publicAccess: 'None'
  }
}

//------------------------------------------------------------------------------
// Azure Function Apps (Flex Consumption Plan)
//------------------------------------------------------------------------------
// Function App Plan
resource functionAppPlan 'Microsoft.Web/serverfarms@2025-03-01' = {
  name: '${accountNameBase}-functions-plan'
  location: location
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
    size: 'FC1'
    family: 'FC'
    capacity: 0
  }
  kind: 'functionapp'
  properties: {
    perSiteScaling: false
    elasticScaleEnabled: false
    maximumElasticWorkerCount: 1
    isSpot: false
    reserved: true
    isXenon: false
    hyperV: false
    targetWorkerCount: 0
    targetWorkerSizeId: 0
  }
}

// Function App
resource functionApp 'Microsoft.Web/sites@2025-03-01' = {
  name: '${accountNameBase}-functions'
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: functionAppPlan.id
    reserved: true
    httpsOnly: true
    clientAffinityEnabled: false
    clientCertEnabled: false
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      alwaysOn: false
      http20Enabled: false
      functionAppScaleLimit: 100
      minimumElasticInstanceCount: 0
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      cors: {
        allowedOrigins: [
          'https://portal.azure.com'
        ]
        supportCredentials: false
      }
      appSettings: [
        {
          // App Insights への接続文字列。
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: insights.properties.ConnectionString
        }
        {
          // App Insights への認証方式を AAD にするための設定。
          // AAD: Azure Active Directory. インストルメンテーションキーの代わりに、マネージド ID を使用して認証する方式。
          name: 'APPLICATIONINSIGHTS_AUTHENTICATION_STRING'
          value: 'Authorization=AAD'
        }
      ]
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageAccount.properties.primaryEndpoints.blob}deployments'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      runtime: {
        name: 'node'
        version: '24'
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 100
        instanceMemoryMB: 2048
      }
    }
  }
}

// FTP によるファイルのデプロイおよびアクセスを無効化
// CI/CD パイプラインでのデプロイは、Function App のマネージド ID を使用して Blob Storage にアクセスする方式を採用しており、FTP は不要。
// セキュリティ上のリスクとなるため。
resource ftpPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2025-03-01' = {
  parent: functionApp
  name: 'ftp'
  properties: {
    allow: false
  }
}

// SCM (Kudu) へのパスワードアクセスを無効化
// EntraID 認証を使用する場合、SCM へのパスワードアクセスは不要であり、セキュリティ上のリスクとなるため。
resource scmPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2025-03-01' = {
  parent: functionApp
  name: 'scm'
  properties: {
    allow: false
  }
}


//------------------------------------------------------------------------------
// App Insights
//------------------------------------------------------------------------------
// Log Analytics Workspace
resource workspace 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  name: '${accountNameBase}-workspace'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    features: {
      legacy: 0
      searchVersion: 1
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    workspaceCapping: {
      dailyQuotaGb: 1 // GB単位で数値を指定。無制限の場合はjson('-1')を指定。
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// App Insights
resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${accountNameBase}-insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    Flow_Type: 'Redfield'
    Request_Source: 'IbizaWebAppExtensionCreate'
    RetentionInDays: 90
    WorkspaceResourceId: workspace.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    DisableLocalAuth: true
  }
}



//------------------------------------------------------------------------------
// IAM Role Assignments for Function Apps
//------------------------------------------------------------------------------
// for GitHub App
var contributorRoleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'
resource functionAppRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(functionApp.id, appPrincipalId, contributorRoleId)
  scope: functionApp
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', contributorRoleId)
    principalId: appPrincipalId
    principalType: 'ServicePrincipal'
  }
}

//------------------------------------------------------------------------------
// IAM Role Assignments for Storage Account
//------------------------------------------------------------------------------
var storageBlobDataOwnerRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
// var storageQueueDataContributorRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
// var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'

// for GitHub App
resource storageBlobRoleAssignmentForGitHub 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, appPrincipalId, storageBlobDataOwnerRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwnerRoleId)
    principalId: appPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// for Function App
resource storageBlobRoleAssignmentForFunctionApp 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, functionApp.id, storageBlobDataOwnerRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwnerRoleId)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

//------------------------------------------------------------------------------
// IAM Role Assignments for App Insights
//------------------------------------------------------------------------------
var metricsPublisherRoleId = '3913510d-42f4-4e42-8a64-420c390055eb'

// for Function App
resource insightsMetricsPublisherRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(insights.id, functionApp.id, metricsPublisherRoleId)
  scope: insights
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', metricsPublisherRoleId)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}
