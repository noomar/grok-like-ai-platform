#!/usr/bin/env bash
# Builds dist/aurora-sovereign-<short-sha>.zip containing everything the user
# needs to boot the Empire on their own box with a single ./start-empire.sh.
#
# Usage:
#   bash scripts/build-sovereign-bundle.sh
#   # → dist/aurora-sovereign-<sha>.zip + dist/aurora-sovereign-<sha>.sha256
#
# Runtime deps: git, zip, sha256sum (or shasum on macOS).

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

command -v zip >/dev/null 2>&1 || { echo "zip is required (apt install zip)"; exit 1; }

if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  sha="$(git rev-parse --short=10 HEAD)"
else
  sha="$(date -u +%Y%m%d%H%M%S)"
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="aurora-sovereign-${sha}"
out_dir="$here/dist"
workdir="$(mktemp -d -t aurora-sovereign.XXXXXX)"
staging="$workdir/$name"
mkdir -p "$out_dir" "$staging"

echo "[bundle] staging → $staging"

# Copy tracked files only — keeps the zip minimal and reproducible.
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  # Include tracked + untracked-but-not-ignored (so fresh checkouts work).
  git ls-files --cached --others --exclude-standard -z \
    | xargs -0 -I{} cp -a --parents "{}" "$staging"
else
  # Fallback: copy everything except the obvious junk.
  rsync -a \
    --exclude node_modules --exclude .next --exclude dist --exclude .git \
    --exclude .env --exclude .env.local --exclude '*.log' \
    ./ "$staging/"
fi

# Build metadata manifest so the user can verify what they got.
cat > "$staging/BUNDLE.json" <<JSON
{
  "name": "$name",
  "built_at_utc": "$stamp",
  "git_sha": "$sha",
  "components": [
    "Next.js 16 app (aurora)",
    "FastAPI + ffmpeg render worker",
    "SQLite persistence adapter",
    "admin terminal + agent executor",
    "IaC templates (fly, railway, oracle, terraform)"
  ]
}
JSON

# Ensure start-empire.sh is executable after unzip.
chmod +x "$staging/start-empire.sh"
find "$staging/scripts" -name '*.sh' -exec chmod +x {} \; 2>/dev/null || true

# Produce the zip.
zip_path="$out_dir/${name}.zip"
rm -f "$zip_path"
( cd "$workdir" && zip -rq "$zip_path" "$name" )

# Checksum for tamper detection.
checksum_path="$out_dir/${name}.sha256"
if command -v sha256sum >/dev/null 2>&1; then
  ( cd "$out_dir" && sha256sum "${name}.zip" > "${name}.sha256" )
elif command -v shasum >/dev/null 2>&1; then
  ( cd "$out_dir" && shasum -a 256 "${name}.zip" > "${name}.sha256" )
fi

rm -rf "$workdir"

size="$(du -h "$zip_path" | cut -f1)"
echo "[bundle] built ${zip_path} (${size})"
if [ -f "$checksum_path" ]; then
  echo "[bundle] sha256:"
  cat "$checksum_path"
fi
