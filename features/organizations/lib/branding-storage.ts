import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3"

import { env } from "@/features/shared/lib/config/env"
import {
  MEDIA_EXTENSIONS,
  type MediaKind,
} from "@/features/shared/lib/storage/media"
import { promoteStagedMedia } from "@/features/shared/lib/storage/promote-media"
import {
  getObjectStorage,
  getPublicObjectUrl,
} from "@/features/shared/lib/storage/s3"

type BrandingField = "logo" | "backgroundImage" | "favicon"

const BRANDING_MEDIA_KINDS: Record<BrandingField, MediaKind> = {
  logo: "logo",
  backgroundImage: "background",
  favicon: "favicon",
}

export type StagedBranding = {
  field: BrandingField
  key: string
}

export type PromotedBranding = StagedBranding & {
  destinationKey: string
  publicUrl: string
}

// Uuid'd, so replacing an organization's branding is a new object and the old
// URL never has to be invalidated.
const CACHE_CONTROL = "public, max-age=31536000, immutable"

function brandingKey(
  organizationId: string,
  field: BrandingField,
  extension: string
) {
  return `organizations/${organizationId}/branding/${field}-${crypto.randomUUID()}.${extension}`
}

export async function uploadShippedBranding(
  organizationId: string,
  branding: typeof env.shippedBranding = env.shippedBranding
) {
  const storage = getObjectStorage()

  return Promise.all(
    branding.map(async ({ field, file, contentType }) => {
      const key = brandingKey(
        organizationId,
        field,
        MEDIA_EXTENSIONS[contentType]
      )

      await storage.client.send(
        new PutObjectCommand({
          Bucket: storage.bucket,
          Key: key,
          Body: await readFile(path.join(process.cwd(), "public", file)),
          ContentType: contentType,
          CacheControl: CACHE_CONTROL,
        })
      )

      return { field, publicUrl: getPublicObjectUrl(storage.publicUrl, key) }
    })
  )
}

export async function promoteOrganizationBranding(
  organizationId: string,
  stagedBranding: StagedBranding[],
  actorUserId: string
) {
  const promotedBranding: PromotedBranding[] = []

  try {
    for (const item of stagedBranding) {
      const promoted = await promoteStagedMedia({
        stagedKey: item.key,
        actorUserId,
        kind: BRANDING_MEDIA_KINDS[item.field],
        destinationKey: (extension) =>
          brandingKey(organizationId, item.field, extension),
      })

      promotedBranding.push({
        ...item,
        destinationKey: promoted.key,
        publicUrl: promoted.publicUrl,
      })
    }
  } catch (error) {
    await cleanupBrandingObjects(
      promotedBranding.map((item) => item.destinationKey)
    )
    throw error
  }

  return promotedBranding
}

export async function cleanupBrandingObjects(keys: string[]) {
  if (keys.length === 0) return

  const { client, bucket } = getObjectStorage()
  await Promise.allSettled(
    keys.map((key) =>
      client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    )
  )
}

const BRANDING_FILENAME =
  /^(?:logo|backgroundImage|favicon)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:ico|jpe?g|png|svg|webp)$/i

// A stored URL is only ever a hint. Anything that does not decode back to this
// organization's own branding prefix is refused rather than deleted, so a
// tampered column can never reach another organization's objects.
export function organizationBrandingKey(
  organizationId: string,
  publicUrl: string,
  storagePublicUrl: string
) {
  const base = `${storagePublicUrl.replace(/\/$/, "")}/`
  if (!publicUrl.startsWith(base)) return null

  const key = publicUrl
    .slice(base.length)
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/")

  const prefix = `organizations/${organizationId}/branding/`
  if (!key.startsWith(prefix)) return null

  return BRANDING_FILENAME.test(key.slice(prefix.length)) ? key : null
}

// Replacing branding writes a new object, so the one it replaced is deleted
// here rather than left to accumulate until the organization itself goes.
export async function deleteOrganizationBrandingObjects(
  organizationId: string,
  publicUrls: string[]
) {
  const { publicUrl } = getObjectStorage()
  const keys = publicUrls
    .map((url) => organizationBrandingKey(organizationId, url, publicUrl))
    .filter((key): key is string => key !== null)

  await cleanupBrandingObjects(keys)
}

// Scoped by listing the organization's own prefix rather than by trusting a
// stored URL, so this can only ever delete objects that organization owns.
export async function deleteOrganizationObjects(organizationId: string) {
  const { client, bucket } = getObjectStorage()
  const prefix = `organizations/${organizationId}/`
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
