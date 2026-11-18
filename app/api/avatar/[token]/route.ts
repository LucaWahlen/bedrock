import {
  renderDefaultAvatarSvg,
  verifyAvatarToken,
} from "@/features/shared/lib/avatar-url"

type RouteContext = {
  params: Promise<{ token: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { token } = await params
  const avatar = verifyAvatarToken(token)
  if (!avatar) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    })
  }

  return new Response(renderDefaultAvatarSvg(avatar), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
