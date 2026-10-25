import {
  oidcEndpoint,
  recordRefusedTokenRequest,
  summarizeTokenRequest,
} from "@/features/auth"
import { recordTokenIssued } from "@/features/shared/lib/telemetry/metrics"

export async function POST(request: Request) {
  const summary = await summarizeTokenRequest(request)
  const response = await oidcEndpoint(request)
  if (response.ok) recordTokenIssued()
  else await recordRefusedTokenRequest(summary, response)
  return response
}
