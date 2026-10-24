"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { LoaderCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { Controller, useForm } from "react-hook-form"

import { login } from "@/features/auth/actions/login"
import { PasskeySignIn } from "@/features/auth/components/passkey-sign-in"
import { createLoginSchema } from "@/features/auth/schemas/login"
import type {
  LoginCredentials,
  LoginOrganization,
  SignInStep,
} from "@/features/auth/types"
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

// A tag renderer for `t.rich`, built outside the component so it is not a new
// component type on every render.
function linkTo(href: string) {
  return function LinkTag(chunks: React.ReactNode) {
    return (
      <Link href={href} className="underline underline-offset-4">
        {chunks}
      </Link>
    )
  }
}

export function LoginForm({
  organization,
  allowSignUp = false,
  className,
  ...props
}: React.ComponentProps<"form"> & {
  organization?: LoginOrganization
  allowSignUp?: boolean
}) {
  const router = useRouter()
  const t = useTranslations("auth")
  const schema = useMemo(() => createLoginSchema(t), [t])
  const form = useForm<LoginCredentials>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  function proceed(next: SignInStep) {
    if (!organization) {
      router.refresh()
      return
    }

    // Not a member yet, but invited: the organization itself would only bounce
    // them off the membership guard. Two-factor accounts are not signed in at
    // all until their second factor is in.
    router.push(
      next === "invitation"
        ? `/org/${organization.slug}/invitation`
        : next === "two-factor"
          ? `/org/${organization.slug}/two-factor`
          : `/org/${organization.slug}`
    )
  }

  async function onSubmit(data: LoginCredentials) {
    const result = await login(data, organization?.slug)
    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    proceed(result.next)
  }

  return (
    <form
      id="login-form"
      className={cn("flex flex-col gap-6", className)}
      aria-busy={form.formState.isSubmitting}
      {...props}
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">{t("login.title")}</h1>
          <p className="text-sm text-balance text-muted-foreground">
            {t("login.description")}
          </p>
        </div>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="login-form-email">
                {t("login.email")}
              </FieldLabel>
              <Input
                {...field}
                id="login-form-email"
                type="email"
                autoComplete="username webauthn"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "login-form-email-error" : undefined
                }
                placeholder={t("login.emailPlaceholder")}
              />
              {fieldState.invalid && (
                <FieldError
                  id="login-form-email-error"
                  errors={[fieldState.error]}
                />
              )}
            </Field>
          )}
        />

        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center">
                <FieldLabel htmlFor="login-form-password">
                  {t("login.password")}
                </FieldLabel>
                {organization && (
                  <Link
                    href={`/org/${organization.slug}/forgot-password`}
                    className="ml-auto text-sm underline-offset-4 hover:underline"
                  >
                    {t("login.forgotPassword")}
                  </Link>
                )}
              </div>
              <PasswordInput
                {...field}
                id="login-form-password"
                autoComplete="current-password"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "login-form-password-error" : undefined
                }
              />
              {fieldState.invalid && (
                <FieldError
                  id="login-form-password-error"
                  errors={[fieldState.error]}
                />
              )}
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
                {t("login.submitting")}
              </>
            ) : (
              t("login.submit")
            )}
          </Button>
        </Field>
        <PasskeySignIn
          separator={t("login.alternatives")}
          organizationSlug={organization?.slug}
          disabled={form.formState.isSubmitting}
          onSignedIn={proceed}
          onError={(message) => form.setError("root", { message })}
        />
        {allowSignUp && organization && (
          <p className="text-center text-sm text-muted-foreground">
            {t.rich("login.signUp", {
              link: linkTo(`/org/${organization.slug}/signup`),
            })}
          </p>
        )}
      </FieldGroup>
    </form>
  )
}
