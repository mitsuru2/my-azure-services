#!/bin/bash
# .devcontainer/post-start.sh
# コンテナ起動のたびに実行される (postStartCommand)。
# az 未ログインや git fetch の失敗でコンテナ起動を止めないよう、意図的に set -e は付けない。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"

# secrets.env の読み込み処理は devcontainer.json に移動しました。
# postStartのタイミングでの読み込みの場合、 Claude Code セッションに反映されないため。

## git のコミット用ユーザー名・メールアドレス設定
## VS Code の Dev Containers 拡張を使う場合はホストの ~/.gitconfig が自動転送されるが、
## それ以外の方法でコンテナを起動したセッション (例: VS Code を介さない Claude Code
## セッション) では転送が効かず未設定になる。secrets.env 経由で明示的に設定することで、
## どちらの起動経路でも git commit がユーザー名・メール未設定エラーにならないようにする。
echo ""
echo "=== git config user.name / user.email ==="
if [ -z "${GIT_USER_NAME:-}" ] || [ -z "${GIT_USER_EMAIL:-}" ]; then
  echo "GIT_USER_NAME / GIT_USER_EMAIL が設定されていません。スキップします。"
  echo "secrets.env に GIT_USER_NAME=... / GIT_USER_EMAIL=... を追加してください。"
else
  git config --global user.name "$GIT_USER_NAME"
  git config --global user.email "$GIT_USER_EMAIL"
  echo "git commit のユーザーを設定しました: $GIT_USER_NAME <$GIT_USER_EMAIL>"
fi

## GitHub CLI (gh) の認証設定
## GH_TOKEN (または GITHUB_TOKEN) が secrets.env 経由で環境変数にあれば、
## gh コマンドはログイン不要でそれを使う。ここでは git 自体 (git push/pull 等) も
## 同じトークンで認証できるよう、git の credential.helper を gh に向ける。
echo ""
echo "=== gh auth setup-git ==="
if ! command -v gh >/dev/null 2>&1; then
  echo "gh コマンドが見つかりません。スキップします。"
elif [ -z "${GH_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GH_TOKEN / GITHUB_TOKEN が設定されていません。スキップします。"
else
  gh auth setup-git
  echo "git の credential.helper を gh に設定しました。"

  echo ""
  echo "=== gh auth status ==="
  gh auth status
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
