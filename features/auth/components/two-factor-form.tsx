"use client"

import { LoaderCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"

import { verifyTwoFactor } from "@/features/auth/actions/verify-two-factor"
import { createTwoFactorSchema } from "@/features/auth/schemas/two-factor"
import type { LoginDestination, TwoFactorMethod } from "@/features/auth/types"
import { Button } from "@/features/shared/components/ui/button"
import { Checkbox } from "@/features/shared/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"

type TwoFactorValues = { code: string; trustDevice: boolean }

// How long Better Auth trusts a device once asked to, which is its default.
const TRUSTED_DEVICE_DAYS = 30

// The message keys of each method's copy.
const COPY = {
  totp: "totp",
  backup_code: "backupCode",
} as const satisfies Record<TwoFactorMethod, string>

export function TwoFactorForm({
  organizationSlug,
  restartHref,
  authorizeUrl,
}: {
  organizationSlug: string
  // Where to start over once the pending sign-in has expired.
  restartHref: string
  // Set when the sign-in belongs to an OIDC authorization, which is resumed
  // here instead of entering the organization.
  authorizeUrl?: string
}) {
  const router = useRouter()
  const t = useTranslations("auth")
  const schema = useMemo(() => createTwoFactorSchema(t), [t])
  const [method, setMethod] = useState<TwoFactorMethod>("totp")
  const [expired, setExpired] = useState(false)
  const form = useForm<TwoFactorValues>({
    defaultValues: { code: "", trustDevice: false },
  })
  const copy = COPY[method]

  function proceed(next: LoginDestination) {
    if (next === "invitation") {
      window.location.assign(`/org/${organizationSlug}/invitation`)
      return
    }

    if (authorizeUrl) {
      // The provider's own endpoint finishes the flow and redirects onwards.
      window.location.assign(authorizeUrl)
      return
    }

    router.push(`/org/${organizationSlug}`)
  }

  async function onSubmit(values: TwoFactorValues) {
    const parsed = schema.safeParse({ method, ...values })
    if (!parsed.success) {
      form.setError("code", { message: parsed.error.issues[0]?.message })
      return
    }

    const result = await verifyTwoFactor(
      { method, ...values },
      organizationSlug
    )
    if (!result.success) {
      if (result.expired) setExpired(true)
      form.setError("root", { message: result.error })
      return
    }

    proceed(result.next)
  }

  function switchMethod() {
    setMethod((current) => (current === "totp" ? "backup_code" : "totp"))
    form.resetField("code")
    form.clearErrors()
  }

  return (
    <form
      className="flex flex-col gap-6"
      aria-busy={form.formState.isSubmitting}
      method="post"
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">{t("twoFactor.title")}</h1>
          <p className="text-sm text-balance text-muted-foreground">
            {t(`twoFactor.${copy}.description`)}
          </p>
        </div>
        <Controller
          name="code"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="two-factor-code">
                {t(`twoFactor.${copy}.label`)}
              </FieldLabel>
              <Input
                {...field}
                id="two-factor-code"
                autoComplete="one-time-code"
                inputMode={method === "totp" ? "numeric" : "text"}
                autoCapitalize="off"
                spellCheck={false}
                disabled={expired}
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "two-factor-code-error" : undefined
                }
                placeholder={method === "totp" ? "123456" : "xxxxx-xxxxx"}
              />
              {fieldState.invalid && (
                <FieldError
                  id="two-factor-code-error"
                  errors={[fieldState.error]}
                />
              )}
            </Field>
          )}
        />
        <Controller
          name="trustDevice"
          control={form.control}
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="two-factor-trust-device"
                checked={field.value}
                disabled={expired}
                onCheckedChange={(checked) => field.onChange(checked)}
              />
              <FieldContent>
                <FieldLabel htmlFor="two-factor-trust-device">
                  {t("twoFactor.trustDevice", { days: TRUSTED_DEVICE_DAYS })}
                </FieldLabel>
                <FieldDescription>
                  {t("twoFactor.trustDeviceDescription")}
                </FieldDescription>
              </FieldContent>
            </Field>
          )}
        />
        {form.formState.errors.root && (
          <FieldError errors={[form.formState.errors.root]} />
        )}
        <Field>
          {expired ? (
            <Button render={<Link href={restartHref} />} nativeButton={false}>
              {t("twoFactor.restart")}
            </Button>
          ) : (
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  {t("twoFactor.submitting")}
                </>
              ) : (
                t("twoFactor.submit")
              )}
            </Button>
          )}
          {!expired && (
            <Button type="button" variant="link" onClick={switchMethod}>
              {t(`twoFactor.${copy}.switchTo`)}
            </Button>
          )}
        </Field>
      </FieldGroup>
    </form>
  )
}
