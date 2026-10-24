import { detectNewSignIn } from "@/features/notifications/actions/detect-new-sign-in"
import { sendNewSignInNotice } from "@/features/notifications/lib/account-notices"
import { deliverAfterResponse } from "@/features/notifications/lib/deliver"
import { readNoticeRequest } from "@/features/notifications/lib/notice-request"
import type { NoticeRecipient } from "@/features/notifications/types"

/**
 * Tells the account holder about a sign-in from a device it has not used
 * recently. Must run before the sign-in is recorded, so the sign-in does not
 * recognise itself, and never fails it: an error here only costs the notice.
 */
export async function noticeSignIn({
  sessionToken,
  recipient,
  organization,
}: {
  sessionToken: string
  recipient: NoticeRecipient
  organization?: { name: string; slug: string } | null
}) {
  try {
    if ((await detectNewSignIn(sessionToken)) !== "new") return

    const request = await readNoticeRequest()

    deliverAfterResponse(() =>
      sendNewSignInNotice({
        recipient,
        request,
        organizationSlug: organization?.slug ?? null,
        organizationName: organization?.name ?? null,
      })
    )
  } catch (error) {
    console.error(
      "[notifications] New sign-in check failed",
      error instanceof Error ? error.message : error
    )
  }
}
