"use server"

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
} from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { getAuditLogAccess } from "@/features/audit/actions/get-audit-log-access"
import { AUDIT_EVENTS_PAGE_SIZE } from "@/features/audit/lib/audit-log-search-params"
import {
  AUDIT_ACTIONS,
  AUDIT_OUTCOMES,
  type AuditEventFacet,
  type AuditEventsQuery,
  type AuditEventsResult,
  type AuditOutcome,
} from "@/features/audit/types"
import { toAuditEventDisplay } from "@/features/audit/utils/to-audit-event-display"
import { ForbiddenError } from "@/features/shared/lib/authorization-error"
import { db } from "@/features/shared/lib/db/client"
import { auditEvent, organization, user } from "@/features/shared/lib/db/schema"
import {
  clampPage,
  normalizeIds,
  normalizeLiterals,
  normalizePageSize,
  normalizeSearch,
} from "@/features/shared/lib/query"

const MAX_FACET_OPTIONS = 50

export async function listAuditEvents(
  query: AuditEventsQuery = {}
): Promise<AuditEventsResult> {
  const access = await getAuditLogAccess(query.organizationId)
  if (!access.canView) throw new ForbiddenError("You cannot view the audit log")

  const scopeFilters: (SQL | undefined)[] = []
  if (query.organizationId) {
    // Only this organization's own administrators reach here, so everything it
    // owns is readable and nothing else is.
    scopeFilters.push(eq(auditEvent.organizationId, query.organizationId))
  } else {
    // The instance log: everything the platform touched, and the root
    // organization's own activity.
    scopeFilters.push(
      or(
        eq(auditEvent.scope, "platform"),
        inArray(
          auditEvent.organizationId,
          db
            .select({ id: organization.id })
            .from(organization)
            .where(eq(organization.isRoot, true))
        )
      )
    )
  }

  const search = normalizeSearch(query.search)
  const actions = normalizeLiterals(query.actions, AUDIT_ACTIONS)
  const outcomes = normalizeLiterals(query.outcomes, AUDIT_OUTCOMES)
  const pageSize = normalizePageSize(query.pageSize, AUDIT_EVENTS_PAGE_SIZE)
  const actorIds = normalizeIds(query.actorIds, MAX_FACET_OPTIONS)
  // Scoping still applies on top, so an unknown id can only ever narrow.
  const organizationIds = normalizeIds(query.organizationIds, MAX_FACET_OPTIONS)

  // An actor who used another organization's authority acted as the platform.
  // To anyone but a root administrator they are the platform and not a person,
  // so their identity is never returned, listed, or searched.
  const namesRootActors = access.isRootAdministrator
  const actorIsOwnOrganization = or(
    isNull(auditEvent.actorOrganizationId),
    eq(auditEvent.actorOrganizationId, auditEvent.organizationId)
  )
  const actorSearch = or(
    ilike(auditEvent.actorName, `%${search}%`),
    ilike(auditEvent.actorEmail, `%${search}%`)
  )

  // Searching the recorded labels rather than the joined rows keeps the count
  // and facet queries join-free, and matches what the log actually says.
  const searchFilter = search
    ? or(
        ilike(auditEvent.action, `%${search}%`),
        namesRootActors
          ? actorSearch
          : and(actorIsOwnOrganization, actorSearch),
        ilike(auditEvent.organizationName, `%${search}%`),
        ilike(auditEvent.organizationSlug, `%${search}%`),
        ilike(auditEvent.targetLabel, `%${search}%`),
        ilike(auditEvent.reason, `%${search}%`)
      )
    : undefined
  const baseFilter = and(...scopeFilters, searchFilter)
  const resultFilter = and(
    baseFilter,
    actions.length ? inArray(auditEvent.action, actions) : undefined,
    outcomes.length ? inArray(auditEvent.outcome, outcomes) : undefined,
    actorIds.length ? inArray(auditEvent.actorUserId, actorIds) : undefined,
    organizationIds.length
      ? inArray(auditEvent.organizationId, organizationIds)
      : undefined
  )

  const [[totalResult], actionFacets, outcomeFacets, actorFacets] =
    await Promise.all([
      db.select({ count: count() }).from(auditEvent).where(resultFilter),
      db
        .select({ action: auditEvent.action, count: count() })
        .from(auditEvent)
        .where(baseFilter)
        .groupBy(auditEvent.action),
      db
        .select({ outcome: auditEvent.outcome, count: count() })
        .from(auditEvent)
        .where(baseFilter)
        .groupBy(auditEvent.outcome),
      db
        .select({
          value: user.id,
          label: user.name,
          description: user.email,
          image: user.image,
          count: count(),
        })
        .from(auditEvent)
        .innerJoin(user, eq(user.id, auditEvent.actorUserId))
        .where(
          namesRootActors ? baseFilter : and(baseFilter, actorIsOwnOrganization)
        )
        .groupBy(user.id, user.name, user.email, user.image)
        .orderBy(desc(count()), asc(user.name))
        .limit(MAX_FACET_OPTIONS),
    ])

  // A single-organization scope has nothing to choose between.
  const organizationFacets: AuditEventFacet[] = query.organizationId
    ? []
    : await db
        .select({
          value: organization.id,
          label: organization.name,
          description: organization.slug,
          image: organization.logo,
          count: count(),
        })
        .from(auditEvent)
        .innerJoin(organization, eq(organization.id, auditEvent.organizationId))
        .where(baseFilter)
        .groupBy(
          organization.id,
          organization.name,
          organization.slug,
          organization.logo
        )
        .orderBy(desc(count()), asc(organization.name))
        .limit(MAX_FACET_OPTIONS)
  const total = totalResult.count
  const page = clampPage(query.page ?? 1, total, pageSize)

  const actorOrganization = alias(organization, "actor_organization")
  const rows = await db
    .select({
      id: auditEvent.id,
      createdAt: auditEvent.createdAt,
      action: auditEvent.action,
      outcome: auditEvent.outcome,
      actorType: auditEvent.actorType,
      actorUserId: auditEvent.actorUserId,
      recordedActorName: auditEvent.actorName,
      recordedActorEmail: auditEvent.actorEmail,
      actorName: user.name,
      actorEmail: user.email,
      actorImage: user.image,
      actorOrganizationId: auditEvent.actorOrganizationId,
      actorOrganizationIsRoot: actorOrganization.isRoot,
      organizationId: auditEvent.organizationId,
      recordedOrganizationName: auditEvent.organizationName,
      recordedOrganizationSlug: auditEvent.organizationSlug,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      organizationLogo: organization.logo,
      organizationIsRoot: organization.isRoot,
      targetType: auditEvent.targetType,
      targetId: auditEvent.targetId,
      targetLabel: auditEvent.targetLabel,
      reason: auditEvent.reason,
      metadata: auditEvent.metadata,
      ipAddress: auditEvent.ipAddress,
      userAgent: auditEvent.userAgent,
    })
    .from(auditEvent)
    .leftJoin(user, eq(user.id, auditEvent.actorUserId))
    .leftJoin(organization, eq(organization.id, auditEvent.organizationId))
    .leftJoin(
      actorOrganization,
      eq(actorOrganization.id, auditEvent.actorOrganizationId)
    )
    .where(resultFilter)
    .orderBy(
      ...(query.direction === "asc"
        ? [asc(auditEvent.createdAt), asc(auditEvent.id)]
        : [desc(auditEvent.createdAt), desc(auditEvent.id)])
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const outcomeCounts: Record<AuditOutcome, number> = {
    success: 0,
    failure: 0,
    denied: 0,
  }
  for (const facet of outcomeFacets) outcomeCounts[facet.outcome] = facet.count

  return {
    events: rows.map((row) => toAuditEventDisplay(row, { namesRootActors })),
    total,
    page,
    pageSize,
    actionCounts: Object.fromEntries(
      actionFacets.map((facet) => [facet.action, facet.count])
    ),
    outcomeCounts,
    actorFacets,
    organizationFacets,
  }
}
