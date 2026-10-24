import { S3Client } from "@aws-sdk/client-s3"

import { env } from "@/features/shared/lib/config/env"

let storageClient: S3Client | undefined

export function getObjectStorage() {
  storageClient ??= new S3Client({
    region: env.storage.region,
    endpoint: env.storage.endpoint,
    forcePathStyle: env.storage.forcePathStyle,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: env.storage.accessKeyId,
      secretAccessKey: env.storage.secretAccessKey,
    },
  })

  return {
    client: storageClient,
    bucket: env.storage.bucket,
    publicUrl: env.storage.publicUrl.replace(/\/$/, ""),
  }
}

export function getPublicObjectUrl(publicUrl: string, key: string) {
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  return `${publicUrl}/${encodedKey}`
}
