# my-azure-services

## 概要

個人用のWeb APIのリポジトリ。用途を限定せず必要になったAPIをどんどん追加する予定。
Azure Functions (従量課金プラン) へのホストを想定しているため、長時間の処理は実装しないこと。

## 開発環境

以下の構成のDockerコンテナ環境。VS CodeのDevContainer拡張またはGitHub Codespacesでの利用を想定。

- **ベースイメージ**: Azure Function AppsのランタイムでサポートされているNode.jsの最新バージョンに合わせる。OSはDebian。起動時間の問題があればslim版検討。Alpine版は互換性リスクがあるため除外。
  - 現在: `node:24-trixie` (Node.js 24 + Debian Trixie)
  - Node.js Official Image (Docker Hub): https://hub.docker.com/_/node
  - Node.js Releases: https://nodejs.org/en/about/previous-releases
  - Debian Releases: https://www.debian.org/releases/
- **OSツール**: APTまたは個別コマンドによりインストール。
  - git
  - sudo
  - jq
  - curl / wget / ca-certificates
  - libicu-dev (Azure Functions Core Tools の依存関係)
  - Azure CLI
  - Azure Functions Core Tools v4
  - Bicep
  - Terraform
  - GitHub CLI
- **VS Code拡張機能** (devcontainer.json で自動インストール):
  - `esbenp.prettier-vscode` (コードフォーマット)
  - `anthropic.claude-code` (AI支援)
  - `ms-azuretools.vscode-azurefunctions` (Azure Functions)
  - `ms-azuretools.vscode-bicep` (Bicep)
  - VS Code設定: `editor.formatOnSave: true`
- **その他設定変更**:
  - ユーザー`node`をパスワード無しでsudoコマンド実行可とするように`/etc/sudoers.d/node`に記載。
  - ソースファイルのコピーはしない。Dev Containers拡張でマウントされるため。

## Azureリソース管理

IaCによりAzureリソースを管理する。TerraformとBicepを併用しており、それぞれ管理対象が異なる。

- **Terraform**: Azure AD (Entra ID) のリソース管理。ARM管理外のリソースを扱うため。
- **Bicep**: Azureリソース (ARM) の管理。

Terraformのstateファイルはリモートバックエンド (Azure Blob Storage) で管理。
- リソースグループ: `rg-terraform-state`
- ストレージアカウント: `64xyt6uu3typ6storage`
- コンテナ: `tfstate-my-azure-services`

### リソース一覧

#### deploy.sh管理

- **リソースグループ**: `rg-azure-services`

#### Terraform管理 (`infra/terraform/main.tf`)

| リソース | 説明 |
|---|---|
| Azure AD アプリ登録 | `github-mitsuru2-my-azure-services` |
| サービスプリンシパル | 上記アプリに紐づく |
| OIDCフェデレーション資格情報 | GitHub Actions (mainブランチ) からキーレス認証するための資格情報 |

#### Bicep管理 (`infra/bicep/main.bicep`)

リソース名は `uniqueString(resourceGroup().id)` を元にしたプレフィックスで自動生成。

| リソース | 種別 / SKU | 説明 |
|---|---|---|
| ストレージアカウント | Standard LRS / StorageV2 | Function App のデプロイパッケージ格納用。Blobパブリックアクセス無効、TLS 1.2以上。 |
| Blob コンテナ | - | `deployments` コンテナ。デプロイパッケージの格納先。 |
| Function App プラン | Flex Consumption (FC1) | Linux用のサーバーレスプラン。 |
| Function App | Linux / Node.js 24 | Flex Consumptionプラン上で動作。マネージドIDを使用。HTTPSのみ、TLS 1.2以上。FTP・SCMパスワード認証は無効。 |
| Log Analytics ワークスペース | PerGB2018 | App Insightsのログ格納先。日次上限 1 GB。 |
| Application Insights | web | Function Appの監視。ローカル認証無効 (AAD認証のみ)。保持期間 90日。 |

#### IAMロール割り当て (Bicep管理)

| 対象リソース | プリンシパル | ロール | 用途 |
|---|---|---|---|
| Function App | GitHub Actions SP | Contributor | GitHub Actionsからのデプロイ |
| ストレージアカウント | GitHub Actions SP | Storage Blob Data Owner | デプロイパッケージのアップロード |
| ストレージアカウント | Function App (マネージドID) | Storage Blob Data Owner | デプロイパッケージの読み取り |
| Application Insights | Function App (マネージドID) | Monitoring Metrics Publisher | AAD認証によるメトリクス送信 |

### デプロイ実行方法

```bash
bash infra/deploy.sh
```
