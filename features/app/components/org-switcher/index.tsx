"use client"

import { Suspense } from "react"

import { OrgSwitcherContent } from "@/features/app/components/org-switcher/content"
import { OrgSwitcherSkeleton } from "@/features/app/components/org-switcher/skeleton"
import type { Organization } from "@/features/organizations"

interface OrgSwitcherProps {
  canCreateOrganization: boolean
  organizationsPromise: Promise<Organization[]>
  onCreateOrganization: () => void
}

export function OrgSwitcher({
  canCreateOrganization,
  organizationsPromise,
  onCreateOrganization,
}: OrgSwitcherProps) {
  return (
    <Suspense fallback={<OrgSwitcherSkeleton />}>
      <OrgSwitcherContent
        canCreateOrganization={canCreateOrganization}
        organizationsPromise={organizationsPromise}
        onCreateOrganization={onCreateOrganization}
      />
    </Suspense>
  )
}
