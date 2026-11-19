import { afterAll, afterEach, describe, expect, test } from "bun:test"

import { eq } from "drizzle-orm"

import { changePassword } from "@/features/account/actions/change-password"
import { confirmTwoFactorEnrollment } from "@/features/account/actions/confirm-two-factor-enrollment"
import { startTwoFactorEnrollment } from "@/features/account/actions/start-two-factor-enrollment"
import { login } from "@/features/auth/actions/login"
import { signUp } from "@/features/auth/actions/sign-up"
import { sendResetPasswordMail } from "@/features/auth/lib/auth-emails"
import {
  getNotificationPreferences,
  listNotifications,
  markNotificationRead,
  resetOrganizationNotificationPreferences,
  sendAccountDisabledNotice,
  updateNotificationPreference,
} from "@/features/notifications"
import { findOrganizationAdminRecipients } from "@/features/notifications/actions/find-organization-admin-recipients"
import { deliveryAuthority } from "@/features/notifications/lib/delivery-authority"
import { preferenceCategory } from "@/features/notifications/utils/preference-category"
import { acceptInvitation } from "@/features/organizations/actions/accept-invitation"
import { addMembers } from "@/features/organizations/actions/add-members"
import { inviteMember } from "@/features/organizations/actions/invite-member"
import { joinOrganization } from "@/features/organizations/actions/join-organization"
import { removeMember } from "@/features/organizations/actions/remove-member"
import { setMemberRole } from "@/features/organizations/actions/set-member-role"
import { startBreakGlass } from "@/features/organizations/actions/start-break-glass"
import { createInvitationToken } from "@/features/organizations/lib/invitations"
import { db } from "@/features/shared/lib/db/client"
import {
  invitation,
  member,
  notification,
  notificationPreference,
  organization,
  passkey,
} from "@/features/shared/lib/db/schema"
import type { EmailMessage } from "@/features/shared/lib/email/types"
import { housekeepNotifications } from "@/scripts/housekeeping/notifications"
import { givePassword, totpFor } from "@/tests/support/credentials"
import { createFixture, type FixtureUser } from "@/tests/support/fixtures"
import { outbox } from "@/tests/support/mail"
import {
  actAs,
  browse,
  discardDeferred,
  forgetSessions,
  runDeferred,
  setRequestHeader,
} from "@/tests/support/request"

const PASSWORD = "correct horse battery staple"
const NEW_PASSWORD = "another horse, a different staple"
const FIREFOX_ON_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"

const fixture = await createFixture("notification-prefs")
const { root, rootOwner, orgA, orgB, alice, bob } = fixture

const realFetch = globalThis.fetch

function stubBreachLookup() {
  globalThis.fetch = Object.assign(
    () => Promise.resolve(new Response("", { status: 200 })),
    { preconnect: realFetch.preconnect }
  ) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
  discardDeferred()
})

afterAll(() => fixture.cleanup())

async function runWithNotices<T>(run: () => Promise<T>) {
  discardDeferred()
  const start = outbox.length
  const result = await run()
  await runDeferred()

  return { result, mails: outbox.slice(start) }
}

function mailsTo(mails: EmailMessage[], address: string) {
  return mails.filter((mail) => mail.to.address === address)
}

async function feedFor(person: FixtureUser) {
  await actAs(person)
  const result = await listNotifications()
  expect(result.success).toBe(true)
  if (!result.success) throw new Error(result.error)
  return result.data
}

async function createEnrolledRootOwner(label: string) {
  const admin = await fixture.createUser(label)
  await givePassword(admin.id, PASSWORD)
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: fixture.root.id,
    userId: admin.id,
    role: "owner",
    createdAt: new Date(),
  })

  await actAs(admin)
  const started = await startTwoFactorEnrollment({ currentPassword: PASSWORD })
  if (!started.success) throw new Error(started.error)
  const confirmed = await confirmTwoFactorEnrollment({
    code: await totpFor(started.data.secret),
  })
  if (!confirmed.success) throw new Error(confirmed.error)
  forgetSessions([admin.id])
  await runDeferred()
  await db.delete(notification).where(eq(notification.userId, admin.id))

  return admin
}

