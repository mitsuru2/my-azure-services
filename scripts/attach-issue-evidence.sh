#!/bin/bash
# scripts/attach-issue-evidence.sh
#
# Zip up test-evidence folders for a GitHub Issue fix, upload each zip into
# an issue-<number> subfolder of a shared Google Drive folder (created on
# first use), and post a single comment on the current branch's open pull
# request listing each test case's title with a link to its zip.
#
# The PR must already exist (run scripts/commit-push-pr.sh first). It is
# looked up before anything is uploaded, so a missing PR fails fast without
# leaving orphaned zips in Drive.
#
# Usage:
#   scripts/attach-issue-evidence.sh <issue-number> <tc-dir1> [<tc-dir2> ...]
#
# Each <tc-dirN> must be named tc1, tc2, ... and contain:
#   - title.txt   first line = short human-readable title for this test case
#   - evidence files appropriate to the change (e.g. Playwright screenshot
#     PNGs for a GUI/component fix, or a plain-text file of input/output
#     pairs for a calculation/logic fix)
#
# GitHub's API has no public endpoint for attaching arbitrary files directly
# to an issue or PR comment (the web UI's drag-and-drop upload is a private,
# session-cookie-based endpoint, not callable from gh/REST with a token),
# so this script uploads to Google Drive instead and links it in a comment.
#
# Requires these environment variables (see .devcontainer/secrets.env,
# injected via devcontainer.json's --env-file, same mechanism as GH_TOKEN):
#   GDRIVE_CLIENT_ID       OAuth client ID (type: Desktop app)
#   GDRIVE_CLIENT_SECRET   OAuth client secret
#   GDRIVE_REFRESH_TOKEN   refresh token for the account's own Drive, scope
#                          https://www.googleapis.com/auth/drive.file
#                          (obtain once via e.g. https://developers.google.com/oauthplayground
#                          using your own client ID/secret)
#   GDRIVE_FOLDER_ID       destination Drive folder ID for evidence zips
#
# scripts/init-verify-gdrive.sh checks these are set and working.

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <issue-number> <tc-dir1> [<tc-dir2> ...]" >&2
  exit 1
fi

issue_number="$1"
shift
tc_dirs=("$@")

for var in GDRIVE_CLIENT_ID GDRIVE_CLIENT_SECRET GDRIVE_REFRESH_TOKEN GDRIVE_FOLDER_ID; do
  if [ -z "${!var:-}" ]; then
    echo "FAIL: $var is not set. Run scripts/init-verify-gdrive.sh for setup details." >&2
    exit 1
  fi
done

for dir in "${tc_dirs[@]}"; do
  if [ ! -d "$dir" ]; then
    echo "FAIL: not a directory: $dir" >&2
    exit 1
  fi
  if [ ! -f "$dir/title.txt" ]; then
    echo "FAIL: missing $dir/title.txt" >&2
    exit 1
  fi
done

current_branch="$(git branch --show-current)"
if [ -z "$current_branch" ]; then
  echo "FAIL: not on a branch (detached HEAD)" >&2
  exit 1
fi

echo "=== attach-issue-evidence: locating open PR for '$current_branch' ==="
pr_number="$(gh pr list --head "$current_branch" --state open --json number --jq '.[0].number // empty')"
if [ -z "$pr_number" ]; then
  echo "FAIL: no open PR for '$current_branch'. Run scripts/commit-push-pr.sh first." >&2
  exit 1
fi
echo "=== attach-issue-evidence: found PR #$pr_number ==="

workdir="$(mktemp -d)"
cleanup() { rm -rf "$workdir"; }
trap cleanup EXIT

echo "=== attach-issue-evidence: refreshing access token ==="
token_response="$(curl -fsS --max-time 10 https://oauth2.googleapis.com/token \
  -d client_id="$GDRIVE_CLIENT_ID" \
  -d client_secret="$GDRIVE_CLIENT_SECRET" \
  -d refresh_token="$GDRIVE_REFRESH_TOKEN" \
  -d grant_type=refresh_token)"
