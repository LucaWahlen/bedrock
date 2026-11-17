import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import {
  AuthShell,
  getAccessContext,
  getPendingTwoFactor,
  TwoFactorForm,
} from "@/features/auth"
import { getOrganizationBySlug } from "@/features/organizations"

type TwoFactorPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.metadata")

  return { title: t("twoFactor") }
}

export default async function TwoFactorPage({ params }: TwoFactorPageProps) {
  const { slug } = await params
  const organization = await getOrganizationBySlug(slug)
  if (!organization) notFound()

  // Nothing to finish without a password that was just accepted, unless the
  // second factor just completed and Next.js is re-rendering the action result.
  const [pending, access] = await Promise.all([
    getPendingTwoFactor(),
    getAccessContext(),
  ])
  if (!pending && !access.user) redirect(`/org/${slug}/login`)

  return (
    <AuthShell organization={organization}>
      <TwoFactorForm
        organizationSlug={organization.slug}
        restartHref={`/org/${organization.slug}/login`}
      />
    </AuthShell>
  )
}
