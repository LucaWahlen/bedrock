"use client"

import { LoaderCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { getAccessContext } from "@/features/auth/actions/get-access-context"
import { verifyTwoFactor } from "@/features/auth/actions/verify-two-factor"
import { createTwoFactorSchema } from "@/features/auth/schemas/two-factor"
import type { LoginDestination, TwoFactorMethod } from "@/features/auth/types"
import {
  CONSENT_SEQUENCE_MS,
  ConsentConnection,
} from "@/features/shared/components/consent-connection"
import { Button } from "@/features/shared/components/ui/button"
import { Checkbox } from "@/features/shared/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"
import { cn } from "@/features/shared/lib/ui/utils"

type TwoFactorValues = { code: string; trustDevice: boolean }

type OidcTwoFactorContext = {
  brandColor: string | null
  user: {
    id: string
    name: string
    email: string
    image?: string | null
  } | null
  application: {
    clientId: string
    name: string
    icon: string | null
    skipConsent: boolean
  }
}

// How long Better Auth trusts a device once asked to, which is its default.
const TRUSTED_DEVICE_DAYS = 30

// The message keys of each method's copy.
const COPY = {
  totp: "totp",
  backup_code: "backupCode",
} as const satisfies Record<TwoFactorMethod, string>

const STACKED =
  "col-start-1 row-start-1 transition-opacity duration-300 motion-reduce:transition-none"

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function TwoFactorForm({
  organizationSlug,
  restartHref,
  authorizeUrl,
  oidc,
}: {
  organizationSlug: string
  // Where to start over once the pending sign-in has expired.
  restartHref: string
  // Set when the sign-in belongs to an OIDC authorization, which is resumed
  // here instead of entering the organization.
  authorizeUrl?: string
  oidc?: OidcTwoFactorContext
}) {
  const router = useRouter()
  const t = useTranslations("auth")
  const schema = useMemo(() => createTwoFactorSchema(t), [t])
  const [method, setMethod] = useState<TwoFactorMethod>("totp")
  const [expired, setExpired] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [allowing, setAllowing] = useState(false)
  const [connected, setConnected] = useState(false)
  const form = useForm<TwoFactorValues>({
    defaultValues: { code: "", trustDevice: false },
  })
  const copy = COPY[method]
  const busy = form.formState.isSubmitting || redirecting

  useEffect(() => {
    function reset(event: PageTransitionEvent) {
      if (!event.persisted) return
      setRedirecting(false)
      setAllowing(false)
      setConnected(false)
    }
    window.addEventListener("pageshow", reset)
    return () => window.removeEventListener("pageshow", reset)
  }, [])

  async function proceed(next: LoginDestination) {
    setRedirecting(true)

    if (next === "invitation") {
      router.push(`/org/${organizationSlug}/invitation`)
      return
    }

    if (authorizeUrl) {
      if (oidc?.application.skipConsent) {
        setAllowing(true)
        await Promise.all([
          getAccessContext(),
          prefersReducedMotion() ? null : wait(CONSENT_SEQUENCE_MS),
        ])
        setConnected(true)
      } else {
        // Let the post-verification revalidation in the action queue settle
        // before the hard navigation would otherwise abort its stream.
        await getAccessContext()
      }
      // The provider's own endpoint finishes the flow and redirects onwards.
      window.location.assign(authorizeUrl)
      return
    }

    router.push(`/org/${organizationSlug}`)
  }

  async function onSubmit(values: TwoFactorValues) {
    const parsed = schema.safeParse({ method, ...values })
    if (!parsed.success) {
      form.setError("code", { message: parsed.error.issues[0]?.message })
      return
    }

    const result = await verifyTwoFactor(
      { method, ...values },
      organizationSlug
    )
    if (!result.success) {
      if (result.expired) setExpired(true)
      form.setError("root", { message: result.error })
      return
    }

    await proceed(result.next)
  }

  function switchMethod() {
    setMethod((current) => (current === "totp" ? "backup_code" : "totp"))
    form.resetField("code")
    form.clearErrors()
  }

  return (
    <form
      className="flex flex-col gap-6"
      aria-busy={busy}
      method="post"
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FieldGroup>
        {oidc && (
          <ConsentConnection
            phase={allowing ? "allowing" : "idle"}
            parties={{
              brandColor: oidc.brandColor,
              user: oidc.user,
              application: oidc.application,
            }}
          />
        )}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="grid text-2xl font-bold">
            <span
              aria-hidden={allowing}
              className={cn(STACKED, allowing && "opacity-0")}
            >
              {t("twoFactor.title")}
            </span>
            {oidc && (
              <span
                aria-hidden={!allowing}
                className={cn(STACKED, !allowing && "opacity-0")}
              >
                {t("oidcLogin.signingIn")}
              </span>
            )}
          </h1>
          <p className="grid text-sm text-balance text-muted-foreground">
            <span
              aria-hidden={allowing}
              className={cn(STACKED, allowing && "opacity-0")}
            >
              {t(`twoFactor.${copy}.description`)}
            </span>
            {oidc && (
              <span
                aria-hidden={!allowing}
                className={cn(STACKED, "self-center", !allowing && "opacity-0")}
              >
                {oidc.user &&
                  t("oidcLogin.signingInDescription", {
                    application: oidc.application.name,
                    email: oidc.user.email,
                  })}
              </span>
            )}
          </p>
        </div>
        <Controller
          name="code"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="two-factor-code">
                {t(`twoFactor.${copy}.label`)}
              </FieldLabel>
              <Input
                {...field}
                id="two-factor-code"
                autoComplete="one-time-code"
                inputMode={method === "totp" ? "numeric" : "text"}
                autoCapitalize="off"
                spellCheck={false}
                disabled={expired || busy}
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "two-factor-code-error" : undefined
                }
                placeholder={method === "totp" ? "123456" : "xxxxx-xxxxx"}
              />
              {fieldState.invalid && (
                <FieldError
                  id="two-factor-code-error"
                  errors={[fieldState.error]}
                />
              )}
            </Field>
          )}
        />
        <Controller
          name="trustDevice"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="two-factor-trust-device"
                checked={field.value}
                disabled={expired || busy}
                onCheckedChange={(checked) => field.onChange(checked)}
              />
              <FieldContent>
                <FieldLabel htmlFor="two-factor-trust-device">
                  {t("twoFactor.trustDevice", { days: TRUSTED_DEVICE_DAYS })}
                </FieldLabel>
                <FieldDescription>
                  {t("twoFactor.trustDeviceDescription")}
                </FieldDescription>
              </FieldContent>
            </Field>
          )}
        />
        {form.formState.errors.root && (
          <FieldError errors={[form.formState.errors.root]} />
        )}
        <div className="grid">
          <Field
            inert={allowing}
            className={cn(STACKED, allowing && "opacity-0")}
          >
            {expired ? (
              <Button render={<Link href={restartHref} />} nativeButton={false}>
                {t("twoFactor.restart")}
              </Button>
            ) : (
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    {t("twoFactor.submitting")}
                  </>
                ) : (
                  t("twoFactor.submit")
                )}
              </Button>
            )}
            {!expired && (
              <Button
                type="button"
                variant="link"
                disabled={busy}
                onClick={switchMethod}
              >
                {t(`twoFactor.${copy}.switchTo`)}
              </Button>
            )}
          </Field>
          {oidc && (
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
                    t("oidcLogin.status.connecting", {
                      application: oidc.application.name,
                    })}
                </span>
                <span
                  aria-hidden={!connected}
                  className={cn(STACKED, !connected && "opacity-0")}
                >
                  {connected &&
                    t("oidcLogin.status.connected", {
                      application: oidc.application.name,
                    })}
                </span>
              </span>
            </output>
          )}
        </div>
      </FieldGroup>
    </form>
  )
}
