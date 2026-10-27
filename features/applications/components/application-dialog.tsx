"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import {
  type Control,
  Controller,
  useFieldArray,
  useForm,
  useFormState,
  useWatch,
} from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { createApplication } from "@/features/applications/actions/create-application"
import { updateApplication } from "@/features/applications/actions/update-application"
import {
  APPLICATION_TOKEN_AUTH_METHODS,
  type ApplicationTokenAuthMethod,
  createLaunchUrlSchema,
  createRedirectUriSchema,
} from "@/features/applications/schemas/application"
import type { Application } from "@/features/applications/types"
import { MediaInput } from "@/features/shared/components/media-input"
import { Button } from "@/features/shared/components/ui/button"
import { Checkbox } from "@/features/shared/components/ui/checkbox"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/features/shared/components/ui/select"
import type { Translator } from "@/features/shared/lib/i18n/translator"
import {
  cleanupMedia,
  uploadMedia,
  type UploadedMedia,
} from "@/features/shared/lib/media-upload"
import { isMediaAllowed } from "@/features/shared/lib/storage/media"

const MAX_REDIRECT_URIS = 20

// One input per URI, checked by the same schema the server applies. They are
// matched exactly by the provider, so nothing here tidies a URI into a
// different one beyond trimming whitespace.
function createUriRowsSchema(t: Translator<"applications">) {
  return z
    .array(
      z.object({
        value: z
          .string()
          .trim()
          .min(1, t("validation.redirectUriRequired"))
          .pipe(createRedirectUriSchema(t)),
      })
    )
    .max(
      MAX_REDIRECT_URIS,
      t("validation.redirectUrisTooMany", { max: MAX_REDIRECT_URIS })
    )
    .superRefine((rows, context) => {
      const seen = new Set<string>()
      rows.forEach((row, index) => {
        const value = row.value.trim()
        if (value && seen.has(value)) {
          context.addIssue({
            code: "custom",
            path: [index, "value"],
            message: t("validation.redirectUriDuplicate"),
          })
        }
        seen.add(value)
      })
    })
}

function createFormSchema(t: Translator<"applications">) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("validation.nameRequired"))
      .max(100, t("validation.tooLong", { max: 100 })),
    redirectUris: createUriRowsSchema(t).refine((rows) => rows.length > 0, {
      message: t("validation.redirectUrisRequired"),
    }),
    postLogoutRedirectUris: createUriRowsSchema(t),
    uri: z
      .string()
      .trim()
      .pipe(z.union([z.literal(""), createLaunchUrlSchema(t)])),
    isPublic: z.boolean(),
    tokenEndpointAuthMethod: z.enum(APPLICATION_TOKEN_AUTH_METHODS),
    skipConsent: z.boolean(),
    icon: z.custom<File>().optional(),
    iconCleared: z.boolean(),
  })
}

type FormValues = z.infer<ReturnType<typeof createFormSchema>>

type ApplicationDialogProps = {
  organizationId: string
  application?: Application
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (created: {
    clientId: string
    clientSecret: string | null
    name: string
    tokenEndpointAuthMethod: ApplicationTokenAuthMethod | null
  }) => void
}

