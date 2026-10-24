"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { deleteAccount } from "@/features/account/actions/delete-account"
import {
  AccountForm,
  AccountSectionHeading,
} from "@/features/account/components/account-dialog/account-form"
import { createDeleteAccountSchema } from "@/features/account/schemas/account"
import type {
  DeleteAccountInput,
  SoleOwnedOrganization,
} from "@/features/account/types"
import { Button } from "@/features/shared/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"
import { PasswordInput } from "@/features/shared/components/ui/password-input"

export function DangerSection({
  organizationSlug,
  soleOwnedOrganizations,
  twoFactorEnabled,
}: {
  organizationSlug: string
  soleOwnedOrganizations: SoleOwnedOrganization[]
  twoFactorEnabled: boolean
}) {
  const t = useTranslations("account")
  const schema = useMemo(() => createDeleteAccountSchema(t), [t])
  const [confirming, setConfirming] = useState(false)
  // The server's answer wins over what was read when the dialog opened, since
  // ownership can change in between.
  const [blockers, setBlockers] = useState(soleOwnedOrganizations)
  const form = useForm<DeleteAccountInput>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", code: "" },
  })

  async function onSubmit(data: DeleteAccountInput) {
    const result = await deleteAccount(data)
    if (!result.success) {
      if (result.soleOwnedOrganizations) {
        setBlockers(result.soleOwnedOrganizations)
        setConfirming(false)
      }
      form.setError("root", { message: result.error })
      return
    }

    // A full load, so nothing of the signed-in shell survives the account.
    window.location.assign(`/org/${organizationSlug}/login`)
  }

  return (
    <div className="flex flex-col gap-4">
      <AccountSectionHeading
        title={t("danger.title")}
        description={t("danger.description")}
      />
      {blockers.length > 0 ? (
        <output className="flex flex-col gap-2 rounded-lg border border-destructive/30 px-4 py-3 text-sm">
          <p>{t("danger.soleOwner")}</p>
          <ul className="list-disc pl-5">
            {blockers.map((organization) => (
              <li key={organization.id}>
                <Link
                  href={`/org/${organization.slug}/members`}
                  className="underline underline-offset-4"
                >
                  {organization.name}
                </Link>
              </li>
            ))}
          </ul>
        </output>
      ) : confirming ? (
        <AccountForm
          id="account-delete-form"
          form={form}
          onSubmit={onSubmit}
          submitLabel={t("danger.submit")}
          submitVariant="destructive"
          requireDirty={false}
        >
          <FieldGroup>
            <Controller
              name="currentPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="account-delete-password">
                    {t("danger.confirmPassword")}
                  </FieldLabel>
                  <PasswordInput
                    {...field}
                    id="account-delete-password"
                    autoComplete="current-password"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid
                        ? "account-delete-password-error"
                        : undefined
                    }
                  />
                  {fieldState.invalid && (
                    <FieldError
                      id="account-delete-password-error"
                      errors={[fieldState.error]}
                    />
                  )}
                </Field>
              )}
            />
            {twoFactorEnabled && (
              <Controller
                name="code"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="account-delete-code">
                      {t("fields.secondFactorCode")}
                    </FieldLabel>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      id="account-delete-code"
                      autoComplete="one-time-code"
                      aria-invalid={fieldState.invalid}
                      aria-describedby={
                        fieldState.invalid
                          ? "account-delete-code-error"
                          : undefined
                      }
                      className="max-w-56"
                    />
                    {fieldState.invalid && (
                      <FieldError
                        id="account-delete-code-error"
                        errors={[fieldState.error]}
                      />
                    )}
                  </Field>
                )}
              />
            )}
          </FieldGroup>
        </AccountForm>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {t("danger.auditNote")}
          </p>
          <Button
            type="button"
            variant="destructive"
            className="shrink-0 self-start sm:self-auto"
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
            {t("danger.delete")}
          </Button>
        </div>
      )}
    </div>
  )
}
