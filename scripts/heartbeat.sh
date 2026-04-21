#!/usr/bin/env bash
# Aurora heartbeat — reports the Nest's current state to every channel you've
# configured in .env. Fires on boot, manual invocation, or systemd-triggered
# restarts. No silent phoning — each channel is explicit and owner-configured.
#
# Supported channels (any combination, all will fire):
#
#   1. Email via Resend (curl-only, zero extra deps)
#      RESEND_API_KEY=re_...
#      EMAIL_TO=you@example.com
#      EMAIL_FROM=aurora@yourdomain.com       # must be a Resend-verified sender
#                                              # default: onboarding@resend.dev
#
#   2. Email via generic SMTP (Python3 stdlib, no extra install)
#      SMTP_HOST=smtp.gmail.com
#      SMTP_PORT=587
#      SMTP_USER=you@gmail.com
#      SMTP_PASS=<app password>
#      EMAIL_TO=you@example.com
#      EMAIL_FROM=you@gmail.com
#
#   3. Telegram
#      TELEGRAM_BOT_TOKEN=1234:ABC...
#      TELEGRAM_CHAT_ID=123456789
#
# Optional env:
#   AURORA_PUBLIC_URL=https://empire.example.com
#   AURORA_NEST_NAME=home-server
#   HEARTBEAT_EVENT=boot | migrate | manual   (default: boot)
#   HEARTBEAT_INCLUDE_PASSWORD=true           (opt-in; ships the admin password
#                                              in plaintext — NOT recommended)
#
# Exit code is 0 if AT LEAST ONE channel succeeded, 1 if every configured
# channel failed, and 2 if no channels were configured.

set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

event="${HEARTBEAT_EVENT:-boot}"
nest="${AURORA_NEST_NAME:-$(hostname -s 2>/dev/null || echo nest)}"
port="${PORT:-3000}"
local_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "${local_ip:-}" ] && local_ip="127.0.0.1"
local_url="http://${local_ip}:${port}"
public_url="${AURORA_PUBLIC_URL:-}"
access_url="${public_url:-$local_url}"
public_ip="$(curl -fsS --max-time 3 https://ifconfig.co 2>/dev/null || echo unknown)"
ts="$(date -u +%FT%TZ)"

# App health (best-effort).
app_health="unknown"
if curl -fsS --max-time 5 "http://127.0.0.1:${port}/api/providers/health" >/dev/null 2>&1; then
  app_health="healthy"
else
  app_health="unreachable"
fi

# Docker compose summary (best-effort).
compose_status="not-available"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  compose_status="$(docker compose ps --format '{{.Service}}: {{.State}}' 2>/dev/null | paste -sd ', ' - || echo unknown)"
fi

# Admin password fingerprint — 8-char SHA-256 prefix. Proves identity without
# exposing the secret. Set HEARTBEAT_INCLUDE_PASSWORD=true to ship the full
# password (not recommended).
pw_fingerprint="not-set"
if [ -n "${ADMIN_PASSWORD:-}" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    pw_fingerprint="$(printf "%s" "$ADMIN_PASSWORD" | sha256sum | cut -c1-8)"
  elif command -v shasum >/dev/null 2>&1; then
    pw_fingerprint="$(printf "%s" "$ADMIN_PASSWORD" | shasum -a 256 | cut -c1-8)"
  fi
fi

pw_line="fingerprint: ${pw_fingerprint} (sha256[:8] of ADMIN_PASSWORD — verify against your .env)"
if [ "${HEARTBEAT_INCLUDE_PASSWORD:-false}" = "true" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  pw_line="$pw_line"$'\n'"admin_password: ${ADMIN_PASSWORD}"
fi

# ---------- Compose the payload ----------

subject="NEST_STATUS_REPORT"
body="$(cat <<BODY
Aurora Nest — ${event}

nest:        ${nest}
time:        ${ts}
public ip:   ${public_ip}
local url:   ${local_url}
public url:  ${public_url:-<not set>}

admin login: ${access_url}/admin/login
agent:       ${access_url}/admin/agent
terminal:    ${access_url}/admin/terminal
nest ctrl:   ${access_url}/admin/nest
providers:   ${access_url}/api/providers/health

app health:  ${app_health}
compose:     ${compose_status}

${pw_line}
BODY
)"

# ---------- Channel dispatch ----------

ok=0
tried=0

send_resend() {
  tried=$((tried + 1))
  local from="${EMAIL_FROM:-onboarding@resend.dev}"
  local to="${EMAIL_TO:?EMAIL_TO not set}"
  # Build JSON payload with python3 (handles escaping of body text correctly).
  local payload
  payload="$(python3 -c '
import json, os, sys
print(json.dumps({
  "from": os.environ["FROM"],
  "to": [os.environ["TO"]],
  "subject": os.environ["SUBJECT"],
  "text": os.environ["BODY"],
}))
' FROM="$from" TO="$to" SUBJECT="$subject" BODY="$body" 2>/dev/null)"
  if [ -z "$payload" ]; then
    echo "[heartbeat][resend] python3 unavailable — cannot build payload" >&2
    return 1
  fi
  local resp
  resp="$(curl -sS --max-time 15 -X POST "https://api.resend.com/emails" \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H "Content-Type: application/json" \
    --data "$payload" 2>&1)"
  if printf "%s" "$resp" | grep -q '"id"'; then
    echo "[heartbeat][resend] delivered → ${to}"
    ok=$((ok + 1))
    return 0
  fi
  echo "[heartbeat][resend] FAILED: $resp" >&2
  return 1
}

