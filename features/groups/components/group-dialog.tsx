"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import type { ApplicationRoleOption } from "@/features/applications"
import { findGroupCandidates } from "@/features/groups/actions/find-group-candidates"
import { saveGroup } from "@/features/groups/actions/save-group"
import { createGroupKeySchema } from "@/features/groups/schemas/group"
import type { Group } from "@/features/groups/types"
import { UserPicker, type PersonSelection } from "@/features/organizations"
import { KeyedOptionPicker } from "@/features/shared/components/keyed-option-picker"
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

function createFormSchema(t: Translator<"groups">) {
  return z.object({
    key: createGroupKeySchema(t),
    name: z.string().trim().min(1, t("validation.nameRequired")),
    description: z.string().trim(),
    roleIds: z.array(z.string()),
    members: z.array(z.custom<PersonSelection>()),
  })
}

type FormValues = z.infer<ReturnType<typeof createFormSchema>>

type GroupDialogProps = {
  organizationId: string
  roles: ApplicationRoleOption[]
  group?: Group
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GroupDialog({
  organizationId,
  roles,
  group,
  open,
  onOpenChange,
}: GroupDialogProps) {
  const t = useTranslations("groups")
  const tCommon = useTranslations("common")
  const formSchema = useMemo(() => createFormSchema(t), [t])
  const editing = group !== undefined
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      key: group?.key ?? "",
      name: group?.name ?? "",
      description: group?.description ?? "",
      roleIds: [],
      members: [],
    },
  })

  async function onSubmit(values: FormValues) {
    setSubmitting(true)

    const result = await saveGroup({
      organizationId,
      groupId: group?.id,
      key: values.key,
      name: values.name,
      description: values.description || null,
      roleIds: editing ? undefined : values.roleIds,
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
    toast.success(t("dialog.saved", { name: values.name }))
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
              {editing ? t("dialog.editTitle") : t("dialog.createTitle")}
            </DialogTitle>
            <DialogDescription>{t("dialog.description")}</DialogDescription>
          </DialogHeader>

          <DialogBody>
            <FieldGroup>
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="group-name">
                      {t("dialog.name")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="group-name"
                      placeholder={t("dialog.namePlaceholder")}
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
                    <FieldLabel htmlFor="group-key">
                      {t("dialog.key")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="group-key"
                      disabled={editing}
                      spellCheck={false}
                      autoCapitalize="none"
                      className="font-mono text-xs"
                      placeholder={t("dialog.keyPlaceholder")}
                    />
                    <p className="text-xs text-muted-foreground">
                      {editing ? t("dialog.keyLocked") : t("dialog.keyHint")}
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
                    <FieldLabel htmlFor="group-description">
                      {t("dialog.descriptionLabel")}
                    </FieldLabel>
                    <Textarea {...field} id="group-description" rows={2} />
                  </Field>
                )}
              />

              {!editing && (
                <>
                  <Controller
                    name="roleIds"
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor="group-roles">
                          {t("dialog.roles")}
                        </FieldLabel>
                        <KeyedOptionPicker
                          id="group-roles"
                          options={roles}
                          value={field.value}
                          onChange={field.onChange}
                          disabled={submitting || roles.length === 0}
                          placeholder={t("rolePicker.placeholder")}
                          noneMessage={t("rolePicker.none")}
                          allTakenMessage={t("rolePicker.allTaken")}
                          noMatchMessage={t("rolePicker.noMatch")}
                        />
                      </Field>
                    )}
                  />

                  <Controller
                    name="members"
                    control={form.control}
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor="group-members">
                          {t("dialog.members")}
                        </FieldLabel>
                        <UserPicker
                          id="group-members"
                          value={field.value}
                          onChange={field.onChange}
                          organizationId={organizationId}
                          canSearchDirectory
                          lookup={findGroupCandidates}
                          disabled={submitting}
                        />
                      </Field>
                    )}
                  />
                </>
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
              {submitting ? tCommon("states.saving") : t("dialog.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
