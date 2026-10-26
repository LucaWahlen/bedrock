"use server"

import { and, asc, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { requireGroupAdministration } from "@/features/groups/lib/group-read"
import type { GroupMember } from "@/features/groups/types"
import { db } from "@/features/shared/lib/db/client"
import {
  group,
  groupMember,
  member,
  user,
} from "@/features/shared/lib/db/schema"
import type { QueryResult } from "@/features/shared/types"

const MAX_MEMBERS = 200

// groupId is a query target, not a claimed identity: the organization is proved
// first, and the group is then matched inside it.
export async function getGroupMembers(
  organizationId: string,
  groupId: string
): Promise<QueryResult<GroupMember[]>> {
  const t = await getTranslations("groups")
  try {
    await requireGroupAdministration(
      organizationId,
      t("errors.viewMembersDenied")
    )
  } catch {
    return { success: false, error: t("errors.viewMembersDenied") }
  }

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId))
    .innerJoin(member, eq(member.id, groupMember.memberId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(groupMember.groupId, groupId),
        eq(group.organizationId, organizationId),
        eq(member.organizationId, organizationId)
      )
    )
    .orderBy(asc(user.name))
    .limit(MAX_MEMBERS)

  return { success: true, data: rows }
}
