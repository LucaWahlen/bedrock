"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Copy, ShieldCheck, ShieldOff } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { Controller, useForm, type UseFormReturn } from "react-hook-form"
import { toast } from "sonner"

import { confirmTwoFactorEnrollment } from "@/features/account/actions/confirm-two-factor-enrollment"
import { disableTwoFactor } from "@/features/account/actions/disable-two-factor"
import { regenerateBackupCodes } from "@/features/account/actions/regenerate-backup-codes"
import { startTwoFactorEnrollment } from "@/features/account/actions/start-two-factor-enrollment"
import { AccountForm } from "@/features/account/components/account-dialog/account-form"
import { BackupCodes } from "@/features/account/components/account-dialog/backup-codes"
import { TotpQrCode } from "@/features/account/components/account-dialog/totp-qr-code"
import {
  createDisableTwoFactorSchema,
  createEnrollmentCodeSchema,
  createPasswordConfirmationSchema,
} from "@/features/account/schemas/account"
import type {
  DisableTwoFactorInput,
  EnrollmentCodeInput,
  EnrollmentCodeValues,
  PasswordConfirmationInput,
  TwoFactorEnrollment,
} from "@/features/account/types"
import { Badge } from "@/features/shared/components/ui/badge"
import { Button } from "@/features/shared/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"
import { PasswordInput } from "@/features/shared/components/ui/password-input"
import { copyToClipboard } from "@/features/shared/lib/ui/clipboard"

type Step =
  | { kind: "idle" }
  | { kind: "enroll-password" }
  | { kind: "enroll-verify"; enrollment: TwoFactorEnrollment }
  | { kind: "codes"; codes: string[] }
  | { kind: "regenerate" }
  | { kind: "disable" }

function PasswordField({
  id,
  form,
}: {
  id: string
  form: UseFormReturn<{ currentPassword: string }>
}) {
  const t = useTranslations("account")

  return (
    <Controller
      name="currentPassword"
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{t("fields.currentPassword")}</FieldLabel>
          <PasswordInput
            {...field}
            id={id}
            autoComplete="current-password"
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.invalid ? `${id}-error` : undefined}
          />
          {fieldState.invalid && (
            <FieldError id={`${id}-error`} errors={[fieldState.error]} />
          )}
        </Field>
      )}
    />
  )
}

function PasswordStep({
  id,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  id: string
  submitLabel: string
  onSubmit: (
    values: PasswordConfirmationInput,
    form: UseFormReturn<PasswordConfirmationInput>
  ) => Promise<void>
  onCancel: () => void
}) {
  const t = useTranslations("account")
  const schema = useMemo(() => createPasswordConfirmationSchema(t), [t])
  const form = useForm<PasswordConfirmationInput>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "" },
  })

  return (
    <AccountForm
      id={`${id}-form`}
      form={form}
      onSubmit={(values) => onSubmit(values, form)}
      submitLabel={submitLabel}
      requireDirty={false}
      onCancel={onCancel}
    >
      <FieldGroup>
        <PasswordField id={`${id}-password`} form={form} />
      </FieldGroup>
    </AccountForm>
  )
}

function VerifyStep({
  enrollment,
  onVerified,
  onCancel,
}: {
  enrollment: TwoFactorEnrollment
  onVerified: () => void
  onCancel: () => void
}) {
  const t = useTranslations("account")
  const schema = useMemo(() => createEnrollmentCodeSchema(t), [t])
  const form = useForm<EnrollmentCodeInput, unknown, EnrollmentCodeValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: "" },
  })

  async function onSubmit(values: EnrollmentCodeValues) {
    const result = await confirmTwoFactorEnrollment(values)
    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    onVerified()
  }

  return (
    <AccountForm
      id="account-two-factor-verify-form"
      form={form}
      onSubmit={onSubmit}
      submitLabel={t("twoFactor.verify.submit")}
      requireDirty={false}
      onCancel={onCancel}
    >
      <FieldGroup>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <TotpQrCode
            value={enrollment.totpURI}
            label={t("twoFactor.verify.qrLabel")}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
            <p>{t("twoFactor.verify.scan")}</p>
            <p className="text-muted-foreground">
              {t("twoFactor.verify.cantScan")}
            </p>
            <div className="flex items-center gap-2">
              <code
                aria-label={t("twoFactor.verify.setupKey")}
                className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs tracking-wide break-all"
              >
                {enrollment.secret.match(/.{1,4}/g)?.join(" ")}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t("twoFactor.verify.copySetupKey")}
                onClick={() =>
                  copyToClipboard(
                    enrollment.secret,
                    t("twoFactor.verify.setupKey")
                  )
                }
              >
                <Copy />
              </Button>
            </div>
          </div>
        </div>
        <Controller
          name="code"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="account-two-factor-code">
                {t("twoFactor.verify.code")}
              </FieldLabel>
              <Input
                {...field}
                id="account-two-factor-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid
                    ? "account-two-factor-code-error"
                    : "account-two-factor-code-description"
                }
                className="max-w-40"
              />
              <FieldDescription id="account-two-factor-code-description">
                {t("twoFactor.verify.codeDescription")}
              </FieldDescription>
              {fieldState.invalid && (
                <FieldError
                  id="account-two-factor-code-error"
                  errors={[fieldState.error]}
                />
              )}
            </Field>
          )}
        />
      </FieldGroup>
    </AccountForm>
  )
}

