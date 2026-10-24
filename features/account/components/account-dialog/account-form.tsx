"use client"

import { useTranslations } from "next-intl"
import type { FieldValues, UseFormReturn } from "react-hook-form"

import { Button } from "@/features/shared/components/ui/button"
import { Spinner } from "@/features/shared/components/ui/spinner"

export function AccountSectionHeading({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

// Each section saves on its own, so each is a form with its own footer rather
// than one dialog-wide submit.
export function AccountForm<
  TValues extends FieldValues,
  TOutput extends FieldValues = TValues,
>({
  id,
  form,
  onSubmit,
  submitLabel,
  submitVariant = "default",
  requireDirty = true,
  onCancel,
  children,
}: {
  id: string
  form: UseFormReturn<TValues, unknown, TOutput>
  onSubmit: (values: TOutput) => Promise<void>
  submitLabel: string
  submitVariant?: "default" | "destructive"
  requireDirty?: boolean
  // Multi-step flows put Cancel beside the submit button, not in the body.
  onCancel?: () => void
  children: React.ReactNode
}) {
  const t = useTranslations("common")
  const { isDirty, isSubmitting, errors } = form.formState

  return (
    <form
      id={id}
      className="flex flex-col gap-4 rounded-lg border"
      aria-busy={isSubmitting}
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <div className="px-4 pt-4">{children}</div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t px-4 py-3">
        {errors.root && (
          <p className="mr-auto text-sm text-destructive" role="alert">
            {errors.root.message}
          </p>
        )}
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            {t("actions.cancel")}
          </Button>
        )}
        <Button
          type="submit"
          variant={submitVariant}
          disabled={isSubmitting || (requireDirty && !isDirty)}
        >
          {isSubmitting && <Spinner aria-hidden />}
          {isSubmitting ? t("states.saving") : submitLabel}
        </Button>
      </div>
    </form>
  )
}
