# Kubernetes

Example manifests for running Bedrock on Kubernetes with `kubectl apply -k`.
They expect Postgres and S3-compatible storage outside the cluster or managed
separately: any Postgres 16+ (for example a
[CloudNativePG](https://cloudnative-pg.io/) cluster) and any S3 API (Cloudflare
R2, MinIO, AWS S3). Treat the manifests as a starting point, not a chart.

| File                           | What it is                                                  |
| ------------------------------ | ----------------------------------------------------------- |
| `configmap.yaml`               | Non-sensitive environment                                   |
| `secret.example.yaml`          | Template for the credentials; not part of the kustomization |
| `deployment.yaml`, `pdb.yaml`  | Two replicas of the server, at least one always available   |
| `service.yaml`, `ingress.yaml` | ClusterIP on 3000, and an example Ingress with TLS          |

Every variable is described in [`.env.example`](../../.env.example) and the
[README](../../README.md).

There is no migrate Job and no housekeeping CronJob. Each pod applies pending
migrations when it starts, before it serves, holding a Postgres advisory lock:
one pod migrates, the others wait for it and then find nothing to do. A
migration that fails makes the pod exit, so the rollout stops with the old pods
still serving. The pods also run housekeeping hourly, each task under its own
lock, so two pods never run the same task at once.

To migrate yourself instead, set `MIGRATE_ON_START: "false"` in the ConfigMap
and run `bedrock migrate` from the image before each rollout. To schedule
housekeeping yourself, set `HOUSEKEEPING_ENABLED: "false"` and run
`bedrock housekeep`, which runs one pass and exits non-zero if a task failed.

## Install

1. Set the version in `kustomization.yaml` (`newTag`) and the host in
   `configmap.yaml` and `ingress.yaml`. `BETTER_AUTH_URL` must be the public
   https URL: it is the OIDC issuer and the passkey relying party, so pick it
   once.
2. Create the namespace and the Secret:

   ```bash
   kubectl create namespace bedrock
   cp secret.example.yaml secret.yaml   # git-ignored; fill in every value
   kubectl apply -f secret.yaml
   ```

3. Deploy:

   ```bash
   kubectl apply -k .
   kubectl -n bedrock rollout status deployment/bedrock
   ```

The first start migrates an empty database and creates the root organization
and the `SEED_ADMIN_EMAIL` owner. `/api/ready` stays 503 until that has
finished, and while the database does not answer, so a pod never takes traffic
against an unmigrated database.

## Upgrade

Bump `newTag` in `kustomization.yaml`, then:

```bash
kubectl apply -k .
kubectl -n bedrock rollout status deployment/bedrock
```

The first new pod migrates while the old ones keep serving, which is why every
migration Bedrock ships is safe to run under the previous version. The
`startupProbe` allows ten minutes for it.

## Operations

```bash
# The admin CLI (lockouts, ownership recovery), interactively
kubectl -n bedrock exec -it deploy/bedrock -- bedrock admin

# Or without prompts
kubectl -n bedrock exec deploy/bedrock -- bedrock admin enable person@example.com

# A housekeeping pass now, instead of on the hour
kubectl -n bedrock exec deploy/bedrock -- bedrock housekeep
```

Containers run as non-root with a read-only root filesystem; the server writes
only to `/tmp` and `/app/.next/cache`, both `emptyDir`. Configuration changes
take effect after `kubectl -n bedrock rollout restart deployment/bedrock`.
