"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { FastAverageColor } from "fast-average-color"
import { Check, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { checkOrganizationSlug } from "@/features/organizations/actions/check-organization-slug"
import { createOrganization } from "@/features/organizations/actions/create-organization"
import { UserPicker } from "@/features/organizations/components/user-picker"
import {
  createOrganizationFormSchema,
  type CreateOrganizationFormValues,
} from "@/features/organizations/schemas/create-organization"
import type { PersonSelection } from "@/features/organizations/types"
import { createSlug } from "@/features/organizations/utils/create-slug"
import { normalizeThemeColor } from "@/features/organizations/utils/normalize-theme-color"
import { MediaInput } from "@/features/shared/components/media-input"
import { Button } from "@/features/shared/components/ui/button"
import {
  DialogBody,
  DialogClose,
  DialogFooter,
} from "@/features/shared/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/features/shared/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/features/shared/components/ui/popover"
import { Spinner } from "@/features/shared/components/ui/spinner"
import {
  cleanupMedia,
  uploadMedia,
  type UploadedMedia,
} from "@/features/shared/lib/media-upload"
import { isMediaAllowed } from "@/features/shared/lib/storage/media"

async function isOrganizationSlugAvailable(slug: string) {
  const result = await checkOrganizationSlug(slug)
  if (!result.success) throw new Error(result.error)
  return result.data
}

interface CreateOrganizationFormProps {
  onCreated: () => void
}

export function CreateOrganizationForm({
  onCreated,
}: CreateOrganizationFormProps) {
  const t = useTranslations("organizations")
  const tCommon = useTranslations("common")
  const schema = useMemo(() => createOrganizationFormSchema(t), [t])
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const slugManuallyEdited = useRef(false)
  const colorRequest = useRef(0)
  const colorInput = useRef<HTMLInputElement>(null)
  const [suggestedColor, setSuggestedColor] = useState<string>()
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false)
  const [owners, setOwners] = useState<PersonSelection[]>([])
  const [isCheckingSlug, setIsCheckingSlug] = useState(false)
  const [showCheckingSlug, setShowCheckingSlug] = useState(false)
  const [slugAvailability, setSlugAvailability] = useState<
    "available" | "taken"
  >()
  const form = useForm<CreateOrganizationFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      slug: "",
      ownerIds: [],
      logo: undefined,
      backgroundImage: undefined,
      favicon: undefined,
      color: "",
    },
  })
  const [organizationName, organizationSlug] = useWatch({
    control: form.control,
    name: ["name", "slug"],
  })

  // A new slug invalidates the last answer at once, during render, rather than
  // a render later from the effect that starts the next check.
  const [checkedSlug, setCheckedSlug] = useState(organizationSlug)
  if (checkedSlug !== organizationSlug) {
    setCheckedSlug(organizationSlug)
    setSlugAvailability(undefined)
    setShowCheckingSlug(false)
    const parsedSlug = schema.shape.slug.safeParse(organizationSlug)
    if (!parsedSlug.success) setIsCheckingSlug(false)
  }

  useEffect(() => {
    const parsedSlug = schema.shape.slug.safeParse(organizationSlug)
    if (!parsedSlug.success) return

    const controller = new AbortController()
    let checkingIndicatorTimeout: number | undefined
    const timeout = window.setTimeout(async () => {
      setIsCheckingSlug(true)
      checkingIndicatorTimeout = window.setTimeout(
        () => setShowCheckingSlug(true),
        150
      )
      try {
        const available = await isOrganizationSlugAvailable(parsedSlug.data)
        if (controller.signal.aborted) return
        setSlugAvailability(available ? "available" : "taken")
      } catch {
        // Advisory only: an unreachable check just leaves the indicator idle,
        // submission still performs the real check below.
        if (!controller.signal.aborted) setSlugAvailability(undefined)
      } finally {
        window.clearTimeout(checkingIndicatorTimeout)
        if (!controller.signal.aborted) {
          setIsCheckingSlug(false)
          setShowCheckingSlug(false)
        }
      }
    }, 400)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
      window.clearTimeout(checkingIndicatorTimeout)
    }
  }, [schema, organizationSlug])

  async function extractThemeColor(logo: File | undefined) {
    if (!logo) {
      colorRequest.current += 1
      setSuggestedColor(undefined)
      setColorPopoverOpen(false)
      return
    }

    const request = ++colorRequest.current
    const averageColor = new FastAverageColor()
    const objectUrl = URL.createObjectURL(logo)
    setSuggestedColor(undefined)
    setColorPopoverOpen(false)

    try {
      const result = await averageColor.getColorAsync(objectUrl, {
        algorithm: "dominant",
        ignoredColor: [
          [0, 0, 0, 0],
          [0, 0, 0, 255, 48],
          [64, 64, 64, 255, 24],
          [128, 128, 128, 255, 24],
          [192, 192, 192, 255, 24],
          [255, 255, 255, 255, 48],
        ],
      })
      if (request === colorRequest.current) {
        const extractedColor = normalizeThemeColor(result.hex)
        // Re-adding a logo whose colour is already in use has nothing to
        // suggest, and an empty popover is worse than none.
        const suggests =
          Boolean(extractedColor) && extractedColor !== form.getValues("color")

        setSuggestedColor(suggests ? extractedColor : undefined)
        setColorPopoverOpen(suggests)
      }
    } catch {
      if (request === colorRequest.current) {
        setSuggestedColor(undefined)
        setColorPopoverOpen(false)
      }
    } finally {
      URL.revokeObjectURL(objectUrl)
      averageColor.destroy()
    }
  }

  async function onSubmit(data: CreateOrganizationFormValues) {
    const uploadedMedia: UploadedMedia[] = []

    try {
      setIsCheckingSlug(true)
      const slugAvailable = await isOrganizationSlugAvailable(data.slug)
      setIsCheckingSlug(false)
      if (!slugAvailable) {
        setSlugAvailability("taken")
        form.setError(
          "slug",
          { type: "validate", message: t("create.slugTaken") },
          { shouldFocus: true }
        )
        return
      }

      const uploadResults = await Promise.allSettled([
        data.logo ? uploadMedia(data.logo, "logo") : undefined,
        data.backgroundImage
          ? uploadMedia(data.backgroundImage, "background")
          : undefined,
        data.favicon ? uploadMedia(data.favicon, "favicon") : undefined,
      ])
      const [logoResult, backgroundImageResult, faviconResult] = uploadResults
      const logo =
        logoResult.status === "fulfilled" ? logoResult.value : undefined
      const backgroundImage =
        backgroundImageResult.status === "fulfilled"
          ? backgroundImageResult.value
          : undefined
      const favicon =
        faviconResult.status === "fulfilled" ? faviconResult.value : undefined
      if (logo) uploadedMedia.push(logo)
      if (backgroundImage) uploadedMedia.push(backgroundImage)
      if (favicon) uploadedMedia.push(favicon)

      const failedUpload = uploadResults.find(
        (result) => result.status === "rejected"
      )
      if (failedUpload?.status === "rejected") throw failedUpload.reason

      const result = await createOrganization({
        name: data.name,
        slug: data.slug,
        ownerIds: data.ownerIds,
        logo,
        color: normalizeThemeColor(data.color),
        backgroundImage,
        favicon,
      })

      if (!result.success) {
        await cleanupMedia(uploadedMedia)
        form.setError("root", {
          message: result.error,
        })
        return
      }

      uploadedMedia.length = 0
      onCreated()

      // Handing an organization to someone else leaves no membership to enter
      // it with, so only its owner is taken there.
      if (result.isMember) {
        router.push(`/org/${result.slug}`)
        return
      }

      toast.success(
        owners.length === 1 && owners[0].kind === "user"
          ? t("create.handedToOwner", {
              name: data.name,
              owner: owners[0].name,
            })
          : t("create.handedToOwners", { name: data.name })
      )
    } catch (error) {
      await cleanupMedia(uploadedMedia)
      form.setError("root", {
        message:
          error instanceof Error ? error.message : t("branding.uploadFailed"),
      })
    }
  }

  return (
    <form
      id="create-organization-form"
      className="flex min-h-0 flex-col gap-5"
      aria-busy={form.formState.isSubmitting}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <DialogBody>
        <FieldGroup>
          <div className="grid items-start gap-5 sm:grid-cols-2">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel
                    className="gap-0"
                    htmlFor="create-organization-name"
                  >
                    {t("branding.name")}{" "}
                    <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="create-organization-name"
                    autoComplete="organization"
                    placeholder={t("create.namePlaceholder")}
                    onChange={(event) => {
                      field.onChange(event)
                      if (!slugManuallyEdited.current) {
                        form.setValue("slug", createSlug(event.target.value), {
                          shouldValidate: form.formState.isSubmitted,
                        })
                      }
                    }}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="slug"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel
                    className="gap-0"
                    htmlFor="create-organization-slug"
                  >
                    {t("create.slug")}{" "}
                    <span className="text-destructive">*</span>
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon className="self-stretch rounded-l-md border-r bg-muted px-2">
                      <InputGroupText>/org/</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      {...field}
                      id="create-organization-slug"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={t("create.slugPlaceholder")}
                      onChange={(event) => {
                        slugManuallyEdited.current = true
                        field.onChange(event)
                      }}
                      aria-invalid={fieldState.invalid}
                    />
                    <InputGroupAddon
                      align="inline-end"
                      className="w-6 shrink-0 p-0"
                      aria-live="polite"
                    >
                      {showCheckingSlug && !fieldState.invalid ? (
                        <Spinner
                          className="size-3.5"
                          aria-label={t("slugAvailability.checking")}
                        />
                      ) : slugAvailability === "available" &&
                        !isCheckingSlug &&
                        !fieldState.invalid ? (
                        <>
                          <Check
                            className="size-4 text-emerald-600 dark:text-emerald-400"
                            aria-hidden="true"
                          />
                          <span className="sr-only">
                            {t("slugAvailability.available")}
                          </span>
                        </>
                      ) : slugAvailability === "taken" &&
                        !isCheckingSlug &&
                        !fieldState.invalid ? (
                        <>
                          <X
                            className="size-4 text-destructive"
                            aria-hidden="true"
                          />
                          <span className="sr-only">
                            {t("slugAvailability.taken")}
                          </span>
                        </>
                      ) : null}
                    </InputGroupAddon>
                  </InputGroup>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>
          <Controller
            name="ownerIds"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel
                  className="gap-0"
                  htmlFor="create-organization-owners"
                >
                  {t("create.owners")}{" "}
                  <span className="text-destructive">*</span>
                </FieldLabel>
                <UserPicker
                  id="create-organization-owners"
                  value={owners}
                  canSearchDirectory
                  disabled={form.formState.isSubmitting}
                  invalid={fieldState.invalid}
                  onChange={(nextOwners) => {
                    setOwners(nextOwners)
                    field.onChange(
                      nextOwners.flatMap((person) =>
                        person.kind === "user" ? [person.id] : []
                      )
                    )
                  }}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="logo"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="create-organization-logo">
                  {t("branding.logo")}
                </FieldLabel>
                <MediaInput
                  inputRef={field.ref}
                  name={field.name}
                  id="create-organization-logo"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  hint={t("branding.logoHint")}
                  file={field.value}
                  fallbackName={organizationName || undefined}
                  disabled={form.formState.isSubmitting}
                  invalid={fieldState.invalid}
                  error={fieldState.error?.message}
                  onBlur={field.onBlur}
                  onChange={(file) => {
                    form.setValue("logo", file, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true,
                    })
                    void extractThemeColor(
                      file && isMediaAllowed("logo", file) ? file : undefined
                    )
                  }}
                />
              </Field>
            )}
          />
          <Controller
            name="backgroundImage"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="create-organization-background-image">
                  {t("branding.backgroundImage")}
                </FieldLabel>
                <MediaInput
                  inputRef={field.ref}
                  name={field.name}
                  id="create-organization-background-image"
                  accept="image/jpeg,image/png,image/webp"
                  hint={t("branding.backgroundImageHint")}
                  file={field.value}
                  previewFit="cover"
                  disabled={form.formState.isSubmitting}
                  invalid={fieldState.invalid}
                  error={fieldState.error?.message}
                  onBlur={field.onBlur}
                  onChange={(file) =>
                    form.setValue("backgroundImage", file, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true,
                    })
                  }
                />
              </Field>
            )}
          />
          <Controller
            name="favicon"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="create-organization-favicon">
                  {t("branding.favicon")}
                </FieldLabel>
                <MediaInput
                  inputRef={field.ref}
                  name={field.name}
                  id="create-organization-favicon"
                  accept="image/x-icon,image/png,image/svg+xml"
                  hint={t("branding.faviconHint")}
                  file={field.value}
                  disabled={form.formState.isSubmitting}
                  invalid={fieldState.invalid}
                  error={fieldState.error?.message}
                  onBlur={field.onBlur}
                  onChange={(file) =>
                    form.setValue("favicon", file, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true,
                    })
                  }
                />
              </Field>
            )}
          />
          <Controller
            name="color"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="create-organization-color">
                  {t("branding.themeColor")}
                </FieldLabel>
                <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2">
                  <Popover
                    open={
                      colorPopoverOpen &&
                      Boolean(suggestedColor) &&
                      suggestedColor !== field.value
                    }
                    onOpenChange={(open) => {
                      if (!open) setColorPopoverOpen(false)
                    }}
                  >
                    <PopoverTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={t("branding.chooseThemeColor")}
                          onClick={() => colorInput.current?.click()}
                          className="shrink-0 overflow-hidden p-0"
                        />
                      }
                    >
                      <span
                        className="size-full"
                        style={{
                          backgroundColor:
                            field.value ||
                            (resolvedTheme === "dark" ? "#ffffff" : "#000000"),
                        }}
                      />
                    </PopoverTrigger>
                    <input
                      ref={colorInput}
                      type="color"
                      tabIndex={-1}
                      className="sr-only"
                      value={
                        field.value ||
                        (resolvedTheme === "dark" ? "#ffffff" : "#000000")
                      }
                      onChange={(event) =>
                        field.onChange(normalizeThemeColor(event.target.value))
                      }
                    />
                    <PopoverContent className="w-52" align="start" side="top">
                      {suggestedColor && suggestedColor !== field.value && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="size-8 rounded-md border"
                              style={{ backgroundColor: suggestedColor }}
                            />
                            <div>
                              <p className="text-sm font-medium">
                                {t("branding.suggestedColor")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {suggestedColor}
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSuggestedColor(undefined)
                                setColorPopoverOpen(false)
                              }}
                            >
                              {t("branding.dismiss")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                field.onChange(suggestedColor)
                                setSuggestedColor(undefined)
                                setColorPopoverOpen(false)
                              }}
                            >
                              <Check />
                              {t("branding.useColor")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  <div className="flex min-w-0 gap-2">
                    <Input
                      {...field}
                      id="create-organization-color"
                      className="min-w-0 flex-1"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={
                        resolvedTheme === "dark" ? "#ffffff" : "#000000"
                      }
                      onBlur={(event) => {
                        field.onBlur()
                        field.onChange(normalizeThemeColor(event.target.value))
                      }}
                      aria-invalid={fieldState.invalid}
                    />
                    {field.value && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        title={t("branding.useDefaultTheme")}
                        aria-label={t("branding.useDefaultTheme")}
                        onClick={() => field.onChange("")}
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                </div>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
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
          render={<Button type="button" variant="outline" />}
          disabled={form.formState.isSubmitting}
        >
          {tCommon("actions.cancel")}
        </DialogClose>
        <Button
          type="submit"
          disabled={form.formState.isSubmitting || isCheckingSlug}
        >
          {form.formState.isSubmitting ? (
            <>
              <Spinner aria-hidden="true" />
              {t("create.creating")}
            </>
          ) : (
            t("create.submit")
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}
