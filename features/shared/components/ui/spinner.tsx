import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/features/shared/lib/ui/utils"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const t = useTranslations("common.states")

  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={t("loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
