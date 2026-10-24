"use client"

import { Check, LoaderCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { grantConsent } from "@/features/applications/actions/grant-consent"
import {
  CONSENT_SEQUENCE_MS,
  ConsentConnection,
  type ConsentParties,
  type ConsentPhase,
} from "@/features/applications/components/consent-connection"
import { Button } from "@/features/shared/components/ui/button"
import { FieldError } from "@/features/shared/components/ui/field"
import { cn } from "@/features/shared/lib/ui/utils"

type ConsentPanelProps = {
  applicationName: string
  organizationName: string
  userEmail: string
  scopeDescriptions: string[]
  oauthQuery: string
  parties: ConsentParties
}

// Cancelling only lets the connector recede before leaving.
const CANCEL_FADE_MS = 200

const STACKED =
  "col-start-1 row-start-1 transition-opacity duration-300 motion-reduce:transition-none"

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function ConsentPanel({
  applicationName,
  organizationName,
  userEmail,
  scopeDescriptions,
  oauthQuery,
  parties,
}: ConsentPanelProps) {
  const t = useTranslations("applications.consent")
  const tCommon = useTranslations("common")
  const [phase, setPhase] = useState<ConsentPhase>("idle")
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Coming back from the application restores this page as it was left,
  // mid-redirect, so it starts over at rest.
  useEffect(() => {
    function reset(event: PageTransitionEvent) {
      if (!event.persisted) return
      setPhase("idle")
      setConnected(false)
    }
    window.addEventListener("pageshow", reset)
    return () => window.removeEventListener("pageshow", reset)
  }, [])

  async function decide(accept: boolean) {
    setError(null)
    setPhase(accept ? "allowing" : "cancelled")

    // The request runs alongside the animation; leaving waits for both, so
    // the page never jumps away mid-motion.
    const [result] = await Promise.all([
      grantConsent(accept, oauthQuery),
      prefersReducedMotion()
        ? null
        : wait(accept ? CONSENT_SEQUENCE_MS : CANCEL_FADE_MS),
    ])

    if (!result.success) {
      setError(result.error)
      setPhase("idle")
      return
    }

    if (accept) setConnected(true)
    // Denial redirects too: the application is told, in the way the protocol
    // expects, rather than left waiting. The final state holds until the
    // browser actually leaves.
    window.location.assign(result.redirectUri)
  }

  const allowing = phase === "allowing"

  return (
    <div className="flex flex-col gap-6">
      <ConsentConnection phase={phase} parties={parties} />

      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="grid text-2xl font-bold">
          <span
            aria-hidden={allowing}
            className={cn(STACKED, allowing && "opacity-0")}
          >
            {t("title", { application: applicationName })}
          </span>
          <span
            aria-hidden={!allowing}
            className={cn(STACKED, !allowing && "opacity-0")}
          >
            {t("signingIn")}
          </span>
        </h1>
        <p className="grid text-sm text-balance text-muted-foreground">
          <span
            aria-hidden={allowing}
            className={cn(STACKED, allowing && "opacity-0")}
          >
            {t("description", {
              application: applicationName,
              organization: organizationName,
              email: userEmail,
            })}
          </span>
          <span
            aria-hidden={!allowing}
            className={cn(STACKED, "self-center", !allowing && "opacity-0")}
          >
            {t("signingInDescription", {
              application: applicationName,
              email: userEmail,
            })}
          </span>
        </p>
      </div>

      <ul className="flex flex-col gap-2 rounded-lg border p-4">
        {scopeDescriptions.map((description) => (
          <li key={description} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>{description}</span>
          </li>
        ))}
      </ul>

      {error && <FieldError errors={[{ message: error }]} />}

      {/* The buttons and the status share one cell, so swapping them moves
          nothing. */}
      <div className="grid">
        <div
          inert={allowing}
          className={cn(
            STACKED,
            "flex flex-col gap-2",
            allowing && "opacity-0"
          )}
        >
          <Button disabled={phase !== "idle"} onClick={() => decide(true)}>
            {t("allow")}
          </Button>
          <Button
            variant="outline"
            disabled={phase !== "idle"}
            onClick={() => decide(false)}
          >
            {phase === "cancelled"
              ? t("cancelling")
              : tCommon("actions.cancel")}
          </Button>
        </div>
        <output
          className={cn(
            STACKED,
            "pointer-events-none flex items-center justify-center gap-2 text-sm text-muted-foreground",
            !allowing && "opacity-0"
          )}
        >
          <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" />
          <span className="grid text-left">
            <span
              aria-hidden={connected}
              className={cn(STACKED, connected && "opacity-0")}
            >
              {allowing &&
                t("status.connecting", { application: applicationName })}
            </span>
            <span
              aria-hidden={!connected}
              className={cn(STACKED, !connected && "opacity-0")}
            >
              {connected &&
                t("status.connected", { application: applicationName })}
            </span>
          </span>
        </output>
      </div>
    </div>
  )
}
