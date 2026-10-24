import { render } from "@react-email/render"
import type { ReactElement } from "react"

import { env } from "@/features/shared/lib/config/env"
import type { EmailBrand } from "@/features/shared/lib/email/templates/layout"
import { normalizeHexColor } from "@/features/shared/lib/ui/color"

/** A mail client cannot resolve a relative source, so a bare path is dropped. */
function absoluteImage(value: string | null | undefined) {
  return value && /^https?:\/\//i.test(value) ? value : null
}

export function emailBrand(organization: {
  name: string
  logo?: string | null
  color?: string | null
}): EmailBrand {
  return {
    organizationName: organization.name,
    logoUrl: absoluteImage(organization.logo),
    color: normalizeHexColor(organization.color) ?? env.rootOrganization.color,
  }
}

export async function renderEmail(element: ReactElement) {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])

  return { html, text }
}
