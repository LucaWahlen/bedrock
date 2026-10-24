import { connection } from "next/server"

// Liveness: answers as long as the process can serve a request. It touches no
// dependency, so a database outage never gets a healthy container restarted.
export async function GET() {
  await connection()

  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } }
  )
}