function DisableStep({
  onDisabled,
  onCancel,
}: {
  onDisabled: () => void
  onCancel: () => void
}) {
  const t = useTranslations("account")
  const schema = useMemo(() => createDisableTwoFactorSchema(t), [t])
  const form = useForm<DisableTwoFactorInput>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", code: "" },
  })

  async function onSubmit(values: DisableTwoFactorInput) {
    const result = await disableTwoFactor(values)
    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    onDisabled()
  }

  return (
    <AccountForm
      id="account-two-factor-disable-form"
      form={form}
      onSubmit={onSubmit}
      submitLabel={t("twoFactor.disableSubmit")}
      submitVariant="destructive"
      requireDirty={false}
      onCancel={onCancel}
    >
      <FieldGroup>
        <PasswordField
          id="account-two-factor-disable-password"
          form={form as unknown as UseFormReturn<{ currentPassword: string }>}
        />
        <Controller
          name="code"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="account-two-factor-disable-code">
                {t("fields.secondFactorCode")}
              </FieldLabel>
              <Input
                {...field}
                id="account-two-factor-disable-code"
                autoComplete="one-time-code"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid
                    ? "account-two-factor-disable-code-error"
                    : undefined
                }
                className="max-w-56"
              />
              {fieldState.invalid && (
                <FieldError
                  id="account-two-factor-disable-code-error"
                  errors={[fieldState.error]}
                />
              )}
            </Field>
          )}
        />
      </FieldGroup>
    </AccountForm>
  )
}

export function TwoFactorPanel({
  enabled,
  backupCodesRemaining,
  disableRefusal,
  onChanged,
}: {
  enabled: boolean
  backupCodesRemaining: number | null
  // Why turning it off is refused, such as an organization requiring it while
  // no passkey would remain. The action refuses it again.
  disableRefusal: string | null
  onChanged: () => void
}) {
  const t = useTranslations("account")
  const tc = useTranslations("common")
  const [step, setStep] = useState<Step>({ kind: "idle" })
  const idle = () => setStep({ kind: "idle" })

  return (
    <section
      aria-labelledby="account-two-factor-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {enabled ? (
            <ShieldCheck
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden
            />
          ) : (
            <ShieldOff
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h4
                id="account-two-factor-heading"
                className="text-sm font-medium"
              >
                {t("twoFactor.title")}
              </h4>
              <Badge variant={enabled ? "default" : "secondary"}>
                {enabled ? t("twoFactor.on") : t("twoFactor.off")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? backupCodesRemaining === null
                  ? t("twoFactor.enabledDescription")
                  : t("twoFactor.enabledWithBackupCodes", {
                      count: backupCodesRemaining,
                    })
                : t("twoFactor.disabledDescription")}
            </p>
            {enabled && disableRefusal && (
              <p
                id="account-two-factor-disable-refusal"
                className="text-xs text-muted-foreground"
              >
                {disableRefusal}.
              </p>
            )}
          </div>
        </div>
        {step.kind === "idle" && (
          <div className="flex shrink-0 flex-wrap gap-2 self-start sm:self-auto">
            {enabled ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStep({ kind: "regenerate" })}
                >
                  {t("twoFactor.newBackupCodes")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={disableRefusal !== null}
                  aria-describedby={
                    disableRefusal
                      ? "account-two-factor-disable-refusal"
                      : undefined
                  }
                  onClick={() => setStep({ kind: "disable" })}
                >
                  {t("twoFactor.turnOff")}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => setStep({ kind: "enroll-password" })}
              >
                {t("twoFactor.setUp")}
              </Button>
            )}
          </div>
        )}
      </div>

      {step.kind === "enroll-password" && (
        <PasswordStep
          id="account-two-factor-enroll"
          submitLabel={tc("actions.continue")}
          onCancel={idle}
          onSubmit={async (values, form) => {
            const result = await startTwoFactorEnrollment(values)
            if (!result.success) {
              form.setError("root", { message: result.error })
              return
            }
            setStep({ kind: "enroll-verify", enrollment: result.data })
          }}
        />
      )}
      {step.kind === "enroll-verify" && (
        <VerifyStep
          enrollment={step.enrollment}
          onCancel={idle}
          onVerified={() => {
            toast.success(t("twoFactor.enabled"))
            setStep({ kind: "codes", codes: step.enrollment.backupCodes })
            onChanged()
          }}
        />
      )}
      {step.kind === "regenerate" && (
        <PasswordStep
          id="account-two-factor-regenerate"
          submitLabel={t("twoFactor.regenerate")}
          onCancel={idle}
          onSubmit={async (values, form) => {
            const result = await regenerateBackupCodes(values)
            if (!result.success) {
              form.setError("root", { message: result.error })
              return
            }
            toast.success(t("twoFactor.regenerated"))
            setStep({ kind: "codes", codes: result.data })
            onChanged()
          }}
        />
      )}
      {step.kind === "codes" && (
        <BackupCodes codes={step.codes} onDone={idle} />
      )}
      {step.kind === "disable" && (
        <DisableStep
          onCancel={idle}
          onDisabled={() => {
            toast.success(t("twoFactor.disabled"))
            idle()
            onChanged()
          }}
        />
      )}
    </section>
  )
}
