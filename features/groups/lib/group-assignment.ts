import { and, eq, inArray } from "drizzle-orm"

import type { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleGroup,
  group,
  groupMember,
  member,
  user,
} from "@/features/shared/lib/db/schema"

type AssignmentWriter = Pick<typeof db, "select" | "insert" | "delete">

type Statement = { id: string; key: string; name: string }

type PersonStatement = {
  memberId: string
  userId: string
  name: string
  email: string
}

// A key of `groups.errors`, so the action can say it in the reader's language.
export type AssignmentRefusal = "unknownGroup" | "unknownRole" | "notMember"

type Refusal = { ok: false; error: AssignmentRefusal }

// Matched inside `organizationId`, so a group from another tenant cannot be
// named. The composite foreign keys refuse the same thing again in the database.
async function groupIn(
  writer: AssignmentWriter,
  organizationId: string,
  groupId: string
): Promise<Statement | null> {
  const [found] = await writer
    .select({ id: group.id, key: group.key, name: group.name })
    .from(group)
    .where(and(eq(group.id, groupId), eq(group.organizationId, organizationId)))
    .limit(1)

  return found ?? null
}

// Changes who is in one group. Takes the change rather than the whole set, so a
// member the caller never saw cannot be dropped by omission.
export async function changeGroupMembers(
  writer: AssignmentWriter,
  organizationId: string,
  groupId: string,
  change: { add: string[]; remove: string[] }
): Promise<
  | {
      ok: true
      group: Statement
      added: PersonStatement[]
      removed: PersonStatement[]
    }
  | Refusal
> {
  const add = new Set(change.add)
  const remove = new Set(change.remove.filter((userId) => !add.has(userId)))
  const named = [...add, ...remove]

  const target = await groupIn(writer, organizationId, groupId)
  if (!target) return { ok: false, error: "unknownGroup" }
  if (named.length === 0) {
    return { ok: true, group: target, added: [], removed: [] }
  }

  const people = await writer
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
        inArray(member.userId, named)
      )
    )

  if (people.length !== named.length) {
    return { ok: false, error: "notMember" }
  }

  const current = await writer
    .select({ memberId: groupMember.memberId })
    .from(groupMember)
    .where(
      and(
        eq(groupMember.groupId, target.id),
        inArray(
          groupMember.memberId,
          people.map((person) => person.memberId)
        )
      )
    )

  const held = new Set(current.map((row) => row.memberId))
  const added = people.filter(
    (person) => add.has(person.userId) && !held.has(person.memberId)
  )
  const removed = people.filter(
    (person) => remove.has(person.userId) && held.has(person.memberId)
  )

  if (removed.length > 0) {
    await writer.delete(groupMember).where(
      and(
        eq(groupMember.groupId, target.id),
        inArray(
          groupMember.memberId,
          removed.map((person) => person.memberId)
        )
      )
    )
  }

  if (added.length > 0) {
    await writer
      .insert(groupMember)
      .values(
        added.map((person) => ({
          groupId: target.id,
          memberId: person.memberId,
          organizationId,
          createdAt: new Date(),
        }))
      )
      .onConflictDoNothing()
  }

  return { ok: true, group: target, added, removed }
}

// Replaces every group one member is in and reports the difference, one group
// at a time, since each group's membership is what its audit event states.
export async function replaceMemberGroups(
  writer: AssignmentWriter,
  organizationId: string,
  userId: string,
  groupIds: string[]
): Promise<
  | {
      ok: true
      person: PersonStatement
      added: Statement[]
      removed: Statement[]
    }
  | Refusal
> {
  const wanted = [...new Set(groupIds)]

  const [person] = await writer
    .select({
      memberId: member.id,
      userId: member.userId,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId))
    )
    .limit(1)

  if (!person) return { ok: false, error: "notMember" }

  const owned = wanted.length
    ? await writer
        .select({ id: group.id, key: group.key, name: group.name })
        .from(group)
        .where(
          and(
            eq(group.organizationId, organizationId),
            inArray(group.id, wanted)
          )
        )
    : []

  if (owned.length !== wanted.length) {
    return { ok: false, error: "unknownGroup" }
  }

  const current = await writer
    .select({ id: group.id, key: group.key, name: group.name })
    .from(groupMember)
    .innerJoin(group, eq(group.id, groupMember.groupId))
    .where(
      and(
        eq(groupMember.memberId, person.memberId),
        eq(groupMember.organizationId, organizationId)
      )
    )

  const held = new Set(current.map((entry) => entry.id))
  const kept = new Set(wanted)
  const added = owned.filter((entry) => !held.has(entry.id))
  const removed = current.filter((entry) => !kept.has(entry.id))

  if (removed.length > 0) {
    await writer.delete(groupMember).where(
      and(
        eq(groupMember.memberId, person.memberId),
        eq(groupMember.organizationId, organizationId),
        inArray(
          groupMember.groupId,
          removed.map((entry) => entry.id)
        )
      )
    )
  }

  if (added.length > 0) {
    await writer
      .insert(groupMember)
      .values(
        added.map((entry) => ({
          groupId: entry.id,
          memberId: person.memberId,
          organizationId,
          createdAt: new Date(),
        }))
      )
      .onConflictDoNothing()
  }

  return { ok: true, person, added, removed }
}

// Replaces the roles one group grants and reports the difference, which is what
// the audit event states.
export async function replaceGroupRoles(
  writer: AssignmentWriter,
  organizationId: string,
  groupId: string,
  roleIds: string[]
): Promise<
  | { ok: true; group: Statement; added: Statement[]; removed: Statement[] }
  | Refusal
> {
  const wanted = [...new Set(roleIds)]
  const target = await groupIn(writer, organizationId, groupId)
  if (!target) return { ok: false, error: "unknownGroup" }

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
    .from(applicationRoleGroup)
    .innerJoin(
      applicationRole,
      eq(applicationRole.id, applicationRoleGroup.roleId)
    )
    .where(eq(applicationRoleGroup.groupId, target.id))

  const held = new Set(current.map((role) => role.id))
  const kept = new Set(wanted)
  const added = owned.filter((role) => !held.has(role.id))
  const removed = current.filter((role) => !kept.has(role.id))

  if (removed.length > 0) {
    await writer.delete(applicationRoleGroup).where(
      and(
        eq(applicationRoleGroup.groupId, target.id),
        inArray(
          applicationRoleGroup.roleId,
          removed.map((role) => role.id)
        )
      )
    )
  }

  if (added.length > 0) {
    await writer
      .insert(applicationRoleGroup)
      .values(
        added.map((role) => ({
          roleId: role.id,
          groupId: target.id,
          organizationId,
          createdAt: new Date(),
        }))
      )
      .onConflictDoNothing()
  }

  return { ok: true, group: target, added, removed }
}

export function describePeople(people: PersonStatement[]) {
  return people.map((person) => `${person.name} <${person.email}>`)
}

export function describeKeyed(subjects: Statement[]) {
  return subjects.map((subject) => subject.key)
}
