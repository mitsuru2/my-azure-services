#!/bin/bash
# scripts/init-verify-git-auth.sh
#
# Confirm that git and gh are installed and that the user's credentials are
# valid, so Claude Code can commit, push, and use gh without hitting an
# auth wall mid-session.

set -euo pipefail

echo "=== init-verify-git-auth: checking git is available ==="
if ! command -v git >/dev/null 2>&1; then
  echo "  FAIL: git is not installed" >&2
  exit 1
fi
echo "  OK: $(git --version)"

echo "=== init-verify-git-auth: checking gh is available ==="
if ! command -v gh >/dev/null 2>&1; then
  echo "  FAIL: gh (GitHub CLI) is not installed" >&2
  exit 1
fi
echo "  OK: $(gh --version | head -n1)"

echo "=== init-verify-git-auth: checking git user identity ==="
git_user_name="$(git config --get user.name || true)"
git_user_email="$(git config --get user.email || true)"
if [ -z "$git_user_name" ] || [ -z "$git_user_email" ]; then
  echo "  FAIL: git user.name / user.email is not configured" >&2
  exit 1
fi
echo "  OK: committing as $git_user_name <$git_user_email>"

echo "=== init-verify-git-auth: checking gh auth status ==="
if ! gh auth status >/dev/null 2>&1; then
  echo "  FAIL: gh is not authenticated (run 'gh auth login')" >&2
  exit 1
fi
echo "  OK: gh is authenticated"

echo "=== init-verify-git-auth: checking git credentials against the remote ==="
if ! git ls-remote --exit-code origin >/dev/null 2>&1; then
  echo "  FAIL: could not reach/authenticate to 'origin' remote" >&2
  exit 1
fi
echo "  OK: origin remote is reachable with current credentials"
