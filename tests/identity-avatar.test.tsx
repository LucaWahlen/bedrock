import { expect, test } from "bun:test"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { IdentityAvatar } from "@/features/shared/components/identity-avatar"

test("renders uploaded avatars without requiring cross-origin image permission", () => {
  const markup = renderToStaticMarkup(
    createElement(IdentityAvatar, {
      logo: "https://images.example.test/users/avatar.webp",
      name: "Ada Lovelace",
      seed: "user-1",
      variant: "md",
    })
  )

  expect(markup).toContain(
    "https%3A%2F%2Fimages.example.test%2Fusers%2Favatar.webp"
  )
  expect(markup).not.toContain("crossorigin")
})
