import { NextResponse } from "next/server"

import { logout } from "@/features/auth"
import { absoluteUrl } from "@/features/shared/lib/app-url"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  await logout(slug)

  // Signing out to accept an invitation comes straight back to it. Only this
  // one destination is ever built from the parameter, so it cannot be pointed
  // somewhere else. The origin comes from the configured public URL: a route
  // handler resolves `request.url` against the address the server itself is
  // listening on, which behind a proxy is localhost.
  const invitationToken = new URL(request.url).searchParams.get("invitation")
  const destination = invitationToken
    ? `/org/${slug}/invitation?token=${encodeURIComponent(invitationToken)}`
    : `/org/${slug}/login`

  return NextResponse.redirect(absoluteUrl(destination))
}
