"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { updateProfile } from "@/features/account/actions/update-profile"
import {
  AccountForm,
  AccountSectionHeading,
} from "@/features/account/components/account-dialog/account-form"
import { createProfileFormSchema } from "@/features/account/schemas/account"
import type {
  AccountProfile,
  ProfileFormValues,
  UpdateProfileInput,
} from "@/features/account/types"
import { MediaInput } from "@/features/shared/components/media-input"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"
import {
  cleanupMedia,
  uploadMedia,
  type UploadedMedia,
} from "@/features/shared/lib/media-upload"

export function ProfileSection({
  profile,
  onSaved,
}: {
  profile: AccountProfile
  onSaved: () => void
}) {
  const t = useTranslations("account")
  const schema = useMemo(() => createProfileFormSchema(t), [t])
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: profile.name, avatar: { action: "keep" } },
  })
  const name = useWatch({ control: form.control, name: "name" })

  async function onSubmit(data: ProfileFormValues) {
    const uploaded: UploadedMedia[] = []

    try {
      let avatar: UpdateProfileInput["avatar"] = { action: "keep" }
      if (data.avatar.action === "remove") avatar = { action: "remove" }
      if (data.avatar.action === "replace") {
        const media = await uploadMedia(data.avatar.file, "avatar")
        uploaded.push(media)
        avatar = { action: "replace", key: media.key }
      }

      const result = await updateProfile({ name: data.name, avatar })
      if (!result.success) {
        await cleanupMedia(uploaded)
        form.setError("root", { message: result.error })
        return
      }

      form.reset({ name: data.name.trim(), avatar: { action: "keep" } })
      toast.success(t("profile.saved"))
      onSaved()
    } catch (error) {
      await cleanupMedia(uploaded)
      form.setError("root", {
        message:
          error instanceof Error ? error.message : t("profile.uploadFailed"),
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AccountSectionHeading
        title={t("profile.title")}
        description={t("profile.description")}
      />
      <AccountForm
        id="account-profile-form"
        form={form}
        onSubmit={onSubmit}
        submitLabel={t("profile.submit")}
      >
        <FieldGroup>
          <Controller
            name="avatar"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="account-avatar">
                  {t("profile.picture")}
                </FieldLabel>
                <MediaInput
                  inputRef={field.ref}
                  name={field.name}
                  id="account-avatar"
                  accept="image/jpeg,image/png,image/webp"
                  hint={t("profile.pictureHint")}
                  file={
                    field.value.action === "replace"
                      ? field.value.file
                      : undefined
                  }
                  currentUrl={profile.image}
                  cleared={field.value.action === "remove"}
                  fallbackName={name || profile.name}
                  fallbackSeed={profile.id}
                  previewFit="cover"
                  invalid={fieldState.invalid}
                  error={fieldState.error?.message}
                  onBlur={field.onBlur}
                  onChange={(file) =>
                    field.onChange(
                      file ? { action: "replace", file } : { action: "keep" }
                    )
                  }
                  onClear={() => field.onChange({ action: "remove" })}
                  onRestore={() => field.onChange({ action: "keep" })}
                />
              </Field>
            )}
          />
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="account-name">
                  {t("fields.name")}
                </FieldLabel>
                <Input
                  {...field}
                  id="account-name"
                  autoComplete="name"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid ? "account-name-error" : undefined
                  }
                />
                {fieldState.invalid && (
                  <FieldError
                    id="account-name-error"
                    errors={[fieldState.error]}
                  />
                )}
              </Field>
            )}
          />
        </FieldGroup>
      </AccountForm>
    </div>
  )
}
