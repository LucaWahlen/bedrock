"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { LoaderCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { signUp } from "@/features/auth/actions/sign-up"
import { createSignUpSchema } from "@/features/auth/schemas/sign-up"
import type { LoginOrganization, SignUpInput } from "@/features/auth/types"
import { FormHeading } from "@/features/shared/components/form-heading"
import { PasswordStrengthMeter } from "@/features/shared/components/password-strength-meter"
import { Button } from "@/features/shared/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"
import { PasswordInput } from "@/features/shared/components/ui/password-input"

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

export function SignUpForm({
  organization,
}: {
  organization: LoginOrganization
}) {
  const router = useRouter()
  const t = useTranslations("auth")
  const schema = useMemo(() => createSignUpSchema(t), [t])
  const form = useForm<SignUpInput>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  })
  const [name, email] = useWatch({
    control: form.control,
    name: ["name", "email"],
  })

  async function onSubmit(data: SignUpInput) {
    const result = await signUp(data, organization.slug)
    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    router.push(`/org/${organization.slug}/verify-email`)
  }

  return (
    <form
      id="sign-up-form"
      className="flex flex-col gap-6"
      aria-busy={form.formState.isSubmitting}
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FieldGroup>
        <FormHeading
          title={t("signUp.title", { organization: organization.name })}
          description={t("signUp.description")}
        />
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="sign-up-form-name">
                {t("fields.name")}
              </FieldLabel>
              <Input
                {...field}
                id="sign-up-form-name"
                autoComplete="name"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "sign-up-form-name-error" : undefined
                }
                placeholder={t("fields.namePlaceholder")}
              />
              {fieldState.invalid && (
                <FieldError
                  id="sign-up-form-name-error"
                  errors={[fieldState.error]}
                />
              )}
            </Field>
          )}
        />
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="sign-up-form-email">
                {t("fields.email")}
              </FieldLabel>
              <Input
                {...field}
                id="sign-up-form-email"
                type="email"
                autoComplete="email"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "sign-up-form-email-error" : undefined
                }
                placeholder={t("fields.emailPlaceholder")}
              />
              {fieldState.invalid && (
                <FieldError
                  id="sign-up-form-email-error"
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
              <FieldLabel htmlFor="sign-up-form-password">
                {t("fields.password")}
              </FieldLabel>
              <PasswordInput
                {...field}
                id="sign-up-form-password"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "sign-up-form-password-error" : undefined
                }
              />
              <PasswordStrengthMeter
                password={field.value}
                name={name}
                email={email}
              />
              {fieldState.invalid && (
                <FieldError
                  id="sign-up-form-password-error"
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
                {t("signUp.submitting")}
              </>
            ) : (
              t("signUp.submit")
            )}
          </Button>
        </Field>
        <p className="text-center text-sm text-muted-foreground">
          {t.rich("signUp.login", {
            link: linkTo(`/org/${organization.slug}/login`),
          })}
        </p>
      </FieldGroup>
    </form>
  )
}
