#!/bin/bash
# scripts/init-verify-gdrive.sh
#
# Confirm that Google Drive credentials (used by scripts/attach-issue-evidence.sh
# to upload GitHub-Issue test evidence) are configured and working.
#
# This integration is optional: until the one-time manual OAuth setup described
# in scripts/attach-issue-evidence.sh has been done and GDRIVE_* secrets added to
# .devcontainer/secrets.env, this script only warns and exits 0 so it never
# blocks init.sh for sessions that don't need the GitHub Issue evidence workflow.

set -euo pipefail

echo "=== init-verify-gdrive: checking GDRIVE_* environment variables ==="
missing=()
for var in GDRIVE_CLIENT_ID GDRIVE_CLIENT_SECRET GDRIVE_REFRESH_TOKEN GDRIVE_FOLDER_ID; do
  if [ -z "${!var:-}" ]; then
    missing+=("$var")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "  WARNING: not configured (missing: ${missing[*]}). Skipping." >&2
  echo "  The GitHub Issue test-evidence upload step will be unavailable until" >&2
  echo "  these are added to .devcontainer/secrets.env (see scripts/attach-issue-evidence.sh)." >&2
  exit 0
fi

echo "=== init-verify-gdrive: refreshing access token ==="
token_response="$(curl -fsS --max-time 10 https://oauth2.googleapis.com/token \
  -d client_id="$GDRIVE_CLIENT_ID" \
  -d client_secret="$GDRIVE_CLIENT_SECRET" \
  -d refresh_token="$GDRIVE_REFRESH_TOKEN" \
  -d grant_type=refresh_token || true)"

access_token="$(echo "$token_response" | jq -r '.access_token // empty')"
if [ -z "$access_token" ]; then
  echo "  FAIL: could not obtain an access token. Response:" >&2
  echo "$token_response" >&2
  exit 1
fi
echo "  OK: obtained access token"

echo "=== init-verify-gdrive: checking Drive API access ==="
about_response="$(curl -fsS --max-time 10 "https://www.googleapis.com/drive/v3/about?fields=user" \
  -H "Authorization: Bearer $access_token" || true)"

user_email="$(echo "$about_response" | jq -r '.user.emailAddress // empty')"
if [ -z "$user_email" ]; then
  echo "  FAIL: could not reach Drive API. Response:" >&2
  echo "$about_response" >&2
  exit 1
fi
echo "  OK: Drive API reachable, authorized as $user_email"
