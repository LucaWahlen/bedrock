"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { TriangleAlert } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { disableAccount } from "@/features/organizations/actions/disable-account"
import { getAccountDisablePreview } from "@/features/organizations/actions/get-account-disable-preview"
import {
  createDisableAccountFormSchema,
  type DisableAccountFormValues,
} from "@/features/organizations/schemas/account-standing"
import type {
  AccountDisablePreview,
  DirectoryPerson,
} from "@/features/organizations/types"
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
  FieldError,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Textarea } from "@/features/shared/components/ui/textarea"

function DisableAccountForm({
  person,
  onDone,
}: {
  person: DirectoryPerson
  onDone: () => void
}) {
  const t = useTranslations("organizations")
  const tCommon = useTranslations("common")
  const format = useFormatter()
  const schema = useMemo(() => createDisableAccountFormSchema(t), [t])
  const [preview, setPreview] = useState<AccountDisablePreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const form = useForm<DisableAccountFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  })
  const { isSubmitting, errors } = form.formState

  useEffect(() => {
    let cancelled = false
    void getAccountDisablePreview(person.id).then((result) => {
      if (cancelled) return
      if (result.success) setPreview(result.data)
      else setLoadError(result.error)
    })

    return () => {
      cancelled = true
    }
  }, [person.id])

  async function onSubmit(values: DisableAccountFormValues) {
    const result = await disableAccount({ userId: person.id, ...values })
    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    toast.success(t("directory.disabled", { name: person.name }))
    onDone()
  }

  const refusal = loadError ?? preview?.refusal ?? null
  const ready = preview !== null && refusal === null

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      aria-busy={isSubmitting}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <DialogHeader>
        <DialogTitle>
          {t("directory.disableDialog.title", { name: person.name })}
        </DialogTitle>
        <DialogDescription>
          {t("directory.disableDialog.description", { email: person.email })}
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        <div className="flex flex-col gap-4">
          {refusal && (
            <p className="text-sm text-destructive" role="alert">
              {refusal}
            </p>
          )}

          {ready && preview.soleOwnedOrganizations.length > 0 && (
            <div
              className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
              aria-live="polite"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                {t("directory.disableDialog.soleOwner", {
                  count: preview.soleOwnedOrganizations.length,
                  organizations: format.list(
                    preview.soleOwnedOrganizations.map(
                      (organization) => organization.name
                    ),
                    { type: "conjunction" }
                  ),
                })}
              </div>
            </div>
          )}

          {refusal === null && (
            <Controller
              name="reason"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="disable-account-reason">
                    {t("directory.disableDialog.reason")}
                  </FieldLabel>
                  <Textarea
                    id="disable-account-reason"
                    aria-invalid={fieldState.invalid}
                    disabled={isSubmitting}
                    rows={3}
                    placeholder={t("directory.disableDialog.reasonPlaceholder")}
                    {...field}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          )}

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
        <Button
          type="submit"
          variant="destructive"
          disabled={!ready || isSubmitting}
        >
          {isSubmitting
            ? t("directory.disableDialog.disabling")
            : t("directory.disableAccount")}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function DisableAccountDialog({
  person,
  open,
  onOpenChange,
}: {
  person: DirectoryPerson
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DisableAccountForm
          person={person}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
