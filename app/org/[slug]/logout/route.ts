import { NextResponse } from "next/server"

import { auth } from "@/features/auth"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const signOutResponse = await auth.api.signOut({
    headers: request.headers,
    asResponse: true,
  })

  const redirectResponse = NextResponse.redirect(
    new URL(`/org/${slug}/login`, request.url)
  )
  for (const cookie of signOutResponse.headers.getSetCookie()) {
    redirectResponse.headers.append("set-cookie", cookie)
  }
  return redirectResponse
}
