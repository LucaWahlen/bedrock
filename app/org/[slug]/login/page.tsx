import { eq } from "drizzle-orm"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { cache } from "react"

import { LoginPage } from "@/features/auth"
import { db } from "@/features/shared/lib/db"
import { organization } from "@/features/shared/lib/schema"

type LoginPageProps = {
  params: Promise<{ slug: string }>
}

const getOrganization = cache((slug: string) =>
  db.query.organization.findFirst({
    where: eq(organization.slug, slug),
  })
)

export async function generateMetadata({
  params,
}: LoginPageProps): Promise<Metadata> {
  const { slug } = await params
  const currentOrganization = await getOrganization(slug)

  return {
    title: `Login | ${currentOrganization?.name ?? "Bedrock"}`,
  }
}

export default async function Page({ params }: LoginPageProps) {
  const { slug } = await params
  const currentOrganization = await getOrganization(slug)

  if (!currentOrganization) {
    const rootOrganization = await db.query.organization.findFirst({
      where: eq(organization.isRoot, true),
    })

    if (rootOrganization) {
      redirect(`/org/${rootOrganization.slug}/login`)
    }
  }

  return <LoginPage organization={currentOrganization} />
}
