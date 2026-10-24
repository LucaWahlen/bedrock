import { afterAll, afterEach, describe, expect, test } from "bun:test"

import { like } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import { rateLimit } from "@/features/shared/lib/db/schema"
import {
  checkPasswordAgainstBreaches,
  countFromRange,
  passwordRangeQuery,
  PWNED_LOOKUP_LIMIT,
  pwnedPasswordCount,
} from "@/features/shared/lib/pwned-passwords"

// The parsing and the k-anonymity split are pure and tested directly. The
// network path is tested by replacing `fetch`, so the suite neither depends on
// Have I Been Pwned being reachable nor sends anything anywhere.

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

// Bun's `fetch` carries a `preconnect` method, so a bare function cannot stand
// in for it without borrowing one.
function stubFetch(
  implementation: (
    url: string | URL | Request,
    init?: RequestInit
  ) => Promise<Response>
) {
  globalThis.fetch = Object.assign(implementation, {
    preconnect: realFetch.preconnect,
  }) as typeof fetch
}

function respondWith(body: string, init: ResponseInit = { status: 200 }) {
  stubFetch(() => Promise.resolve(new Response(body, init)))
}

describe("what actually leaves the instance", () => {
  test("five hex characters, and never the password", () => {
    const { prefix, suffix } = passwordRangeQuery("password")

    // The full SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8.
    expect(prefix).toBe("5BAA6")
    expect(suffix).toBe("1E4C9B93F3F0682250B6CF8331B7EE68FD8")
    expect(prefix).toHaveLength(5)
  })

  test("the split always reassembles into the whole digest", () => {
    const { prefix, suffix } = passwordRangeQuery("plain lantern harbour")

    expect(prefix + suffix).toHaveLength(40)
  })

  test("non-ascii passwords are hashed as utf-8 rather than throwing", () => {
    expect(passwordRangeQuery("paßwort-mit-ümläuten").prefix).toHaveLength(5)
  })
})

describe("reading a range response", () => {
  const suffix = "1E4C9B93F3F0682250B6CF8331B7EE68FD8"

  test("finds the count for a matching suffix", () => {
    expect(countFromRange(`${suffix}:52372427`, suffix)).toBe(52372427)
  })

  test("ignores the other suffixes in the bucket", () => {
    const body = ["0002EEFFB2CCA91812B5CC9956854E22BEB:4", `${suffix}:12`].join(
      "\n"
    )

    expect(countFromRange(body, suffix)).toBe(12)
  })

  test("returns zero when the suffix is absent", () => {
    expect(
      countFromRange("0002EEFFB2CCA91812B5CC9956854E22BEB:4", suffix)
    ).toBe(0)
  })

  test("tolerates the carriage returns the API actually sends", () => {
    expect(countFromRange(`${suffix}:99\r\nAAAA:1\r\n`, suffix)).toBe(99)
  })

  // Padded responses carry decoy suffixes with a count of zero, and treating
  // one as a hit would refuse a perfectly good password.
  test("a padding entry counts as not breached", () => {
    expect(countFromRange(`${suffix}:0`, suffix)).toBe(0)
  })
})

describe("when the service cannot answer", () => {
  test("a refused connection allows the password through", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")))

    expect(await pwnedPasswordCount("password")).toBeNull()
  })

  test("so does an error response", async () => {
    respondWith("", { status: 503 })

    expect(await pwnedPasswordCount("password")).toBeNull()
  })

  test("and so does a timeout", async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("abort"))
          )
        })
    )

    expect(await pwnedPasswordCount("password")).toBeNull()
  }, 5000)
})

describe("a successful lookup", () => {
  test("reports the breach count for the password asked about", async () => {
    const { suffix } = passwordRangeQuery("password")
    respondWith(`${suffix}:52372427`)

    expect(await pwnedPasswordCount("password")).toBe(52372427)
  })

  test("and zero when the bucket does not contain it", async () => {
    respondWith("0002EEFFB2CCA91812B5CC9956854E22BEB:4")

    expect(await pwnedPasswordCount("password")).toBe(0)
  })

  test("asks for a padded response, so its size reveals nothing", async () => {
    let headers: HeadersInit | undefined
    stubFetch((_url, init) => {
      headers = init?.headers
      return Promise.resolve(new Response(""))
    })

    await pwnedPasswordCount("password")

    expect(headers).toMatchObject({ "Add-Padding": "true" })
  })

  test("requests only the prefix bucket, never the password", async () => {
    let requested = ""
    stubFetch((url) => {
      requested = String(url)
      return Promise.resolve(new Response(""))
    })

    const secret = "lantern-harbour-9182"
    await pwnedPasswordCount(secret)

    expect(requested).toEndWith(`/${passwordRangeQuery(secret).prefix}`)
    expect(requested).not.toContain("lantern")
    expect(requested).not.toContain(passwordRangeQuery(secret).suffix)
  })
})

// The lookup has a budget so one caller cannot make this instance fetch without
// limit. Exhausting it must refuse the request, not wave the password through:
// skipping would make the check optional to anyone willing to spend the budget
// on throwaway submissions first.
describe("when the lookup budget is spent", () => {
  const source = `test-${crypto.randomUUID().slice(0, 8)}`
  const breached = passwordRangeQuery("password").suffix

  afterAll(async () => {
    await db.delete(rateLimit).where(like(rateLimit.key, "pwned-lookup:test-%"))
  })

  test("the request is refused rather than allowed unchecked", async () => {
    respondWith("")

    // Spend the budget on submissions that are themselves fine.
    for (let attempt = 0; attempt < PWNED_LOOKUP_LIMIT.max; attempt++) {
      expect(
        (await checkPasswordAgainstBreaches("plain lantern harbour", source)).ok
      ).toBe(true)
    }

    const verdict = await checkPasswordAgainstBreaches(
      "plain lantern harbour",
      source
    )

    expect(verdict.ok).toBe(false)
    if (verdict.ok) return
    expect(verdict.error).toContain("Too many attempts")
  }, 30_000)

  test("so a breached password cannot slip through behind it", async () => {
    respondWith(`${breached}:52372427`)

    expect(await checkPasswordAgainstBreaches("password", source)).toEqual({
      ok: false,
      error: expect.stringContaining("Too many attempts"),
    })
  })

  test("while another source still has its own budget", async () => {
    respondWith(`${breached}:52372427`)

    expect(
      await checkPasswordAgainstBreaches("password", `${source}-other`)
    ).toEqual({
      ok: false,
      error:
        "This password has appeared in a data breach. Choose a different one.",
    })
  })
})

describe("the verdict a caller acts on", () => {
  const source = `test-${crypto.randomUUID().slice(0, 8)}-verdict`

  afterAll(async () => {
    await db.delete(rateLimit).where(like(rateLimit.key, "pwned-lookup:test-%"))
  })

  test("allows a password the corpus does not know", async () => {
    respondWith("0002EEFFB2CCA91812B5CC9956854E22BEB:4")

    expect(
      await checkPasswordAgainstBreaches("plain lantern harbour", source)
    ).toEqual({ ok: true })
  })

  test("allows one when the service cannot be reached", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")))

    expect(
      await checkPasswordAgainstBreaches("plain lantern harbour", source)
    ).toEqual({ ok: true })
  })
})
