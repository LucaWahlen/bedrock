import type { OrganizationRole } from "@/features/auth/types"
import { env } from "@/features/shared/lib/config/env"
import {
  listMembers,
  listOrganizations,
  removeMember,
  setMembershipRole,
  type AdminOrganization,
  type AdminUser,
  type MembershipResult,
} from "@/scripts/admin/memberships"
import { prompt } from "@/scripts/admin/prompt"
import { seedDevelopmentData } from "@/scripts/admin/seed"
import {
  createUser,
  disableUser,
  enableUser,
  findUserByEmail,
  listUsers,
  resetTwoFactor,
  type AccountStandingResult,
} from "@/scripts/admin/users"

function ask(question: string) {
  return prompt(`${question} `)?.trim() ?? ""
}

function askWithDefault(question: string, fallback: string) {
  return ask(`${question} [${fallback}]`) || fallback
}

function choose<TItem>(
  label: string,
  items: TItem[],
  render: (item: TItem) => string
) {
  if (items.length === 0) {
    console.log(`No ${label} found.`)
    return null
  }

  for (const [index, item] of items.entries()) {
    console.log(`  ${index + 1}. ${render(item)}`)
  }

  return items[Number(ask(`Select a ${label}:`)) - 1] ?? null
}

// The root organization has no plain members.
function chooseRole(targetOrganization: AdminOrganization) {
  const roles: OrganizationRole[] = targetOrganization.isRoot
    ? ["owner", "admin"]
    : ["owner", "admin", "member"]

  return choose("role", roles, (role) => role)
}

function report(result: MembershipResult, success: string) {
  console.log(result.ok ? success : `Refused: ${result.error}`)
}

async function chooseOrganization() {
  return choose(
    "organization",
    await listOrganizations(),
    (item) => `${item.name} (${item.slug})${item.isRoot ? " — root" : ""}`
  )
}

async function chooseUser(users: AdminUser[]) {
  return choose("user", users, (item) => `${item.email} — ${item.name}`)
}

async function createUserAction() {
  const email = ask("Email:")
  if (!email) return console.log("An email is required.")

  const created = await createUser({
    email,
    name: askWithDefault("Name:", email.split("@")[0]),
    password: askWithDefault("Password:", "password123"),
  })

  console.log(`Created ${created.email} (${created.id}).`)
}

async function setRoleAction() {
  const targetOrganization = await chooseOrganization()
  if (!targetOrganization) return

  const targetUser = await chooseUser(await listUsers())
  if (!targetUser) return

  const role = chooseRole(targetOrganization)
  if (!role) return

  report(
    await setMembershipRole(targetOrganization, targetUser, role),
    `${targetUser.email} is now ${role} of ${targetOrganization.name}.`
  )
}

async function removeMemberAction() {
  const targetOrganization = await chooseOrganization()
  if (!targetOrganization) return

  const targetUser = await chooseUser(await listMembers(targetOrganization.id))
  if (!targetUser) return

  report(
    await removeMember(targetOrganization, targetUser),
    `${targetUser.email} was removed from ${targetOrganization.name}.`
  )
}

async function listMembersAction() {
  const targetOrganization = await chooseOrganization()
  if (!targetOrganization) return

  for (const person of await listMembers(targetOrganization.id)) {
    console.log(`  ${person.role.padEnd(8)} ${person.email} — ${person.name}`)
  }
}

async function listUsersAction() {
  for (const person of await listUsers()) {
    console.log(`  ${person.email} — ${person.name} (${person.id})`)
  }
}

async function resetTwoFactorAction() {
  const targetUser = await chooseUser(await listUsers())
  if (!targetUser) return

  const confirmation = ask(
    `Turn off two-factor authentication for ${targetUser.email}? Type the address to confirm:`
  )
  if (confirmation !== targetUser.email) return console.log("Not confirmed.")

  const result = await resetTwoFactor(targetUser)
  console.log(
    result.ok
      ? `Two-factor authentication is off for ${targetUser.email}. They sign in with their password and can set it up again.`
      : `Refused: ${result.error}`
  )
}

