import { findOrganizationAdminRecipients } from "@/features/notifications/actions/find-organization-admin-recipients"
import { deliveryAuthority } from "@/features/notifications/lib/delivery-authority"
import {
  sendMemberJoinedNotice,
  sendMemberLeftNotice,
  sendUserSignedUpNotice,
} from "@/features/notifications/lib/membership-notices"
import type { NoticeRecipient } from "@/features/notifications/types"

export async function notifyOrganizationMemberJoined({
  organizationId,
  member,
  role = "member",
  excludeUserIds = [],
}: {
  organizationId: string
  member: NoticeRecipient & { id: string }
  role?: string
  excludeUserIds?: string[]
}): Promise<string[]> {
  const { organization, recipients } = await findOrganizationAdminRecipients(
    deliveryAuthority,
    {
      organizationId,
      excludeUserIds: [member.id, ...excludeUserIds],
    }
  )
  if (!organization || recipients.length === 0) return []

  const delivered = await Promise.all(
    recipients.map((recipient) =>
      sendMemberJoinedNotice({
        recipient,
        organization,
        member,
        role,
      })
    )
  )

  return recipients.filter((_, index) => delivered[index]).map(({ id }) => id)
}

export async function notifyOrganizationMemberLeft({
  organizationId,
  member,
}: {
  organizationId: string
  member: NoticeRecipient & { id: string }
}): Promise<void> {
  const { organization, recipients } = await findOrganizationAdminRecipients(
    deliveryAuthority,
    {
      organizationId,
      excludeUserIds: [member.id],
    }
  )
  if (!organization || recipients.length === 0) return

  await Promise.all(
    recipients.map((recipient) =>
      sendMemberLeftNotice({
        recipient,
        organization,
        member,
      })
    )
  )
}

export async function notifyUserSignedUp({
  newUser,
  excludeUserIds = [],
}: {
  newUser: NoticeRecipient & { id: string }
  excludeUserIds?: string[]
}): Promise<void> {
  const { organization, recipients } = await findOrganizationAdminRecipients(
    deliveryAuthority,
    {
      root: true,
      excludeUserIds: [newUser.id, ...excludeUserIds],
    }
  )
  if (!organization || recipients.length === 0) return

  await Promise.all(
    recipients.map((recipient) =>
      sendUserSignedUpNotice({
        recipient,
        organization,
        newUser,
      })
    )
  )
}
