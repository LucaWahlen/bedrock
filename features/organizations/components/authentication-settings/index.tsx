"use client"

import { ArrowRight, TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { updateOrganization } from "@/features/organizations/actions/update-organization"
import type {
  Organization,
  OrganizationAuthentication,
} from "@/features/organizations/types"
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
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import { Switch } from "@/features/shared/components/ui/switch"

type Policy = "allowPublicSignUp" | "requireTwoFactor"

export type AuthenticationSettingsData = Pick<
  OrganizationAuthentication,
  | "allowPublicSignUp"
  | "requireTwoFactor"
  | "memberCount"
  | "nonCompliantCount"
  | "viewerHasSecondFactor"
  | "capabilities"
>

// A tag renderer for `t.rich`, built outside the component so it is not a new
// component type on every render.
function strong(chunks: React.ReactNode) {
  return (
    <span className="font-medium text-foreground tabular-nums">{chunks}</span>
  )
}

function PolicyRow({
  id,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
  children,
}: {
  id: string
  title: string
  description: React.ReactNode
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-start justify-between gap-6">
        <div className="grid gap-1">
          <label htmlFor={id} className="text-sm font-medium">
            {title}
          </label>
          <p id={`${id}-description`} className="text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <Switch
          id={id}
          className="mt-0.5 shrink-0"
          checked={checked}
          disabled={disabled}
          aria-describedby={`${id}-description`}
          onCheckedChange={onCheckedChange}
        />
      </div>
      {children}
    </div>
  )
}

// One card, one row per policy. A switch is the decision, so it saves the
// moment it is flipped; only a change that locks people out asks first.
export function AuthenticationSettings({
  organization,
  authentication,
}: {
  organization: Pick<Organization, "id" | "name" | "slug">
  authentication: AuthenticationSettingsData
}) {
  const t = useTranslations("organizations.authentication")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [values, setValues] = useState({
    allowPublicSignUp: authentication.allowPublicSignUp,
    requireTwoFactor: authentication.requireTwoFactor,
  })
  const [saving, setSaving] = useState<Policy | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [, startTransition] = useTransition()
  const {
    capabilities,
    memberCount,
    nonCompliantCount,
    viewerHasSecondFactor,
  } = authentication
  const compliantCount = memberCount - nonCompliantCount
  // Turning it on would lock out the owner doing it, which the server refuses.
  const cannotEnable = !values.requireTwoFactor && !viewerHasSecondFactor

  async function save(policy: Policy, value: boolean) {
    const previous = values[policy]
    setValues((current) => ({ ...current, [policy]: value }))
    setSaving(policy)

    const result = await updateOrganization({
      organizationId: organization.id,
      [policy]: value,
    })
    setSaving(null)

    if (!result.success) {
      setValues((current) => ({ ...current, [policy]: previous }))
      toast.error(result.error)
      return
    }

    const name = { organization: organization.name }
    toast.success(
      policy === "allowPublicSignUp"
        ? value
          ? t("saved.signUpOpened", name)
          : t("saved.signUpClosed", name)
        : value
          ? t("saved.twoFactorRequired", name)
          : t("saved.twoFactorOptional", name)
    )
    startTransition(() => router.refresh())
  }

  function changeTwoFactor(checked: boolean) {
    // Everyone it would lock out is counted before it happens, not after.
    if (checked && nonCompliantCount > 0) {
      setConfirming(true)
      return
    }

    void save("requireTwoFactor", checked)
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        <section
          aria-labelledby="sign-in-policy-heading"
          className="divide-y rounded-lg border"
        >
          <div className="px-4 py-3">
            <h2 id="sign-in-policy-heading" className="text-sm font-semibold">
              {t("title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("description", { organization: organization.name })}
            </p>
          </div>

          <PolicyRow
            id="policy-public-sign-up"
            title={t("publicSignUp.title")}
            description={
              <>
                {t("publicSignUp.description", {
                  organization: organization.name,
                })}
                {!capabilities.canChangeSignUp &&
                  ` ${t("publicSignUp.ownersAndAdminsOnly")}`}
              </>
            }
            checked={values.allowPublicSignUp}
            disabled={
              !capabilities.canChangeSignUp || saving === "allowPublicSignUp"
            }
            onCheckedChange={(checked) =>
              void save("allowPublicSignUp", checked)
            }
          />

          <PolicyRow
            id="policy-require-two-factor"
            title={t("twoFactor.title")}
            description={
              <>
                {t("twoFactor.description", {
                  organization: organization.name,
                })}
                {!capabilities.canRequireTwoFactor &&
                  ` ${t("twoFactor.ownersOnly")}`}
                {capabilities.canRequireTwoFactor &&
                  cannotEnable &&
                  ` ${t("twoFactor.setUpYourOwnFirst")}`}
              </>
            }
            checked={values.requireTwoFactor}
            disabled={
              !capabilities.canRequireTwoFactor ||
              cannotEnable ||
              saving === "requireTwoFactor"
            }
            onCheckedChange={changeTwoFactor}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <div className="flex min-w-48 flex-1 items-center gap-3">
                <div
                  className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted"
                  aria-hidden="true"
                >
                  <div
                    className={
                      nonCompliantCount === 0
                        ? "h-full bg-emerald-500"
                        : "h-full bg-amber-500"
                    }
                    style={{
                      width: `${memberCount === 0 ? 100 : (compliantCount / memberCount) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-muted-foreground">
                  {t.rich("twoFactor.compliance", {
                    compliant: compliantCount,
                    total: memberCount,
                    strong,
                  })}
                </span>
              </div>
              <Link
                href={`/org/${organization.slug}/members`}
                className="inline-flex items-center gap-1 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {t("twoFactor.viewMembers")}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </PolicyRow>
        </section>
      </div>

      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (saving !== "requireTwoFactor") setConfirming(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTwoFactor.title")}</DialogTitle>
            <DialogDescription>
              {t("confirmTwoFactor.description", {
                count: nonCompliantCount,
                organization: organization.name,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("confirmTwoFactor.notice")}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {tCommon("actions.cancel")}
            </DialogClose>
            <Button
              onClick={() => {
                setConfirming(false)
                void save("requireTwoFactor", true)
              }}
            >
              {t("confirmTwoFactor.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}
