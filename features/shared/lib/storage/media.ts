export const MEDIA_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
}

export const MEDIA_POLICIES = {
  logo: {
    maxBytes: 2 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
  },
  background: {
    maxBytes: 10 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  favicon: {
    maxBytes: 1 * 1024 * 1024,
    contentTypes: ["image/x-icon", "image/png", "image/svg+xml"],
  },
  // A person's picture, shown beside their name wherever they appear. No SVG:
  // nothing about a photo needs a format that can carry script.
  avatar: {
    maxBytes: 2 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
  },
} as const

export type MediaKind = keyof typeof MEDIA_POLICIES

export function getOrganizationBrandingStagingPrefix(userId: string) {
  return `staging/organization-branding/${encodeURIComponent(userId)}/`
}

const STAGED_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:ico|jpe?g|png|svg|webp)$/i

// The staging prefix is the only thing separating one user's uploads from
// another's, so a key is owned only if it names exactly one object directly
// under that user's prefix.
export function isOwnedStagedBrandingKey(key: string, userId: string) {
  const prefix = getOrganizationBrandingStagingPrefix(userId)

  return (
    key.startsWith(prefix) && STAGED_FILENAME.test(key.slice(prefix.length))
  )
}

export function isMediaAllowed(
  kind: MediaKind,
  file: Pick<File, "size" | "type">
) {
  const policy = MEDIA_POLICIES[kind]
  return (
    policy.contentTypes.some((contentType) => contentType === file.type) &&
    file.size <= policy.maxBytes
  )
}
