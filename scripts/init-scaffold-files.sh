#!/bin/bash
# scripts/init-scaffold-files.sh
#
# Ensure feature-list.json and claude-progress.txt exist at the repo root.
# If either is missing, create it from a minimal template and commit it,
# so every Claude Code session has these files to read/update
# (see CLAUDE.md "Session Start/End Procedure").

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

FEATURE_LIST="feature-list.json"
PROGRESS_LOG="claude-progress.txt"
created=()

if [ ! -f "$FEATURE_LIST" ]; then
  echo "=== init-scaffold-files: creating $FEATURE_LIST ==="
  cat >"$FEATURE_LIST" <<'EOF'
{
  "features": [
    {
      "name": "example-feature",
      "status": "todo",
      "description": "Replace this entry with a real feature. status must be one of: todo, in_progress, done.",
      "updatedAt": null
    }
  ]
}
EOF
  created+=("$FEATURE_LIST")
else
  echo "=== init-scaffold-files: $FEATURE_LIST already exists, skipping ==="
fi

if [ ! -f "$PROGRESS_LOG" ]; then
  echo "=== init-scaffold-files: creating $PROGRESS_LOG ==="
  cat >"$PROGRESS_LOG" <<'EOF'
# Claude Progress Log
#
# Append one dated entry per Claude Code session summarizing what was done,
# decisions made, and any unresolved issues. Newest entries at the bottom.
EOF
  created+=("$PROGRESS_LOG")
else
  echo "=== init-scaffold-files: $PROGRESS_LOG already exists, skipping ==="
fi

if [ "${#created[@]}" -gt 0 ]; then
  echo "=== init-scaffold-files: committing ${created[*]} ==="
  git add "${created[@]}"
  git commit -m "chore: scaffold ${created[*]} for Claude Code sessions" >/dev/null
  echo "  committed."
else
  echo "=== init-scaffold-files: nothing to commit ==="
fi
