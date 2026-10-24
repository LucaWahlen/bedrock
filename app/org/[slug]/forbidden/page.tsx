import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound } from "next/navigation"

import { StatusPage } from "@/features/app"
import {
  canAccessOrganization,
  getAccessContext,
  membershipIn,
} from "@/features/auth"
import {
  getOrganizationBySlug,
  getPendingInvitation,
  getRootOrganization,
  isOpenToAnyone,
} from "@/features/organizations"

type ForbiddenPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: ForbiddenPageProps): Promise<Metadata> {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)
  const rootOrganization = currentOrganization
    ? undefined
    : await getRootOrganization()
  const organizationName = currentOrganization?.name ?? rootOrganization?.name

  return {
    title: organizationName ? `403 | ${organizationName}` : "403",
  }
}

export default async function Page({ params }: ForbiddenPageProps) {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)

  if (!currentOrganization) {
    notFound()
  }

  const [t, access] = await Promise.all([
    getTranslations("app.status"),
    getAccessContext(),
  ])
  const organization = currentOrganization.name
  const signOut = {
    href: `/org/${slug}/logout`,
    label: t("switchAccount"),
  }
  const goElsewhere = { href: "/", label: t("goElsewhere") }
  const elsewhere = access.memberships.some(canAccessOrganization)

  // Someone already inside was turned away by a page, not by the door, so the
  // way on is back into the organization rather than out of it.
  if (membershipIn(access, currentOrganization.id)) {
    return (
      <StatusPage
        organization={currentOrganization}
        code="403"
        title={t("roleDenied.title")}
        description={t("roleDenied.description", { organization })}
        action={{
          href: `/org/${slug}`,
          label: t("roleDenied.action", { organization }),
        }}
        secondaryAction={signOut}
      />
    )
  }

  // Being invited is what makes someone a member, so someone holding an
  // invitation is not turned away for not being one yet.
  if (access.user && (await getPendingInvitation(slug)).success) {
    return (
      <StatusPage
        organization={currentOrganization}
        code="403"
        title={t("invitationWaiting.title")}
        description={t("invitationWaiting.description", { organization })}
        action={{
          href: `/org/${slug}/invitation`,
          label: t("invitationWaiting.action"),
        }}
        secondaryAction={elsewhere ? goElsewhere : signOut}
      />
    )
  }

  // An organization anyone may join is not one to turn a signed-in visitor away
  // from without saying so.
  if (access.user && isOpenToAnyone(currentOrganization)) {
    return (
      <StatusPage
        organization={currentOrganization}
        code="403"
        title={t("notJoined.title")}
        description={t("notJoined.description", { organization })}
        action={{
          href: `/org/${slug}/signup`,
          label: t("notJoined.action"),
        }}
        secondaryAction={elsewhere ? goElsewhere : signOut}
      />
    )
  }

  return (
    <StatusPage
      organization={currentOrganization}
      code="403"
      title={t("notMember.title")}
      description={t("notMember.description", { organization })}
      action={
        elsewhere ? { href: "/", label: t("availableOrganizations") } : signOut
      }
      secondaryAction={elsewhere ? signOut : undefined}
    />
  )
}
