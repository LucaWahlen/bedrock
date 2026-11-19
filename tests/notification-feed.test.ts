import { afterAll, expect, test } from "bun:test"

import { eq, inArray, sql } from "drizzle-orm"

import {
  listNotifications,
  markAllNotificationsRead,
} from "@/features/notifications"
import { db } from "@/features/shared/lib/db/client"
import { notification, organization } from "@/features/shared/lib/db/schema"
import { createFixture } from "@/tests/support/fixtures"
import { actAs } from "@/tests/support/request"

const fixture = await createFixture("notification-feed")
afterAll(() => fixture.cleanup())

test("unread filtering precedes the limit and counts only the viewer's visible inbox", async () => {
  const { alice, bob } = fixture
  const newer = new Date("2026-04-02T00:00:00Z")
  const older = new Date("2026-04-01T00:00:00Z")
  const row = { topic: "security", kind: "password_changed", userId: alice.id }
  const unreadId = crypto.randomUUID()
  await db.insert(notification).values([
    ...Array.from({ length: 60 }, () => ({
      ...row,
      id: crypto.randomUUID(),
      createdAt: newer,
      readAt: newer,
    })),
    { ...row, id: unreadId, createdAt: older },
    { ...row, id: crypto.randomUUID(), userId: bob.id, createdAt: newer },
  ])
  await actAs(alice)
  const result = await listNotifications({ filter: "unread" })
  if (!result.success) throw new Error(result.error)
  expect(result.data.notifications.map((item) => item.id)).toEqual([unreadId])
  expect(result.data).toMatchObject({
    unreadCount: 1,
    nextCursor: null,
  })
})

test("cursor preserves tied timestamp precision after the boundary row is removed", async () => {
  const { bob } = fixture
  const person = await fixture.createUser("paging")
  const ids = Array.from({ length: 53 }, () => crypto.randomUUID())
    .toSorted()
    .toReversed()
  const row = { topic: "security", kind: "password_changed", userId: person.id }
  await db.insert(notification).values(
    ids.map((id) => ({
      ...row,
      id,
      createdAt: sql`timestamp '2026-04-02 12:00:00.123456'`,
    }))
  )
  await actAs(person)
  const first = await listNotifications({ filter: "unread" })
  if (!first.success || !first.data.nextCursor)
    throw new Error("Missing first page")
  const firstIds = first.data.notifications.map((item) => item.id)
  expect(firstIds).toEqual(ids.slice(0, firstIds.length))
  const cursor = first.data.nextCursor
  await db.delete(notification).where(eq(notification.id, cursor.id))
  await db.insert(notification).values({
    ...row,
    id: crypto.randomUUID(),
    createdAt: new Date("2026-04-03T00:00:00Z"),
  })
  const next = await listNotifications({ filter: "unread", cursor })
  if (!next.success) throw new Error(next.error)
  expect(next.data.notifications.map((item) => item.id)).toEqual(
    ids.slice(firstIds.length)
  )
  expect(next.data.nextCursor).toBeNull()
  expect(next.data.unreadCount).toBe(53)
  await actAs(bob)
  const foreign = await listNotifications({ cursor })
  expect(foreign.success).toBe(false)
})

test("mark all refuses signed-out callers without changing read state", async () => {
  const id = crypto.randomUUID()
  await db.insert(notification).values({
    id,
    topic: "security",
    kind: "password_changed",
    userId: fixture.carol.id,
  })
  await actAs(null)
  expect((await markAllNotificationsRead()).success).toBe(false)
  const [row] = await db
    .select()
    .from(notification)
    .where(eq(notification.id, id))
  expect(row?.readAt).toBeNull()
})

test("mark all reads the entire visible inbox and preserves other read states", async () => {
  const viewer = await fixture.createUser("bulk-read")
  await db
    .update(organization)
    .set({ status: "deleted", deletedAt: new Date() })
    .where(eq(organization.id, fixture.orgB.id))
  const base = {
    topic: "security",
    kind: "password_changed",
    userId: viewer.id,
  }
  const priorRead = {
    ...base,
    id: crypto.randomUUID(),
    readAt: new Date("2026-03-01T12:00:00Z"),
  }
  const untouched = [
    { ...base, id: crypto.randomUUID(), organizationId: fixture.orgB.id },
    { ...base, id: crypto.randomUUID(), kind: "unknown" },
    { ...base, id: crypto.randomUUID(), userId: fixture.bob.id },
  ]
  const visible = [
    ...Array.from({ length: 50 }, () => ({ ...base, id: crypto.randomUUID() })),
    // Lack of membership disables the destination, not the notice itself.
    {
      ...base,
      id: crypto.randomUUID(),
      organizationId: fixture.orgA.id,
      createdAt: new Date("2020-01-01T00:00:00Z"),
    },
  ]
  await db.insert(notification).values([...visible, ...untouched, priorRead])
  await actAs(viewer)
  const before = await listNotifications({ filter: "unread" })
  if (!before.success) throw new Error(before.error)
  expect(before.data.unreadCount).toBe(visible.length)
  expect(before.data.nextCursor).not.toBeNull()

  expect(await markAllNotificationsRead()).toEqual({ success: true })
  const rows = await db
    .select({ id: notification.id, readAt: notification.readAt })
    .from(notification)
    .where(
      inArray(
        notification.id,
        [...visible, ...untouched, priorRead].map((row) => row.id)
      )
    )
  const readDates = new Map(rows.map((row) => [row.id, row.readAt]))
  for (const { id } of visible) expect(readDates.get(id)).toBeInstanceOf(Date)
  for (const { id } of untouched) expect(readDates.get(id)).toBeNull()
  expect(readDates.get(priorRead.id)).toEqual(priorRead.readAt)
})
