import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"

import { updateProfile } from "@/features/account"
import { updateOrganization } from "@/features/organizations"
import {
  getOrganizationBrandingStagingPrefix,
  isValidMediaBytes,
} from "@/features/shared/lib/storage/media"
import { deleteStoredObjects } from "@/features/shared/lib/storage/promote-media"
import { getObjectStorage } from "@/features/shared/lib/storage/s3"
import { createFixture, type Fixture } from "@/tests/support/fixtures"
import { actAs } from "@/tests/support/request"

// Minimal 1x1 transparent PNG.
const VALID_PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
    "base64"
  )
)

// Minimal 1x1 baseline JPEG (SOI, SOF0 1x1, SOS, 1 entropy byte, EOI).
const VALID_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01,
  0x11, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f,
  0xff, 0xd9,
])

// Minimal 1x1 lossless WebP (RIFF + WEBP + VP8L).
const VALID_WEBP = Uint8Array.from(
  Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64")
)

function pngBackedIco(png: Uint8Array) {
  const ico = new Uint8Array(22 + png.length)
  ico[2] = 1
  ico[4] = 1
  ico[6] = 1
  ico[7] = 1
  const view = new DataView(ico.buffer)
  view.setUint32(14, png.length, true)
  view.setUint32(18, 22, true)
  ico.set(png, 22)
  return ico
}

describe("media byte validation", () => {
  test("accepts well-formed PNG, JPEG, WebP, ICO and SVG files", () => {
    const repoLogo = new Uint8Array(readFileSync("public/bedrock-logo.svg"))
    expect(isValidMediaBytes("image/png", VALID_PNG)).toBe(true)
    expect(isValidMediaBytes("image/jpeg", VALID_JPEG)).toBe(true)
    expect(isValidMediaBytes("image/webp", VALID_WEBP)).toBe(true)
    expect(isValidMediaBytes("image/x-icon", pngBackedIco(VALID_PNG))).toBe(
      true
    )
    expect(isValidMediaBytes("image/svg+xml", repoLogo)).toBe(true)
  })

  test("refuses corrupt, truncated and mislabelled files", () => {
    const textBytes = new TextEncoder().encode("not an image")
    expect(isValidMediaBytes("image/png", textBytes)).toBe(false)
    expect(
      isValidMediaBytes(
        "image/png",
        VALID_PNG.subarray(0, VALID_PNG.length - 4)
      )
    ).toBe(false)
    expect(
      isValidMediaBytes(
        "image/jpeg",
        VALID_JPEG.subarray(0, VALID_JPEG.length - 2)
      )
    ).toBe(false)
    expect(
      isValidMediaBytes(
        "image/webp",
        VALID_WEBP.subarray(0, VALID_WEBP.length - 6)
      )
    ).toBe(false)
    expect(isValidMediaBytes("image/x-icon", VALID_PNG)).toBe(false)
    expect(
      isValidMediaBytes(
        "image/svg+xml",
        new TextEncoder().encode("<html><body>nope</body></html>")
      )
    ).toBe(false)
    expect(
      isValidMediaBytes(
        "image/svg+xml",
        new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        )
      )
    ).toBe(false)
    expect(
      isValidMediaBytes(
        "image/svg+xml",
        new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'
        )
      )
    ).toBe(false)
  })
})

describe("promoting staged media", () => {
  let fixture: Fixture
  const createdKeys: string[] = []

  async function stage(userId: string, bytes: Uint8Array, contentType: string) {
    const { client, bucket } = getObjectStorage()
    const key = `${getOrganizationBrandingStagingPrefix(userId)}${crypto.randomUUID()}.png`
    createdKeys.push(key)
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        Body: bytes,
      })
    )
    return key
  }

  beforeAll(async () => {
    fixture = await createFixture("media-validation")
  })

  afterAll(async () => {
    await deleteStoredObjects(createdKeys)
    await fixture.cleanup()
  })

  test("rejects a broken image on profile save and cleans up the staged object", async () => {
    const brokenKey = await stage(
      fixture.alice.id,
      new TextEncoder().encode("corrupt-png-bytes"),
      "image/png"
    )

    await actAs(fixture.alice)
    const result = await updateProfile({
      name: fixture.alice.name,
      avatar: { action: "replace", key: brokenKey },
    })

    expect(result).toEqual({
      success: false,
      error: "Invalid profile picture",
    })

    const { client, bucket } = getObjectStorage()
    await expect(
      client.send(new HeadObjectCommand({ Bucket: bucket, Key: brokenKey }))
    ).rejects.toThrow()
  })

  test("accepts a valid image for the owning tenant and refuses cross-tenant or broken uploads", async () => {
    const brokenOrgKey = await stage(
      fixture.alice.id,
      new TextEncoder().encode("corrupt-logo"),
      "image/png"
    )
    await actAs(fixture.alice)
    const brokenResult = await updateOrganization({
      organizationId: fixture.orgA.id,
      logo: { action: "replace", key: brokenOrgKey },
    })
    expect(brokenResult).toEqual({
      success: false,
      error: "Invalid organization media",
    })

    const aliceStagedKey = await stage(fixture.alice.id, VALID_PNG, "image/png")

    // Bob owns orgB, not Alice's staged object, and Alice does not administer orgB.
    await actAs(fixture.bob)
    const crossUser = await updateOrganization({
      organizationId: fixture.orgB.id,
      logo: { action: "replace", key: aliceStagedKey },
    })
    expect(crossUser.success).toBe(false)

    await actAs(fixture.alice)
    const crossTenant = await updateOrganization({
      organizationId: fixture.orgB.id,
      logo: { action: "replace", key: aliceStagedKey },
    })
    expect(crossTenant.success).toBe(false)

    const validResult = await updateOrganization({
      organizationId: fixture.orgA.id,
      logo: { action: "replace", key: aliceStagedKey },
    })
    expect(validResult.success).toBe(true)

    // Remove the logo again so the tenant's stored object is cleaned up too.
    const cleared = await updateOrganization({
      organizationId: fixture.orgA.id,
      logo: { action: "remove" },
    })
    expect(cleared.success).toBe(true)
  })
})
