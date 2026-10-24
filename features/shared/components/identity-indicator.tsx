import { Gavel, Landmark, PenLine, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/features/shared/components/ui/tooltip"

// Labels are keys of `common.identity`.
const VARIANTS = {
  organization: {
    icon: Landmark,
    className: "text-[var(--root-primary,var(--muted-foreground))]",
    label: "rootOrganization",
  },
  actor: {
    icon: Gavel,
    className: "text-[var(--root-primary,var(--muted-foreground))]",
    label: "rootActor",
  },
  deleted: {
    icon: Trash2,
    className: "text-muted-foreground",
    label: "deleted",
  },
  renamed: {
    icon: PenLine,
    className: "text-muted-foreground",
    label: "renamed",
  },
} as const

type IdentityIndicatorProps = {
  variant: IdentityIndicatorVariant
  // Overrides the variant's own wording when the reason is specific.
  label?: string
}

export type IdentityIndicatorVariant = keyof typeof VARIANTS

export function IdentityIndicator({
  variant,
  label: labelOverride,
}: IdentityIndicatorProps) {
  const t = useTranslations("common.identity")
  const { icon: Icon, className, label: variantLabel } = VARIANTS[variant]
  const label = labelOverride ?? t(variantLabel)

  return (
    <Tooltip>
      <TooltipTrigger>
        <Icon className={`size-3.5 ${className}`} aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
