#!/usr/bin/env bash
# Aurora Nest backup — snapshots SQLite + .env → GPG-encrypted tarball.
#
# Destinations (pick one via BACKUP_DEST):
#   local:/path/to/backups        # default, plain directory on the host
#   rclone:remote:bucket/prefix   # rclone copies to any of its 70+ cloud backends
#   s3:bucket/prefix              # requires aws cli configured
#
# Required env:
#   BACKUP_GPG_PASSPHRASE         # symmetric passphrase; treat as root key
#
# Optional env:
#   BACKUP_DEST                   # default: local:./backups
#   BACKUP_RETAIN                 # number of recent archives to keep (default 14)
#
# Usage:
#   ./scripts/backup-nest.sh
#
# Cron example (daily at 03:17):
#   17 3 * * * cd /opt/aurora && ./scripts/backup-nest.sh >> /var/log/aurora-backup.log 2>&1

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${BACKUP_GPG_PASSPHRASE:?BACKUP_GPG_PASSPHRASE not set — add it to .env or export it}"
dest="${BACKUP_DEST:-local:./backups}"
retain="${BACKUP_RETAIN:-14}"

command -v gpg >/dev/null 2>&1 || { echo "gpg is required (apt install gnupg)"; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "tar is required"; exit 1; }

sha="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d -t aurora-backup.XXXXXX)"
staging="$work/aurora-backup-$sha"
mkdir -p "$staging"

echo "[backup] staging → $staging"

# Snapshot SQLite from the running app container if possible (online backup),
# otherwise copy the file from the Docker volume directly.
if command -v docker >/dev/null 2>&1 && docker compose ps -q app >/dev/null 2>&1; then
  if [ -n "$(docker compose ps -q app 2>/dev/null)" ]; then
    echo "[backup] running SQLite online backup via docker compose exec"
    docker compose exec -T app sh -c "sqlite3 /data/aurora.db \".backup /data/_tmp_backup.db\" && cat /data/_tmp_backup.db" > "$staging/aurora.db"
    docker compose exec -T app sh -c "rm -f /data/_tmp_backup.db" || true
  fi
fi

if [ ! -s "$staging/aurora.db" ]; then
  # Fallback: read from Docker volume mount via a one-shot busybox container.
  echo "[backup] fallback — reading /data/aurora.db via one-shot container"
  if docker volume inspect aurora-data >/dev/null 2>&1; then
    docker run --rm -v aurora-data:/data busybox cat /data/aurora.db > "$staging/aurora.db" 2>/dev/null || true
  fi
fi

# Include .env (encrypted later, so this is fine) + BUNDLE.json if present.
[ -f ".env" ] && cp -a .env "$staging/.env"
[ -f "BUNDLE.json" ] && cp -a BUNDLE.json "$staging/BUNDLE.json"

# Write a small manifest for the archive itself.
cat > "$staging/MANIFEST.txt" <<MANIFEST
Aurora Nest backup
built_at_utc: $(date -u +%FT%TZ)
hostname: $(hostname 2>/dev/null || echo unknown)
contents:
$(ls -la "$staging")
MANIFEST

tar_path="$work/aurora-backup-$sha.tar.gz"
tar -czf "$tar_path" -C "$work" "aurora-backup-$sha"

# Symmetric-encrypt with GPG so the archive is safe on any remote.
enc_path="$work/aurora-backup-$sha.tar.gz.gpg"
GPG_TTY=$(tty 2>/dev/null || echo)
export GPG_TTY
gpg --batch --yes --pinentry-mode loopback \
  --passphrase "$BACKUP_GPG_PASSPHRASE" \
  --symmetric --cipher-algo AES256 \
  -o "$enc_path" "$tar_path"

size="$(du -h "$enc_path" | cut -f1)"
echo "[backup] encrypted archive: $enc_path ($size)"

# Ship it.
case "$dest" in
  local:*)
    dir="${dest#local:}"
    mkdir -p "$dir"
    cp "$enc_path" "$dir/"
    echo "[backup] copied to $dir"
    # Retention.
    ls -1tr "$dir"/aurora-backup-*.tar.gz.gpg 2>/dev/null | head -n -"$retain" | xargs -r rm -v
    ;;
  rclone:*)
    remote="${dest#rclone:}"
    command -v rclone >/dev/null 2>&1 || { echo "rclone not installed"; exit 1; }
    rclone copy "$enc_path" "$remote"
    echo "[backup] uploaded via rclone → $remote"
    ;;
  s3:*)
    s3="${dest#s3:}"
    command -v aws >/dev/null 2>&1 || { echo "aws cli not installed"; exit 1; }
    aws s3 cp "$enc_path" "s3://$s3/"
    echo "[backup] uploaded → s3://$s3/"
    ;;
  *)
    echo "Unknown BACKUP_DEST scheme: $dest" >&2
    exit 1
    ;;
esac

rm -rf "$work"
echo "[backup] done."
