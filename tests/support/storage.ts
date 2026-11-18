import { mock } from "bun:test"

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3"

import { env } from "@/features/shared/lib/config/env"

type StoredObject = {
  bytes: Uint8Array
  contentType: string
}

// Stands in for S3/MiniStack so media promotion, avatar replacement and tenant
// object cleanup run in CI without an object-storage container.
export const storedObjects = new Map<string, StoredObject>()

function notFound(key: string) {
  const error = new Error(`NoSuchKey: ${key}`)
  error.name = "NotFound"
  return error
}

function toBytes(body: unknown): Uint8Array {
  if (body instanceof Uint8Array) return new Uint8Array(body)
  if (typeof body === "string") return new TextEncoder().encode(body)
  return new Uint8Array(0)
}

function parseCopySourceKey(copySource: string) {
  const trimmed = copySource.replace(/^\//, "")
  const [, ...segments] = trimmed.split("/")
  return segments.map((segment) => decodeURIComponent(segment)).join("/")
}

const memoryClient = {
  send: async (command: unknown) => {
    if (command instanceof HeadBucketCommand) {
      return {}
    }

    if (command instanceof PutObjectCommand) {
      const key = command.input.Key ?? ""
      storedObjects.set(key, {
        bytes: toBytes(command.input.Body),
        contentType: command.input.ContentType ?? "application/octet-stream",
      })
      return {}
    }

    if (command instanceof HeadObjectCommand) {
      const key = command.input.Key ?? ""
      const found = storedObjects.get(key)
      if (!found) throw notFound(key)
      return {
        ContentType: found.contentType,
        ContentLength: found.bytes.byteLength,
      }
    }

    if (command instanceof GetObjectCommand) {
      const key = command.input.Key ?? ""
      const found = storedObjects.get(key)
      if (!found) throw notFound(key)
      const snapshot = new Uint8Array(found.bytes)
      return {
        ContentType: found.contentType,
        ContentLength: snapshot.byteLength,
        Body: {
          transformToByteArray: async () => snapshot,
        },
      }
    }

    if (command instanceof CopyObjectCommand) {
      const sourceKey = parseCopySourceKey(command.input.CopySource ?? "")
      const source = storedObjects.get(sourceKey)
      if (!source) throw notFound(sourceKey)
      const destinationKey = command.input.Key ?? ""
      storedObjects.set(destinationKey, {
        bytes: new Uint8Array(source.bytes),
        contentType: command.input.ContentType ?? source.contentType,
      })
      return {}
    }

    if (command instanceof DeleteObjectCommand) {
      storedObjects.delete(command.input.Key ?? "")
      return {}
    }

    if (command instanceof ListObjectsV2Command) {
      const prefix = command.input.Prefix ?? ""
      const Contents = Array.from(storedObjects.keys())
        .filter((key) => key.startsWith(prefix))
        .map((Key) => ({ Key }))
      return { Contents, IsTruncated: false }
    }

    throw new Error(
      `Unsupported S3 command in test storage stand-in: ${String(command)}`
    )
  },
}

mock.module("@/features/shared/lib/storage/s3", () => ({
  getObjectStorage: () => ({
    client: memoryClient,
    bucket: env.storage.bucket,
    publicUrl: env.storage.publicUrl.replace(/\/$/, ""),
  }),
  getPublicObjectUrl: (publicUrl: string, key: string) => {
    const encodedKey = key
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")
    return `${publicUrl}/${encodedKey}`
  },
}))
