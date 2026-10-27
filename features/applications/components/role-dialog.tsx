"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { findRoleCandidates } from "@/features/applications/actions/find-role-candidates"
import { saveApplicationRole } from "@/features/applications/actions/save-application-role"
import { ApplicationPicker } from "@/features/applications/components/application-picker"
import type {
  ApplicationRole,
  ApplicationSummary,
} from "@/features/applications/types"
import { UserPicker, type PersonSelection } from "@/features/organizations"
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
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"
import { Textarea } from "@/features/shared/components/ui/textarea"
import type { Translator } from "@/features/shared/lib/i18n/translator"

function createFormSchema(t: Translator<"applications">) {
  return z.object({
    key: z
      .string()
      .trim()
      .min(1, t("validation.roleKeyRequired"))
      .max(64, t("validation.tooLong", { max: 64 }))
      .regex(
        /^[A-Za-z0-9]+(?:[-_:][A-Za-z0-9]+)*$/,
        t("validation.roleKeyFormat")
      ),
    name: z
      .string()
      .trim()
      .min(1, t("validation.roleNameRequired"))
      .max(100, t("validation.tooLong", { max: 100 })),
    description: z
      .string()
      .trim()
      .max(500, t("validation.tooLong", { max: 500 })),
    clientIds: z.array(z.string()),
    members: z.array(z.custom<PersonSelection>()),
  })
}

type FormValues = z.infer<ReturnType<typeof createFormSchema>>

type RoleDialogProps = {
  organizationId: string
  applications: ApplicationSummary[]
  role?: ApplicationRole
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoleDialog({
  organizationId,
  applications,
  role,
  open,
  onOpenChange,
}: RoleDialogProps) {
  const t = useTranslations("applications")
  const tCommon = useTranslations("common")
  const formSchema = useMemo(() => createFormSchema(t), [t])
  const editing = role !== undefined
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      key: role?.key ?? "",
      name: role?.name ?? "",
      description: role?.description ?? "",
      clientIds:
        role?.applications.map((application) => application.clientId) ?? [],
      members: [],
    },
  })

  async function onSubmit(values: FormValues) {
    setSubmitting(true)

    const result = await saveApplicationRole({
      organizationId,
      roleId: role?.id,
      key: values.key,
      name: values.name,
      description: values.description || null,
      clientIds: values.clientIds,
      memberUserIds: editing
        ? undefined
        : values.members.flatMap((person) =>
            person.kind === "user" ? [person.id] : []
          ),
    })

    setSubmitting(false)

    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    onOpenChange(false)
    form.reset()
    toast.success(t("roleDialog.saved", { name: values.name }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          aria-busy={submitting}
          className="flex min-h-0 flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("roleDialog.editTitle")
                : t("roleDialog.createTitle")}
            </DialogTitle>
            <DialogDescription>{t("roleDialog.description")}</DialogDescription>
          </DialogHeader>

          <DialogBody>
            <FieldGroup>
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="role-name">
                      {t("roleDialog.name")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="role-name"
                      placeholder={t("roleDialog.namePlaceholder")}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="key"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="role-key">
                      {t("roleDialog.key")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="role-key"
                      disabled={editing}
                      spellCheck={false}
                      autoCapitalize="none"
                      className="font-mono text-xs"
                      placeholder={t("roleDialog.keyPlaceholder")}
                    />
                    <p className="text-xs text-muted-foreground">
                      {/* Applications match on this, so changing it would break them. */}
                      {editing
                        ? t("roleDialog.keyLocked")
                        : t("roleDialog.keyHint")}
                    </p>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="description"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="role-description">
                      {t("roleDialog.descriptionLabel")}
                    </FieldLabel>
                    <Textarea {...field} id="role-description" rows={2} />
                  </Field>
                )}
              />

              <Controller
                name="clientIds"
                control={form.control}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor="role-applications">
                      {t("roleDialog.applications")}
                    </FieldLabel>
                    <ApplicationPicker
                      id="role-applications"
                      applications={applications}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={applications.length === 0}
                    />
                  </Field>
                )}
              />

              {!editing && (
                <Controller
                  name="members"
                  control={form.control}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="role-members">
                        {t("roleDialog.members")}
                      </FieldLabel>
                      <UserPicker
                        id="role-members"
                        value={field.value}
                        onChange={field.onChange}
                        organizationId={organizationId}
                        canSearchDirectory
                        lookup={findRoleCandidates}
                        disabled={submitting}
                      />
                    </Field>
                  )}
                />
              )}

              {form.formState.errors.root && (
                <FieldError errors={[form.formState.errors.root]} />
              )}
            </FieldGroup>
          </DialogBody>

          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" type="button" />}
              disabled={submitting}
            >
              {tCommon("actions.cancel")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? tCommon("states.saving") : t("roleDialog.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
