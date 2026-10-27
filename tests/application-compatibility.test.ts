import { describe, expect, test } from "bun:test"

import {
  createApplicationRoleSchema,
  createApplicationSchema,
  registeredClientAuthMethod,
} from "@/features/applications/schemas/application"
import { translatorFor } from "@/features/shared/lib/i18n/translator"

const applicationSchema = createApplicationSchema(
  translatorFor("en", "applications")
)
const applicationRoleSchema = createApplicationRoleSchema(
  translatorFor("en", "applications")
)
const application = {
  name: "Portal",
  redirectUris: ["https://portal.example.test/callback"],
}

describe("stock OIDC client compatibility", () => {
  test("defaults confidential clients to post and accepts basic explicitly", () => {
    expect(
      registeredClientAuthMethod(
        false,
        applicationSchema.parse(application).tokenEndpointAuthMethod
      )
    ).toBe("client_secret_post")
    expect(
      applicationSchema.safeParse({
        ...application,
        tokenEndpointAuthMethod: "client_secret_basic",
      }).success
    ).toBe(true)
  })

  test("public clients do not use a client secret", () => {
    expect(registeredClientAuthMethod(true, "client_secret_basic")).toBe("none")
    expect(registeredClientAuthMethod(false, "client_secret_post")).toBe(
      "client_secret_post"
    )
  })

  test("accepts exact case-sensitive role keys", () => {
    expect(
      applicationRoleSchema.safeParse({
        key: "consoleAdmin",
        name: "Console administrator",
        clientIds: [],
      }).success
    ).toBe(true)
  })
})