send_smtp() {
  tried=$((tried + 1))
  if ! command -v python3 >/dev/null 2>&1; then
    echo "[heartbeat][smtp] python3 not installed — skipping" >&2
    return 1
  fi
  SMTP_HOST="$SMTP_HOST" SMTP_PORT="${SMTP_PORT:-587}" \
  SMTP_USER="$SMTP_USER" SMTP_PASS="$SMTP_PASS" \
  EMAIL_TO="$EMAIL_TO" EMAIL_FROM="${EMAIL_FROM:-$SMTP_USER}" \
  SUBJECT="$subject" BODY="$body" \
  python3 - <<'PY'
import os, smtplib, ssl
from email.message import EmailMessage

msg = EmailMessage()
msg["From"] = os.environ["EMAIL_FROM"]
msg["To"] = os.environ["EMAIL_TO"]
msg["Subject"] = os.environ["SUBJECT"]
msg.set_content(os.environ["BODY"])

host = os.environ["SMTP_HOST"]
port = int(os.environ["SMTP_PORT"])
ctx = ssl.create_default_context()
try:
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as s:
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=15) as s:
            s.starttls(context=ctx)
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
            s.send_message(msg)
    print("[heartbeat][smtp] delivered")
except Exception as e:
    print(f"[heartbeat][smtp] FAILED: {e}", flush=True)
    raise SystemExit(1)
PY
  if [ $? -eq 0 ]; then
    ok=$((ok + 1))
    return 0
  fi
  return 1
}

send_telegram() {
  tried=$((tried + 1))
  local api="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"
  # Body is short; let Telegram URL-encode via --data-urlencode.
  local resp
  resp="$(curl -sS --max-time 10 -X POST "$api" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${subject}"$'\n\n'"${body}" \
    --data "disable_web_page_preview=true" 2>&1)"
  if printf "%s" "$resp" | grep -q '"ok":true'; then
    echo "[heartbeat][telegram] delivered"
    ok=$((ok + 1))
    return 0
  fi
  echo "[heartbeat][telegram] FAILED: $resp" >&2
  return 1
}

if [ -n "${RESEND_API_KEY:-}" ] && [ -n "${EMAIL_TO:-}" ]; then
  send_resend || true
fi

if [ -n "${SMTP_HOST:-}" ] && [ -n "${SMTP_USER:-}" ] && [ -n "${SMTP_PASS:-}" ] && [ -n "${EMAIL_TO:-}" ]; then
  send_smtp || true
fi

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  send_telegram || true
fi

if [ $tried -eq 0 ]; then
  echo "[heartbeat] no channels configured. Set one of:"
  echo "  RESEND_API_KEY + EMAIL_TO"
  echo "  SMTP_HOST + SMTP_USER + SMTP_PASS + EMAIL_TO"
  echo "  TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID"
  exit 2
fi

if [ $ok -gt 0 ]; then
  echo "[heartbeat] ${ok}/${tried} channel(s) delivered (event=${event})"
  exit 0
fi

echo "[heartbeat] all ${tried} channel(s) failed (event=${event})" >&2
exit 1
