"use client"

import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  WebAuthnAbortService,
} from "@simplewebauthn/browser"
import { Fingerprint } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"

import { getPasskeySignInOptions } from "@/features/auth/actions/get-passkey-sign-in-options"
import { signInWithPasskey } from "@/features/auth/actions/sign-in-with-passkey"
import type { LoginDestination } from "@/features/auth/types"
import { Button } from "@/features/shared/components/ui/button"
import { Field, FieldSeparator } from "@/features/shared/components/ui/field"
import { Spinner } from "@/features/shared/components/ui/spinner"

// The browser's own refusal: the person closed the prompt, or another ceremony
// replaced this one. Neither is worth an error message.
function wasDismissed(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "NotAllowedError" ||
      error.name === "AbortError" ||
      ("code" in error && error.code === "ERROR_CEREMONY_ABORTED"))
  )
}

async function complete(
  credential: unknown,
  {
    organizationSlug,
    onSignedIn,
    onError,
  }: {
    organizationSlug?: string
    onSignedIn: (next: LoginDestination) => void
    onError: (message: string) => void
  }
) {
  const result = await signInWithPasskey(credential, organizationSlug)
  if (!result.success) {
    onError(result.error)
    return
  }

  // Never "two-factor": a passkey is already both factors.
  onSignedIn(result.next === "invitation" ? "invitation" : "organization")
}

/**
 * "Sign in with passkey", plus the browser's passkey autofill on the email
 * field where it is supported. Requires an input on the page with
 * `autoComplete="username webauthn"` for the autofill to attach to.
 */
export function PasskeySignIn({
  separator,
  organizationSlug,
  disabled,
  onSignedIn,
  onError,
}: {
  separator: string
  organizationSlug?: string
  disabled?: boolean
  onSignedIn: (next: LoginDestination) => void
  onError: (message: string) => void
}) {
  const t = useTranslations("auth")
  const [pending, setPending] = useState(false)
  const failed = t("errors.passkeyFailed")
  const latest = useRef({ organizationSlug, onSignedIn, onError, failed })

  useEffect(() => {
    latest.current = { organizationSlug, onSignedIn, onError, failed }
  })

  useEffect(() => {
    let cancelled = false
    let removeFocusRetry: (() => void) | undefined

    async function offerAutofill(retryOnFocus: boolean) {
      let options: Awaited<ReturnType<typeof getPasskeySignInOptions>>
      try {
        if (
          !browserSupportsWebAuthn() ||
          !(await browserSupportsWebAuthnAutofill())
        ) {
          return
        }

        options = await getPasskeySignInOptions()
      } catch {
        // An edge proxy (e.g. bot detection before clearance settles) or a
        // brief network blip can reject the mount-time action; try once more
        // when the person focuses the passkey-autofill field.
        if (!cancelled && retryOnFocus) {
          const onFocusIn = (event: FocusEvent) => {
            if (
              !(event.target instanceof HTMLInputElement) ||
              !event.target.autocomplete.includes("webauthn")
            ) {
              return
            }
            removeFocusRetry?.()
            void offerAutofill(false)
          }
          document.addEventListener("focusin", onFocusIn)
          removeFocusRetry = () => {
            document.removeEventListener("focusin", onFocusIn)
            removeFocusRetry = undefined
          }
        }
        return
      }
      if (cancelled || !options.success) return

      let credential: unknown
      try {
        credential = await startAuthentication({
          optionsJSON: options.data,
          useBrowserAutofill: true,
        })
      } catch (error) {
        // Replaced by the button, or dismissed: nothing to report.
        if (!cancelled && !wasDismissed(error)) {
          latest.current.onError(latest.current.failed)
        }
        return
      }
      if (cancelled) return

      setPending(true)
      try {
        await complete(credential, latest.current)
      } catch {
        if (!cancelled) latest.current.onError(latest.current.failed)
      } finally {
        if (!cancelled) setPending(false)
      }
    }

    void offerAutofill(true)

    return () => {
      cancelled = true
      removeFocusRetry?.()
      WebAuthnAbortService.cancelCeremony()
    }
  }, [])

  async function signIn() {
    if (!browserSupportsWebAuthn()) {
      onError(t("errors.passkeyUnavailable"))
      return
    }

    setPending(true)
    try {
      const options = await getPasskeySignInOptions()
      if (!options.success) {
        onError(options.error)
        return
      }

      // Replaces the autofill request above, which is cancelled for it.
      const credential = await startAuthentication({
        optionsJSON: options.data,
      })
      await complete(credential, latest.current)
    } catch (error) {
      if (!wasDismissed(error)) onError(failed)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <FieldSeparator>{separator}</FieldSeparator>
      <Field>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || pending}
          onClick={() => void signIn()}
        >
          {pending ? <Spinner aria-hidden /> : <Fingerprint aria-hidden />}
          {t("passkey.signIn")}
        </Button>
      </Field>
    </>
  )
}
