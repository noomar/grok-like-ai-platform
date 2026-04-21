#!/usr/bin/env bash
# Aurora heartbeat — pings your own Telegram bot with the Nest's current state.
#
# What it sends:
#   - hostname + public IP (best-effort via ifconfig.co)
#   - local URL (http://<host>:<port>) and, if AURORA_PUBLIC_URL is set, that too
#   - a direct link to /admin/terminal (URL only — admin password still required)
#   - docker compose health summary
#   - the event that triggered this ping: boot | migrate | manual
#
# Required env (put them in .env):
#   TELEGRAM_BOT_TOKEN=1234:ABC...
#   TELEGRAM_CHAT_ID=123456789
#
# Optional env:
#   AURORA_PUBLIC_URL=https://empire.example.com   # if you front with Caddy/Tunnel
#   AURORA_NEST_NAME=home-server                   # shows up in the message
#   HEARTBEAT_EVENT=boot                           # free-form tag
#
# Usage:
#   ./scripts/heartbeat.sh           # event=boot
#   HEARTBEAT_EVENT=migrate ./scripts/heartbeat.sh
#
# Exits 0 if the message was delivered (Telegram API returned ok:true).
# Exits 1 if token/chat_id missing (fails loud, no silent swallow).

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

# Load .env if present.
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN not set — add it to .env}"
: "${TELEGRAM_CHAT_ID:?TELEGRAM_CHAT_ID not set — add it to .env}"

event="${HEARTBEAT_EVENT:-boot}"
nest="${AURORA_NEST_NAME:-$(hostname -s 2>/dev/null || echo nest)}"
port="${PORT:-3000}"
local_url="http://$(hostname -I 2>/dev/null | awk '{print $1}'):${port}"
public_url="${AURORA_PUBLIC_URL:-}"
public_ip="$(curl -fsS --max-time 3 https://ifconfig.co 2>/dev/null || echo unknown)"
ts="$(date -u +%FT%TZ)"

# Docker compose health snapshot (best-effort).
compose_status="not-installed"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  compose_status="$(docker compose ps --format '{{.Service}}: {{.State}}' 2>/dev/null | paste -sd ', ' - || echo unknown)"
fi

# App health (best-effort).
app_health="unknown"
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 5 "http://127.0.0.1:${port}/api/providers/health" >/dev/null 2>&1; then
    app_health="healthy"
  else
    app_health="unreachable"
  fi
fi

# Build a clean plain-text message (Telegram accepts up to 4096 chars).
msg="$(cat <<MSG
🦅 Aurora Nest — ${event}
nest: ${nest}
time: ${ts}
public ip: ${public_ip}
local url: ${local_url}
public url: ${public_url:-<not set>}
admin login: ${public_url:-${local_url}}/admin/login
terminal: ${public_url:-${local_url}}/admin/terminal
agent: ${public_url:-${local_url}}/admin/agent
app health: ${app_health}
compose: ${compose_status}
MSG
)"

# URL-encode with python (portable fallback to sed if python missing).
encode() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read()))'
  else
    # Very simple fallback — not perfect, but adequate for a Telegram message body.
    sed -e 's/%/%25/g' -e 's/ /%20/g' -e 's/#/%23/g' -e 's/&/%26/g' -e 's/+/%2B/g'
  fi
}

encoded="$(printf "%s" "$msg" | encode)"
api="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"

response="$(curl -fsS --max-time 10 -X POST "$api" \
  --data "chat_id=${TELEGRAM_CHAT_ID}" \
  --data "text=${encoded}" \
  --data "disable_web_page_preview=true" 2>&1 || true)"

if printf "%s" "$response" | grep -q '"ok":true'; then
  echo "[heartbeat] delivered (event=${event})"
  exit 0
else
  echo "[heartbeat] FAILED" >&2
  echo "$response" >&2
  exit 1
fi
