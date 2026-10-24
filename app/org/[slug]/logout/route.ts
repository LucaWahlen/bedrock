import { NextResponse } from "next/server"

import { logout } from "@/features/auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  await logout(slug)

  // Signing out to accept an invitation comes straight back to it. Only this
  // one destination is ever built from the parameter, so it cannot be pointed
  // somewhere else.
  const invitationToken = new URL(request.url).searchParams.get("invitation")
  const destination = invitationToken
    ? `/org/${slug}/invitation?token=${encodeURIComponent(invitationToken)}`
    : `/org/${slug}/login`

  return NextResponse.redirect(new URL(destination, request.url))
}
