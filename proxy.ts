import { getSessionCookie } from "better-auth/cookies"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const ROOT_ORGANIZATION_SLUG = "bedrock"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(`/org/${ROOT_ORGANIZATION_SLUG}`, request.url)
    )
  }

  const orgMatch = pathname.match(/^\/org\/([^/]+)(\/.*)?$/)

  if (!orgMatch) {
    return NextResponse.next()
  }

  const [, slug, rest = ""] = orgMatch
  const isLoginPage = rest === "/login"
  const isAuthenticated = !!getSessionCookie(request)

  if (!isAuthenticated && !isLoginPage) {
    return NextResponse.redirect(new URL(`/org/${slug}/login`, request.url))
  }

  if (isAuthenticated && isLoginPage) {
    return NextResponse.redirect(new URL(`/org/${slug}`, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/", "/org/:path*"],
}
