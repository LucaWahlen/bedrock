import { eq } from "drizzle-orm"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { StatusPage } from "@/features/app"
import { db } from "@/features/shared/lib/db"
import { organization } from "@/features/shared/lib/schema"

type ForbiddenPageProps = {
  params: Promise<{ slug: string }>
}

const getOrganization = cache((slug: string) =>
  db.query.organization.findFirst({
    where: eq(organization.slug, slug),
  })
)

export async function generateMetadata({
  params,
}: ForbiddenPageProps): Promise<Metadata> {
  const { slug } = await params
  const currentOrganization = await getOrganization(slug)

  return {
    title: `403 | ${currentOrganization?.name ?? "Bedrock"}`,
  }
}

export default async function Page({ params }: ForbiddenPageProps) {
  const { slug } = await params
  const currentOrganization = await getOrganization(slug)

  if (!currentOrganization) {
    notFound()
  }

  return (
    <StatusPage
      organization={currentOrganization}
      code="403"
      title="You do not have access"
      description={`Your account is not a member of ${currentOrganization.name}.`}
      action={{ href: "/", label: "Go to available organizations" }}
      secondaryAction={{
        href: `/org/${slug}/login`,
        label: "Switch account",
      }}
    />
  )
}
