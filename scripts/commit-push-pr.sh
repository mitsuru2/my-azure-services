#!/bin/bash
# scripts/commit-push-pr.sh
#
# Commit the given files on the current working branch, push it, and ensure
# an open pull request exists for it — creating one only if none is already
# open, per CLAUDE.md's "Working Branch & Pull Requests" rule.
#
# Usage:
#   scripts/commit-push-pr.sh <base-branch> <commit-message-file> <pr-title> <pr-body-file> <file1> [<file2> ...]

set -euo pipefail

if [ "$#" -lt 5 ]; then
  echo "Usage: $0 <base-branch> <commit-message-file> <pr-title> <pr-body-file> <file1> [<file2> ...]" >&2
  exit 1
fi

base_branch="$1"
commit_message_file="$2"
pr_title="$3"
pr_body_file="$4"
shift 4
files=("$@")

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

current_branch="$(git branch --show-current)"
if [ -z "$current_branch" ] || [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ] || [ "$current_branch" = "$base_branch" ]; then
  echo "FAIL: refusing to commit/push directly on '$current_branch' — checkout a working branch first (scripts/start-work-branch.sh)" >&2
  exit 1
fi

for f in "$commit_message_file" "$pr_body_file"; do
  if [ ! -f "$f" ]; then
    echo "FAIL: file not found: $f" >&2
    exit 1
  fi
done

echo "=== commit-push-pr: staging ${#files[@]} file(s) ==="
git add -- "${files[@]}"

if git diff --cached --quiet; then
  echo "FAIL: nothing staged to commit" >&2
  exit 1
fi

echo "=== commit-push-pr: committing on '$current_branch' ==="
git commit -F "$commit_message_file"

echo "=== commit-push-pr: pushing '$current_branch' ==="
git push -u origin "$current_branch"

echo "=== commit-push-pr: checking for an existing open PR ==="
existing_pr_url="$(gh pr list --head "$current_branch" --state open --json url --jq '.[0].url // empty' 2>/dev/null || true)"

if [ -n "$existing_pr_url" ]; then
  echo "OK: open PR already exists, skipped creation: $existing_pr_url"
else
  echo "=== commit-push-pr: creating PR ($current_branch -> $base_branch) ==="
  pr_url="$(gh pr create --base "$base_branch" --head "$current_branch" --title "$pr_title" --body-file "$pr_body_file")"
  echo "OK: created PR: $pr_url"
fi
