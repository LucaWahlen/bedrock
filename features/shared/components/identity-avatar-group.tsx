import type { CSSProperties } from "react"

import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import {
  AvatarGroup,
  AvatarGroupCount,
} from "@/features/shared/components/ui/avatar"

// How far the silhouette reaches past the logo, in pixels.
const SILHOUETTE_RADIUS = 2

// Copies of the logo offset around it. Multiple mask layers union by default,
// so this dilates the opaque pixels as the chained shadows did: those composed
// into a square reach, since each pass dilated the result of the last. The
// shape is a mask the browser rasterises once, leaving only a plain background
// colour to follow the row.
const SILHOUETTE_OFFSETS = Array.from({ length: SILHOUETTE_RADIUS * 2 + 1 })
  .flatMap((_column, column) =>
    Array.from({ length: SILHOUETTE_RADIUS * 2 + 1 }).map((_row, row) => [
      column - SILHOUETTE_RADIUS,
      row - SILHOUETTE_RADIUS,
    ])
  )
  .filter(([x, y]) => x !== 0 || y !== 0)

// Anything that could close the `url("…")` and continue with declarations of
// its own. A logo that contains one keeps its plain avatar rather than being
// re-encoded, since the URL is already escaped by whoever stored it.
const UNSAFE_IN_URL = /["'()\\\s]/

function silhouetteMask(logo: string): CSSProperties | undefined {
  if (UNSAFE_IN_URL.test(logo)) return undefined

  const layer = `url("${logo}")`
  const inset = SILHOUETTE_RADIUS * 2

  return {
    maskImage: SILHOUETTE_OFFSETS.map(() => layer).join(", "),
    // The box is larger all round, so an outward offset is not clipped.
    maskSize: SILHOUETTE_OFFSETS.map(
      () => `calc(100% - ${inset}px) calc(100% - ${inset}px)`
    ).join(", "),
    maskPosition: SILHOUETTE_OFFSETS.map(
      ([x, y]) => `${SILHOUETTE_RADIUS + x}px ${SILHOUETTE_RADIUS + y}px`
    ).join(", "),
    maskRepeat: "no-repeat",
  }
}

type IdentityAvatarGroupItem = {
  id: string
  name: string
  image?: string | null
}

type IdentityAvatarGroupProps = {
  items: IdentityAvatarGroupItem[]
  // The whole count, which the preview usually does not reach.
  total: number
}

export function IdentityAvatarGroup({
  items,
  total,
}: IdentityAvatarGroupProps) {
  const remaining = Math.max(total - items.length, 0)

  return (
    <AvatarGroup
      // Positioning every avatar keeps them in one paint phase, or the wrapped
      // logos would lift above the initials that follow them.
      className="*:data-[slot=avatar]:relative"
    >
      {items.map((item) => {
        const mask = item.image ? silhouetteMask(item.image) : undefined

        // Only logos are wrapped, so initials keep the group's rounded ring.
        return mask ? (
          <span
            key={item.id}
            data-slot="avatar"
            className="relative inline-flex ring-0! [&>[data-slot=avatar]]:relative"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-0.5 bg-(--avatar-ring,var(--background)) transition-colors"
              style={mask}
            />
            <IdentityAvatar
              seed={item.id}
              logo={item.image}
              name={item.name}
              variant="md"
            />
          </span>
        ) : (
          <IdentityAvatar
            key={item.id}
            seed={item.id}
            logo={item.image}
            name={item.name}
            variant="md"
          />
        )
      })}
      {remaining > 0 && (
        <AvatarGroupCount className="rounded-md text-xs">
          +{remaining}
        </AvatarGroupCount>
      )}
    </AvatarGroup>
  )
}
