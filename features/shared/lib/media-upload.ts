import { z } from "zod"

import type { MediaKind } from "@/features/shared/lib/storage/media"

const uploadResponseSchema = z.object({
  key: z.string(),
  uploadUrl: z.url(),
  publicUrl: z.url(),
})

const uploadErrorSchema = z.object({ error: z.string() })

export type UploadedMedia = z.infer<typeof uploadResponseSchema>

export async function uploadMedia(file: File, kind: MediaKind) {
  const presignResponse = await fetch("/api/uploads/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, contentType: file.type, size: file.size }),
  })
  const responseBody: unknown = await presignResponse.json()
  const presignResult = uploadResponseSchema.safeParse(responseBody)

  if (!presignResponse.ok || !presignResult.success) {
    const uploadError = uploadErrorSchema.safeParse(responseBody)
    throw new Error(
      uploadError.success
        ? uploadError.data.error
        : "Could not prepare the image upload"
    )
  }

  const uploadResponse = await fetch(presignResult.data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  })
  if (!uploadResponse.ok) throw new Error("Could not upload the image")

  return presignResult.data
}

export async function cleanupMedia(media: UploadedMedia[]) {
  await Promise.allSettled(
    media.map((item) =>
      fetch("/api/uploads/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: item.key }),
      })
    )
  )
}