function reportStanding(
  result: AccountStandingResult,
  email: string,
  disabled: boolean
) {
  if (!result.ok) {
    console.log(`Refused: ${result.error}`)
    return false
  }

  console.log(
    disabled
      ? `${email} is disabled. Every session and application token it held has ended.`
      : `${email} can sign in again.`
  )
  if (result.soleOwnerOf.length > 0) {
    console.log(
      `  It was the only active owner of: ${result.soleOwnerOf.join(", ")}.`
    )
  }

  return true
}

async function disableUserAction() {
  const targetUser = await chooseUser(await listUsers())
  if (!targetUser) return

  const reason = ask("Reason:")
  if (!reason) return console.log("A reason is required.")

  reportStanding(await disableUser(targetUser, reason), targetUser.email, true)
}

async function enableUserAction() {
  const targetUser = await chooseUser(await listUsers())
  if (!targetUser) return

  reportStanding(await enableUser(targetUser), targetUser.email, false)
}

function askCount(question: string, fallback: string) {
  const count = Number(askWithDefault(question, fallback))

  return Number.isInteger(count) && count >= 0 ? count : null
}

async function seedAction() {
  if (process.env.NODE_ENV === "production") {
    return console.log("Seeding is only available outside production.")
  }

  const userCount = askCount("How many users?", "25")
  if (userCount === null) return console.log("Enter a whole number.")

  const organizationCount = askCount("How many organizations?", "8")
  if (organizationCount === null) return console.log("Enter a whole number.")

  const password = askWithDefault("Password for seeded users:", "password123")

  console.log("Seeding. Hashing passwords takes a moment...")
  const summary = await seedDevelopmentData({
    userCount,
    organizationCount,
    password,
  })

  console.log(
    `  ${summary.usersCreated} users created, ${summary.usersSkipped} skipped.`
  )
  console.log(
    `  ${summary.organizationsCreated} organizations created, ${summary.organizationsSkipped} skipped.`
  )
  console.log(`  ${summary.membershipsGranted} memberships granted.`)
  console.log(`  ${summary.rootAdminsGranted} root admins granted.`)
}

const ACTIONS = [
  { label: "Create a user", run: createUserAction },
  { label: "Grant or change an organization role", run: setRoleAction },
  { label: "Remove a member from an organization", run: removeMemberAction },
  { label: "List an organization's members", run: listMembersAction },
  { label: "List users", run: listUsersAction },
  {
    label: "Reset a user's two-factor authentication",
    run: resetTwoFactorAction,
  },
  { label: "Disable a user's account", run: disableUserAction },
  { label: "Enable a user's account", run: enableUserAction },
  { label: "Seed development data", run: seedAction },
]

function option(args: string[], name: string) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`))
  if (inline) return inline.slice(name.length + 3)

  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

// `admin disable <email> --reason "..."` and `admin enable <email>`, through
// `bun run admin` or `bedrock admin`, for when there is no one to answer
// prompts. Anything else opens the menu.
async function runCommand(args: string[]) {
  const [command, email] = args
  if (command !== "disable" && command !== "enable") return null

  if (!email || email.startsWith("--")) {
    console.log(
      command === "disable"
        ? "Usage: admin disable <email> --reason <reason>"
        : "Usage: admin enable <email>"
    )
    return 1
  }

  const targetUser = await findUserByEmail(email)
  if (!targetUser) {
    console.log(`No user has the address ${email}.`)
    return 1
  }

  if (command === "enable") {
    return reportStanding(await enableUser(targetUser), targetUser.email, false)
      ? 0
      : 1
  }

  const reason = option(args, "reason")?.trim()
  if (!reason) {
    console.log("A reason is required: --reason <reason>")
    return 1
  }

  return reportStanding(
    await disableUser(targetUser, reason),
    targetUser.email,
    true
  )
    ? 0
    : 1
}

const exitCode = await runCommand(process.argv.slice(2))
if (exitCode !== null) process.exit(exitCode)

const { host, pathname } = new URL(env.database.url)
console.log(`Bedrock admin — ${host}${pathname}`)

let running = true
while (running) {
  console.log("")
  for (const [index, action] of ACTIONS.entries()) {
    console.log(`  ${index + 1}. ${action.label}`)
  }
  console.log("  0. Exit")

  const action = ACTIONS[Number(ask("What do you want to do?")) - 1]

  if (!action) {
    running = false
    break
  }

  try {
    await action.run()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
  }
}

process.exit(0)
