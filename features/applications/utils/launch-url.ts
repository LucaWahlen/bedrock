// Where a member is sent to open an application. It is rendered as a link, so
// only a plain web address qualifies: https in production, and http as well
// while developing against a local server. Credentials in the address are never
// acceptable, since the link is shown to every member.
export function isLaunchUrlAllowed(
  value: string,
  production = process.env.NODE_ENV === "production"
) {
  const url = URL.parse(value)
  if (!url || url.username || url.password || !url.hostname) return false

  return production
    ? url.protocol === "https:"
    : url.protocol === "https:" || url.protocol === "http:"
}

// A stored address may predate validation or arrive through the provider's own
// endpoints, so it is checked again before it becomes a link.
export function launchUrlOf(uri: string | null) {
  return uri && isLaunchUrlAllowed(uri) ? uri : null
}