describe("notification preferences and mandatory channels", () => {
  test("admin activity requires the tenant's factor and trusted delivery context", async () => {
    const target = { organizationId: orgB.id }
    await expect(
      findOrganizationAdminRecipients(Symbol(), target)
    ).rejects.toThrow("access")
    await db
      .update(organization)
      .set({ requireTwoFactor: true })
      .where(eq(organization.id, orgB.id))
    try {
      const recipients = async () =>
        (
          await findOrganizationAdminRecipients(deliveryAuthority, target)
        ).recipients.map(({ id }) => id)
      expect(await recipients()).not.toContain(bob.id)
      const keyId = crypto.randomUUID()
      await db.insert(passkey).values({
        id: keyId,
        credentialID: keyId,
        userId: bob.id,
        publicKey: "test",
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
      })
      try {
        expect(await recipients()).toContain(bob.id)
      } finally {
        await db.delete(passkey).where(eq(passkey.id, keyId))
      }
    } finally {
      await db
        .update(organization)
        .set({ requireTwoFactor: false })
        .where(eq(organization.id, orgB.id))
    }
  })

  test("anonymous callers are refused across inbox and preference actions", async () => {
    await actAs(null)

    expect((await listNotifications()).success).toBe(false)
    expect((await getNotificationPreferences()).success).toBe(false)
    expect(
      (
        await updateNotificationPreference({
          kinds: ["new_sign_in"],
          channel: "email",
          enabled: false,
        })
      ).success
    ).toBe(false)
    expect((await markNotificationRead({ id: "any" })).success).toBe(false)
    expect(
      (await resetOrganizationNotificationPreferences(orgA.id)).success
    ).toBe(false)
    expect((await resetOrganizationNotificationPreferences(null)).success).toBe(
      false
    )
  })

  test("defaults enable standard kinds, leave join/leave/sign-up emails off, and lock security and break-glass emails", async () => {
    const person = await fixture.createUser("defaults")
    await actAs(person)

    const result = await getNotificationPreferences()
    expect(result.success).toBe(true)
    if (!result.success) return

    const byKind = new Map(result.data.global.map((item) => [item.kind, item]))
    expect(byKind.get("password_changed")).toEqual({
      kind: "password_changed",
      inApp: true,
      email: true,
      inAppCustom: false,
      emailCustom: false,
      emailLocked: true,
    })
    expect(byKind.get("new_sign_in")).toEqual({
      kind: "new_sign_in",
      inApp: true,
      email: true,
      inAppCustom: false,
      emailCustom: false,
      emailLocked: false,
    })
    expect(byKind.get("member_joined")).toEqual({
      kind: "member_joined",
      inApp: true,
      email: false,
      inAppCustom: false,
      emailCustom: false,
      emailLocked: false,
    })
    expect(byKind.get("break_glass_started")).toEqual({
      kind: "break_glass_started",
      inApp: true,
      email: true,
      inAppCustom: false,
      emailCustom: false,
      emailLocked: true,
    })
    expect(result.data.overrides).toEqual({})
  })

  test("turning off locked security or break-glass emails is refused by the action and database", async () => {
    const person = await fixture.createUser("locked-check")
    await actAs(person)

    for (const kind of ["password_changed", "break_glass_started"] as const) {
      const english = await updateNotificationPreference({
        kinds: [kind],
        channel: "email",
        enabled: false,
      })
      expect(english).toEqual({
        success: false,
        error: "Critical security emails cannot be turned off",
      })
    }

    await actAs(person)
    setRequestHeader("accept-language", "de")
    const german = await updateNotificationPreference({
      kinds: ["password_changed"],
      channel: "email",
      enabled: false,
    })
    expect(german).toEqual({
      success: false,
      error: "Wichtige Sicherheits-E-Mails können nicht deaktiviert werden",
    })

    // Even bypassing the action is rejected by the Postgres check constraint.
    let dbRejected = false
    try {
      await db.insert(notificationPreference).values({
        id: crypto.randomUUID(),
        userId: person.id,
        kind: "password_changed",
        email: false,
        inApp: true,
      })
    } catch {
      dbRejected = true
    }
    expect(dbRejected).toBe(true)
  })

  test("granular per-kind toggles apply independently without affecting sibling kinds or other accounts", async () => {
    const quietMember = await fixture.createUser("quiet-member")
    const normalMember = await fixture.createUser("normal-member")

    // `quietMember` mutes ONLY `member_added` email, leaving `member_role_changed` email ON!
    await actAs(quietMember)
    expect(
      await updateNotificationPreference({
        kinds: ["member_added"],
        channel: "email",
        enabled: false,
      })
    ).toEqual({ success: true })

    await actAs(alice)
    const { mails } = await runWithNotices(() =>
      addMembers(orgA.id, [quietMember.id, normalMember.id], "member")
    )

    expect(mailsTo(mails, quietMember.email)).toHaveLength(0)
    expect(mailsTo(mails, normalMember.email)).toHaveLength(1)

    const quietFeed = await feedFor(quietMember)
    expect(quietFeed.unreadCount).toBe(1)
    expect(quietFeed.notifications[0]).toMatchObject({
      topic: "membership",
      kind: "member_added",
      link: { type: "organization", slug: orgA.slug, path: "" },
      organization: { id: orgA.id, name: orgA.name },
    })

    // `member_role_changed` was NOT muted, so changing `quietMember`'s role STILL sends email!
    await actAs(alice)
    const roleChange = await runWithNotices(() =>
      setMemberRole(orgA.id, quietMember.id, "admin")
    )
    expect(mailsTo(roleChange.mails, quietMember.email)).toHaveLength(1)

    // Batch-toggling the whole membership category off for `inApp` suppresses subsequent inbox items.
    await actAs(quietMember)
    expect(
      await updateNotificationPreference({
        kinds: ["member_added", "member_role_changed", "member_removed"],
        channel: "inApp",
        enabled: false,
      })
    ).toEqual({ success: true })

    await actAs(alice)
    await runWithNotices(() => setMemberRole(orgA.id, quietMember.id, "member"))
    expect((await feedFor(quietMember)).notifications).toHaveLength(2)
  })

  test("disabling security or break-glass in-app suppresses only the inbox while keeping mandatory emails", async () => {
    stubBreachLookup()
    const owner = await fixture.createUser("sec-owner")
    await givePassword(owner.id, PASSWORD)
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: orgB.id,
      userId: owner.id,
      role: "owner",
      createdAt: new Date(),
    })

    await actAs(owner)
    await updateNotificationPreference({
      kinds: ["password_changed"],
      channel: "inApp",
      enabled: false,
    })
    await updateNotificationPreference({
      kinds: ["break_glass_started"],
      channel: "inApp",
      enabled: false,
    })

    const pwChange = await runWithNotices(() =>
      changePassword({
        currentPassword: PASSWORD,
        password: NEW_PASSWORD,
        revokeOtherSessions: false,
      })
    )
    expect(pwChange.result).toEqual({ success: true })
    expect(mailsTo(pwChange.mails, owner.email)).toHaveLength(1)
    expect((await feedFor(owner)).notifications).toHaveLength(0)

    const rootAdmin = await createEnrolledRootOwner("bg-admin")
    await actAs(rootAdmin)
    const bg = await runWithNotices(() =>
      startBreakGlass({
        organizationId: orgB.id,
        reason: "Investigating owner lockout in tenant B",
      })
    )
    expect(bg.result.success).toBe(true)
    // Mandatory break-glass email still reaches both `owner` and `bob`.
    expect(mailsTo(bg.mails, owner.email)).toHaveLength(1)
    expect(mailsTo(bg.mails, bob.email)).toHaveLength(1)
    // `owner` turned break_glass in-app off; `bob` kept the default (on).
    expect((await feedFor(owner)).notifications).toHaveLength(0)
    const bobFeed = await feedFor(bob)
    expect(
      bobFeed.notifications.some((n) => n.kind === "break_glass_started")
    ).toBe(true)
  })

  test("sign-in and invitation-accepted preferences control their channels while transactional mail always sends", async () => {
    const person = await fixture.createUser("signin-prefs", {
      // Older than 90 days with no sign-in history so an unrecognized browser triggers a notice.
      createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
    })
    await givePassword(person.id, PASSWORD)
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: orgA.id,
      userId: person.id,
      role: "admin",
      createdAt: new Date(),
    })

    await actAs(person)
    await updateNotificationPreference({
      kinds: ["new_sign_in"],
      channel: "email",
      enabled: false,
    })
    await updateNotificationPreference({
      kinds: ["invitation_accepted"],
      channel: "email",
      enabled: false,
    })

    browse()
    setRequestHeader("user-agent", FIREFOX_ON_LINUX)
    const signIn = await runWithNotices(() =>
      login({ email: person.email, password: PASSWORD }, orgA.slug)
    )
    expect(signIn.result.success).toBe(true)
    expect(mailsTo(signIn.mails, person.email)).toHaveLength(0)

    const afterLoginFeed = await feedFor(person)
    expect(afterLoginFeed.notifications[0]).toMatchObject({
      topic: "sign_in",
      kind: "new_sign_in",
      link: { type: "account", section: "sessions" },
    })

    // Invitation accepted: inviter (`person`) suppressed email, keeps in-app.
    const invitee = await fixture.createUser("accepted-invitee")
    const { token, tokenHash } = createInvitationToken()
    const now = new Date()
    await db.insert(invitation).values({
      id: crypto.randomUUID(),
      organizationId: orgA.id,
      email: invitee.email,
      role: "member",
      expiresAt: new Date(now.getTime() + 3600_000),
      createdAt: now,
      lastSentAt: now,
      inviterId: person.id,
      tokenHash,
    })

    await actAs(invitee)
    const accepted = await runWithNotices(() => acceptInvitation(token))
    expect(accepted.result.success).toBe(true)
    expect(mailsTo(accepted.mails, person.email)).toHaveLength(0)
    const afterAcceptFeed = await feedFor(person)
    expect(
      afterAcceptFeed.notifications.some(
        (item) => item.kind === "invitation_accepted"
      )
    ).toBe(true)

    // Password reset, invitation token mail, and account-disabled notice still send mail.
    const start = outbox.length
    await sendResetPasswordMail({
      user: { name: person.name, email: person.email },
      url: `http://localhost:3000/api/auth/reset-password/tok?callbackURL=/org/${orgA.slug}/reset-password`,
      token: "reset-tok",
    })
    await sendAccountDisabledNotice({
      recipient: { id: person.id, name: person.name, email: person.email },
      reason: "Policy check",
    })
    await actAs(alice)
    await inviteMember({
      organizationId: orgA.id,
      email: `fresh-${fixture.suffix}@example.test`,
      role: "member",
    })
    const transactional = outbox.slice(start)
    expect(mailsTo(transactional, person.email)).toHaveLength(2)
    expect(
      mailsTo(transactional, `fresh-${fixture.suffix}@example.test`)
    ).toHaveLength(1)
  })
})

