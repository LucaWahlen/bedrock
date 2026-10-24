"use client"

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"
import type { CSSProperties } from "react"

import { ScrollBar } from "@/features/shared/components/ui/scroll-area"
import { cn } from "@/features/shared/lib/ui/utils"

type ScrollRegionProps = ScrollAreaPrimitive.Root.Props & {
  // Where the vertical scrollbar starts, so it clears a sticky header.
  insetTop?: string
}

// `ScrollArea` renders a vertical scrollbar only, and Base UI needs each one as
// a child of the root, so scrolling both axes has to be composed separately.
function ScrollRegion({
  className,
  children,
  insetTop = "0px",
  style,
  ...props
}: ScrollRegionProps) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn(
        "relative",
        // Overriding `top` needs `!` because the primitive sets it inline, and
        // the thumb carries the same `data-orientation`, so sizing must not
        // reach it.
        "[&_[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:top-[var(--scroll-region-inset-top)]!",
        "[&_[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:h-[calc(100%-var(--scroll-region-inset-top)-var(--scroll-area-corner-height))]!",
        className
      )}
      style={
        {
          ...style,
          "--scroll-region-inset-top": insetTop,
        } as CSSProperties & Record<string, string>
      }
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollBar orientation="horizontal" />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

export { ScrollRegion }
