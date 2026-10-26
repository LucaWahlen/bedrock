"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ShieldAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { Controller, useForm } from "react-hook-form"

import { startBreakGlass } from "@/features/organizations/actions/start-break-glass"
import { BREAK_GLASS_MINUTES } from "@/features/organizations/lib/break-glass"
import {
  createBreakGlassFormSchema,
  type BreakGlassFormValues,
} from "@/features/organizations/schemas/break-glass"
import type { OrganizationDisplay } from "@/features/organizations/types"
import { Button } from "@/features/shared/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/features/shared/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Textarea } from "@/features/shared/components/ui/textarea"

function BreakGlassForm({
  organization,
}: {
  organization: Pick<OrganizationDisplay, "id" | "name">
}) {
  const t = useTranslations("organizations")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const schema = useMemo(() => createBreakGlassFormSchema(t), [t])
  const form = useForm<BreakGlassFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  })
  const { isSubmitting, errors } = form.formState

  async function onSubmit(values: BreakGlassFormValues) {
    const result = await startBreakGlass({
      organizationId: organization.id,
      ...values,
    })
    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    router.push(`/org/${result.slug}`)
  }

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      aria-busy={isSubmitting}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <DialogHeader>
        <DialogTitle>
          {t("breakGlass.dialog.title", { organization: organization.name })}
        </DialogTitle>
        <DialogDescription>
          {t("breakGlass.dialog.description", {
            organization: organization.name,
            minutes: BREAK_GLASS_MINUTES,
          })}
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{t("breakGlass.dialog.disclosure")}</p>
          </div>

          <Controller
            name="reason"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="break-glass-reason">
                  {t("breakGlass.dialog.reason")}
                </FieldLabel>
                <Textarea
                  id="break-glass-reason"
                  aria-invalid={fieldState.invalid}
                  disabled={isSubmitting}
                  rows={3}
                  placeholder={t("breakGlass.dialog.reasonPlaceholder")}
                  {...field}
                />
                <FieldDescription>
                  {t("breakGlass.dialog.reasonHint")}
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          {errors.root && (
            <p className="text-sm text-destructive" role="alert">
              {errors.root.message}
            </p>
          )}
        </div>
      </DialogBody>

      <DialogFooter>
        <DialogClose
          render={<Button variant="outline" disabled={isSubmitting} />}
        >
          {tCommon("actions.cancel")}
        </DialogClose>
        <Button type="submit" variant="destructive" disabled={isSubmitting}>
          {isSubmitting
            ? t("breakGlass.dialog.entering")
            : t("breakGlass.dialog.confirm")}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function BreakGlassDialog({
  organization,
  open,
  onOpenChange,
}: {
  organization: Pick<OrganizationDisplay, "id" | "name">
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <BreakGlassForm organization={organization} />}
      </DialogContent>
    </Dialog>
  )
}