describe("inbox isolation, organization concealment, and housekeeping", () => {
  test("accounts can only change the read status of their own notifications", async () => {
    const userOne = await fixture.createUser("inbox-one")
    const userTwo = await fixture.createUser("inbox-two")

    await actAs(alice)
    await runWithNotices(() =>
      addMembers(orgA.id, [userOne.id, userTwo.id], "member")
    )

    const oneInitial = await feedFor(userOne)
    const twoInitial = await feedFor(userTwo)
    expect(oneInitial.notifications).toHaveLength(1)
    expect(twoInitial.notifications).toHaveLength(1)
    const twoNotificationId = twoInitial.notifications[0]!.id

    // Trying to mark another account's notification touches nothing.
    await actAs(userOne)
    await markNotificationRead({ id: twoNotificationId, read: true })

    const twoAfterCrossAttempt = await feedFor(userTwo)
    expect(twoAfterCrossAttempt.unreadCount).toBe(1)
    expect(twoAfterCrossAttempt.notifications[0]?.readAt).toBeNull()

    await actAs(userTwo)
    await markNotificationRead({ id: twoNotificationId, read: true })
    expect((await feedFor(userTwo)).unreadCount).toBe(0)

    await actAs(userTwo)
    await markNotificationRead({ id: twoNotificationId, read: false })
    expect((await feedFor(userTwo)).unreadCount).toBe(1)

    expect((await feedFor(userTwo)).notifications[0]?.id).toBe(
      twoNotificationId
    )
    // `userOne`'s unread notification is untouched.
    expect((await feedFor(userOne)).unreadCount).toBe(1)
  })

  test("member removal strips organization links, and deleted organizations disappear from the inbox", async () => {
    const tempOrgId = `test-notif-org-${fixture.suffix}`
    fixture.trackOrganization(tempOrgId)
    await db.insert(organization).values({
      id: tempOrgId,
      name: `Temp Org ${fixture.suffix}`,
      slug: `temp-org-${fixture.suffix}`,
      createdAt: new Date(),
      status: "active",
    })
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: tempOrgId,
      userId: alice.id,
      role: "owner",
      createdAt: new Date(),
    })

    const target = await fixture.createUser("org-lifecycle")
    await actAs(alice)
    await runWithNotices(() => addMembers(tempOrgId, [target.id], "member"))

    let feed = await feedFor(target)
    expect(feed.notifications).toHaveLength(1)
    expect(feed.notifications[0]?.link).toEqual({
      type: "organization",
      slug: `temp-org-${fixture.suffix}`,
      path: "",
    })

    // Suspended organization: notification stays readable, link is stripped.
    await db
      .update(organization)
      .set({ status: "suspended" })
      .where(eq(organization.id, tempOrgId))
    feed = await feedFor(target)
    expect(feed.notifications).toHaveLength(1)
    expect(feed.notifications[0]?.link).toBeNull()

    // Soft-deleted organization: hidden completely from notifications and unread count.
    await db
      .update(organization)
      .set({ status: "deleted", deletedAt: new Date() })
      .where(eq(organization.id, tempOrgId))
    feed = await feedFor(target)
    expect(feed.notifications).toHaveLength(0)
    expect(feed.unreadCount).toBe(0)

    // Restored organization: visible again, and removing the member drops the link on prior notices.
    await db
      .update(organization)
      .set({ status: "active", deletedAt: null })
      .where(eq(organization.id, tempOrgId))
    await actAs(alice)
    await runWithNotices(() => removeMember(tempOrgId, target.id))

    feed = await feedFor(target)
    expect(feed.notifications).toHaveLength(2)
    expect(feed.notifications.every((item) => item.link === null)).toBe(true)
  })

  test("housekeeping prunes notifications older than 90 days and keeps newer ones", async () => {
    const person = await fixture.createUser("retention")
    const oldId = crypto.randomUUID()
    const recentId = crypto.randomUUID()

    await db.insert(notification).values([
      {
        id: oldId,
        userId: person.id,
        topic: "security",
        kind: "backup_codes_regenerated",
        payload: {},
        createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
      },
      {
        id: recentId,
        userId: person.id,
        topic: "security",
        kind: "backup_codes_regenerated",
        payload: {},
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    ])

    const pruned = await housekeepNotifications()
    expect(pruned.deleted).toBeGreaterThanOrEqual(1)

    const remaining = await feedFor(person)
    expect(remaining.notifications.map((n) => n.id)).toEqual([recentId])
  })
})

