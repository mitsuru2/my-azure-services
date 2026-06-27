#!/bin/bash
# .devcontainer/postCreate.sh
sudo mkdir -p /home/node/.azure
sudo chown -R node:node /home/node/.azure

sudo mkdir -p /home/node/.claude
sudo chown -R node:node /home/node/.claude

az account show

## gitのステータスを表示
git fetch --prune && git status
