import {
  deleteStoredObjects,
  promoteStagedMedia,
} from "@/features/shared/lib/storage/promote-media"

function iconPrefix(organizationId: string, clientId: string) {
  return `organizations/${organizationId}/applications/${encodeURIComponent(clientId)}/`
}

export async function promoteApplicationIcon(
  organizationId: string,
  clientId: string,
  stagedKey: string,
  actorUserId: string
) {
  return promoteStagedMedia({
    stagedKey,
    actorUserId,
    kind: "logo",
    destinationKey: (extension) =>
      `${iconPrefix(organizationId, clientId)}icon-${crypto.randomUUID()}.${extension}`,
  })
}

// A stored URL proves no ownership on its own, so a replaced icon is only
// deleted once its key decodes back to this application's own prefix.
export function applicationIconKey(
  organizationId: string,
  clientId: string,
  url: string | null,
  storagePublicUrl: string
) {
  if (!url) return null

  const base = storagePublicUrl.endsWith("/")
    ? storagePublicUrl
    : `${storagePublicUrl}/`

  if (!url.startsWith(base)) return null

  const key = decodeURIComponent(url.slice(base.length))
  const prefix = iconPrefix(organizationId, clientId)

  if (!key.startsWith(prefix)) return null
  if (!/^icon-[0-9a-f-]{36}\.[a-z]{3,4}$/i.test(key.slice(prefix.length))) {
    return null
  }

  return key
}

export { deleteStoredObjects }
