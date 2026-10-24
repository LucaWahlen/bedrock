import { connection } from "next/server"

import { isReady } from "@/features/shared/lib/health"

// Readiness: whether this instance should receive traffic. Anonymous callers
// learn the verdict and nothing about why.
export async function GET() {
  await connection()

  const ready = await isReady()

  return Response.json(
    { status: ready ? "ready" : "unavailable" },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  )
}
