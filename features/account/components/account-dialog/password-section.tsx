"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { changePassword } from "@/features/account/actions/change-password"
import {
  AccountForm,
  AccountSectionHeading,
} from "@/features/account/components/account-dialog/account-form"
import { createChangePasswordSchema } from "@/features/account/schemas/account"
import type {
  AccountProfile,
  ChangePasswordInput,
  ChangePasswordValues,
} from "@/features/account/types"
import { PasswordStrengthMeter } from "@/features/shared/components/password-strength-meter"
import { Checkbox } from "@/features/shared/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { PasswordInput } from "@/features/shared/components/ui/password-input"

export function PasswordSection({
  profile,
  onSessionsChanged,
}: {
  profile: AccountProfile
  onSessionsChanged: () => void
}) {
  const t = useTranslations("account")
  const schema = useMemo(() => createChangePasswordSchema(t), [t])
  const form = useForm<ChangePasswordInput, unknown, ChangePasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: "",
      password: "",
      revokeOtherSessions: true,
    },
  })
  const password = useWatch({ control: form.control, name: "password" })

  async function onSubmit(data: ChangePasswordValues) {
    const result = await changePassword({
      currentPassword: data.currentPassword,
      password: data.password,
      revokeOtherSessions: data.revokeOtherSessions,
    })
    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    form.reset()
    toast.success(
      data.revokeOtherSessions
        ? t("password.changedAndRevoked")
        : t("password.changed")
    )
    onSessionsChanged()
  }

  return (
    <div className="flex flex-col gap-4">
      <AccountSectionHeading
        title={t("password.title")}
        description={t("password.description")}
      />
      <AccountForm
        id="account-password-form"
        form={form}
        onSubmit={onSubmit}
        submitLabel={t("password.submit")}
      >
        <FieldGroup>
          <Controller
            name="currentPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="account-current-password">
                  {t("fields.currentPassword")}
                </FieldLabel>
                <PasswordInput
                  {...field}
                  id="account-current-password"
                  autoComplete="current-password"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid
                      ? "account-current-password-error"
                      : undefined
                  }
                />
                {fieldState.invalid && (
                  <FieldError
                    id="account-current-password-error"
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
                <FieldLabel htmlFor="account-new-password">
                  {t("password.newPassword")}
                </FieldLabel>
                <PasswordInput
                  {...field}
                  id="account-new-password"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid
                      ? "account-new-password-error"
                      : undefined
                  }
                />
                <PasswordStrengthMeter
                  password={password ?? ""}
                  name={profile.name}
                  email={profile.email}
                />
                {fieldState.invalid && (
                  <FieldError
                    id="account-new-password-error"
                    errors={[fieldState.error]}
                  />
                )}
              </Field>
            )}
          />
          <Controller
            name="revokeOtherSessions"
            control={form.control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="account-revoke-other-sessions"
                  checked={field.value ?? true}
                  onCheckedChange={(checked) => field.onChange(checked)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="account-revoke-other-sessions">
                    {t("password.revokeOthers")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("password.revokeOthersDescription")}
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          />
        </FieldGroup>
      </AccountForm>
    </div>
  )
}
