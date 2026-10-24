"use client"

import { Suspense } from "react"

import { UserMenuContent } from "@/features/app/components/user-menu/content"
import { UserMenuSkeleton } from "@/features/app/components/user-menu/skeleton"
import type { AccessUser } from "@/features/auth"

interface UserMenuProps {
  userPromise: Promise<AccessUser>
}

export function UserMenu({ userPromise }: UserMenuProps) {
  return (
    <Suspense fallback={<UserMenuSkeleton />}>
      <UserMenuContent userPromise={userPromise} />
    </Suspense>
  )
}
