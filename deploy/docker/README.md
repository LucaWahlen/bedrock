# Docker Compose

[`compose.yaml`](compose.yaml) runs Bedrock and its Postgres on one host with
Docker or Podman. Object storage and mail stay external: any S3 API (Cloudflare
R2, AWS S3, MinIO) and any SMTP server.

The server applies pending migrations when it starts and runs housekeeping
hourly in the same process, so there is nothing else to schedule.

## Configure

Create `.env` next to `compose.yaml`, replace every `REPLACE_ME`, and never
commit it. Every setting is described in the repository's
[`.env.example`](../../.env.example).

```env
# Optional. The image tag to run; pin a release such as 0.1.0.
# BEDROCK_VERSION=latest

# Postgres, run by compose.yaml. The same password in both lines; letters and
# digits only (`openssl rand -hex 24`), so it needs no URL escaping.
POSTGRES_PASSWORD=REPLACE_ME
DATABASE_URL=postgres://bedrock:REPLACE_ME@db:5432/bedrock

# The public https URL, exactly as users reach it through the proxy.
BETTER_AUTH_URL=https://bedrock.example.com
# `openssl rand -base64 32`
BETTER_AUTH_SECRET=REPLACE_ME

# The first root owner, created on first start.
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=REPLACE_ME
SEED_ADMIN_NAME=Admin

# An external S3-compatible bucket.
S3_REGION=auto
S3_BUCKET=bedrock-media
S3_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_URL=https://media.example.com
S3_ACCESS_KEY_ID=REPLACE_ME
S3_SECRET_ACCESS_KEY=REPLACE_ME

# An external SMTP server. Remove SMTP_USER and SMTP_PASSWORD for a relay
# without authentication; SMTP_SECURE=true for implicit TLS on 465.
EMAIL_SENDER_NAME=Bedrock
EMAIL_SENDER_ADDRESS=bedrock@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=REPLACE_ME
SMTP_PASSWORD=REPLACE_ME

# Unset keeps the audit log forever. Minimum 30.
AUDIT_RETENTION_DAYS=365
ORGANIZATION_RETENTION_DAYS=30
```

`BETTER_AUTH_URL` must be the public https URL. It is the OIDC issuer and the
passkey relying party, so pick it once. The bucket needs CORS and a lifecycle
rule for staged uploads; see
[Object storage](../../README.md#object-storage).

## Run

```bash
docker compose up -d
docker compose logs -f bedrock
```

The first start migrates the empty database and creates the root organization
with the `SEED_ADMIN_EMAIL` owner. Sign in and change the password.

The server listens on `127.0.0.1:3000` only. Put a reverse proxy with TLS in
front of it (Caddy, nginx, Traefik) that passes the original `Host` and
`X-Forwarded-Proto` and overwrites `X-Forwarded-For`; see
[Deployment](../../README.md#deployment). With Caddy, for example:

```caddyfile
bedrock.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

The container runs as a non-root user with a read-only root filesystem; it
writes only to `/tmp` and `/app/.next/cache`, both in memory.

## Upgrade

```bash
docker compose pull
docker compose up -d
```

The new container applies any pending migrations before it serves. If one
fails, the container exits and keeps restarting; `docker compose logs bedrock`
says why. Pin `BEDROCK_VERSION` to a release in production rather than
following `latest`.

## Back up

Postgres holds everything but media, including the keys that sign tokens.
Dump it on a schedule and keep the dumps away from `BETTER_AUTH_SECRET`:

```bash
docker compose exec -T db pg_dump -U bedrock -Fc bedrock > bedrock-$(date +%F).dump
```

To restore into a fresh volume:

```bash
docker compose up -d db
docker compose exec -T db pg_restore -U bedrock -d bedrock --no-owner < bedrock-YYYY-MM-DD.dump
docker compose up -d
```

Restore with the same `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`. Back up the
bucket separately; see [Backups and recovery](../../README.md#backups-and-recovery).

## Administer

The image carries the `bedrock` command:

```bash
# The admin CLI: lockouts, two-factor resets, ownership recovery
docker compose exec bedrock bedrock admin
docker compose exec bedrock bedrock admin enable person@example.com

# A housekeeping pass now, instead of on the hour
docker compose exec bedrock bedrock housekeep
```

To migrate or housekeep from your own tooling instead, set
`MIGRATE_ON_START=false` or `HOUSEKEEPING_ENABLED=false` in `.env` and run
`bedrock migrate` or `bedrock housekeep` yourself.
