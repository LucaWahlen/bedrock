import { headers } from "next/headers"

import type { NoticeRequest } from "@/features/notifications/types"
import { clientAddress } from "@/features/shared/lib/client-address"

// Read while the request is still there: the mail is sent after the response.
export async function readNoticeRequest(): Promise<NoticeRequest> {
  const at = new Date()

  try {
    const requestHeaders = await headers()

    return {
      at,
      ipAddress: clientAddress(requestHeaders),
      userAgent: requestHeaders.get("user-agent"),
    }
  } catch {
    return { at, ipAddress: null, userAgent: null }
  }
}
