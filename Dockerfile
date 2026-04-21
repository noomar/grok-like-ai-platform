# syntax=docker/dockerfile:1.7
# Aurora AI Platform — portable Docker image.
#
# Build:   docker build -t aurora:latest .
# Run:     docker run -p 3000:3000 --env-file .env aurora:latest
# Compose: docker compose up  (see docker-compose.yml for the full stack)
#
# This image runs the Next.js app in `standalone` mode so the final layer is
# tiny and free of build-time dependencies. SQLite is enabled by default
# (AURORA_STORAGE=sqlite, data at /data/aurora.db) so state survives restarts
# without any external database. Mount a volume at /data to make it durable.

# ---- deps stage ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ---- build stage ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    AURORA_STORAGE=sqlite \
    AURORA_SQLITE_PATH=/data/aurora.db
# ffmpeg is kept in the runtime image so the ffmpeg video provider works
# out of the box (no hosted Shotstack/HF required).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home /app nextjs \
    && chown -R nextjs:nodejs /data /app
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT}/api/providers/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
