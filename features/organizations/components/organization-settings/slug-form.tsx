"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Check, Link2, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { checkOrganizationSlug } from "@/features/organizations/actions/check-organization-slug"
import { updateOrganization } from "@/features/organizations/actions/update-organization"
import {
  createOrganizationSlugFormSchema,
  type OrganizationSlugValues,
} from "@/features/organizations/schemas/update-organization"
import type { Organization } from "@/features/organizations/types"
import { Button } from "@/features/shared/components/ui/button"
import {
  Dialog,
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/features/shared/components/ui/input-group"
import { Spinner } from "@/features/shared/components/ui/spinner"

async function isOrganizationSlugAvailable(slug: string, id: string) {
  const result = await checkOrganizationSlug(slug, id)
  if (!result.success) throw new Error(result.error)
  return result.data
}

type SlugFormSchema = ReturnType<typeof createOrganizationSlugFormSchema>

// The slug worth asking about, if any: a valid one that is not the current one.
function slugToCheck(
  schema: SlugFormSchema,
  slug: string,
  currentSlug: string
) {
  const parsed = schema.shape.slug.safeParse(slug)
  return parsed.success && parsed.data !== currentSlug ? parsed.data : null
}

export function SlugForm({ organization }: { organization: Organization }) {
  const t = useTranslations("organizations")
  const tCommon = useTranslations("common")
  const schema = useMemo(() => createOrganizationSlugFormSchema(t), [t])
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isCheckingSlug, setIsCheckingSlug] = useState(false)
  const [showCheckingSlug, setShowCheckingSlug] = useState(false)
  const [availability, setAvailability] = useState<"available" | "taken">()

  const form = useForm<OrganizationSlugValues>({
    resolver: zodResolver(schema),
    defaultValues: { slug: organization.slug },
  })
  const slug = useWatch({ control: form.control, name: "slug" })
  const changed = slug !== organization.slug

  // A new slug invalidates the last answer at once, during render, rather than
  // a render later from the effect that starts the next check.
  const checkKey = `${organization.id}:${organization.slug}:${slug}`
  const [checkedKey, setCheckedKey] = useState(checkKey)
  if (checkedKey !== checkKey) {
    setCheckedKey(checkKey)
    setAvailability(undefined)
    setShowCheckingSlug(false)
    if (slugToCheck(schema, slug, organization.slug) === null) {
      setIsCheckingSlug(false)
    }
  }

  useEffect(() => {
    const candidate = slugToCheck(schema, slug, organization.slug)
    if (candidate === null) return

    const controller = new AbortController()
    let checkingIndicatorTimeout: number | undefined
    const timeout = window.setTimeout(async () => {
      setIsCheckingSlug(true)
      checkingIndicatorTimeout = window.setTimeout(
        () => setShowCheckingSlug(true),
        150
      )
      try {
        const available = await isOrganizationSlugAvailable(
          candidate,
          organization.id
        )
        if (controller.signal.aborted) return
        setAvailability(available ? "available" : "taken")
      } catch {
        // Advisory only: an unreachable check just leaves the indicator idle,
        // saving still performs the real check below.
        if (!controller.signal.aborted) setAvailability(undefined)
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
  }, [schema, organization.id, organization.slug, slug])

  async function onSubmit(data: OrganizationSlugValues) {
    try {
      setIsCheckingSlug(true)
      const available = await isOrganizationSlugAvailable(
        data.slug,
        organization.id
      )
      setIsCheckingSlug(false)

      if (!available) {
        setAvailability("taken")
        form.setError(
          "slug",
          { type: "validate", message: t("settings.slug.taken") },
          { shouldFocus: true }
        )
        return
      }

      const result = await updateOrganization({
        organizationId: organization.id,
        slug: data.slug,
      })

      if (!result.success) {
        form.setError("slug", { message: result.error })
        return
      }

      setOpen(false)
      toast.success(
        t("settings.slug.changed", {
          organization: organization.name,
          path: `/org/${result.slug}`,
        })
      )
      router.replace(`/org/${result.slug}/settings`)
    } catch (error) {
      form.setError("slug", {
        message:
          error instanceof Error
            ? error.message
            : t("settings.slug.changeFailed"),
      })
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {t("settings.slug.description")}
      </p>
      <Button
        type="button"
        variant="destructive"
        className="shrink-0 self-start sm:self-auto"
        onClick={() => {
          form.reset({ slug: organization.slug })
          setOpen(true)
        }}
      >
        <Link2 />
        {t("settings.slug.change")}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false)
        }}
      >
        <DialogContent>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{t("settings.slug.dialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("settings.slug.dialogDescription", {
                  organization: organization.name,
                  path: `/org/${organization.slug}`,
                })}
              </DialogDescription>
            </DialogHeader>
            <Controller
              name="slug"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="my-4">
                  <FieldLabel htmlFor="organization-slug">
                    {t("settings.slug.newSlug")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon className="self-stretch rounded-l-md border-r bg-muted px-2">
                      <InputGroupText>/org/</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      {...field}
                      id="organization-slug"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
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
                      ) : availability === "available" &&
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
                      ) : availability === "taken" &&
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
            <DialogFooter>
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="outline"
                    disabled={form.formState.isSubmitting}
                  />
                }
              >
                {tCommon("actions.cancel")}
              </DialogClose>
              <Button
                type="submit"
                variant="destructive"
                disabled={
                  !changed ||
                  availability === "taken" ||
                  form.formState.isSubmitting
                }
              >
                {form.formState.isSubmitting
                  ? tCommon("states.saving")
                  : t("settings.slug.change")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  )
}
