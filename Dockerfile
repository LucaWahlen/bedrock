# syntax=docker/dockerfile:1

# One image: the Next.js standalone server under Node.js, plus the `bedrock`
# command for operators, bundled for Node.js from `scripts/`:
#
#   bedrock admin       the admin CLI (lockouts, ownership recovery)
#   bedrock migrate     apply the migrations, for MIGRATE_ON_START=false
#   bedrock housekeep   one housekeeping pass, for HOUSEKEEPING_ENABLED=false
#
#   docker build -t bedrock .
#   docker exec -it bedrock bedrock admin
#
# The server applies pending migrations on start, under an advisory lock so
# one replica migrates while the others wait, and runs housekeeping hourly in
# process. It runs as a numeric non-root user, so Kubernetes can verify
# `runAsNonRoot` without a `runAsUser` of its own.

FROM oven/bun:1.3-alpine AS bun

# Next.js builds and serves under Node.js; Bun only installs packages here.
FROM node:24-alpine AS base
RUN apk add --no-cache libstdc++ libgcc
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` evaluates the server modules, and env.ts refuses to load without
# a complete production configuration. These values exist only in this stage:
# nothing reads them at request time and they never reach the runtime image,
# which is configured entirely by its own environment.
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-stage-placeholder-never-used-at-runtime \
    BETTER_AUTH_URL=https://build.invalid \
    SEED_ADMIN_EMAIL=build@build.invalid \
    SEED_ADMIN_PASSWORD=build-placeholder \
    SEED_ADMIN_NAME=build \
    S3_REGION=auto \
    S3_BUCKET=build \
    S3_ENDPOINT=https://build.invalid \
    S3_FORCE_PATH_STYLE=true \
    S3_PUBLIC_URL=https://build.invalid \
    S3_ACCESS_KEY_ID=build \
    S3_SECRET_ACCESS_KEY=build \
    EMAIL_SENDER_NAME=build \
    EMAIL_SENDER_ADDRESS=build@build.invalid \
    SMTP_HOST=build.invalid \
    SMTP_PORT=587
# `build:cli` bundles scripts/ for Node.js into dist/cli, keeping NODE_ENV a
# runtime read: Bun would otherwise inline the development configuration.
RUN bun run build && bun run build:cli

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/dist/cli ./dist/cli
COPY --chmod=755 <<'EOF' /usr/local/bin/bedrock
#!/bin/sh
set -e
cd /app
case "$1" in
  admin | migrate) script=$1 ;;
  housekeep) script=housekeeping ;;
  *)
    echo "Usage: bedrock admin | migrate | housekeep [arguments]" >&2
    exit 64
    ;;
esac
shift
exec node "dist/cli/$script.mjs" "$@"
EOF
# Shown on the Health page; CI passes the full commit SHA.
ARG GIT_COMMIT=""
ENV GIT_COMMIT=${GIT_COMMIT}
USER 1001:1001
EXPOSE 3000
# Liveness only. Orchestrators that route traffic should also probe /api/ready.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
