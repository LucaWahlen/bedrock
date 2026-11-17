"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { LoaderCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { getAccessContext } from "@/features/auth/actions/get-access-context"
import { login } from "@/features/auth/actions/login"
import { PasskeySignIn } from "@/features/auth/components/passkey-sign-in"
import { createLoginSchema } from "@/features/auth/schemas/login"
import type {
  AccessUser,
  LoginCredentials,
  SignInStep,
} from "@/features/auth/types"
import {
  CONSENT_SEQUENCE_MS,
  ConsentConnection,
} from "@/features/shared/components/consent-connection"
import { Button } from "@/features/shared/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"
import { PasswordInput } from "@/features/shared/components/ui/password-input"
import { cn } from "@/features/shared/lib/ui/utils"

type OidcLoginFormProps = {
  application: {
    clientId: string
    name: string
    icon: string | null
    skipConsent: boolean
  }
  organization: {
    slug: string
    color: string | null
  }
  // The signed authorization query this flow arrived with, handed straight back
  // so the provider can resume the request it interrupted.
  authorizeUrl: string
}

const STACKED =
  "col-start-1 row-start-1 transition-opacity duration-300 motion-reduce:transition-none"

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function OidcLoginForm({
  application,
  organization,
  authorizeUrl,
}: OidcLoginFormProps) {
  const router = useRouter()
  const t = useTranslations("auth")
  const schema = useMemo(() => createLoginSchema(t), [t])
  const [redirecting, setRedirecting] = useState(false)
  const [allowing, setAllowing] = useState(false)
  const [connected, setConnected] = useState(false)
  const [signedInUser, setSignedInUser] = useState<AccessUser | null>(null)
  const form = useForm<LoginCredentials>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  })
  const busy = form.formState.isSubmitting || redirecting

  useEffect(() => {
    function reset(event: PageTransitionEvent) {
      if (!event.persisted) return
      setRedirecting(false)
      setAllowing(false)
      setConnected(false)
      setSignedInUser(null)
    }
    window.addEventListener("pageshow", reset)
    return () => window.removeEventListener("pageshow", reset)
  }, [])

  async function proceed(next: SignInStep) {
    setRedirecting(true)

    // Not a member yet, so the application would refuse them; accept first.
    if (next === "invitation") {
      router.push(`/org/${organization.slug}/invitation`)
      return
    }

    // The second step keeps the signed authorization query, so finishing it
    // resumes this same request.
    if (next === "two-factor") {
      router.push(`/oauth2/two-factor${window.location.search}`)
      return
    }

    // Setting the session cookie makes Next.js revalidate this page in the
    // action queue. Queuing a read behind it lets that render settle before a
    // hard navigation would otherwise abort its stream into the error boundary,
    // and resolves the signed-in account for the connection animation.
    const { user } = await getAccessContext()
    if (application.skipConsent && user) {
      setSignedInUser(user)
      setAllowing(true)
      if (!prefersReducedMotion()) await wait(CONSENT_SEQUENCE_MS)
      setConnected(true)
    }

    // A full navigation, not a router push: the destination is the provider's
    // own endpoint, which finishes the flow and redirects to the application.
    window.location.assign(authorizeUrl)
  }

  async function onSubmit(data: LoginCredentials) {
    const result = await login(data, organization.slug)

    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    await proceed(result.next)
  }

  return (
    <form
      className="flex flex-col gap-6"
      aria-busy={busy}
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FieldGroup>
        <ConsentConnection
          phase={allowing ? "allowing" : "idle"}
          parties={{
            brandColor: organization.color,
            user: signedInUser,
            application,
          }}
        />
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="grid text-2xl font-bold">
            <span
              aria-hidden={allowing}
              className={cn(STACKED, allowing && "opacity-0")}
            >
              {t("oidcLogin.title")}
            </span>
            <span
              aria-hidden={!allowing}
              className={cn(STACKED, !allowing && "opacity-0")}
            >
              {t("oidcLogin.signingIn")}
            </span>
          </h1>
          <p className="grid text-sm text-balance text-muted-foreground">
            <span
              aria-hidden={allowing}
              className={cn(STACKED, allowing && "opacity-0")}
            >
              {t("oidcLogin.description", { application: application.name })}
            </span>
            <span
              aria-hidden={!allowing}
              className={cn(STACKED, "self-center", !allowing && "opacity-0")}
            >
              {signedInUser &&
                t("oidcLogin.signingInDescription", {
                  application: application.name,
                  email: signedInUser.email,
                })}
            </span>
          </p>
        </div>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="oidc-login-email">
                {t("fields.email")}
              </FieldLabel>
              <Input
                {...field}
                id="oidc-login-email"
                type="email"
                autoComplete="username webauthn"
                disabled={busy}
                aria-invalid={fieldState.invalid}
                placeholder={t("fields.emailPlaceholder")}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center">
                <FieldLabel htmlFor="oidc-login-password">
                  {t("fields.password")}
                </FieldLabel>
                <Link
                  href={`/org/${organization.slug}/forgot-password`}
                  className="ml-auto text-sm underline-offset-4 hover:underline"
                >
                  {t("login.forgotPassword")}
                </Link>
              </div>
              <PasswordInput
                {...field}
                id="oidc-login-password"
                autoComplete="current-password"
                disabled={busy}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
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
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  {t("oidcLogin.submitting")}
                </>
              ) : (
                t("oidcLogin.submit")
              )}
            </Button>
          </Field>
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
                    application: application.name,
                  })}
              </span>
              <span
                aria-hidden={!connected}
                className={cn(STACKED, !connected && "opacity-0")}
              >
                {connected &&
                  t("oidcLogin.status.connected", {
                    application: application.name,
                  })}
              </span>
            </span>
          </output>
        </div>
        <PasskeySignIn
          separator={t("oidcLogin.alternatives")}
          organizationSlug={organization.slug}
          disabled={busy}
          onSignedIn={(next) => void proceed(next)}
          onError={(message) => form.setError("root", { message })}
        />
      </FieldGroup>
    </form>
  )
}
