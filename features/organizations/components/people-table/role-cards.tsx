"use client"

import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { useTranslations } from "next-intl"

import { MEMBER_ROLE_DISPLAY } from "@/features/organizations/lib/member-role-display"
import type { MemberRole } from "@/features/organizations/types"

type RoleCardsProps = {
  id: string
  value: MemberRole
  onChange: (role: MemberRole) => void
  roles: readonly MemberRole[]
  disabled?: boolean
}

export function RoleCards({
  id,
  value,
  onChange,
  roles,
  disabled,
}: RoleCardsProps) {
  const t = useTranslations("organizations.roles")

  return (
    <RadioGroup
      id={id}
      value={value}
      disabled={disabled}
      onValueChange={(role) => onChange(role as MemberRole)}
      className="grid gap-2"
    >
      {roles.map((role) => {
        const display = MEMBER_ROLE_DISPLAY[role]
        const RoleIcon = display.icon

        return (
          <Radio.Root
            key={role}
            value={role}
            className="group/role flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-ring data-checked:bg-accent/40 data-disabled:cursor-not-allowed data-disabled:opacity-50"
          >
            <RoleIcon
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {t(`${role}.label`)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t(`${role}.description`)}
              </span>
            </span>
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input group-data-checked/role:border-primary group-data-checked/role:bg-primary">
              <Radio.Indicator className="size-1.5 rounded-full bg-primary-foreground data-unchecked:hidden" />
            </span>
          </Radio.Root>
        )
      })}
    </RadioGroup>
  )
}
