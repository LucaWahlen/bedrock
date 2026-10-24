import { cn } from "@/features/shared/lib/ui/utils"

// Takes the chart's place at its height, so an empty card is not a short one.
export function ChartEmpty({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-60 items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-balance text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  )
}
