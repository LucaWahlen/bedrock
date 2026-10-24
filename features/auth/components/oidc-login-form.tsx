"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { LoaderCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useMemo } from "react"
import { Controller, useForm } from "react-hook-form"

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
  const t = useTranslations("auth")
  const schema = useMemo(() => createLoginSchema(t), [t])
  const form = useForm<LoginCredentials>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  })

  function proceed(next: SignInStep) {
    // Not a member yet, so the application would refuse them; accept first.
    if (next === "invitation") {
      window.location.assign(`/org/${organizationSlug}/invitation`)
      return
    }

    // The second step keeps the signed authorization query, so finishing it
    // resumes this same request.
    if (next === "two-factor") {
      window.location.assign(`/oauth2/two-factor${window.location.search}`)
      return
    }

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

    proceed(result.next)
  }

  return (
    <form
      className="flex flex-col gap-6"
      aria-busy={form.formState.isSubmitting}
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
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
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
          disabled={form.formState.isSubmitting}
          onSignedIn={proceed}
          onError={(message) => form.setError("root", { message })}
        />
      </FieldGroup>
    </form>
  )
}
