"use server"

import { addMembers } from "@/features/organizations/actions/add-members"
import { inviteMember } from "@/features/organizations/actions/invite-member"
import {
  isValidEmail,
  normalizeEmails,
} from "@/features/organizations/lib/email-normalization"
import {
  MEMBER_ROLES,
  type AddPeopleInput,
  type AddPeopleResult,
} from "@/features/organizations/types"

const MAX_PEOPLE_PER_REQUEST = 50

/**
 * One way in, because an administrator knows the person, not whether that
 * person already has an account. Both halves are delegated to the actions that
 * already own them, so authorization, audit and rate limiting are not written
 * a second time here and cannot drift.
 */
export async function addPeople({
  organizationId,
  userIds,
  emails,
  role,
  invite,
}: AddPeopleInput): Promise<AddPeopleResult> {
  const subjects = Array.from(new Set(userIds))
  const addresses = normalizeEmails(emails)

  if (subjects.length + addresses.length === 0) {
    return { success: false, error: "Choose at least one person" }
  }
  if (subjects.length + addresses.length > MAX_PEOPLE_PER_REQUEST) {
    return {
      success: false,
      error: `Add at most ${MAX_PEOPLE_PER_REQUEST} people at a time`,
    }
  }
  if (addresses.some((email) => !isValidEmail(email))) {
    return { success: false, error: "Enter a valid email address" }
  }
  if (!MEMBER_ROLES.includes(role)) {
    return { success: false, error: "That role does not exist" }
  }

  // An address with no account cannot be added, so nothing in the batch is.
  // The dialog says so too, but a request that skipped it would otherwise do
  // two different things to two halves of one list.
  const invitesEveryone = invite || addresses.length > 0

  if (!invitesEveryone) {
    const result = await addMembers(organizationId, subjects, role)

    return result.success
      ? {
          success: true,
          added: result.added,
          invited: 0,
          skipped: result.skipped,
          undelivered: 0,
          refused: [],
        }
      : result
  }

  if (subjects.length > 0) {
    // Chosen from the picker, so these are ids the caller never typed; their
    // addresses are what an invitation is actually sent to.

    return {
      success: false,
      error: "Invitations must name email addresses",
    }
  }

  let invited = 0
  let undelivered = 0
  const refused: string[] = []

  for (const email of addresses) {
    const result = await inviteMember({ organizationId, email, role })

    if (!result.success) {
      refused.push(`${email}: ${result.error}`)
      continue
    }

    invited += 1
    if (!result.delivered) undelivered += 1
  }

  if (invited === 0) {
    return { success: false, error: refused[0] ?? "Nobody could be invited" }
  }

  return {
    success: true,
    added: 0,
    invited,
    // Somebody who already belongs is refused by name rather than counted, so
    // the caller can say which address it was.
    skipped: 0,
    undelivered,
    refused,
  }
}
