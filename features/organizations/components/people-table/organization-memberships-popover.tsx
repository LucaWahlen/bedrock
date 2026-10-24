"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"

import { getUserMemberships } from "@/features/organizations/actions/get-user-memberships"
import { RoleBadges } from "@/features/organizations/components/people-table/role-badges"
import type { Membership } from "@/features/organizations/types"
import { IdentityAvatarGroup } from "@/features/shared/components/identity-avatar-group"
import { IdentityLabel } from "@/features/shared/components/identity-label"
import { Button } from "@/features/shared/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/features/shared/components/ui/popover"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import { Separator } from "@/features/shared/components/ui/separator"
import { Skeleton } from "@/features/shared/components/ui/skeleton"

const MAX_VISIBLE_MEMBERSHIPS = 6

type OrganizationMembershipsPopoverProps = {
  userId: string
  userName: string
  count: number
  preview: Membership[]
}

export function OrganizationMembershipsPopover({
  userId,
  userName,
  count,
  preview,
}: OrganizationMembershipsPopoverProps) {
  const t = useTranslations("organizations")
  const tCommon = useTranslations("common")
  const [memberships, setMemberships] = useState<Membership[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (count === 0) {
    return <span className="text-muted-foreground">{t("none")}</span>
  }

  async function loadMemberships() {
    setIsLoading(true)
    setError(null)

    try {
      const result = await getUserMemberships(userId)

      if (result.success) setMemberships(result.data)
      else setError(result.error)
    } catch {
      setError(t("directory.memberships.loadFailed"))
    } finally {
      setIsLoading(false)
    }
  }

  const membershipList = memberships?.map((membership) => (
    <div
      key={membership.organizationId}
      className="flex items-center justify-between gap-3 p-2"
    >
      <IdentityLabel
        name={membership.name}
        secondary={membership.slug}
        avatar={{ seed: membership.organizationId, logo: membership.logo }}
        indicator={membership.isRoot ? "organization" : undefined}
      />
      <RoleBadges roles={membership.roles} />
    </div>
  ))
  const skeletonList = (
    <div aria-label={t("directory.memberships.loading")}>
      {Array.from({ length: Math.min(count, MAX_VISIBLE_MEMBERSHIPS) }).map(
        (_, index) => (
          <div key={index} className="flex items-center gap-2 p-2">
            <Skeleton className="size-8 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        )
      )}
    </div>
  )

  return (
    <Popover
      onOpenChange={(open) => {
        if (open && memberships === null && !isLoading) void loadMemberships()
      }}
    >
      <PopoverTrigger
        className="flex h-8 items-center"
        aria-label={t("directory.memberships.view", { count, name: userName })}
      >
        <IdentityAvatarGroup
          items={preview.map((membership) => ({
            id: membership.organizationId,
            name: membership.name,
            image: membership.logo,
          }))}
          total={count}
        />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 gap-0 p-0">
        <PopoverHeader className="p-2">
          <PopoverTitle>{t("directory.memberships.title")}</PopoverTitle>
          <PopoverDescription>
            {t("directory.memberships.count", { count })}
          </PopoverDescription>
        </PopoverHeader>
        <Separator />
        {isLoading && memberships === null ? (
          skeletonList
        ) : error ? (
          <div className="flex flex-col items-start gap-2 p-2 text-sm">
            <span className="text-destructive">{error}</span>
            <Button variant="outline" size="sm" onClick={loadMemberships}>
              {tCommon("actions.retry")}
            </Button>
          </div>
        ) : memberships && memberships.length > MAX_VISIBLE_MEMBERSHIPS ? (
          <ScrollArea className="h-72">{membershipList}</ScrollArea>
        ) : (
          membershipList
        )}
      </PopoverContent>
    </Popover>
  )
}
