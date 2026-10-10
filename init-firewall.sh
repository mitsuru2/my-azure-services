#!/bin/bash
# scripts/init-firewall.sh
#
# Restrict all outbound network traffic from this container to an allowlist of
# domains, for use with Claude Code sessions. Everything else is dropped.
#
# Requires: iptables, ipset, dig (dnsutils), curl, jq — all installed in the Dockerfile.
# Requires: NET_ADMIN / NET_RAW capabilities — added via .devcontainer/devcontainer.json
#           ("runArgs": ["--cap-add=NET_ADMIN", "--cap-add=NET_RAW"]).
# Must be run as root (this script re-execs itself with sudo if needed).
#
# Rules are applied to the running container's network namespace only; they do
# NOT persist across container restarts, so this script must be re-run each
# time the container starts (e.g. from init.sh).

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -E bash "$0" "$@"
fi

# Apex domains to allow. Edit this list to change what the container may reach.
ALLOWED_DOMAINS=(
  "github.com"
  "anthropic.com"
)

# Subdomains required for github.com / anthropic.com to actually work end-to-end
# (git over https, gh CLI API calls, release/tarball downloads, Claude API).
ALLOWED_SUBDOMAINS=(
  "api.github.com"
  "codeload.github.com"
  "objects.githubusercontent.com"
  "raw.githubusercontent.com"
  "api.anthropic.com"
  "console.anthropic.com"
  "oauth2.googleapis.com"
  "www.googleapis.com"
)

echo "=== init-firewall: resetting firewall state ==="
iptables -F OUTPUT 2>/dev/null || true
iptables -F INPUT 2>/dev/null || true
ipset destroy allowed-domains 2>/dev/null || true

ipset create allowed-domains hash:net

echo "=== init-firewall: allowing loopback and established/related traffic ==="
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

echo "=== init-firewall: allowing DNS resolution ==="
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

resolve_and_add() {
  local domain="$1"
  local ips
  ips="$(dig +short "$domain" A | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || true)"
  if [ -z "$ips" ]; then
    echo "  WARNING: could not resolve $domain, skipping" >&2
    return
  fi
  while IFS= read -r ip; do
    ipset add allowed-domains "$ip" 2>/dev/null || true
  done <<<"$ips"
}

echo "=== init-firewall: resolving allowed domains ==="
for domain in "${ALLOWED_DOMAINS[@]}" "${ALLOWED_SUBDOMAINS[@]}"; do
  echo "  - $domain"
  resolve_and_add "$domain"
done

echo "=== init-firewall: adding GitHub's published IP ranges (api.github.com/meta) ==="
github_meta="$(curl -fsSL --max-time 10 https://api.github.com/meta || true)"
if [ -n "$github_meta" ]; then
  echo "$github_meta" | jq -r '(.web // []) + (.api // []) + (.git // []) | .[]' 2>/dev/null | grep -v ':' | while IFS= read -r cidr; do
    ipset add allowed-domains "$cidr" 2>/dev/null || true
  done
else
  echo "  WARNING: could not fetch https://api.github.com/meta, relying on DNS-resolved IPs only" >&2
fi

# oauth2.googleapis.com / www.googleapis.com sit behind Google's frontend pool,
# which rotates across many IPs on a short DNS TTL (a few minutes). Pinning
# whatever single IP happened to resolve at init time goes stale mid-session,
# so allow Google's whole published frontend range instead (same rationale as
# the GitHub ranges above).
echo "=== init-firewall: adding Google's published IP ranges (gstatic.com/ipranges/goog.json) ==="
goog_ranges="$(curl -fsSL --max-time 10 https://www.gstatic.com/ipranges/goog.json || true)"
if [ -n "$goog_ranges" ]; then
  echo "$goog_ranges" | jq -r '.prefixes[].ipv4Prefix // empty' 2>/dev/null | while IFS= read -r cidr; do
    ipset add allowed-domains "$cidr" 2>/dev/null || true
  done
else
  echo "  WARNING: could not fetch https://www.gstatic.com/ipranges/goog.json, relying on DNS-resolved IPs only" >&2
fi

echo "=== init-firewall: applying allowlist and default-deny policy ==="
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT
iptables -A OUTPUT -j DROP
iptables -A INPUT -j DROP

echo "=== init-firewall: verifying ==="
if curl -fsS --max-time 5 https://api.github.com/zen >/dev/null; then
  echo "  OK: github.com is reachable"
else
  echo "  FAIL: github.com is NOT reachable (expected to be allowed)" >&2
  exit 1
fi

if curl -fsS --max-time 5 https://example.com >/dev/null 2>&1; then
  echo "  FAIL: example.com is reachable but should have been blocked" >&2
  exit 1
else
  echo "  OK: example.com is blocked as expected"
fi

echo "=== init-firewall: done. Outbound access is restricted to: ${ALLOWED_DOMAINS[*]} (and required subdomains) ==="
