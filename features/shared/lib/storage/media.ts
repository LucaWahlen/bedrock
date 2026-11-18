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
    file.size > 0 &&
    policy.contentTypes.some((contentType) => contentType === file.type) &&
    file.size <= policy.maxBytes
  )
}

export const MAX_MEDIA_BYTES = Math.max(
  ...Object.values(MEDIA_POLICIES).map((policy) => policy.maxBytes)
)

export class InvalidMediaError extends Error {
  constructor(message = "Invalid media file") {
    super(message)
    this.name = "InvalidMediaError"
  }
}

export function isInvalidMediaError(
  error: unknown
): error is InvalidMediaError {
  return error instanceof InvalidMediaError
}

function readU16BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readU16LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readU24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function readU32BE(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  )
}

function readU32LE(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  )
}

function readI32LE(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  )
}

function asciiAt(bytes: Uint8Array, offset: number, expected: string) {
  if (offset + expected.length > bytes.length) return false
  for (let index = 0; index < expected.length; index++) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) return false
  }
  return true
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function isValidPng(bytes: Uint8Array) {
  if (bytes.length < 45) return false
  for (let index = 0; index < PNG_SIGNATURE.length; index++) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return false
  }
  if (readU32BE(bytes, 8) !== 13 || !asciiAt(bytes, 12, "IHDR")) return false
  if (readU32BE(bytes, 16) === 0 || readU32BE(bytes, 20) === 0) return false

  let offset = 8
  let hasData = false
  while (offset + 12 <= bytes.length) {
    const length = readU32BE(bytes, offset)
    const next = offset + 12 + length
    if (next > bytes.length) return false

    if (asciiAt(bytes, offset + 4, "IDAT") && length > 0) hasData = true
    if (asciiAt(bytes, offset + 4, "IEND")) {
      return length === 0 && hasData && next === bytes.length
    }
    offset = next
  }

  return false
}

function isJpegFrameMarker(marker: number) {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  )
}

function hasJpegEndOfImage(bytes: Uint8Array, from: number) {
  for (let index = bytes.length - 2; index >= from; index--) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0xd9) {
      return index > from
    }
  }
  return false
}

function isValidJpeg(bytes: Uint8Array) {
  if (bytes.length < 20) return false
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return false

  let offset = 2
  let hasFrame = false
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return false
    while (offset < bytes.length && bytes[offset] === 0xff) offset++
    if (offset >= bytes.length) return false

    const marker = bytes[offset++]
    if (marker === 0x00 || marker === 0xd9) return false
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue

    if (offset + 2 > bytes.length) return false
    const segmentLength = readU16BE(bytes, offset)
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return false

    if (isJpegFrameMarker(marker)) {
      if (segmentLength < 8) return false
      const height = readU16BE(bytes, offset + 3)
      const width = readU16BE(bytes, offset + 5)
      if (width === 0 || height === 0) return false
      hasFrame = true
    }

    if (marker === 0xda) {
      return hasFrame && hasJpegEndOfImage(bytes, offset + segmentLength)
    }

    offset += segmentLength
  }

  return false
}

function isValidWebp(bytes: Uint8Array) {
  if (bytes.length < 20) return false
  if (!asciiAt(bytes, 0, "RIFF") || !asciiAt(bytes, 8, "WEBP")) return false

  const riffSize = readU32LE(bytes, 4)
  const riffEnd = 8 + riffSize
  if (riffSize < 12 || riffEnd > bytes.length) return false

  let offset = 12
  let hasBitstream = false
  while (offset + 8 <= riffEnd) {
    const chunkSize = readU32LE(bytes, offset + 4)
    const dataOffset = offset + 8
    const dataEnd = dataOffset + chunkSize
    if (dataEnd > riffEnd) return false

    if (asciiAt(bytes, offset, "VP8 ")) {
      if (
        chunkSize < 10 ||
        (bytes[dataOffset] & 1) !== 0 ||
        bytes[dataOffset + 3] !== 0x9d ||
        bytes[dataOffset + 4] !== 0x01 ||
        bytes[dataOffset + 5] !== 0x2a ||
        (readU16LE(bytes, dataOffset + 6) & 0x3fff) === 0 ||
        (readU16LE(bytes, dataOffset + 8) & 0x3fff) === 0
      ) {
        return false
      }
      hasBitstream = true
    } else if (asciiAt(bytes, offset, "VP8L")) {
      if (chunkSize < 5 || bytes[dataOffset] !== 0x2f) return false
      hasBitstream = true
    } else if (asciiAt(bytes, offset, "VP8X")) {
      if (chunkSize !== 10) return false
      if (readU24LE(bytes, dataOffset + 4) > 0xffffff) return false
    } else if (asciiAt(bytes, offset, "ANMF") && chunkSize >= 16) {
      hasBitstream = true
    }

    offset = dataEnd < riffEnd ? dataEnd + (chunkSize & 1) : dataEnd
  }

  return hasBitstream && offset === riffEnd
}

function isValidIco(bytes: Uint8Array) {
  if (bytes.length < 22) return false
  if (bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1 || bytes[3] !== 0) {
    return false
  }

  const count = readU16LE(bytes, 4)
  const directoryEnd = 6 + count * 16
  if (count < 1 || count > 256 || directoryEnd > bytes.length) return false

  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16
    const size = readU32LE(bytes, entry + 8)
    const offset = readU32LE(bytes, entry + 12)
    if (size < 40 || offset < directoryEnd || offset + size > bytes.length) {
      return false
    }

    const image = bytes.subarray(offset, offset + size)
    if (image[0] === 0x89) {
      if (!isValidPng(image)) return false
      continue
    }

    const headerSize = readU32LE(image, 0)
    const width = Math.abs(readI32LE(image, 4))
    const height = Math.abs(readI32LE(image, 8))
    if (headerSize !== 40 || width === 0 || height < 2) return false
  }

  return true
}

function isValidSvg(bytes: Uint8Array) {
  if (bytes.length === 0) return false
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return false
  }
  if (text.includes("\0")) return false

  const body = text
    .replace(/^\uFEFF/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!DOCTYPE[^>]*>\s*)?/i, "")
    .trim()

  if (!/^<svg(?=[\s/>])/i.test(body)) return false
  if (!/(?:<\/svg>|\/>)$/i.test(body)) return false
  if (/<(?:script|foreignObject)(?=[\s/>])/i.test(body)) return false
  if (/\bon[a-z]+\s*=/i.test(body) || /javascript\s*:/i.test(body)) {
    return false
  }

  const opens = body.match(/<svg(?=[\s/>])/gi)?.length ?? 0
  const closes = body.match(/<\/svg\s*>/gi)?.length ?? 0
  const selfClosingRoot = /^<svg\b[^>]*\/>$/i.test(body)
  return selfClosingRoot ? opens === 1 && closes === 0 : opens === closes
}

/**
 * Checks that uploaded bytes actually decode as the format their Content-Type
 * claims, rather than trusting the filename extension the browser guessed from.
 */
export function isValidMediaBytes(contentType: string, bytes: Uint8Array) {
  switch (contentType) {
    case "image/png":
      return isValidPng(bytes)
    case "image/jpeg":
      return isValidJpeg(bytes)
    case "image/webp":
      return isValidWebp(bytes)
    case "image/x-icon":
      return isValidIco(bytes)
    case "image/svg+xml":
      return isValidSvg(bytes)
    default:
      return false
  }
}
