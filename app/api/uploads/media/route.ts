import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { z } from "zod"

import { getAccessContext } from "@/features/auth"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import {
  getOrganizationBrandingStagingPrefix,
  isMediaAllowed,
  isOwnedStagedBrandingKey,
  MEDIA_EXTENSIONS,
} from "@/features/shared/lib/storage/media"
import {
  getObjectStorage,
  getPublicObjectUrl,
} from "@/features/shared/lib/storage/s3"

const uploadSchema = z.object({
  kind: z.enum(["logo", "background", "favicon", "avatar"]),
  contentType: z.string(),
  size: z.number().int().positive(),
})

const UPLOAD_LIMIT = { window: 15 * 60, max: 20 }
const DELETE_LIMIT = { window: 15 * 60, max: 40 }

async function consumeUserLimit(key: string, rule: typeof UPLOAD_LIMIT) {
  const decision = await consumeRateLimit(key, rule)
  if (decision.allowed) return null

  return Response.json(
    {
      error: `Too many requests. Try again in ${Math.ceil((decision.retryAfter ?? 60) / 60)} minutes.`,
    },
    { status: 429 }
  )
}

const deleteSchema = z.object({
  key: z.string().min(1),
})

export async function POST(request: Request) {
  const { user } = await getAccessContext()
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const limited = await consumeUserLimit(
    `upload:media:${user.id}`,
    UPLOAD_LIMIT
  )
  if (limited) return limited

  const result = uploadSchema.safeParse(
    await request.json().catch(() => undefined)
  )
  if (!result.success) {
    return Response.json({ error: "Invalid upload request" }, { status: 400 })
  }

  const { kind, contentType, size } = result.data
  if (!isMediaAllowed(kind, { type: contentType, size })) {
    return Response.json(
      { error: "Unsupported image type or size" },
      { status: 400 }
    )
  }

  try {
    const { client, bucket, publicUrl } = getObjectStorage()
    const key = `${getOrganizationBrandingStagingPrefix(user.id)}${crypto.randomUUID()}.${MEDIA_EXTENSIONS[contentType]}`
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
      { expiresIn: 300 }
    )

    return Response.json({
      key,
      uploadUrl,
      publicUrl: getPublicObjectUrl(publicUrl, key),
    })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Object storage is unavailable",
      },
      { status: 503 }
    )
  }
}

export async function DELETE(request: Request) {
  const { user } = await getAccessContext()
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const limited = await consumeUserLimit(
    `upload:media:delete:${user.id}`,
    DELETE_LIMIT
  )
  if (limited) return limited

  const result = deleteSchema.safeParse(
    await request.json().catch(() => undefined)
  )
  if (!result.success || !isOwnedStagedBrandingKey(result.data.key, user.id)) {
    return Response.json({ error: "Invalid object key" }, { status: 400 })
  }

  try {
    const { client, bucket } = getObjectStorage()
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: result.data.key })
    )
    return new Response(null, { status: 204 })
  } catch {
    return Response.json({ error: "Object cleanup failed" }, { status: 503 })
  }
}
