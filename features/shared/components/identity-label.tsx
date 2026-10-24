import { useTranslations } from "next-intl"

import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import {
  IdentityIndicator,
  type IdentityIndicatorVariant,
} from "@/features/shared/components/identity-indicator"

type IdentityLabelProps = {
  name: string
  secondary?: string | null
  // Omitted when there is no identity to picture, such as an anonymous actor.
  avatar?: { seed: string | null; logo?: string | null }
  indicator?: IdentityIndicatorVariant
  deleted?: boolean
  // The name this identity goes by now, when it differs from the one shown.
  renamedTo?: string | null
}

export function IdentityLabel({
  name,
  secondary,
  avatar,
  indicator,
  deleted,
  renamedTo,
}: IdentityLabelProps) {
  const t = useTranslations("common.identity")

  return (
    <div className="flex min-w-0 items-center gap-2">
      {avatar && (
        <IdentityAvatar
          seed={avatar.seed}
          logo={avatar.logo}
          name={name}
          variant="md"
        />
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className="truncate font-medium">{name}</span>
          {indicator && <IdentityIndicator variant={indicator} />}
          {deleted && <IdentityIndicator variant="deleted" />}
          {renamedTo && (
            <IdentityIndicator
              variant="renamed"
              label={t("renamedTo", { name: renamedTo })}
            />
          )}
        </div>
        {secondary && (
          <div className="truncate text-xs text-muted-foreground">
            {secondary}
          </div>
        )}
      </div>
    </div>
  )
}
