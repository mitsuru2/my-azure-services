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
RUN curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > /usr/share/keyrings/microsoft-archive-keyring.gpg && \
    echo "deb [arch=amd64,arm64,armhf signed-by=/usr/share/keyrings/microsoft-archive-keyring.gpg] https://packages.microsoft.com/repos/azure-cli/ $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/azure-cli.list && \
    apt-get update && \
    apt-get install -y azure-functions-core-tools-4

# Bicep のインストール
RUN az bicep install

# nodeユーザーをパスワード無しでsudoコマンド実行可能に設定
RUN echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/node && \
    chmod 0440 /etc/sudoers.d/node

# ワーキングディレクトリの設定
WORKDIR /home/node/app

# node ユーザーに所有権を変更
RUN chown -R node:node /home/node/app

USER node
