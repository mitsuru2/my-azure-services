# syntax=docker/dockerfile:1
# バージョン変更時はREADME.mdのバージョン表記も変更すること。
FROM node:24-trixie

# OSツールのインストール
RUN apt-get update && apt-get install -y \
    git \
    sudo \
    gnupg \
    iptables \
    ipset \
    dnsutils \
    jq \
    curl \
    ca-certificates \
    wget \
    libicu-dev \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI (gh).
# Official install instructions: https://github.com/cli/cli/blob/trunk/docs/install_linux.md
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Azure CLI のインストール
RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash

# Azure Functions Core Tools のインストール
# keyserver からの取得は不安定で、trusted.gpg.d に置くと全リポジトリに対して鍵が信頼されてしまうため、
# 公式の鍵ファイルを取得して signed-by でこのリポジトリに限定する。
# Debian 13 (trixie) のリポジトリは新しい鍵 (microsoft-2025.asc, EE4D7792F748182B) で署名されており、
# 旧鍵 (microsoft.asc) では署名検証に失敗するため注意。
RUN curl -fsSL https://packages.microsoft.com/keys/microsoft-2025.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && . /etc/os-release \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/${VERSION_ID}/prod ${VERSION_CODENAME} main" > /etc/apt/sources.list.d/microsoft-prod.list \
    && apt-get update && apt-get install -y azure-functions-core-tools-4 \
    && rm -rf /var/lib/apt/lists/*
  
# Bicep のインストール
RUN az bicep install

# Terraformのインストール
# https://developer.hashicorp.com/terraform/install
RUN wget -O - https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg \
    && . /etc/os-release \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com ${VERSION_CODENAME} main" > /etc/apt/sources.list.d/hashicorp.list \
    && apt-get update && apt-get install -y terraform \
    && rm -rf /var/lib/apt/lists/*

# Azuriteのインストール
RUN npm install -g azurite@3.35.0

# nodeユーザーをパスワード無しでsudoコマンド実行可能に設定
RUN echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node

# node ユーザーに切り替え
USER node

# デフォルト動作 (Do nothing)
CMD ["sleep", "infinity"]

