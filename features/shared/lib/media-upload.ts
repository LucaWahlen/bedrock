import { z } from "zod"

import {
  InvalidMediaError,
  isValidMediaBytes,
  type MediaKind,
} from "@/features/shared/lib/storage/media"

const uploadResponseSchema = z.object({
  key: z.string(),
  uploadUrl: z.url(),
  publicUrl: z.url(),
})

const uploadErrorSchema = z.object({ error: z.string() })

export type UploadedMedia = z.infer<typeof uploadResponseSchema>

function canBrowserDecodeImage(file: File) {
  if (typeof window === "undefined" || typeof window.Image !== "function") {
    return Promise.resolve(true)
  }

  const objectUrl = URL.createObjectURL(file)
  return new Promise<boolean>((resolve) => {
    const image = new window.Image()
    image.addEventListener(
      "load",
      () => {
        resolve(
          file.type === "image/svg+xml" ||
            (image.naturalWidth > 0 && image.naturalHeight > 0)
        )
      },
      { once: true }
    )
    image.addEventListener("error", () => resolve(false), { once: true })
    image.src = objectUrl
  }).finally(() => URL.revokeObjectURL(objectUrl))
}

export async function canDecodeMediaFile(file: File) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!isValidMediaBytes(file.type, bytes)) return false
    return await canBrowserDecodeImage(file)
  } catch {
    return false
  }
}

export async function uploadMedia(file: File, kind: MediaKind) {
  if (!(await canDecodeMediaFile(file))) {
    throw new InvalidMediaError("This image file could not be read")
  }

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
