import { describe, expect, test } from "bun:test"

import {
  assessPassword,
  MINIMUM_PASSWORD_LENGTH,
  MINIMUM_PASSWORD_SCORE,
} from "@/features/shared/lib/password-strength"

// zxcvbn does the estimating, so these do not re-test its scoring. What they
// pin is the policy around it: where our own floor sits, that the person's
// details are handed over as known inputs, and that a refusal explains itself.

async function score(
  password: string,
  context?: { email?: string; name?: string }
) {
  return (await assessPassword(password, context)).score
}

describe("the floor this application sets", () => {
  test("under the minimum length is refused whatever zxcvbn thinks", async () => {
    const short = "xk7$Qm"

    expect(short.length).toBeLessThan(MINIMUM_PASSWORD_LENGTH)
    expect(await score(short)).toBe(0)
  })

  test("and says so rather than offering generic advice", async () => {
    expect((await assessPassword("xk7$Qm")).hint).toBe(
      `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`
    )
  })
})

describe("what zxcvbn catches that a rule-based meter would not", () => {
  test.each([
    ["a leetspeak classic", "P@ssw0rd1"],
    ["a padded dictionary word", "sunshine123"],
    ["a keyboard walk", "qwertyuiop"],
    ["a date", "01011990"],
  ])("%s is below the accepted score", async (_name, password) => {
    expect(await score(password)).toBeLessThan(MINIMUM_PASSWORD_SCORE)
  })

  test("a long passphrase of one character class is strong", async () => {
    expect(await score("correct horse battery staple")).toBe(4)
  })

  test("length beats ornamentation", async () => {
    expect(await score("Ab3$xY7!")).toBeLessThan(
      await score("plain lantern harbour")
    )
  })
})

describe("the person's own details are known to an attacker", () => {
  const context = { email: "jonathan@example.test", name: "Jonathan Marsh" }

  // The clean demonstration that the context reaches zxcvbn at all: on its own
  // this address is long and varied enough to score top marks.
  test("their own address is refused however strong it looks", async () => {
    expect(await score("jonathan@example.test")).toBe(4)
    expect(await score("jonathan@example.test", context)).toBe(0)
  })

  test("their own name is refused", async () => {
    expect(await score("jonathanmarsh", context)).toBeLessThan(
      MINIMUM_PASSWORD_SCORE
    )
  })

  test("the context only ever lowers a score, never raises it", async () => {
    for (const password of ["jonathanmarsh", "JonathanMarsh1", "marsh-2024"]) {
      expect(await score(password, context)).toBeLessThanOrEqual(
        await score(password)
      )
    }
  })

  test("an unrelated password is unaffected by it", async () => {
    expect(
      await score("plain lantern harbour", context)
    ).toBeGreaterThanOrEqual(MINIMUM_PASSWORD_SCORE)
  })
})

describe("what the person is told", () => {
  test("a refusal always explains itself", async () => {
    for (const password of ["xk7$Qm", "P@ssw0rd1", "sunshine123"]) {
      expect((await assessPassword(password)).hint).toBeString()
    }
  })

  test("the strongest band is not nagged", async () => {
    expect(
      (await assessPassword("correct horse battery staple")).hint
    ).toBeNull()
  })

  test("an assessment always carries a label", async () => {
    const assessment = await assessPassword("plain lantern harbour")

    expect(assessment.label).toBeString()
    expect(assessment.strength).toBeString()
  })
})
