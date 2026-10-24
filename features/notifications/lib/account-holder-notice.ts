import { deliverAfterResponse } from "@/features/notifications/lib/deliver"
import { readNoticeRequest } from "@/features/notifications/lib/notice-request"
import type {
  AccountNoticeInput,
  NoticeRecipient,
} from "@/features/notifications/types"
import { accountHomeSlug } from "@/features/notifications/utils/account-home"

/**
 * Schedules an account notice to the person who just changed their own account,
 * once the response is on its way. Call it only after the change is committed.
 * Never throws, so it cannot fail the change it reports.
 */
export async function noticeAccountHolder(
  {
    user,
    memberships,
    preferredSlug,
  }: {
    user: NoticeRecipient
    memberships: { slug: string; status: string }[]
    preferredSlug?: string | null
  },
  send: (input: AccountNoticeInput) => Promise<unknown>
) {
  const request = await readNoticeRequest()
  const input: AccountNoticeInput = {
    recipient: { name: user.name, email: user.email, locale: user.locale },
    request,
    organizationSlug: accountHomeSlug(memberships, preferredSlug),
  }

  deliverAfterResponse(() => send(input))
}
