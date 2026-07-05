"use client"

import { Suspense } from "react"

import { UserMenuContent } from "@/features/app/components/user-menu/content"
import { UserMenuSkeleton } from "@/features/app/components/user-menu/skeleton"
import { user } from "@/features/app/lib/types"

interface UserMenuProps {
  userPromise: Promise<user>
}

export function UserMenu({ userPromise }: UserMenuProps) {
  return (
    <Suspense fallback={<UserMenuSkeleton />}>
      <UserMenuContent userPromise={userPromise} />
    </Suspense>
  )
}
