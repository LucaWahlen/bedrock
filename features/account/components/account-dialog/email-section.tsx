"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CircleCheck, MailCheck } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { changeEmail } from "@/features/account/actions/change-email"
import {
  AccountForm,
  AccountSectionHeading,
} from "@/features/account/components/account-dialog/account-form"
import { createChangeEmailSchema } from "@/features/account/schemas/account"
import type {
  AccountProfile,
  ChangeEmailInput,
  ChangeEmailValues,
} from "@/features/account/types"
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
function strong(chunks: React.ReactNode) {
  return <span className="font-medium">{chunks}</span>
}

export function EmailSection({
  profile,
  organizationSlug,
  justChanged,
}: {
  profile: AccountProfile
  organizationSlug: string
  // Set when the dialog was opened by following a confirmation link.
  justChanged: boolean
}) {
  const t = useTranslations("account")
  const schema = useMemo(() => createChangeEmailSchema(t), [t])
  const [requested, setRequested] = useState<string | null>(null)
  const form = useForm<ChangeEmailInput, unknown, ChangeEmailValues>({
    resolver: zodResolver(schema),
    defaultValues: { newEmail: "", currentPassword: "" },
  })

  async function onSubmit(data: ChangeEmailValues) {
    const result = await changeEmail(data, organizationSlug)
    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    form.reset()
    setRequested(data.newEmail)
  }

  return (
    <div className="flex flex-col gap-4">
      <AccountSectionHeading
        title={t("email.title")}
        description={t("email.description")}
      />
      <p className="text-sm">
        {t.rich("email.current", { email: profile.email, strong })}
      </p>
      {justChanged && (
        <output className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>{t("email.confirmed")}</p>
        </output>
      )}
      {requested && (
        <output className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>
            {t.rich("email.requested", {
              requested,
              email: profile.email,
              strong,
            })}
          </p>
        </output>
      )}
      <AccountForm
        id="account-email-form"
        form={form}
        onSubmit={onSubmit}
        submitLabel={t("email.submit")}
      >
        <FieldGroup>
          <Controller
            name="newEmail"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="account-new-email">
                  {t("email.newAddress")}
                </FieldLabel>
                <Input
                  {...field}
                  id="account-new-email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid ? "account-new-email-error" : undefined
                  }
                  placeholder={t("email.newAddressPlaceholder")}
                />
                {fieldState.invalid && (
                  <FieldError
                    id="account-new-email-error"
                    errors={[fieldState.error]}
                  />
                )}
              </Field>
            )}
          />
          <Controller
            name="currentPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="account-email-password">
                  {t("fields.currentPassword")}
                </FieldLabel>
                <PasswordInput
                  {...field}
                  id="account-email-password"
                  autoComplete="current-password"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid
                      ? "account-email-password-error"
                      : undefined
                  }
                />
                {fieldState.invalid && (
                  <FieldError
                    id="account-email-password-error"
                    errors={[fieldState.error]}
                  />
                )}
              </Field>
            )}
          />
        </FieldGroup>
      </AccountForm>
    </div>
  )
}
