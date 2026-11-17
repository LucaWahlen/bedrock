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
import type { LoginCredentials, SignInStep } from "@/features/auth/types"
import { Button } from "@/features/shared/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"
import { PasswordInput } from "@/features/shared/components/ui/password-input"

type OidcLoginFormProps = {
  applicationName: string
  organizationSlug: string
  // The signed authorization query this flow arrived with, handed straight back
  // so the provider can resume the request it interrupted.
  authorizeUrl: string
}

export function OidcLoginForm({
  applicationName,
  organizationSlug,
  authorizeUrl,
}: OidcLoginFormProps) {
  const router = useRouter()
  const t = useTranslations("auth")
  const schema = useMemo(() => createLoginSchema(t), [t])
  const [redirecting, setRedirecting] = useState(false)
  const form = useForm<LoginCredentials>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  })
  const busy = form.formState.isSubmitting || redirecting

  useEffect(() => {
    function reset(event: PageTransitionEvent) {
      if (event.persisted) setRedirecting(false)
    }
    window.addEventListener("pageshow", reset)
    return () => window.removeEventListener("pageshow", reset)
  }, [])

  async function proceed(next: SignInStep) {
    setRedirecting(true)

    // Not a member yet, so the application would refuse them; accept first.
    if (next === "invitation") {
      router.push(`/org/${organizationSlug}/invitation`)
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
    // hard navigation would otherwise abort its stream into the error boundary.
    await getAccessContext()

    // A full navigation, not a router push: the destination is the provider's
    // own endpoint, which finishes the flow and redirects to the application.
    window.location.assign(authorizeUrl)
  }

  async function onSubmit(data: LoginCredentials) {
    const result = await login(data, organizationSlug)

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
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">{t("oidcLogin.title")}</h1>
          <p className="text-sm text-balance text-muted-foreground">
            {t("oidcLogin.description", { application: applicationName })}
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
                  href={`/org/${organizationSlug}/forgot-password`}
                  className="ml-auto text-sm underline-offset-4 hover:underline"
                >
                  {t("login.forgotPassword")}
                </Link>
              </div>
              <PasswordInput
                {...field}
                id="oidc-login-password"
                autoComplete="current-password"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        {form.formState.errors.root && (
          <FieldError errors={[form.formState.errors.root]} />
        )}
        <Field>
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
        <PasskeySignIn
          separator={t("oidcLogin.alternatives")}
          organizationSlug={organizationSlug}
          disabled={busy}
          onSignedIn={(next) => void proceed(next)}
          onError={(message) => form.setError("root", { message })}
        />
      </FieldGroup>
    </form>
  )
}
