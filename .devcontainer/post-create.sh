#!/bin/bash
# .devcontainer/post-create.sh
# コンテナ作成時に 1 回だけ実行される (postCreateCommand)。
# npm ci は node_modules を毎回削除して再作成するため、起動ごとの post-start.sh ではなくここで実行する。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"

# node_modules は名前付きボリュームで、Docker により root 所有で作成される。
# postCreateCommand は postStartCommand より先に実行されるため、npm ci の前にここで chown する必要がある。
echo ""
echo "=== node_modules の所有者を node に変更 ==="
sudo mkdir -p "$WORKSPACE_DIR/node_modules"
sudo chown node:node "$WORKSPACE_DIR/node_modules"

echo ""
echo "=== npm ci ==="
cd "$WORKSPACE_DIR"
npm ci
