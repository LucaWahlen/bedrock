import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import { AuthShell, getAccessContext, VerifyEmailPanel } from "@/features/auth"
import { getOrganizationBySlug } from "@/features/organizations"

type VerifyEmailPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string }>
}

export async function generateMetadata({
  params,
}: VerifyEmailPageProps): Promise<Metadata> {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)

  const t = await getTranslations("auth.metadata")

  return {
    title: currentOrganization
      ? `${t("verifyEmail")} | ${currentOrganization.name}`
      : t("verifyEmail"),
  }
}

export default async function Page({
  params,
  searchParams,
}: VerifyEmailPageProps) {
  const [{ slug }, { token }] = await Promise.all([params, searchParams])
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization) notFound()

  const access = await getAccessContext()

  // A confirmed account has nothing to do here unless it brought a link, which
  // is how a change of address is confirmed. Neither does a visitor with
  // neither a session nor a link to redeem.
  if (access.user?.emailVerified && !token) redirect(`/org/${slug}`)
  if (!access.user && !token) redirect(`/org/${slug}/login`)

  return (
    <AuthShell organization={currentOrganization}>
      <VerifyEmailPanel
        organization={currentOrganization}
        email={access.user?.email ?? null}
        token={token ?? null}
      />
    </AuthShell>
  )
}
