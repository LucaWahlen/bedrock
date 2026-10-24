import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"

import { LoginPage } from "@/features/auth"
import {
  getOrganizationBySlug,
  getRootOrganization,
} from "@/features/organizations"

type LoginPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: LoginPageProps): Promise<Metadata> {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)
  const rootOrganization = currentOrganization
    ? undefined
    : await getRootOrganization()
  const organizationName = currentOrganization?.name ?? rootOrganization?.name
  const t = await getTranslations("auth.metadata")

  return {
    title: organizationName
      ? `${t("login")} | ${organizationName}`
      : t("login"),
  }
}

export default async function Page({ params }: LoginPageProps) {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)

  if (!currentOrganization) {
    const rootOrganization = await getRootOrganization()

    if (rootOrganization) {
      redirect(`/org/${rootOrganization.slug}/login`)
    }
  }

  return (
    <LoginPage
      organization={currentOrganization}
      allowSignUp={currentOrganization?.allowPublicSignUp ?? false}
    />
  )
}
