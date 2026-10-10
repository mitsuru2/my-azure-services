#!/bin/bash
# .claude/hooks/format-on-edit.sh
#
# PostToolUse hook (Edit|Write): run Prettier on the file Claude just changed,
# so formatting no longer depends on a CLAUDE.md rule being followed.
#
# --ignore-unknown skips file types Prettier can't parse, and .prettierignore
# is respected, so this is safe to run on any path. Formatting failures are
# reported to Claude via stderr + exit 2 rather than silently ignored.

set -euo pipefail

file_path="$(jq -r '.tool_input.file_path // empty')"
[ -n "$file_path" ] || exit 0
[ -f "$file_path" ] || exit 0

# Files outside the repo (e.g. scratch directories) are not ours to format.
case "$file_path" in
  "$CLAUDE_PROJECT_DIR"/*) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR"
if ! output="$(npx --no-install prettier --write --ignore-unknown --log-level warn "$file_path" 2>&1)"; then
  echo "prettier failed for $file_path:" >&2
  echo "$output" >&2
  exit 2
fi
