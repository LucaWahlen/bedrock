import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import {
  AuthShell,
  getAccessContext,
  membershipIn,
  SignUpForm,
} from "@/features/auth"
import {
  getOrganizationBySlug,
  isOpenToAnyone,
  JoinOrganizationPanel,
} from "@/features/organizations"

type SignUpPageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({
  params,
}: SignUpPageProps): Promise<Metadata> {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)

  const t = await getTranslations("auth.metadata")

  return {
    title: currentOrganization
      ? t("join", { organization: currentOrganization.name })
      : t("signUp"),
  }
}

export default async function Page({ params }: SignUpPageProps) {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization) notFound()

  // The same rule the actions re-check. Hiding the form is presentation; the
  // refusal that matters is the one in `signUp` and `joinOrganization`.
  if (!isOpenToAnyone(currentOrganization)) {
    redirect(`/org/${slug}/login`)
  }

  const access = await getAccessContext()

  // Already signed in: the account exists, so only the membership is missing.
  if (access.user) {
    if (membershipIn(access, currentOrganization.id)) {
      redirect(`/org/${slug}`)
    }

    return (
      <AuthShell organization={currentOrganization}>
        <JoinOrganizationPanel
          organizationName={currentOrganization.name}
          organizationSlug={currentOrganization.slug}
          email={access.user.email}
        />
      </AuthShell>
    )
  }

  return (
    <AuthShell organization={currentOrganization}>
      <SignUpForm organization={currentOrganization} />
    </AuthShell>
  )
}
