"use client"

import { useTranslations } from "next-intl"
import type { FieldValues, UseFormReturn } from "react-hook-form"

import { Button } from "@/features/shared/components/ui/button"

// Each block of the settings page saves on its own, so each is a form with its
// own footer rather than one page-wide submit.
export function SettingsBlock<TValues extends FieldValues>({
  title,
  description,
  form,
  disabled,
  onSubmit,
  children,
}: {
  title: string
  description: string
  form: UseFormReturn<TValues>
  disabled: boolean
  onSubmit: (values: TValues) => Promise<void>
  children: React.ReactNode
}) {
  const t = useTranslations("organizations.settings")
  const tCommon = useTranslations("common")
  const { isDirty, isSubmitting, errors } = form.formState

  return (
    <form
      className="rounded-lg border"
      aria-busy={isSubmitting}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="px-4 py-4">{children}</div>
      <div className="flex items-center justify-end gap-3 border-t px-4 py-3">
        {errors.root && (
          <p className="mr-auto text-sm text-destructive" role="alert">
            {errors.root.message}
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={!isDirty || isSubmitting}
          onClick={() => form.reset()}
        >
          {t("discard")}
        </Button>
        <Button type="submit" disabled={disabled || !isDirty || isSubmitting}>
          {isSubmitting ? tCommon("states.saving") : tCommon("actions.save")}
        </Button>
      </div>
    </form>
  )
}
