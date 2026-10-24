"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Check, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState, useSyncExternalStore } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { updateOrganization } from "@/features/organizations/actions/update-organization"
import { SettingsBlock } from "@/features/organizations/components/organization-settings/settings-block"
import {
  createOrganizationProfileSchema,
  type OrganizationProfileValues,
} from "@/features/organizations/schemas/update-organization"
import type { MediaUpdate, Organization } from "@/features/organizations/types"
import { extractThemeColor } from "@/features/organizations/utils/extract-theme-color"
import { normalizeThemeColor } from "@/features/organizations/utils/normalize-theme-color"
import { MediaInput } from "@/features/shared/components/media-input"
import { Button } from "@/features/shared/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/features/shared/components/ui/popover"
import {
  cleanupMedia,
  uploadMedia,
  type UploadedMedia,
} from "@/features/shared/lib/media-upload"
import {
  isMediaAllowed,
  type MediaKind,
} from "@/features/shared/lib/storage/media"

type MediaField = "logo" | "backgroundImage" | "favicon"

const MEDIA_KINDS: Record<MediaField, MediaKind> = {
  logo: "logo",
  backgroundImage: "background",
  favicon: "favicon",
}

// Nothing to subscribe to: the snapshot only tells the server render apart
// from the client's.
function subscribeToNothing() {
  return () => {}
}

export function ProfileForm({
  organization,
  disabled,
}: {
  organization: Organization
  disabled: boolean
}) {
  const t = useTranslations("organizations")
  const schema = useMemo(() => createOrganizationProfileSchema(t), [t])
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const colorRequest = useRef(0)
  const colorInput = useRef<HTMLInputElement>(null)
  const [suggestedColor, setSuggestedColor] = useState<string>()
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false)
  // This page renders on first load, when next-themes has not resolved yet, so
  // the empty swatch has to be re-read once the client is up.
  const isMounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  )
  const emptyColor =
    isMounted && resolvedTheme === "dark" ? "#ffffff" : "#000000"
  const form = useForm<OrganizationProfileValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: organization.name,
      color: organization.color ?? "",
      logo: { action: "keep" },
      backgroundImage: { action: "keep" },
      favicon: { action: "keep" },
    },
  })
  const organizationName = useWatch({ control: form.control, name: "name" })

  async function suggestColorFrom(logo: File | undefined) {
    if (!logo) {
      colorRequest.current += 1
      setSuggestedColor(undefined)
      setColorPopoverOpen(false)
      return
    }

    const request = ++colorRequest.current
    setSuggestedColor(undefined)
    setColorPopoverOpen(false)

    const extractedColor = await extractThemeColor(logo)
    if (request !== colorRequest.current) return

    // Re-adding a logo whose colour is already in use has nothing to suggest,
    // and an empty popover is worse than none.
    const suggests =
      Boolean(extractedColor) && extractedColor !== form.getValues("color")

    setSuggestedColor(suggests ? extractedColor : undefined)
    setColorPopoverOpen(suggests)
  }

  async function onSubmit(data: OrganizationProfileValues) {
    const uploadedMedia: UploadedMedia[] = []

    try {
      const staged: Partial<Record<MediaField, MediaUpdate>> = {}

      for (const field of ["logo", "backgroundImage", "favicon"] as const) {
        const update = data[field]
        if (update.action === "keep") continue
        if (update.action === "remove") {
          staged[field] = { action: "remove" }
          continue
        }

        const uploaded = await uploadMedia(update.file, MEDIA_KINDS[field])
        uploadedMedia.push(uploaded)
        staged[field] = { action: "replace", key: uploaded.key }
      }

      const result = await updateOrganization({
        organizationId: organization.id,
        name: data.name,
        color: normalizeThemeColor(data.color),
        ...staged,
      })

      if (!result.success) {
        await cleanupMedia(uploadedMedia)
        form.setError("root", { message: result.error })
        return
      }

      uploadedMedia.length = 0
      form.reset({
        ...data,
        logo: { action: "keep" },
        backgroundImage: { action: "keep" },
        favicon: { action: "keep" },
      })
      toast.success(t("settings.profile.updated", { name: data.name }))
      router.refresh()
    } catch (error) {
      await cleanupMedia(uploadedMedia)
      form.setError("root", {
        message:
          error instanceof Error ? error.message : t("branding.uploadFailed"),
      })
    }
  }

  return (
    <SettingsBlock
      title={t("settings.profile.title")}
      description={t("settings.profile.description")}
      form={form}
      disabled={disabled}
      onSubmit={onSubmit}
    >
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="organization-name">
                {t("branding.name")}
              </FieldLabel>
              <Input
                {...field}
                id="organization-name"
                autoComplete="organization"
                disabled={disabled}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <MediaField
          control={form.control}
          name="logo"
          label={t("branding.logo")}
          accept="image/jpeg,image/png,image/webp,image/svg+xml"
          hint={t("branding.logoHint")}
          currentUrl={organization.logo}
          fallbackName={organizationName || undefined}
          fallbackSeed={organization.id}
          disabled={disabled}
          onFile={(file) =>
            void suggestColorFrom(
              file && isMediaAllowed("logo", file) ? file : undefined
            )
          }
        />
        <MediaField
          control={form.control}
          name="backgroundImage"
          label={t("branding.backgroundImage")}
          accept="image/jpeg,image/png,image/webp"
          hint={t("branding.backgroundImageHint")}
          currentUrl={organization.backgroundImage}
          previewFit="cover"
          disabled={disabled}
        />
        <MediaField
          control={form.control}
          name="favicon"
          label={t("branding.favicon")}
          accept="image/x-icon,image/png,image/svg+xml"
          hint={t("branding.faviconHint")}
          currentUrl={organization.favicon}
          disabled={disabled}
        />
        <Controller
          name="color"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="organization-color">
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
                        disabled={disabled}
                        aria-label={t("branding.chooseThemeColor")}
                        onClick={() => colorInput.current?.click()}
                        className="shrink-0 overflow-hidden p-0"
                      />
                    }
                  >
                    <span
                      className="size-full"
                      style={{ backgroundColor: field.value || emptyColor }}
                    />
                  </PopoverTrigger>
                  <input
                    ref={colorInput}
                    type="color"
                    tabIndex={-1}
                    className="sr-only"
                    value={field.value || emptyColor}
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
                    id="organization-color"
                    className="min-w-0 flex-1"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={emptyColor}
                    disabled={disabled}
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
                      disabled={disabled}
                      title={t("branding.useDefaultTheme")}
                      aria-label={t("branding.useDefaultTheme")}
                      onClick={() => field.onChange("")}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>
    </SettingsBlock>
  )
}

