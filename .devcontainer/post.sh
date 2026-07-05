#!/bin/bash
# .devcontainer/postCreate.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECRETS_ENV="$SCRIPT_DIR/secrets.env"

if [ -f "$SECRETS_ENV" ]; then
  echo ""
  echo "=== secrets.env を読み込み中 ==="
  set -a
  source "$SECRETS_ENV"
  set +a

  # 新しいシェルでも環境変数が使えるように .bashrc に読み込み設定を追加
  MARKER="# .devcontainer/secrets.env"
  if ! grep -qF "$MARKER" /home/node/.bashrc 2>/dev/null; then
    {
      echo ""
      echo "$MARKER"
      echo "set -a"
      echo "source \"$SECRETS_ENV\""
      echo "set +a"
    } >> /home/node/.bashrc
  fi
else
  echo "secrets.env が見つかりません: $SECRETS_ENV"
fi

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

