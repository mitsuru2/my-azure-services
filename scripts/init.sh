#!/bin/bash
# init.sh
#
# Entry point run at the start of a Claude Code session (or manually) to get
# this container into a known-good state:
#
#   1. Scaffold feature-list.json / claude-progress.txt if missing, and commit them.
#   2. Verify the test runner and build command both work.
#   3. Lock down outbound network access to an allowlist (github.com, anthropic.com).
#   4. Verify git/gh are usable and the user's credentials are valid.
#   5. Verify access to this repo's GitHub Issues.
#   6. Verify Google Drive credentials for the test-evidence upload workflow
#      (optional — warns and skips if not yet configured).
#
# Steps 1-2 run before the network is locked down (step 3) since they don't
# need network access; steps 4-6 run after, both to confirm the allowlist
# is actually sufficient and that credentials work under it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

steps=(
  "init-scaffold-files.sh"
  "init-verify-build.sh"
  "init-firewall.sh"
  "init-verify-git-auth.sh"
  "init-verify-github-issues.sh"
  "init-verify-gdrive.sh"
)

for step in "${steps[@]}"; do
  echo ""
  echo "########################################"
  echo "# $step"
  echo "########################################"
  bash "$step"
done

echo ""
echo "=== init.sh: all checks passed, environment is ready ==="
