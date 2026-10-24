import { oidcEndpoint } from "@/features/auth"
import { recordTokenIssued } from "@/features/shared/lib/telemetry/metrics"

export async function POST(request: Request) {
  const response = await oidcEndpoint(request)
  if (response.ok) recordTokenIssued()
  return response
}
