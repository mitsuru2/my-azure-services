#!/bin/bash
# .devcontainer/postCreate.sh
sudo mkdir -p /home/node/.azure
sudo chown -R node:node /home/node/.azure

sudo mkdir -p /home/node/.claude
sudo chown -R node:node /home/node/.claude

sudo mkdir -p /workspaces/.azurite
sudo chown -R node:node /workspaces/.azurite

echo ""
echo "=== az account show ==="
az account show

## gitのステータスを表示
echo ""
echo "=== git fetch --prune ==="
git fetch --prune

echo ""
echo "=== git status ==="
git status

