import type { OrganizationStatus } from "@/features/organizations/types"

export type JoinableOrganization = {
  isRoot: boolean
  status: OrganizationStatus
  allowPublicSignUp: boolean
}

/**
 * Whether anyone may put themselves into this organization. The one place the
 * rule is stated: the sign-up form, the join action, and the pages that offer
 * either all read it here, so hiding a control and refusing a request cannot
 * disagree.
 *
 * Root is excluded whatever the column says. The database enforces that too,
 * but administering the instance is granted and never claimed, so the rule is
 * worth stating where it is read as well as where it is written.
 */
export function isOpenToAnyone(organization: JoinableOrganization) {
  return (
    !organization.isRoot &&
    organization.status === "active" &&
    organization.allowPublicSignUp
  )
}
