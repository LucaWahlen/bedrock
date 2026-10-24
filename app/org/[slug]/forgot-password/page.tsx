import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound } from "next/navigation"

import {
  AuthShell,
  ForgotPasswordForm,
  isInvitationToken,
} from "@/features/auth"
import { getOrganizationBySlug } from "@/features/organizations"

type ForgotPasswordPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ invitation?: string }>
}

export async function generateMetadata({
  params,
}: ForgotPasswordPageProps): Promise<Metadata> {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)

  const t = await getTranslations("auth.metadata")

  return {
    title: currentOrganization
      ? `${t("resetPassword")} | ${currentOrganization.name}`
      : t("resetPassword"),
  }
}

export default async function Page({
  params,
  searchParams,
}: ForgotPasswordPageProps) {
  const [{ slug }, { invitation }] = await Promise.all([params, searchParams])
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization) notFound()

  return (
    <AuthShell organization={currentOrganization}>
      <ForgotPasswordForm
        organization={currentOrganization}
        invitationToken={isInvitationToken(invitation) ? invitation : undefined}
      />
    </AuthShell>
  )
}
