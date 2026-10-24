import { and, eq, isNull, ne, sql } from "drizzle-orm"

import { recordAuditEvent, type AuditActor } from "@/features/audit"
import { memberHasRole } from "@/features/auth"
import type { OwnedOrganization } from "@/features/organizations/types"
import type { db } from "@/features/shared/lib/db/client"
import {
  member,
  oauthAccessToken,
  oauthConsent,
  oauthRefreshToken,
  organization,
  session,
  user,
} from "@/features/shared/lib/db/schema"

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type StandingTarget = { id: string; name: string; email: string }

export type AccountStandingChange =
  | {
      ok: true
      target: StandingTarget
      soleOwnedOrganizations: OwnedOrganization[]
    }
  | { ok: false; error: string; target: StandingTarget | null }

// Owners of this organization other than the account in question who can still
// sign in. Correlated on the outer `member` row.
function otherActiveOwners(userId: string) {
  return sql`exists (
    select 1 from ${member} as other
    join ${user} as other_user on other_user.id = other.user_id
    where other.organization_id = ${member.organizationId}
      and other.user_id <> ${userId}
      and other.role ~ '(^|,)owner(,|$)'
      and other_user.disabled_at is null
  )`
}

// The tenants this account is the only active owner of. Disabling it would
// leave them with nobody able to administer them, which is allowed, because it
// is undone by enabling the account, but never done silently.
export async function findSoleActiveOwnerships(
  reader: Pick<typeof db, "select">,
  userId: string
): Promise<OwnedOrganization[]> {
  return reader
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(
      and(
        eq(member.userId, userId),
        memberHasRole(member.role, "owner"),
        eq(organization.isRoot, false),
        ne(organization.status, "deleted"),
        sql`not ${otherActiveOwners(userId)}`
      )
    )
    .orderBy(organization.name)
}

// Whether the account is a root owner with no other root owner able to sign in.
// Root must always keep one, or nothing in the product could administer it.
export async function isFinalActiveRootOwner(
  reader: Pick<typeof db, "select">,
  userId: string
) {
  const [row] = await reader
    .select({ hasOthers: otherActiveOwners(userId).mapWith(Boolean) })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(
      and(
        eq(member.userId, userId),
        eq(organization.isRoot, true),
        memberHasRole(member.role, "owner")
      )
    )
    .limit(1)

  return row ? !row.hasOthers : false
}

export async function isRootOwner(
  reader: Pick<typeof db, "select">,
  userId: string
) {
  const [row] = await reader
    .select({ id: member.id })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(
      and(
        eq(member.userId, userId),
        eq(organization.isRoot, true),
        memberHasRole(member.role, "owner")
      )
    )
    .limit(1)

  return Boolean(row)
}

// Not an action: the web action and `bun run admin` each authorize first, then
// hand over their own transaction, so the change and its audit event commit
// together or not at all.
//
// The root organization's row is locked first, which serializes every standing
// change on the instance. Two administrators disabling the last two root owners
// at once would otherwise both see the other still active.
export async function changeAccountStanding(
  tx: Transaction,
  {
    userId,
    disable,
    actor,
    disabledBy,
    metadata,
  }: {
    userId: string
    // A reason disables; null enables.
    disable: { reason: string } | null
    actor: AuditActor
    // The administrator's id, as a plain column like an audit reference.
    disabledBy: string | null
    // Recorded on the audit event alongside the statement of who it was.
    metadata?: Record<string, unknown>
  }
): Promise<AccountStandingChange> {
  await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.isRoot, true))
    .for("update")

  const [target] = await tx
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      disabledAt: user.disabledAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .for("update")
  if (!target) {
    return { ok: false, error: "That user no longer exists", target: null }
  }

  const statement = { id: target.id, name: target.name, email: target.email }

  if (!disable) {
    if (!target.disabledAt) {
      return {
        ok: false,
        error: "This account is not disabled",
        target: statement,
      }
    }

    await tx
      .update(user)
      .set({ disabledAt: null, disabledReason: null, disabledBy: null })
      .where(eq(user.id, userId))
    await recordAuditEvent(
      {
        action: "user.enabled",
        actor,
        target: { type: "user", id: target.id, label: target.name },
        metadata: { ...metadata, name: target.name, email: target.email },
      },
      tx
    )

    return { ok: true, target: statement, soleOwnedOrganizations: [] }
  }

  if (target.disabledAt) {
    return {
      ok: false,
      error: "This account is already disabled",
      target: statement,
    }
  }

  if (await isFinalActiveRootOwner(tx, userId)) {
    return {
      ok: false,
      error:
        "The last active owner of the root organization cannot be disabled",
      target: statement,
    }
  }

  const soleOwnedOrganizations = await findSoleActiveOwnerships(tx, userId)

  await tx
    .update(user)
    .set({
      disabledAt: new Date(),
      disabledReason: disable.reason,
      disabledBy,
    })
    .where(and(eq(user.id, userId), isNull(user.disabledAt)))

  // Everything the account could still act with goes in the same transaction:
  // its browser sessions, and every token and consent an application holds.
  await tx.delete(oauthAccessToken).where(eq(oauthAccessToken.userId, userId))
  await tx.delete(oauthRefreshToken).where(eq(oauthRefreshToken.userId, userId))
  await tx.delete(oauthConsent).where(eq(oauthConsent.userId, userId))
  await tx.delete(session).where(eq(session.userId, userId))

  await recordAuditEvent(
    {
      action: "user.disabled",
      actor,
      target: { type: "user", id: target.id, label: target.name },
      reason: disable.reason,
      metadata: {
        ...metadata,
        name: target.name,
        email: target.email,
        ...(soleOwnedOrganizations.length > 0 && {
          soleOwnerOf: soleOwnedOrganizations.map((owned) => ({
            id: owned.id,
            name: owned.name,
            slug: owned.slug,
          })),
        }),
      },
    },
    tx
  )

  return { ok: true, target: statement, soleOwnedOrganizations }
}