access_token="$(echo "$token_response" | jq -r '.access_token // empty')"
if [ -z "$access_token" ]; then
  echo "FAIL: could not obtain an access token: $token_response" >&2
  exit 1
fi

issue_folder_name="issue-${issue_number}"
echo "=== attach-issue-evidence: locating '$issue_folder_name' subfolder in Google Drive ==="
escaped_folder_name="${issue_folder_name//\'/\\\'}"
search_query="name = '${escaped_folder_name}' and '${GDRIVE_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
search_response="$(curl -fsS --max-time 10 -G \
  "https://www.googleapis.com/drive/v3/files" \
  -H "Authorization: Bearer $access_token" \
  --data-urlencode "q=$search_query" \
  --data-urlencode "fields=files(id,name)")"

issue_folder_id="$(echo "$search_response" | jq -r '.files[0].id // empty')"
if [ -z "$issue_folder_id" ]; then
  echo "=== attach-issue-evidence: creating '$issue_folder_name' subfolder in Google Drive ==="
  create_folder_response="$(curl -fsS --max-time 10 \
    "https://www.googleapis.com/drive/v3/files?fields=id" \
    -H "Authorization: Bearer $access_token" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg name "$issue_folder_name" --arg parent "$GDRIVE_FOLDER_ID" \
      '{name: $name, mimeType: "application/vnd.google-apps.folder", parents: [$parent]}')")"

  issue_folder_id="$(echo "$create_folder_response" | jq -r '.id // empty')"
  if [ -z "$issue_folder_id" ]; then
    echo "FAIL: could not create '$issue_folder_name' subfolder: $create_folder_response" >&2
    exit 1
  fi
else
  echo "=== attach-issue-evidence: found existing '$issue_folder_name' subfolder ($issue_folder_id) ==="
fi

comment_body="$workdir/comment.md"
echo "## Test evidence" >"$comment_body"
echo "" >>"$comment_body"
echo "Issue #$issue_number" >>"$comment_body"
echo "" >>"$comment_body"

for dir in "${tc_dirs[@]}"; do
  name="$(basename "$dir")"
  title="$(head -n1 "$dir/title.txt")"
  zip_path="$workdir/$name.zip"

  echo "=== attach-issue-evidence: zipping $dir -> $name.zip ==="
  (cd "$dir" && zip -r -q "$zip_path" .)

  echo "=== attach-issue-evidence: uploading $name.zip to Google Drive ($issue_folder_name) ==="
  upload_response="$(curl -fsS --max-time 60 \
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id" \
    -H "Authorization: Bearer $access_token" \
    -F "metadata={\"name\":\"$name.zip\",\"parents\":[\"$issue_folder_id\"]};type=application/json;charset=UTF-8" \
    -F "file=@${zip_path};type=application/zip")"

  file_id="$(echo "$upload_response" | jq -r '.id // empty')"
  if [ -z "$file_id" ]; then
    echo "FAIL: upload failed for $name.zip: $upload_response" >&2
    exit 1
  fi

  echo "=== attach-issue-evidence: making $name.zip link-shareable ==="
  perm_response="$(curl -fsS --max-time 10 \
    "https://www.googleapis.com/drive/v3/files/$file_id/permissions" \
    -H "Authorization: Bearer $access_token" \
    -H "Content-Type: application/json" \
    -d '{"role":"reader","type":"anyone"}')"

  if ! echo "$perm_response" | jq -e '.id' >/dev/null 2>&1; then
    echo "FAIL: could not set sharing permission for $name.zip: $perm_response" >&2
    exit 1
  fi

  link="https://drive.google.com/file/d/$file_id/view"
  echo "- **$title** — [$name.zip]($link)" >>"$comment_body"
done

echo "=== attach-issue-evidence: posting comment on PR #$pr_number ==="
gh pr comment "$pr_number" --body-file "$comment_body"

echo "=== attach-issue-evidence: done ==="
