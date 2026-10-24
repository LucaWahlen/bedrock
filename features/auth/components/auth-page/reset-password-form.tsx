"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CircleCheck, LoaderCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { resetPassword } from "@/features/auth/actions/reset-password"
import { createNewPasswordSchema } from "@/features/auth/schemas/sign-up"
import type { LoginOrganization, NewPassword } from "@/features/auth/types"
import { FormHeading } from "@/features/shared/components/form-heading"
import { PasswordStrengthMeter } from "@/features/shared/components/password-strength-meter"
import { Button } from "@/features/shared/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { PasswordInput } from "@/features/shared/components/ui/password-input"

export function ResetPasswordForm({
  organization,
  token,
  invitationToken,
}: {
  organization: LoginOrganization
  token: string
  invitationToken?: string
}) {
  const t = useTranslations("auth")
  const tCommon = useTranslations("common")
  const schema = useMemo(() => createNewPasswordSchema(t), [t])
  const [done, setDone] = useState(false)
  const form = useForm<NewPassword>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  })

  async function onSubmit(data: NewPassword) {
    const result = await resetPassword(token, data.password)
    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    setDone(true)
  }

  if (done) {
    return (
      <FieldGroup>
        <div className="flex flex-col items-center gap-3 text-center">
          <CircleCheck className="size-8 text-muted-foreground" />
          <FormHeading
            title={t("resetPassword.done.title")}
            description={
              invitationToken
                ? t("resetPassword.done.descriptionInvitation")
                : t("resetPassword.done.description")
            }
          />
        </div>
        {/* The login page refuses a non-member, so an invitation goes back to
            itself and is accepted there. */}
        <Button
          nativeButton={false}
          render={
            <Link
              href={
                invitationToken
                  ? `/org/${organization.slug}/invitation?token=${encodeURIComponent(invitationToken)}`
                  : `/org/${organization.slug}/login`
              }
            />
          }
        >
          {invitationToken
            ? t("resetPassword.done.continueToInvitation")
            : t("resetPassword.done.login")}
        </Button>
      </FieldGroup>
    )
  }

  return (
    <form
      id="reset-password-form"
      className="flex flex-col gap-6"
      aria-busy={form.formState.isSubmitting}
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FieldGroup>
        <FormHeading
          title={t("resetPassword.title")}
          description={t("resetPassword.description")}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="reset-password-form-password">
                {t("fields.newPassword")}
              </FieldLabel>
              <PasswordInput
                {...field}
                id="reset-password-form-password"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid
                    ? "reset-password-form-password-error"
                    : undefined
                }
              />
              <PasswordStrengthMeter password={field.value} />
              {fieldState.invalid && (
                <FieldError
                  id="reset-password-form-password-error"
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
                {tCommon("states.saving")}
              </>
            ) : (
              t("resetPassword.submit")
            )}
          </Button>
        </Field>
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href={`/org/${organization.slug}/forgot-password`}
            className="underline underline-offset-4"
          >
            {t("resetPassword.requestNewLink")}
          </Link>
        </p>
      </FieldGroup>
    </form>
  )
}
