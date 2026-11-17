import { describe, expect, test } from "bun:test"

import { buildEnvironment } from "@/features/shared/lib/config/env"
import deHealth from "@/messages/de/health.json"
import enHealth from "@/messages/en/health.json"

describe("health build metadata", () => {
  test("keeps valid tags and hex revisions and drops malformed ones", () => {
    expect(buildEnvironment({})).toEqual({
      tag: undefined,
      commit: undefined,
    })
    expect(
      buildEnvironment({
        GIT_TAG: "v0.1.0",
        GIT_COMMIT: "8A8506ECD100F5E4B5CBBA0146975C8CFB97328B",
      })
    ).toEqual({
      tag: "v0.1.0",
      commit: "8a8506ecd100",
    })
    expect(
      buildEnvironment({
        GIT_TAG: "refs/tags/v0.2.0-beta.1",
        SOURCE_COMMIT: "abcdef1234567",
      })
    ).toEqual({
      tag: "v0.2.0-beta.1",
      commit: "abcdef123456",
    })
    expect(buildEnvironment({ GIT_TAG: "nightly" })).toEqual({
      tag: "nightly",
      commit: undefined,
    })
    expect(
      buildEnvironment({
        GIT_TAG: "refs/heads/main",
        GIT_COMMIT: "not-a-commit",
      })
    ).toEqual({
      tag: undefined,
      commit: undefined,
    })
  })

  test("exposes only tag and commit labels in health messages", () => {
    expect(Object.keys(enHealth.build)).toEqual(["tag", "commit"])
    expect(Object.keys(deHealth.build)).toEqual(["tag", "commit"])
  })
})
