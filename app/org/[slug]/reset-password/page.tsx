import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import {
  AuthShell,
  isInvitationToken,
  ResetPasswordForm,
} from "@/features/auth"
import { getOrganizationBySlug } from "@/features/organizations"

type ResetPasswordPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string; invitation?: string }>
}

export async function generateMetadata({
  params,
}: ResetPasswordPageProps): Promise<Metadata> {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)

  const t = await getTranslations("auth.metadata")

  return {
    title: currentOrganization
      ? `${t("newPassword")} | ${currentOrganization.name}`
      : t("newPassword"),
  }
}

export default async function Page({
  params,
  searchParams,
}: ResetPasswordPageProps) {
  const [{ slug }, { token, invitation }] = await Promise.all([
    params,
    searchParams,
  ])
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization) notFound()

  // Whether the token is any good is the action's decision, not this page's.
  if (!token) redirect(`/org/${slug}/forgot-password`)

  return (
    <AuthShell organization={currentOrganization}>
      <ResetPasswordForm
        organization={currentOrganization}
        token={token}
        invitationToken={isInvitationToken(invitation) ? invitation : undefined}
      />
    </AuthShell>
  )
}
