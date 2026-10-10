#!/bin/bash
# scripts/start-work-branch.sh
#
# Create (or resume) the dedicated working branch for the current task, per
# CLAUDE.md's "Working Branch & Pull Requests" rule: work is never committed
# directly to the base branch.
#
# The branch name is computed mechanically as:
#
#   <type>/<issue-number>/claude-code
#
# where:
#   - <issue-number> is "issue-<n>" when this work is tied to GitHub Issue
#     <n>, otherwise today's date as "yyyy-MM-dd".
#   - <type> is "feat" if the issue has the "enhancement" label, "fix" if it
#     has the "bug" label (checked in that priority order); otherwise it
#     falls back to the caller-supplied <feat|fix> argument.
#
# Usage:
#   scripts/start-work-branch.sh <issue-number|none> <feat|fix> [<base-branch>]
#
# <feat|fix> is required even when an issue number is given: it's only used
# as a fallback if the issue has neither the "enhancement" nor "bug" label,
# but a valid value must still be supplied up front.
#
# <base-branch> defaults to "main". The new branch is always created from the
# latest origin/<base-branch> (origin is fetched first). If the computed
# branch name already exists locally, it is reused as-is (checked out, not
# recreated) so a session can resume earlier work on the same branch.

set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 <issue-number|none> <feat|fix> [<base-branch>]" >&2
  exit 1
fi

issue_arg="$1"
fallback_type="$2"
base_branch="${3:-main}"

if [ "$fallback_type" != "feat" ] && [ "$fallback_type" != "fix" ]; then
  echo "FAIL: <feat|fix> argument must be 'feat' or 'fix', got '$fallback_type'" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [ "$issue_arg" = "none" ]; then
  issue_segment="$(date +%Y-%m-%d)"
  type="$fallback_type"
else
  if ! [[ "$issue_arg" =~ ^[0-9]+$ ]]; then
    echo "FAIL: <issue-number|none> must be a positive integer or the literal 'none', got '$issue_arg'" >&2
    exit 1
  fi
  issue_segment="issue-$issue_arg"

  echo "=== start-work-branch: reading labels for issue #$issue_arg ==="
  labels_json="$(gh issue view "$issue_arg" --json labels --jq '[.labels[].name]')"

  if echo "$labels_json" | jq -e 'index("enhancement")' >/dev/null; then
    type="feat"
  elif echo "$labels_json" | jq -e 'index("bug")' >/dev/null; then
    type="fix"
  else
    echo "  no 'enhancement'/'bug' label found (labels: $labels_json), using fallback type '$fallback_type'"
    type="$fallback_type"
  fi
fi

branch_name="$type/$issue_segment/claude-code"

if [ "$branch_name" = "main" ] || [ "$branch_name" = "master" ] || [ "$branch_name" = "$base_branch" ]; then
  echo "FAIL: refusing to use '$branch_name' as a working branch name" >&2
  exit 1
fi

current_branch="$(git branch --show-current)"
if [ "$current_branch" = "$branch_name" ]; then
  echo "OK: already on working branch '$branch_name'"
  exit 0
fi

if git show-ref --verify --quiet "refs/heads/$branch_name"; then
  echo "=== start-work-branch: '$branch_name' already exists locally, resuming it ==="
  git switch "$branch_name"
  exit 0
fi

echo "=== start-work-branch: fetching latest origin/$base_branch ==="
git fetch origin "$base_branch"

echo "=== start-work-branch: creating '$branch_name' from origin/$base_branch ==="
git switch -c "$branch_name" "origin/$base_branch"

echo "OK: now on new working branch '$branch_name' (branched from origin/$base_branch)"