describe("per-organization overrides and member activity notices", () => {
  test("per-organization overrides supersede global defaults, changing global clears org exceptions, and global/org resets restore defaults", async () => {
    const multiAdmin = await fixture.createUser("multi-admin")
    await db.insert(member).values([
      {
        id: crypto.randomUUID(),
        organizationId: orgA.id,
        userId: multiAdmin.id,
        role: "admin",
        createdAt: new Date(),
      },
      {
        id: crypto.randomUUID(),
        organizationId: orgB.id,
        userId: multiAdmin.id,
        role: "admin",
        createdAt: new Date(),
      },
    ])

    // Account-only kinds cannot carry an organization override.
    await actAs(multiAdmin)
    expect(
      await updateNotificationPreference({
        kinds: ["new_sign_in"],
        channel: "email",
        enabled: false,
        organizationId: orgA.id,
      })
    ).toEqual({
      success: false,
      error: "This notification applies to your whole account",
    })

    // Cross-tenant override for an organization the user does not belong to is refused.
    await actAs(alice)
    expect(
      await updateNotificationPreference({
        kinds: ["member_added"],
        channel: "email",
        enabled: false,
        organizationId: orgB.id,
      })
    ).toEqual({
      success: false,
      error: "You do not have access to this organization",
    })

    // Globally mute `invitation_accepted` emails, then override `orgA` back to `email: true`.
    await actAs(multiAdmin)
    expect(
      await updateNotificationPreference({
        kinds: ["invitation_accepted"],
        channel: "email",
        enabled: false,
      })
    ).toEqual({ success: true })
    expect(
      await updateNotificationPreference({
        kinds: ["invitation_accepted"],
        channel: "email",
        enabled: true,
        organizationId: orgA.id,
      })
    ).toEqual({ success: true })

    let overview = await getNotificationPreferences()
    expect(overview.success).toBe(true)
    if (overview.success) {
      expect(overview.data.overrides[orgA.id]?.invitation_accepted).toEqual({
        email: true,
      })
      const items = preferenceCategory(
        ["invitation_accepted"],
        overview.data,
        orgA.id
      )
      expect(items[0]).toMatchObject({
        email: true,
        emailCustom: true,
        inAppCustom: false,
      })
      expect(
        preferenceCategory(["invitation_accepted"], overview.data, orgB.id)[0]
      ).toMatchObject({ inApp: true, email: false, emailCustom: false })
    }

    async function acceptFrom(org: { id: string; slug: string }, tag: string) {
      const invitee = await fixture.createUser(tag)
      const { token, tokenHash } = createInvitationToken()
      const now = new Date()
      await db.insert(invitation).values({
        id: crypto.randomUUID(),
        organizationId: org.id,
        email: invitee.email,
        role: "member",
        expiresAt: new Date(now.getTime() + 3600_000),
        createdAt: now,
        lastSentAt: now,
        inviterId: multiAdmin.id,
        tokenHash,
      })
      await actAs(invitee)
      return runWithNotices(() => acceptInvitation(token))
    }

    // `orgA` sends email (override = true); `orgB` skips email (global = false).
    const acceptedA = await acceptFrom(orgA, "ovr-a")
    expect(mailsTo(acceptedA.mails, multiAdmin.email)).toHaveLength(1)

    const acceptedB = await acceptFrom(orgB, "ovr-b")
    expect(mailsTo(acceptedB.mails, multiAdmin.email)).toHaveLength(0)

    // Resetting one organization restores inheritance without changing the default.
    await actAs(multiAdmin)
    expect(await resetOrganizationNotificationPreferences(orgA.id)).toEqual({
      success: true,
    })
    overview = await getNotificationPreferences()
    if (!overview.success) throw new Error(overview.error)
    expect(
      preferenceCategory(["invitation_accepted"], overview.data, orgA.id)[0]
    ).toMatchObject({ email: false, emailCustom: false })
    expect(
      await updateNotificationPreference({
        kinds: ["invitation_accepted"],
        channel: "email",
        enabled: true,
        organizationId: orgA.id,
      })
    ).toEqual({ success: true })

    // Setting the global ("All organizations") preference clears `orgA`'s override on that channel!
    await actAs(multiAdmin)
    const globalEmail = {
      kinds: ["invitation_accepted" as const],
      channel: "email" as const,
      enabled: false,
    }
    expect(await updateNotificationPreference(globalEmail)).toMatchObject({
      success: false,
      needsConfirmation: true,
    })
    overview = await getNotificationPreferences()
    if (!overview.success) throw new Error(overview.error)
    expect(overview.data.overrides[orgA.id]?.invitation_accepted).toEqual({
      email: true,
    })
    // A different channel saves without confirmation and preserves the email override.
    expect(
      await updateNotificationPreference({ ...globalEmail, channel: "inApp" })
    ).toEqual({ success: true })
    expect(
      await updateNotificationPreference({
        ...globalEmail,
        replaceOverrides: true,
      })
    ).toEqual({ success: true })

    overview = await getNotificationPreferences()
    expect(overview.success).toBe(true)
    if (overview.success) {
      expect(overview.data.overrides[orgA.id]).toBeUndefined()
    }

    const acceptedAAfterGlobalSet = await acceptFrom(orgA, "ovr-a-cleared")
    expect(
      mailsTo(acceptedAAfterGlobalSet.mails, multiAdmin.email)
    ).toHaveLength(0)

    // Global reset (`null`) restores factory defaults (`invitation_accepted` email back to ON).
    await actAs(multiAdmin)
    expect(await resetOrganizationNotificationPreferences(null)).toEqual({
      success: true,
    })

    const acceptedAAfterFullReset = await acceptFrom(orgA, "ovr-a-full-reset")
    expect(
      mailsTo(acceptedAAfterFullReset.mails, multiAdmin.email)
    ).toHaveLength(1)
  })

  test("member joins, departures, and new sign-ups notify administrators in-app by default and by email only when opted in", async () => {
    stubBreachLookup()
    await db
      .update(organization)
      .set({ allowPublicSignUp: true })
      .where(eq(organization.id, orgA.id))

    try {
      // Clear prior notifications on `alice` and `rootOwner` for crisp assertions.
      await db.delete(notification).where(eq(notification.userId, alice.id))
      await db.delete(notification).where(eq(notification.userId, rootOwner.id))

      // 1. Self-service join into `orgA`: `alice` gets `member_joined` in-app, NO email by default.
      const joiner = await fixture.createUser("self-joiner")
      await actAs(joiner)
      const joined = await runWithNotices(() => joinOrganization(orgA.slug))
      expect(joined.result.success).toBe(true)
      expect(mailsTo(joined.mails, alice.email)).toHaveLength(0)

      let aliceFeed = await feedFor(alice)
      expect(aliceFeed.notifications[0]).toMatchObject({
        topic: "member_activity",
        kind: "member_joined",
        link: { type: "organization", slug: orgA.slug, path: "/members" },
      })

      // 2. Member voluntarily leaves `orgA`: `alice` gets `member_left` in-app, NO email by default.
      await actAs(joiner)
      const left = await runWithNotices(() => removeMember(orgA.id, joiner.id))
      expect(left.result).toEqual({ success: true })
      expect(mailsTo(left.mails, alice.email)).toHaveLength(0)

      aliceFeed = await feedFor(alice)
      expect(aliceFeed.notifications[0]).toMatchObject({
        topic: "member_activity",
        kind: "member_left",
        link: { type: "organization", slug: orgA.slug, path: "/members" },
      })

      // 3. `alice` opts in to `member_joined` emails specifically on `orgA`.
      await actAs(alice)
      expect(
        await updateNotificationPreference({
          kinds: ["member_joined"],
          channel: "email",
          enabled: true,
          organizationId: orgA.id,
        })
      ).toEqual({ success: true })

      // 4. Public sign-up into `orgA`: `alice` gets `member_joined` (in-app + email!),
      //    and `rootOwner` gets `user_signed_up` on `root` (in-app only, linking to `/directory`).
      // Also an admin of A, but opting out of joins must not suppress root sign-ups.
      await db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId: orgA.id,
        userId: rootOwner.id,
        role: "admin",
        createdAt: new Date(),
      })
      await actAs(rootOwner)
      expect(
        await updateNotificationPreference({
          kinds: ["member_joined"],
          channel: "inApp",
          enabled: false,
          organizationId: orgA.id,
        })
      ).toEqual({ success: true })
      const newEmail = `signup-${fixture.suffix}@example.test`
      browse()
      const signedUp = await runWithNotices(() =>
        signUp(
          {
            name: `Signed Up ${fixture.suffix}`,
            email: newEmail,
            password: PASSWORD,
          },
          orgA.slug
        )
      )
      expect(signedUp.result).toEqual({ success: true })
      const createdRows = await db
        .select({ id: notification.userId })
        .from(notification)
        .where(eq(notification.kind, "user_signed_up"))
      expect(createdRows.some((r) => r.id === rootOwner.id)).toBe(true)

      expect(mailsTo(signedUp.mails, alice.email)).toHaveLength(1)
      expect(mailsTo(signedUp.mails, rootOwner.email)).toHaveLength(0)

      const rootFeed = await feedFor(rootOwner)
      expect(rootFeed.notifications[0]).toMatchObject({
        topic: "member_activity",
        kind: "user_signed_up",
        link: { type: "organization", slug: root.slug, path: "/directory" },
      })

      // Clean up the newly signed-up user so no test data lingers.
      const { user: userTable } =
        await import("@/features/shared/lib/db/schema")
      await db.delete(userTable).where(eq(userTable.email, newEmail))
    } finally {
      await db
        .update(organization)
        .set({ allowPublicSignUp: false })
        .where(eq(organization.id, orgA.id))
    }
  })
})
