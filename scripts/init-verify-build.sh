#!/bin/bash
# scripts/init-verify-build.sh
#
# Sanity-check that the test runner and build command both work before
# starting a Claude Code session.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "=== init-verify-build: npm test ==="
if ! npm test; then
  echo "  FAIL: npm test did not succeed" >&2
  exit 1
fi
echo "  OK: npm test passed"

echo "=== init-verify-build: npm run build ==="
if ! npm run build; then
  echo "  FAIL: npm run build did not succeed" >&2
  exit 1
fi
echo "  OK: npm run build passed"
