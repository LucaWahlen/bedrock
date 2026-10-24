import { eq } from "drizzle-orm"

import { recordAuditEvent } from "@/features/audit"
import { createSlug } from "@/features/organizations/utils/create-slug"
import { db } from "@/features/shared/lib/db/client"
import { organization, user } from "@/features/shared/lib/db/schema"
import {
  setMembershipRole,
  type AdminOrganization,
  type AdminUser,
} from "@/scripts/admin/memberships"
import { createUser } from "@/scripts/admin/users"

const SYSTEM_ACTOR = { type: "system" } as const

const FIRST_NAMES = [
  "Alma",
  "Bo",
  "Casper",
  "Dilara",
  "Emil",
  "Freya",
  "Goran",
  "Hanna",
  "Ines",
  "Jonas",
  "Katri",
  "Lars",
  "Mira",
  "Nils",
  "Oona",
  "Piet",
  "Quirin",
  "Rune",
  "Sanna",
  "Timo",
  "Ulla",
  "Viggo",
  "Wanda",
  "Yara",
  "Zeno",
]

const LAST_NAMES = [
  "Aaltonen",
  "Bakker",
  "Costa",
  "Dahl",
  "Eriksen",
  "Fischer",
  "Gruber",
  "Halvorsen",
  "Iversen",
  "Janssen",
  "Koivisto",
  "Lindqvist",
  "Mikkelsen",
  "Novak",
  "Olsen",
  "Persson",
  "Quist",
  "Rasmussen",
  "Sorensen",
  "Toft",
]

const ORGANIZATION_WORDS = [
  "Northwind",
  "Contoso",
  "Fabrikam",
  "Lighthouse",
  "Meridian",
  "Harbour",
  "Foundry",
  "Beacon",
  "Cascade",
  "Ironwood",
  "Silverbirch",
  "Nordhaven",
  "Blackpine",
  "Riverstone",
  "Copperfield",
  "Greenfield",
]

const ORGANIZATION_SUFFIXES = [
  "Group",
  "Labs",
  "Systems",
  "Collective",
  "Works",
  "Industries",
  "Studio",
  "Partners",
]

export type SeedOptions = {
  userCount: number
  organizationCount: number
  password: string
}

export type SeedSummary = {
  usersCreated: number
  usersSkipped: number
  organizationsCreated: number
  organizationsSkipped: number
  membershipsGranted: number
  rootAdminsGranted: number
}

function pick<TItem>(items: readonly TItem[]) {
  return items[Math.floor(Math.random() * items.length)]
}

function shuffle<TItem>(items: TItem[]) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]]
  }

  return shuffled
}

function randomBetween(minimum: number, maximum: number) {
  return minimum + Math.floor(Math.random() * (maximum - minimum + 1))
}

// Names repeat long before the pools do, so the index keeps addresses unique.
function personAt(index: number) {
  const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`
  const handle = createSlug(name).replaceAll("-", ".")

  return { name, email: `${handle}.${index}@example.com` }
}

function organizationAt(index: number) {
  const name = `${pick(ORGANIZATION_WORDS)} ${pick(ORGANIZATION_SUFFIXES)}`

  return { name, slug: `${createSlug(name)}-${index}` }
}

// Most organizations are ordinary; the rest exist so the states that are
// awkward to reach by hand are always represented.
function statusAt(index: number) {
  if (index % 7 === 3) {
    const deletedAt = new Date()
    deletedAt.setDate(deletedAt.getDate() - 3)

    return { status: "deleted" as const, deletedAt }
  }

  if (index % 5 === 2) {
    return { status: "suspended" as const, deletedAt: null }
  }

  return { status: "active" as const, deletedAt: null }
}

export async function seedDevelopmentData({
  userCount,
  organizationCount,
  password,
}: SeedOptions): Promise<SeedSummary> {
  const summary: SeedSummary = {
    usersCreated: 0,
    usersSkipped: 0,
    organizationsCreated: 0,
    organizationsSkipped: 0,
    membershipsGranted: 0,
    rootAdminsGranted: 0,
  }

  const takenEmails = new Set(
    (await db.select({ email: user.email }).from(user)).map((row) =>
      row.email.toLowerCase()
    )
  )
  const takenSlugs = new Set(
    (await db.select({ slug: organization.slug }).from(organization)).map(
      (row) => row.slug
    )
  )

  const seeded: AdminUser[] = []
  for (let index = 0; index < userCount; index++) {
    const person = personAt(takenEmails.size + index)
    if (takenEmails.has(person.email)) {
      summary.usersSkipped++
      continue
    }

    // Better Auth hashes the password, so seeded accounts can actually sign in.
    const created = await createUser({ ...person, password })
    takenEmails.add(person.email)
    seeded.push({ id: created.id, name: person.name, email: person.email })
    summary.usersCreated++
  }

  const organizations: AdminOrganization[] = []
  for (let index = 0; index < organizationCount; index++) {
    const details = organizationAt(takenSlugs.size + index)
    if (takenSlugs.has(details.slug)) {
      summary.organizationsSkipped++
      continue
    }

    const [created] = await db
      .insert(organization)
      .values({
        id: crypto.randomUUID(),
        name: details.name,
        slug: details.slug,
        createdAt: new Date(),
        ...statusAt(index),
      })
      .returning({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        isRoot: organization.isRoot,
      })

    takenSlugs.add(details.slug)
    organizations.push(created)
    summary.organizationsCreated++

    await recordAuditEvent({
      action: "organization.created",
      actor: SYSTEM_ACTOR,
      organization: {
        id: created.id,
        name: created.name,
        slug: created.slug,
      },
      target: { type: "organization", id: created.id, label: created.name },
      reason: "Created with the admin script",
    })
  }

  const candidates = seeded.length
    ? seeded
    : await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .limit(200)

  if (candidates.length === 0) return summary

  for (const target of organizations) {
    const members = shuffle(candidates).slice(
      0,
      Math.min(candidates.length, randomBetween(2, 8))
    )

    for (const [index, person] of members.entries()) {
      // Every organization gets an owner first, so none is left unrecoverable.
      const role = index === 0 ? "owner" : index === 1 ? "admin" : "member"
      const result = await setMembershipRole(target, person, role)
      if (result.ok) summary.membershipsGranted++
    }
  }

  const [root] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      isRoot: organization.isRoot,
    })
    .from(organization)
    .where(eq(organization.isRoot, true))
    .limit(1)

  if (root) {
    for (const person of shuffle(candidates).slice(0, 2)) {
      const result = await setMembershipRole(root, person, "admin")
      if (result.ok) summary.rootAdminsGranted++
    }
  }

  return summary
}