function MediaField({
  control,
  name,
  label,
  accept,
  hint,
  currentUrl,
  fallbackName,
  fallbackSeed,
  previewFit,
  disabled,
  onFile,
}: {
  control: ReturnType<typeof useForm<OrganizationProfileValues>>["control"]
  name: MediaField
  label: string
  accept: string
  hint: string
  currentUrl?: string | null
  fallbackName?: string
  fallbackSeed?: string | null
  previewFit?: "contain" | "cover"
  disabled?: boolean
  onFile?: (file?: File) => void
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const value = field.value
        const file = value.action === "replace" ? value.file : undefined

        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`organization-${name}`}>{label}</FieldLabel>
            <MediaInput
              inputRef={field.ref}
              name={field.name}
              id={`organization-${name}`}
              accept={accept}
              hint={hint}
              file={file}
              currentUrl={currentUrl}
              cleared={value.action === "remove"}
              fallbackName={fallbackName}
              fallbackSeed={fallbackSeed}
              previewFit={previewFit}
              disabled={disabled}
              invalid={fieldState.invalid}
              error={fieldState.error?.message}
              onBlur={field.onBlur}
              onChange={(nextFile) => {
                field.onChange(
                  nextFile
                    ? { action: "replace", file: nextFile }
                    : { action: "keep" }
                )
                onFile?.(nextFile)
              }}
              onClear={() => field.onChange({ action: "remove" })}
              onRestore={() => field.onChange({ action: "keep" })}
            />
          </Field>
        )
      }}
    />
  )
}
