#!/bin/bash
# .devcontainer/post-start.sh
# コンテナ起動のたびに実行される (postStartCommand)。
# az 未ログインや git fetch の失敗でコンテナ起動を止めないよう、意図的に set -e は付けない。
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"
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

# ボリュームは Docker により root 所有で作成される。
# 毎回 chown -R すると .claude のセッション履歴などが増えるにつれ起動が遅くなるため、所有者が node でない場合のみ実行する。
ensure_owned_by_node() {
  local dir="$1"
  sudo mkdir -p "$dir"
  if [ "$(stat -c '%U' "$dir")" != "node" ]; then
    echo "所有者を node に変更: $dir"
    sudo chown -R node:node "$dir"
  fi
}

ensure_owned_by_node /home/node/.azure
ensure_owned_by_node /home/node/.claude
ensure_owned_by_node /workspaces/.azurite
# post-create.sh でも chown しているが、ボリュームを作り直した場合などに備えて起動時にも確認する
ensure_owned_by_node "$WORKSPACE_DIR/node_modules"

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
