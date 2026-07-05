"use client"

import { Suspense } from "react"

import { OrgSwitcherContent } from "@/features/app/components/org-switcher/content"
import { OrgSwitcherSkeleton } from "@/features/app/components/org-switcher/skeleton"
import { organization } from "@/features/app/lib/types"

interface OrgSwitcherProps {
  organizationsPromise: Promise<organization[]>
}

export function OrgSwitcher({ organizationsPromise }: OrgSwitcherProps) {
  return (
    <Suspense fallback={<OrgSwitcherSkeleton />}>
      <OrgSwitcherContent organizationsPromise={organizationsPromise} />
    </Suspense>
  )
}
