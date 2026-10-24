import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AuthShell } from "@/features/auth"
import {
  getInvitation,
  getOrganizationBySlug,
  getPendingInvitation,
  invitationRefusal,
  InvitationPanel,
} from "@/features/organizations"
import { FormHeading } from "@/features/shared/components/form-heading"
import { Button } from "@/features/shared/components/ui/button"
import { FieldGroup } from "@/features/shared/components/ui/field"

type InvitationPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string }>
}

export async function generateMetadata({
  params,
}: InvitationPageProps): Promise<Metadata> {
  const { slug } = await params
  const [t, currentOrganization] = await Promise.all([
    getTranslations("organizations.pages"),
    getOrganizationBySlug(slug),
  ])

  return {
    title: currentOrganization
      ? t("titleWithOrganization", {
          page: t("invitation"),
          organization: currentOrganization.name,
        })
      : t("invitation"),
  }
}

export default async function Page({
  params,
  searchParams,
}: InvitationPageProps) {
  const [{ slug }, { token }] = await Promise.all([params, searchParams])
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization) notFound()

  // Without a token this is someone who signed in and was told an invitation is
  // waiting. The session's own address is what finds it.
  const lookup = token
    ? await getInvitation(token)
    : await getPendingInvitation(slug)

  if (!lookup.success) {
    const t = await getTranslations("organizations")
    const { title, description } = invitationRefusal(t, lookup.refusal)
    // A refusal is only useful if it says what to do next.
    const next =
      lookup.refusal === "unconfirmed_address"
        ? {
            href: `/org/${slug}/verify-email`,
            label: t("invitation.confirmAddress"),
          }
        : { href: `/org/${slug}/login`, label: t("invitation.goToLogin") }

    return (
      <AuthShell organization={currentOrganization}>
        <FieldGroup>
          <FormHeading title={title} description={description} />
          <Button nativeButton={false} render={<Link href={next.href} />}>
            {next.label}
          </Button>
        </FieldGroup>
      </AuthShell>
    )
  }

  return (
    <AuthShell organization={currentOrganization}>
      <InvitationPanel invitation={lookup.invitation} token={token ?? null} />
    </AuthShell>
  )
}
