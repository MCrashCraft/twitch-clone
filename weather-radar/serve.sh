#!/usr/bin/env bash
#
# Serve the live weather radar page on your Tailscale network.
#
# Usage:
#   ./serve.sh              # serve on http://localhost:8777 only
#   ./serve.sh --tailnet    # also expose over Tailscale HTTPS (tailscale serve)
#   ./serve.sh --funnel     # expose to the public internet (tailscale funnel)
#
# Requirements: python3 (for the static file server). For --tailnet/--funnel,
# Tailscale must be installed and logged in on this machine.

set -euo pipefail

PORT="${PORT:-8777}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-local}"

cleanup() {
  if [[ "$MODE" == "--tailnet" || "$MODE" == "--funnel" ]]; then
    tailscale serve --https=443 off >/dev/null 2>&1 || true
    tailscale funnel --https=443 off >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Serving weather radar from: $DIR"
echo "Local URL: http://localhost:$PORT"

case "$MODE" in
  --tailnet)
    if ! command -v tailscale >/dev/null 2>&1; then
      echo "error: tailscale CLI not found. Install it from https://tailscale.com/download" >&2
      exit 1
    fi
    tailscale serve --bg "$PORT"
    echo
    echo "Exposed on your tailnet. Open the HTTPS URL printed above"
    echo "from any device logged into your Tailscale network."
    ;;
  --funnel)
    if ! command -v tailscale >/dev/null 2>&1; then
      echo "error: tailscale CLI not found. Install it from https://tailscale.com/download" >&2
      exit 1
    fi
    tailscale funnel --bg "$PORT"
    echo
    echo "Exposed to the PUBLIC internet via Tailscale Funnel."
    ;;
  local) ;;
  *)
    echo "usage: $0 [--tailnet|--funnel]" >&2
    exit 1
    ;;
esac

exec python3 "$DIR/server.py" "$PORT"
