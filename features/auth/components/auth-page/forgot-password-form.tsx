"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { LoaderCircle, MailCheck } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { requestPasswordReset } from "@/features/auth/actions/request-password-reset"
import { createEmailSchema } from "@/features/auth/schemas/sign-up"
import type { EmailOnly } from "@/features/auth/schemas/sign-up"
import type { LoginOrganization } from "@/features/auth/types"
import { FormHeading } from "@/features/shared/components/form-heading"
import { Button } from "@/features/shared/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"

// Tag renderers for `t.rich`, built outside the component so they are not new
// component types on every render.
function linkTo(href: string) {
  return function LinkTag(chunks: React.ReactNode) {
    return (
      <Link href={href} className="underline underline-offset-4">
        {chunks}
      </Link>
    )
  }
}

function strong(chunks: React.ReactNode) {
  return <strong>{chunks}</strong>
}

export function ForgotPasswordForm({
  organization,
  invitationToken,
}: {
  organization: LoginOrganization
  invitationToken?: string
}) {
  const t = useTranslations("auth")
  const schema = useMemo(() => createEmailSchema(t), [t])
  const [sentTo, setSentTo] = useState<string | null>(null)
  const form = useForm<EmailOnly>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  })

  // Somewhere that will not refuse them: back to the invitation if there is
  // one, since the login page turns away anyone who is not a member yet.
  const back = invitationToken
    ? {
        href: `/org/${organization.slug}/invitation?token=${encodeURIComponent(invitationToken)}`,
        label: t("forgotPassword.backToInvitation"),
      }
    : {
        href: `/org/${organization.slug}/login`,
        label: t("forgotPassword.backToLogin"),
      }

  async function onSubmit(data: EmailOnly) {
    const result = await requestPasswordReset(
      data.email,
      organization.slug,
      invitationToken
    )
    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    setSentTo(data.email)
  }

  // Deliberately the same answer whether or not that address has an account.
  if (sentTo) {
    return (
      <FieldGroup>
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="size-8 text-muted-foreground" />
          <FormHeading
            title={t("forgotPassword.sent.title")}
            description={t.rich("forgotPassword.sent.description", {
              email: sentTo,
              strong,
            })}
          />
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={back.href} />}
        >
          {back.label}
        </Button>
      </FieldGroup>
    )
  }

  return (
    <form
      id="forgot-password-form"
      className="flex flex-col gap-6"
      aria-busy={form.formState.isSubmitting}
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FieldGroup>
        <FormHeading
          title={t("forgotPassword.title")}
          description={t("forgotPassword.description")}
        />
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="forgot-password-form-email">
                {t("fields.email")}
              </FieldLabel>
              <Input
                {...field}
                id="forgot-password-form-email"
                type="email"
                autoComplete="email"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid
                    ? "forgot-password-form-email-error"
                    : undefined
                }
                placeholder={t("fields.emailPlaceholder")}
              />
              {fieldState.invalid && (
                <FieldError
                  id="forgot-password-form-email-error"
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
                {t("forgotPassword.submitting")}
              </>
            ) : (
              t("forgotPassword.submit")
            )}
          </Button>
        </Field>
        <p className="text-center text-sm text-muted-foreground">
          {t.rich(
            invitationToken
              ? "forgotPassword.rememberedInvitation"
              : "forgotPassword.remembered",
            { link: linkTo(back.href) }
          )}
        </p>
      </FieldGroup>
    </form>
  )
}
