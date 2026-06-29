# syntax=docker/dockerfile:1
FROM node:26-trixie

# OSツールのインストール
RUN apt-get update && apt-get install -y \
    git \
    sudo \
    jq \
    curl \
    ca-certificates \
    wget \
    libicu-dev \
    && rm -rf /var/lib/apt/lists/*

# Azure CLI のインストール
RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash

# Azure Functions Core Tools のインストール
RUN gpg --keyserver keyserver.ubuntu.com --recv-keys EE4D7792F748182B \
    && gpg --export EE4D7792F748182B > /etc/apt/trusted.gpg.d/microsoft.gpg \
    && . /etc/os-release \
    && echo "deb [arch=$(dpkg --print-architecture)] https://packages.microsoft.com/debian/${VERSION_ID}/prod ${VERSION_CODENAME} main" > /etc/apt/sources.list.d/dotnetdev.list \
    && apt-get update && apt-get install -y azure-functions-core-tools-4 \
    && rm -rf /var/lib/apt/lists/*
  
# Bicep のインストール
RUN az bicep install

# Terraformのインストール
# https://developer.hashicorp.com/terraform/install
RUN wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list \
    && apt-get update && apt-get install -y terraform \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI のインストール
RUN (type -p wget >/dev/null || (sudo apt update && sudo apt install wget -y)) \
	&& sudo mkdir -p -m 755 /etc/apt/keyrings \
	&& out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg \
	&& cat $out | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
	&& sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
	&& sudo mkdir -p -m 755 /etc/apt/sources.list.d \
	&& echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
	&& sudo apt update \
	&& sudo apt install gh -y

# nodeユーザーをパスワード無しでsudoコマンド実行可能に設定
RUN echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node

# ワーキングディレクトリの設定
WORKDIR /home/node/app

# node ユーザーに所有権を変更
RUN chown -R node:node /home/node/app

# node ユーザーに切り替え
USER node

# デフォルト動作 (Do nothing)
CMD ["sleep", "infinity"]

