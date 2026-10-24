type HomeCandidate = { slug: string; status: string }

/**
 * Account settings live in the dialog of an organization the person belongs to,
 * so that is where a mail sends them: the one they acted from when known,
 * otherwise any they can still enter. Null when none can be.
 */
export function accountHomeSlug(
  memberships: HomeCandidate[],
  preferred?: string | null
) {
  const open = memberships.filter(
    (membership) => membership.status === "active"
  )

  return (
    open.find((membership) => membership.slug === preferred)?.slug ??
    open[0]?.slug ??
    null
  )
}
