import type { Metadata } from "next"
import type { CSSProperties } from "react"

import {
  getOrganizationBySlug,
  getRootOrganization,
} from "@/features/organizations"
import { env } from "@/features/shared/lib/config/env"
import {
  contrastingForeground,
  normalizeHexColor,
} from "@/features/shared/lib/ui/color"

type OrgRootLayoutProps = {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: Omit<OrgRootLayoutProps, "children">): Promise<Metadata> {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)

  return {
    icons: {
      icon: currentOrganization?.favicon ?? env.defaultFaviconUrl,
    },
  }
}

export default async function OrgRootLayout({
  children,
  params,
}: OrgRootLayoutProps) {
  const { slug } = await params
  const [currentOrganization, rootOrganization] = await Promise.all([
    getOrganizationBySlug(slug),
    getRootOrganization(),
  ])

  const organizationColor = normalizeHexColor(currentOrganization?.color)
  const primaryForeground = organizationColor
    ? contrastingForeground(organizationColor)
    : null
  const rootColor = normalizeHexColor(rootOrganization?.color)

  const organizationTheme = {
    ...(organizationColor && {
      "--primary": organizationColor,
      "--primary-foreground": primaryForeground,
    }),
    ...(rootColor && { "--root-primary": rootColor }),
  } as CSSProperties

  return (
    <>
      {organizationColor && primaryForeground && (
        <style>{`:root{--primary:${organizationColor};--primary-foreground:${primaryForeground};}`}</style>
      )}
      {rootColor && <style>{`:root{--root-primary:${rootColor};}`}</style>}
      <div style={organizationTheme}>{children}</div>
    </>
  )
}
