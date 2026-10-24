import { getSessionCookie } from "better-auth/cookies"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { env } from "@/features/shared/lib/config/env"
import {
  createNonce,
  securityHeaders,
} from "@/features/shared/lib/security-headers"

// Reachable without a session. Optimistic only: each of these pages decides for
// itself what an anonymous visitor may actually see.
const PUBLIC_PATHS = [
  "/login",
  "/two-factor",
  "/signup",
  "/invitation",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]

// Where a signed-in visitor has no business, because they already have what the
// page offers. `/signup` is not one of them: for someone who already has an
// account it is where they join an organization open to anyone.
const SIGNED_OUT_ONLY_PATHS = ["/login", "/two-factor"]

export function proxy(request: NextRequest) {
  const nonce = createNonce()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)

  function next() {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  function withSecurityHeaders(response: NextResponse) {
    for (const [key, value] of securityHeaders(nonce)) {
      response.headers.set(key, value)
    }
    return response
  }

  const { pathname } = request.nextUrl
  const isAuthenticated = !!getSessionCookie(request)

  if (pathname === "/") {
    return withSecurityHeaders(
      isAuthenticated
        ? next()
        : NextResponse.redirect(
            new URL(`/org/${env.rootOrganization.slug}/login`, request.url)
          )
    )
  }

  const orgMatch = pathname.match(/^\/org\/([^/]+)(\/.*)?$/)

  if (!orgMatch) {
    return withSecurityHeaders(next())
  }

  const [, slug, rest = ""] = orgMatch

  if (!isAuthenticated && !PUBLIC_PATHS.includes(rest)) {
    return withSecurityHeaders(
      NextResponse.redirect(new URL(`/org/${slug}/login`, request.url))
    )
  }

  if (isAuthenticated && SIGNED_OUT_ONLY_PATHS.includes(rest)) {
    return withSecurityHeaders(
      NextResponse.redirect(new URL(`/org/${slug}`, request.url))
    )
  }

  return withSecurityHeaders(next())
}

export const config = {
  // `/oauth2` carries no redirect rules; it is matched so the sign-in and
  // consent screens are served with the same security headers as the rest of
  // the app. A consent screen without frame-ancestors is a clickjacking target.
  matcher: ["/", "/org/:path*", "/oauth2/:path*"],
}
