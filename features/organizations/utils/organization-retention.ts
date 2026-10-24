const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

// When a deleted organization stops being restorable and is purged.
export function organizationPurgeDate(
  deletedAt: Date,
  retentionDays: number
): Date {
  return new Date(deletedAt.getTime() + retentionDays * DAY_IN_MILLISECONDS)
}

// The deletion moment whose retention has just elapsed, so housekeeping and the
// date shown to a root administrator can never disagree.
export function organizationPurgeCutoff(
  now: Date,
  retentionDays: number
): Date {
  return new Date(now.getTime() - retentionDays * DAY_IN_MILLISECONDS)
}
