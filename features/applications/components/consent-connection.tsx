import type { CSSProperties } from "react"

import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import {
  contrastingForeground,
  normalizeHexColor,
} from "@/features/shared/lib/ui/color"
import { cn } from "@/features/shared/lib/ui/utils"

import styles from "@/features/applications/components/consent-connection.module.css"

export type ConsentPhase = "idle" | "allowing" | "cancelled"

export type ConsentParties = {
  brandColor: string | null
  user: { id: string; name: string; image?: string | null }
  application: { clientId: string; name: string; icon: string | null }
}

// How long allowing takes to play through: about 1.6 s to the check mark,
// then a short rest so it registers before the page leaves.
export const CONSENT_SEQUENCE_MS = 1850

// A pen stroke with a loop in the middle, from one tile towards the other.
const ARROW_BODY =
  "M70 35 C88 34 100 36 112 32 C124 28 130 20 123 16 C116 12 108 20 114 28 C119 35 136 36 150 34 C158 33 164 32 170 32"
const ARROW_HEAD =
  "M162.5 26 C165.5 28.5 168 30.5 170.5 32.2 C167.5 34.2 164.8 36.4 162.2 38.8"

/**
 * Decorative only: who is connected to what is said by the text around it.
 * Sized up front, so neither state moves the layout.
 */
export function ConsentConnection({
  phase,
  parties,
}: {
  phase: ConsentPhase
  parties: ConsentParties
}) {
  const brand = normalizeHexColor(parties.brandColor)
  const { user, application } = parties

  return (
    <div
      aria-hidden="true"
      data-phase={phase}
      className={styles.root}
      style={
        brand
          ? ({
              "--brand": brand,
              "--brand-foreground": contrastingForeground(brand),
            } as CSSProperties)
          : undefined
      }
    >
      <svg
        className={styles.arrow}
        width="240"
        height="64"
        viewBox="0 0 240 64"
      >
        {/* Two strokes, drawn one after the other as a hand would: browsers
            restart a dash pattern at every subpath, so one path would draw
            the shaft and the head at once. */}
        <g className={styles.pencil}>
          <path className={styles.shaft} d={ARROW_BODY} pathLength={100} />
          <path className={styles.head} d={ARROW_HEAD} pathLength={100} />
        </g>
        <g className={styles.ink}>
          <path className={styles.shaft} d={ARROW_BODY} pathLength={100} />
          <path className={styles.head} d={ARROW_HEAD} pathLength={100} />
        </g>
      </svg>

      <div className={cn(styles.tile, styles.person)}>
        <IdentityAvatar
          logo={user.image}
          name={user.name}
          seed={user.id}
          variant="lg"
          eager
        />
      </div>

      <div className={cn(styles.tile, styles.application)}>
        <IdentityAvatar
          logo={application.icon}
          name={application.name}
          seed={application.clientId}
          variant="lg"
          eager
        />
        <span className={styles.seal}>
          <svg className={styles.checkMark} viewBox="0 0 24 24">
            <path
              className={styles.check}
              d="M6 12.5l4 4 8-8.5"
              pathLength={100}
            />
          </svg>
        </span>
      </div>
    </div>
  )
}
