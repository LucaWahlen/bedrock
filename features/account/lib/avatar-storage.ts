import { DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"

import {
  deleteStoredObjects,
  promoteStagedMedia,
} from "@/features/shared/lib/storage/promote-media"
import { getObjectStorage } from "@/features/shared/lib/storage/s3"

// A person's own prefix. Nothing else is ever written under it, so listing it
// is how everything they own is found, and decoding back into it is how a
// stored URL is proven to be theirs.
export function userObjectPrefix(userId: string) {
  return `users/${encodeURIComponent(userId)}/`
}

function avatarPrefix(userId: string) {
  return `${userObjectPrefix(userId)}avatar/`
}

const AVATAR_FILENAME =
  /^avatar-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpe?g|png|webp)$/i

// Moves an upload out of the user's staging prefix and into their own. The
// staging ownership and the media policy are re-checked by `promoteStagedMedia`.
export async function promoteAvatar(userId: string, stagedKey: string) {
  return promoteStagedMedia({
    stagedKey,
    actorUserId: userId,
    kind: "avatar",
    destinationKey: (extension) =>
      `${avatarPrefix(userId)}avatar-${crypto.randomUUID()}.${extension}`,
  })
}

// A stored URL proves nothing on its own, so the key it names is only returned
// when it decodes back to exactly one avatar under this user's prefix.
export function userAvatarKey(
  userId: string,
  url: string | null | undefined,
  storagePublicUrl: string
) {
  if (!url) return null

  const base = `${storagePublicUrl.replace(/\/$/, "")}/`
  if (!url.startsWith(base)) return null

  let key: string
  try {
    key = url
      .slice(base.length)
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/")
  } catch {
    return null
  }

  const prefix = avatarPrefix(userId)
  if (!key.startsWith(prefix)) return null

  return AVATAR_FILENAME.test(key.slice(prefix.length)) ? key : null
}

// Only once the row points elsewhere, and only for a proven key.
export async function deleteReplacedAvatar(
  userId: string,
  previousUrl: string | null | undefined
) {
  const { publicUrl } = getObjectStorage()
  const key = userAvatarKey(userId, previousUrl, publicUrl)
  if (key) await deleteStoredObjects([key])
}

export { deleteStoredObjects }

// Scoped by listing the user's own prefix rather than by trusting a stored URL,
// so this can only ever reach objects that person owns.
export async function deleteUserObjects(userId: string) {
  const { client, bucket } = getObjectStorage()
  const prefix = userObjectPrefix(userId)
  let continuationToken: string | undefined

  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    )

    const keys = (listed.Contents ?? [])
      .map((object) => object.Key)
      .filter((key): key is string => Boolean(key?.startsWith(prefix)))

    for (const key of keys) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    }

    continuationToken = listed.IsTruncated
      ? listed.NextContinuationToken
      : undefined
  } while (continuationToken)
}
