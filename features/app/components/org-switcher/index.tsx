"use client"

import { Suspense } from "react"
import { organization } from "../../lib/types"
import { OrgSwitcherContent } from "./content"
import { OrgSwitcherSkeleton } from "./skeleton"

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
