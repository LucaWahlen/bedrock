import { and, eq, inArray } from "drizzle-orm"

import type { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleMember,
  member,
  user,
} from "@/features/shared/lib/db/schema"

type AssignmentWriter = Pick<typeof db, "select" | "insert" | "delete">

type RoleStatement = { id: string; key: string; name: string }

type PersonStatement = {
  memberId: string
  userId: string
  name: string
  email: string
}

// A key of `applications.errors`, so the action can say it in the reader's
// language.
export type AssignmentRefusal = "unknownRole" | "unknownGroup" | "notMember"

type Refusal = { ok: false; error: AssignmentRefusal }

// Every id is matched inside `organizationId`, so neither a role nor a person
// from another tenant can be named into an assignment.
function membersOf(
  writer: AssignmentWriter,
  organizationId: string,
  userIds: string[]
) {
  return writer
    .select({
      memberId: member.id,
      userId: member.userId,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        inArray(member.userId, userIds)
      )
    )
}

// Replaces one member's roles and reports the difference, which is what the
// audit event states.
export async function replaceMemberRoles(
  writer: AssignmentWriter,
  organizationId: string,
  userId: string,
  roleIds: string[]
): Promise<
  | {
      ok: true
      person: PersonStatement
      added: RoleStatement[]
      removed: RoleStatement[]
    }
  | Refusal
> {
  const wanted = [...new Set(roleIds)]
  const [person] = await membersOf(writer, organizationId, [userId])

  if (!person) return { ok: false, error: "notMember" }

  const owned = wanted.length
    ? await writer
        .select({
          id: applicationRole.id,
          key: applicationRole.key,
          name: applicationRole.name,
        })
        .from(applicationRole)
        .where(
          and(
            eq(applicationRole.organizationId, organizationId),
            inArray(applicationRole.id, wanted)
          )
        )
    : []

  if (owned.length !== wanted.length) {
    return { ok: false, error: "unknownRole" }
  }

  const current = await writer
    .select({
      id: applicationRole.id,
      key: applicationRole.key,
      name: applicationRole.name,
    })
    .from(applicationRoleMember)
    .innerJoin(
      applicationRole,
      eq(applicationRole.id, applicationRoleMember.roleId)
    )
    .where(eq(applicationRoleMember.memberId, person.memberId))

  const held = new Set(current.map((role) => role.id))
  const kept = new Set(wanted)
  const added = owned.filter((role) => !held.has(role.id))
  const removed = current.filter((role) => !kept.has(role.id))

  if (removed.length > 0) {
    await writer.delete(applicationRoleMember).where(
      and(
        eq(applicationRoleMember.memberId, person.memberId),
        inArray(
          applicationRoleMember.roleId,
          removed.map((role) => role.id)
        )
      )
    )
  }

  if (added.length > 0) {
    await writer
      .insert(applicationRoleMember)
      .values(
        added.map((role) => ({
          roleId: role.id,
          memberId: person.memberId,
          createdAt: new Date(),
        }))
      )
      .onConflictDoNothing()
  }

  return { ok: true, person, added, removed }
}

// Changes who holds one role. Takes the change rather than the whole set, so a
// holder the caller never saw cannot be dropped by omission.
export async function changeRoleMembers(
  writer: AssignmentWriter,
  organizationId: string,
  roleId: string,
  change: { add: string[]; remove: string[] }
): Promise<
  | {
      ok: true
      role: RoleStatement
      added: PersonStatement[]
      removed: PersonStatement[]
    }
  | Refusal
> {
  const add = new Set(change.add)
  const remove = new Set(change.remove.filter((userId) => !add.has(userId)))
  const named = [...add, ...remove]

  const [role] = await writer
    .select({
      id: applicationRole.id,
      key: applicationRole.key,
      name: applicationRole.name,
    })
    .from(applicationRole)
    .where(
      and(
        eq(applicationRole.id, roleId),
        eq(applicationRole.organizationId, organizationId)
      )
    )
    .limit(1)

  if (!role) return { ok: false, error: "unknownRole" }
  if (named.length === 0) return { ok: true, role, added: [], removed: [] }

  const people = await membersOf(writer, organizationId, named)

  if (people.length !== named.length) {
    return { ok: false, error: "notMember" }
  }

  const holders = await writer
    .select({ memberId: applicationRoleMember.memberId })
    .from(applicationRoleMember)
    .where(
      and(
        eq(applicationRoleMember.roleId, role.id),
        inArray(
          applicationRoleMember.memberId,
          people.map((person) => person.memberId)
        )
      )
    )

  const held = new Set(holders.map((holder) => holder.memberId))
  const added = people.filter(
    (person) => add.has(person.userId) && !held.has(person.memberId)
  )
  const removed = people.filter(
    (person) => remove.has(person.userId) && held.has(person.memberId)
  )

  if (removed.length > 0) {
    await writer.delete(applicationRoleMember).where(
      and(
        eq(applicationRoleMember.roleId, role.id),
        inArray(
          applicationRoleMember.memberId,
          removed.map((person) => person.memberId)
        )
      )
    )
  }

  if (added.length > 0) {
    await writer
      .insert(applicationRoleMember)
      .values(
        added.map((person) => ({
          roleId: role.id,
          memberId: person.memberId,
          createdAt: new Date(),
        }))
      )
      .onConflictDoNothing()
  }

  return { ok: true, role, added, removed }
}

export function describePeople(people: PersonStatement[]) {
  return people.map((person) => `${person.name} <${person.email}>`)
}
