"use server"

import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  sql,
} from "drizzle-orm"
import { z } from "zod"

import { db } from "@/features/shared/lib/db/client"
import { oauthClient, usageDaily } from "@/features/shared/lib/db/schema"
import { authorizeOrganizationUsage } from "@/features/usage/lib/authorize-organization-usage"
import {
  computeEventMetrics,
  computeOrganizationSnapshots,
} from "@/features/usage/lib/compute-usage"
import { rollUpMissingDays } from "@/features/usage/lib/rollup"
import {
  USAGE_EVENT_METRICS,
  USAGE_PERIODS,
  type OrganizationUsage,
  type OrganizationUsageInput,
} from "@/features/usage/types"
import { addDays, periodBounds, utcDay } from "@/features/usage/utils/days"
import {
  liveTotals,
  summariseUsage,
} from "@/features/usage/utils/summarise-usage"

const inputSchema = z.object({
  organizationId: z.string().min(1),
  period: z.literal(USAGE_PERIODS),
})

const TOP_APPLICATIONS = 8

/**
 * One tenant's usage, for its own owners and admins. Root administration grants
 * nothing here, and root itself has no tenant usage: the instance's is its own
 * page. Every read is scoped by the membership's organization id.
 */
export async function getOrganizationUsage(
  input: OrganizationUsageInput
): Promise<OrganizationUsage> {
  const { organizationId: requested, period } = inputSchema.parse(input)
  const organizationId = await authorizeOrganizationUsage(requested)

  await rollUpMissingDays()
  const today = utcDay(new Date())
  const { currentFrom, previousFrom } = periodBounds(today, period)
  const scoped = eq(usageDaily.organizationId, organizationId)
  const instanceMarker = and(
    isNull(usageDaily.organizationId),
    isNull(usageDaily.subjectId),
    eq(usageDaily.metric, "sign_ins")
  )

  const [rows, markers, clientRows, live, snapshot, [previousDay]] =
    await Promise.all([
      db
        .select({
          day: usageDaily.day,
          metric: usageDaily.metric,
          value: usageDaily.value,
        })
        .from(usageDaily)
        .where(
          and(
            scoped,
            isNull(usageDaily.subjectId),
            inArray(usageDaily.metric, [...USAGE_EVENT_METRICS]),
            gte(usageDaily.day, previousFrom),
            lt(usageDaily.day, today)
          )
        ),
      db
        .select({ day: usageDaily.day })
        .from(usageDaily)
        .where(
          and(
            instanceMarker,
            gte(usageDaily.day, previousFrom),
            lt(usageDaily.day, today)
          )
        ),
      db
        .select({
          clientId: sql<string>`${usageDaily.subjectId}`,
          tokens: sql<number>`sum(${usageDaily.value})`.mapWith(Number),
        })
        .from(usageDaily)
        .where(
          and(
            scoped,
            eq(usageDaily.metric, "tokens_issued"),
            isNotNull(usageDaily.subjectId),
            gte(usageDaily.day, currentFrom),
            lt(usageDaily.day, today)
          )
        )
        .groupBy(usageDaily.subjectId),
      computeEventMetrics(db, {
        from: today,
        to: addDays(today, 1),
        organizationId,
      }),
      computeOrganizationSnapshots(db, organizationId),
      // The last end-of-day snapshot before the period began.
      db
        .select({ day: max(usageDaily.day) })
        .from(usageDaily)
        .where(
          and(
            scoped,
            eq(usageDaily.metric, "members"),
            lt(usageDaily.day, currentFrom)
          )
        ),
    ])

  const summary = summariseUsage({
    period,
    today,
    rows,
    rolledUp: new Set(markers.map((row) => row.day)),
    live: liveTotals(live, organizationId),
  })

  const previousSnapshot = previousDay?.day
    ? await db
        .select({ metric: usageDaily.metric, value: usageDaily.value })
        .from(usageDaily)
        .where(
          and(
            scoped,
            isNull(usageDaily.subjectId),
            eq(usageDaily.day, previousDay.day),
            inArray(usageDaily.metric, [
              "members",
              "members_with_second_factor",
            ])
          )
        )
    : []
  const previousMembers =
    previousSnapshot.find((row) => row.metric === "members")?.value ?? 0
  const previousWithSecondFactor =
    previousSnapshot.find((row) => row.metric === "members_with_second_factor")
      ?.value ?? 0

  // Today's tokens per client join the rolled-up days.
  const tokensByClient = new Map<string, number>()
  for (const row of clientRows) tokensByClient.set(row.clientId, row.tokens)
  for (const row of live) {
    if (row.metric !== "tokens_issued" || !row.subjectId) continue
    tokensByClient.set(
      row.subjectId,
      (tokensByClient.get(row.subjectId) ?? 0) + row.value
    )
  }
  const topClients = [...tokensByClient]
    .filter(([, tokens]) => tokens > 0)
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_APPLICATIONS)
  // Names are read live and only from this organization's own clients.
  const names =
    topClients.length > 0
      ? await db
          .select({ clientId: oauthClient.clientId, name: oauthClient.name })
          .from(oauthClient)
          .where(
            and(
              eq(oauthClient.referenceId, organizationId),
              inArray(
                oauthClient.clientId,
                topClients.map(([clientId]) => clientId)
              )
            )
          )
      : []
  const nameOf = new Map(names.map((row) => [row.clientId, row.name]))

  const current = (metric: string) =>
    snapshot.find((row) => row.metric === metric)?.value ?? 0

  return {
    period,
    ...summary,
    secondFactor: {
      members: current("members"),
      withSecondFactor: current("members_with_second_factor"),
      previousRate:
        previousMembers > 0 ? previousWithSecondFactor / previousMembers : null,
    },
    applications: topClients.map(([clientId, tokens]) => ({
      clientId,
      name: nameOf.get(clientId) ?? null,
      tokens,
    })),
  }
}
