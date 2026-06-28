#!/bin/bash
# .devcontainer/postCreate.sh
sudo mkdir -p /home/node/.azure
sudo chown -R node:node /home/node/.azure

sudo mkdir -p /home/node/.claude
sudo chown -R node:node /home/node/.claude

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

