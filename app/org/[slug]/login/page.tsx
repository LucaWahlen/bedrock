import { eq } from "drizzle-orm"
import { notFound } from "next/navigation"

import { LoginPage } from "@/features/auth"
import { db } from "@/features/shared/lib/db"
import { organization } from "@/features/shared/lib/schema"

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const currentOrganization = await db.query.organization.findFirst({
    where: eq(organization.slug, slug),
  })

  if (!currentOrganization) {
    notFound()
  }

  return <LoginPage organization={currentOrganization} />
}
