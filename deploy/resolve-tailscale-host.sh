#!/usr/bin/env bash
# Resolve a Tailscale hostname to an IPv4 address.
# MagicDNS is often broken on PVE guests (resolv.conf → 9.9.9.9). Prefer
# `tailscale status`, including via sudo, then a known IP fallback.
set -euo pipefail

NAME="${1:-server1}"
FALLBACK="${2:-100.100.126.125}"

tailscale_json() {
  if command -v tailscale >/dev/null 2>&1 && tailscale status --json >/dev/null 2>&1; then
    tailscale status --json
    return 0
  fi
  if command -v sudo >/dev/null 2>&1 && sudo -n tailscale status --json >/dev/null 2>&1; then
    sudo -n tailscale status --json
    return 0
  fi
  return 1
}

from_dns() {
  getent ahostsv4 "${NAME}" 2>/dev/null | awk '{print $1; exit}'
}

from_tailscale() {
  tailscale_json | python3 -c '
import json, sys

want = sys.argv[1].lower()
data = json.load(sys.stdin)
rows = []
if data.get("Self"):
    rows.append(data["Self"])
peer = data.get("Peer") or {}
if isinstance(peer, dict):
    rows.extend(peer.values())
else:
    rows.extend(peer)

def first_v4(ips):
    if not isinstance(ips, list):
        return None
    for ip in ips:
        if isinstance(ip, str) and ":" not in ip:
            return ip
    return ips[0] if ips and isinstance(ips[0], str) else None

aliases = {want, "server1"}
for peer in rows:
    host = str(peer.get("HostName") or "").split(".")[0].lower()
    dns = str(peer.get("DNSName") or "").split(".")[0].lower()
    if host not in aliases and dns not in aliases:
        continue
    ip = first_v4(peer.get("TailscaleIPs"))
    if ip:
        print(ip)
        raise SystemExit(0)
raise SystemExit(1)
' "${NAME}"
}

ip="$(from_dns || true)"
if [[ -z "${ip}" ]]; then
  ip="$(from_tailscale || true)"
fi
if [[ -z "${ip}" ]]; then
  echo "Could not resolve ${NAME} via DNS or tailscale; using ${FALLBACK}" >&2
  ip="${FALLBACK}"
fi
printf '%s\n' "${ip}"
