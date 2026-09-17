#!/usr/bin/env bash
# Resolve a Tailscale hostname to an IPv4 address.
# MagicDNS (`getent`) first; if that is down, `tailscale status --json`.
set -euo pipefail

NAME="${1:-server1}"

from_dns() {
  getent ahostsv4 "${NAME}" 2>/dev/null | awk '{print $1; exit}'
}

from_tailscale() {
  command -v tailscale >/dev/null 2>&1 || return 1
  tailscale status --json | python3 -c '
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

for peer in rows:
    host = str(peer.get("HostName") or "").split(".")[0].lower()
    dns = str(peer.get("DNSName") or "").split(".")[0].lower()
    if host != want and dns != want:
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
  echo "Could not resolve ${NAME} via DNS or tailscale status" >&2
  exit 1
fi
printf '%s\n' "${ip}"
