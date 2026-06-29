terraform {
  required_providers {
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "rg-terraform-state"
    storage_account_name = "64xyt6uu3typ6storage"
    container_name       = "tfstate-my-azure-services"
    key                  = "terraform.tfstate"
  }
}

provider "azuread" {}

data "azuread_client_config" "current" {}

variable "app_name" {
  type        = string
  description = "The display name of the Azure AD application"
}

variable "github_org" {
  type        = string
  description = "The GitHub organization or user name"
}

variable "github_repo" {
  type        = string
  description = "The GitHub repository name"
}

# アプリケーション登録
resource "azuread_application" "app" {
  display_name = var.app_name
  owners       = [data.azuread_client_config.current.object_id]
}

# サービスプリンシパル
resource "azuread_service_principal" "sp" {
  client_id = azuread_application.app.client_id
  owners    = [data.azuread_client_config.current.object_id]
}

# OIDCフェデレーション資格情報
resource "azuread_application_federated_identity_credential" "oidc_main" {
  application_id = azuread_application.app.id
  display_name   = "github-oidc-main"
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/main"
  audiences      = ["api://AzureADTokenExchange"]
}

# アウトプット
output "client_id" {
  value = azuread_application.app.client_id
}

output "principal_id" {
  value = azuread_service_principal.sp.object_id
}
