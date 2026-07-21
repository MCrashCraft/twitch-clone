#!/usr/bin/env bash
# Keepalive for the Weather Emergency Platform in the ephemeral container.
#
# Checks REAL health (localapi socket + HTTP), not process names — the previous
# pgrep -f approach false-matched unrelated processes whose command lines
# merely contained the word "tailscaled". Uses pkill -x (exact name) only.
#
# Env overrides: TS_DIR (tailscale binaries+state dir), APP_DIR, PORT, PUBLIC_URL
set -u

TS_DIR="${TS_DIR:-/tmp/claude-0/-home-user-twitch-clone/1b637db9-3776-52b5-9507-1fc5d796096c/scratchpad}"
APP_DIR="${APP_DIR:-/home/user/twitch-clone/weather-radar}"
PORT="${PORT:-8777}"
PUBLIC_URL="${PUBLIC_URL:-https://weather-radar.tail9775d.ts.net}"
TSBIN="$TS_DIR/tailscale_1.98.9_amd64"
SOCK="$TS_DIR/tailscaled.sock"
actions=""

# --- 1. tailscaled: healthy means the localapi socket answers -----------------
if ! timeout 8 "$TSBIN/tailscale" --socket="$SOCK" status --peers=false >/dev/null 2>&1; then
  pkill -x tailscaled 2>/dev/null   # exact process name only — never -f
  sleep 1
  ("$TSBIN/tailscaled" --tun=userspace-networking --socket="$SOCK" \
      --statedir="$TS_DIR/ts-state" >> "$TS_DIR/tailscaled.log" 2>&1 &)
  actions="$actions tailscaled:restarted"
  sleep 8
else
  actions="$actions tailscaled:ok"
fi

# --- 2. app server: healthy means /api/status answers locally ------------------
if ! curl -sf --max-time 8 "http://127.0.0.1:$PORT/api/status" >/dev/null; then
  (cd "$APP_DIR" && (python3 server.py "$PORT" >> "$TS_DIR/httpd.log" 2>&1 &))
  actions="$actions server:restarted"
  sleep 3
else
  actions="$actions server:ok"
fi

# --- 3. public funnel: retry up to ~60s after restarts -------------------------
code=000
for i in 1 2 3 4 5 6; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 12 "$PUBLIC_URL/" || echo 000)
  [ "$code" = "200" ] && break
  sleep 10
done

if [ "$code" = "200" ]; then
  echo "OK$actions public:200"
  exit 0
fi
echo "FAIL$actions public:$code"
exit 1
