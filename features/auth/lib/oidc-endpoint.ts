import { auth } from "@/features/auth/lib/auth"

// Better Auth's catch-all router is deliberately never mounted: it would
// re-expose sign-up, organization and member endpoints that bypass every guard,
// audit event and rate limit in this app. Each OpenID endpoint is instead named
// by its own route file and forwarded here, so anything unnamed stays a 404.
export function oidcEndpoint(request: Request) {
  return auth.handler(request)
}
