# syntax=docker/dockerfile:1
FROM node:26-trixie

# OSツールのインストール
RUN apt-get update && apt-get install -y \
    git \
    sudo \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Azure CLI のインストール
RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash

# Azure Functions Core Tools のインストール
RUN gpg --keyserver keyserver.ubuntu.com --recv-keys EE4D7792F748182B \
    && gpg --export EE4D7792F748182B > /etc/apt/trusted.gpg.d/microsoft.gpg \
    && . /etc/os-release \
    && echo "deb [arch=amd64] https://packages.microsoft.com/debian/${VERSION_ID}/prod ${VERSION_CODENAME} main" > /etc/apt/sources.list.d/dotnetdev.list \
    && apt-get update && apt-get install -y azure-functions-core-tools-4
  
# Bicep のインストール
RUN az bicep install

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

