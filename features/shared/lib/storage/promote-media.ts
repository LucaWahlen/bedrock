import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3"

import {
  isMediaAllowed,
  isOwnedStagedBrandingKey,
  MEDIA_EXTENSIONS,
  type MediaKind,
} from "@/features/shared/lib/storage/media"
import {
  getObjectStorage,
  getPublicObjectUrl,
} from "@/features/shared/lib/storage/s3"

// Uuid'd, so replacing an image is a new object and the old URL never has to be
// invalidated.
const CACHE_CONTROL = "public, max-age=31536000, immutable"

function encodeCopySource(bucket: string, key: string) {
  return [bucket, ...key.split("/")].map(encodeURIComponent).join("/")
}

type PromoteStagedMedia = {
  stagedKey: string
  actorUserId: string
  kind: MediaKind
  // Given the resolved extension, since that is only known after the stored
  // object's real content type has been read.
  destinationKey: (extension: string) => string
}

// Moves an upload out of the uploader's own staging prefix into a place the
// application owns. Ownership and media policy are re-checked here rather than
// trusted from the caller, because this is the step that changes who the object
// belongs to.
export async function promoteStagedMedia({
  stagedKey,
  actorUserId,
  kind,
  destinationKey,
}: PromoteStagedMedia) {
  if (!isOwnedStagedBrandingKey(stagedKey, actorUserId)) {
    throw new Error("Invalid media upload")
  }

  const storage = getObjectStorage()
  const source = await storage.client.send(
    new HeadObjectCommand({ Bucket: storage.bucket, Key: stagedKey })
  )
  const contentType = source.ContentType?.split(";", 1)[0].trim()
  const size = source.ContentLength

  if (
    !contentType ||
    size === undefined ||
    !isMediaAllowed(kind, { type: contentType, size })
  ) {
    throw new Error(`Invalid ${kind} upload`)
  }

  const key = destinationKey(MEDIA_EXTENSIONS[contentType])

  await storage.client.send(
    new CopyObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      CopySource: encodeCopySource(storage.bucket, stagedKey),
      MetadataDirective: "REPLACE",
      ContentType: contentType,
      CacheControl: CACHE_CONTROL,
    })
  )

  return {
    key,
    publicUrl: getPublicObjectUrl(storage.publicUrl, key),
  }
}

export async function deleteStoredObjects(keys: string[]) {
  if (keys.length === 0) return

  const { client, bucket } = getObjectStorage()
  await Promise.allSettled(
    keys.map((key) =>
      client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    )
  )
}