export function ApplicationDialog({
  organizationId,
  application,
  open,
  onOpenChange,
  onCreated,
}: ApplicationDialogProps) {
  const t = useTranslations("applications")
  const tCommon = useTranslations("common")
  const formSchema = useMemo(() => createFormSchema(t), [t])
  const editing = application !== undefined
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: application?.name ?? "",
      redirectUris: application?.redirectUris.map((value) => ({ value })) ?? [
        { value: "" },
      ],
      postLogoutRedirectUris:
        application?.postLogoutRedirectUris.map((value) => ({ value })) ?? [],
      uri: application?.uri ?? "",
      isPublic: application ? !application.isConfidential : false,
      tokenEndpointAuthMethod:
        application?.tokenEndpointAuthMethod ?? "client_secret_basic",
      skipConsent: application?.skipConsent ?? false,
      icon: undefined,
      iconCleared: false,
    },
  })
  const [iconCleared, name, isPublic] = useWatch({
    control: form.control,
    name: ["iconCleared", "name", "isPublic"],
  })

  async function onSubmit(values: FormValues) {
    setSubmitting(true)

    const redirectUris = values.redirectUris.map((row) => row.value)
    const postLogoutRedirectUris = values.postLogoutRedirectUris.map(
      (row) => row.value
    )

    let uploaded: UploadedMedia | undefined

    try {
      if (values.icon) {
        if (!isMediaAllowed("logo", values.icon)) {
          throw new Error(t("validation.iconInvalid"))
        }
        uploaded = await uploadMedia(values.icon, "logo")
      }

      // Absent leaves the stored icon alone, which is why this is undefined
      // rather than null unless it was explicitly cleared.
      const icon = uploaded
        ? { key: uploaded.key }
        : values.iconCleared
          ? null
          : undefined

      const shared = {
        organizationId,
        name: values.name,
        redirectUris,
        postLogoutRedirectUris,
        uri: values.uri || null,
        skipConsent: values.skipConsent,
        tokenEndpointAuthMethod: values.tokenEndpointAuthMethod,
        icon,
      }

      if (editing) {
        const result = await updateApplication({
          ...shared,
          clientId: application.clientId,
        })

        if (!result.success) {
          if (uploaded) await cleanupMedia([uploaded])
          form.setError("root", { message: result.error })
          return
        }

        onOpenChange(false)
        form.reset()
        toast.success(t("applicationDialog.updated", { name: values.name }))
        return
      }

      const result = await createApplication({
        ...shared,
        isPublic: values.isPublic,
      })

      if (!result.success) {
        if (uploaded) await cleanupMedia([uploaded])
        form.setError("root", { message: result.error })
        return
      }

      onOpenChange(false)
      form.reset()
      onCreated({
        clientId: result.clientId,
        clientSecret: result.clientSecret,
        name: values.name,
        tokenEndpointAuthMethod: values.isPublic
          ? null
          : values.tokenEndpointAuthMethod,
      })
    } catch (error) {
      if (uploaded) await cleanupMedia([uploaded])
      form.setError("root", {
        message:
          error instanceof Error
            ? error.message
            : t("applicationDialog.iconUploadFailed"),
      })
    } finally {
      setSubmitting(false)
    }
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
                ? t("applicationDialog.editTitle")
                : t("applicationDialog.createTitle")}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? t("applicationDialog.editDescription")
                : t("applicationDialog.createDescription")}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <FieldGroup>
              <Controller
                name="name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="application-name">
                      {t("applicationDialog.name")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="application-name"
                      placeholder={t("applicationDialog.namePlaceholder")}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <UriListField
                control={form.control}
                name="redirectUris"
                idPrefix="application-redirect-uri"
                label={t("applicationDialog.redirectUris")}
                hint={t("applicationDialog.redirectUrisHint")}
                placeholder="https://app.example.com/callback"
                rowLabel={(index) =>
                  t("applicationDialog.redirectUri", { index })
                }
                removeLabel={(index) =>
                  t("applicationDialog.removeRedirectUri", { index })
                }
                addLabel={t("applicationDialog.addRedirectUri")}
                minRows={1}
              />

              <UriListField
                control={form.control}
                name="postLogoutRedirectUris"
                idPrefix="application-post-logout-redirect-uri"
                label={t("applicationDialog.postLogoutRedirectUris")}
                hint={t("applicationDialog.postLogoutRedirectUrisHint")}
                placeholder="https://app.example.com/"
                rowLabel={(index) =>
                  t("applicationDialog.postLogoutRedirectUri", { index })
                }
                removeLabel={(index) =>
                  t("applicationDialog.removePostLogoutRedirectUri", { index })
                }
                addLabel={t("applicationDialog.addPostLogoutRedirectUri")}
                minRows={0}
              />

              <Controller
                name="icon"
                control={form.control}
                render={({ field, fieldState }) => (
                  <MediaInput
                    id="application-icon"
                    name={field.name}
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    hint={t("applicationDialog.iconHint")}
                    file={field.value}
                    currentUrl={application?.icon}
                    cleared={iconCleared}
                    fallbackName={name}
                    fallbackSeed={application?.clientId ?? null}
                    invalid={fieldState.invalid}
                    error={fieldState.error?.message}
                    onBlur={field.onBlur}
                    onChange={(file) => {
                      field.onChange(file)
                      if (file) form.setValue("iconCleared", false)
                    }}
                    onClear={() => {
                      field.onChange(undefined)
                      form.setValue("iconCleared", true, { shouldDirty: true })
                    }}
                    onRestore={() => form.setValue("iconCleared", false)}
                  />
                )}
              />

              <Controller
                name="uri"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="application-uri">
                      {t("applicationDialog.launchUrl")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="application-uri"
                      type="url"
                      inputMode="url"
                      spellCheck={false}
                      autoCapitalize="none"
                      placeholder="https://app.example.com"
                      aria-invalid={fieldState.invalid}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("applicationDialog.launchUrlHint")}
                    </p>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              {!editing && (
                <Controller
                  name="isPublic"
                  control={form.control}
                  render={({ field }) => (
                    <Field orientation="horizontal">
                      <Checkbox
                        id="application-public"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <FieldLabel htmlFor="application-public">
                        {t("applicationDialog.isPublic")}
                      </FieldLabel>
                    </Field>
                  )}
                />
              )}

              {/* A public client authenticates with nothing, so the method only
                  exists for confidential ones. */}
              {(editing ? application?.isConfidential : !isPublic) && (
                <Controller
                  name="tokenEndpointAuthMethod"
                  control={form.control}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="application-auth-method">
                        {t("applicationDialog.tokenEndpointAuthMethod")}
                      </FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        items={APPLICATION_TOKEN_AUTH_METHODS.map((method) => ({
                          value: method,
                          label: t(`applicationDialog.authMethods.${method}`),
                        }))}
                      >
                        <SelectTrigger id="application-auth-method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APPLICATION_TOKEN_AUTH_METHODS.map((method) => (
                            <SelectItem key={method} value={method}>
                              {t(`applicationDialog.authMethods.${method}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t("applicationDialog.tokenEndpointAuthMethodHint")}
                      </p>
                    </Field>
                  )}
                />
              )}

              <Controller
                name="skipConsent"
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Checkbox
                      id="application-skip-consent"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <FieldLabel htmlFor="application-skip-consent">
                      {t("applicationDialog.skipConsent")}
                    </FieldLabel>
                  </Field>
                )}
              />

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
              {submitting
                ? tCommon("states.saving")
                : editing
                  ? t("applicationDialog.saveChanges")
                  : t("applicationDialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type UriListFieldProps = {
  control: Control<FormValues>
  name: "redirectUris" | "postLogoutRedirectUris"
  idPrefix: string
  label: string
  hint: string
  placeholder: string
  rowLabel: (index: number) => string
  removeLabel: (index: number) => string
  addLabel: string
  // Below this the last row cannot be removed.
  minRows: number
}

function UriListField({
  control,
  name,
  idPrefix,
  label,
  hint,
  placeholder,
  rowLabel,
  removeLabel,
  addLabel,
  minRows,
}: UriListFieldProps) {
  const rows = useFieldArray({ control, name })
  const { errors } = useFormState({ control, name })
  const listError = errors[name]?.root ?? errors[name]

  return (
    <Field data-invalid={Boolean(listError?.message)}>
      <FieldLabel htmlFor={rows.fields.length ? `${idPrefix}-0` : undefined}>
        {label}
      </FieldLabel>
      <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>
      {rows.fields.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.fields.map((row, index) => (
            <li key={row.id}>
              <Controller
                name={`${name}.${index}.value`}
                control={control}
                render={({ field, fieldState }) => (
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-2">
                      <Input
                        {...field}
                        id={`${idPrefix}-${index}`}
                        type="url"
                        inputMode="url"
                        spellCheck={false}
                        autoCapitalize="none"
                        autoComplete="off"
                        className="font-mono text-xs"
                        placeholder={placeholder}
                        aria-label={rowLabel(index + 1)}
                        aria-invalid={fieldState.invalid}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return
                          event.preventDefault()
                          if (rows.fields.length < MAX_REDIRECT_URIS) {
                            rows.insert(index + 1, { value: "" })
                          }
                        }}
                        onPaste={(event) => {
                          // Several URIs pasted at once become rows.
                          const pasted = event.clipboardData
                            .getData("text")
                            .split(/[\s,]+/)
                            .filter(Boolean)
                          if (pasted.length < 2) return
                          event.preventDefault()
                          const room =
                            MAX_REDIRECT_URIS - rows.fields.length + 1
                          const [first, ...rest] = pasted.slice(0, room)
                          field.onChange(first)
                          rows.insert(
                            index + 1,
                            rest.map((value) => ({ value }))
                          )
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={removeLabel(index + 1)}
                        disabled={rows.fields.length <= minRows}
                        onClick={() => rows.remove(index)}
                      >
                        <X />
                      </Button>
                    </div>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </div>
                )}
              />
            </li>
          ))}
        </ul>
      )}
      {rows.fields.length < MAX_REDIRECT_URIS && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => rows.append({ value: "" })}
        >
          <Plus />
          {addLabel}
        </Button>
      )}
      <FieldError
        errors={[
          listError?.message ? { message: listError.message } : undefined,
        ]}
      />
    </Field>
  )
}
