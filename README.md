# my-azure-services

## 概要

個人用のWeb APIのリポジトリ。用途を限定せず必要になったAPIをどんどん追加する予定。
Azure Functions (従量課金プラン) へのホストを想定しているため、長時間の処理は実装しないこと。

## 開発環境

以下の構成のDockerコンテナ環境。VS CodeのDevContainer拡張またはGitHub Codespacesでの利用を想定。

- **ベースイメージ**: 原則として最新LTS版を利用。OSはDebian。起動時間の問題があればslim版検討。Alpine版は開発用とでは互換性リスクがあるため除外。
  -  Node.js Official Image (Docker Hub): https://hub.docker.com/_/node
  -  Node.js Releases: https://nodejs.org/en/about/previous-releases
  -  Devian Releases: https://www.debian.org/releases/
- **OSツール**: APTまたは個別コマンドによりインストール。
  - git
  - sudo
  - jq
  - Azure CLI
  - Azure Functions Core Tools
  - Bicep
  - その他
- **その他設定変更**:
  - ユーザー`node`をパスワード無しでsudoコマンド実行可とするように`/etc/sodoers.d/node`に記載。
  - ワーキングディレクトリ: `/home/node/app`
  - ソースファイルのコピーはしない。Dev Containers拡張でマウントされるため。


