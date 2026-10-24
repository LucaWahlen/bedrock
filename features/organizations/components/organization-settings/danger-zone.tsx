"use client"

import { Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { deleteOrganization } from "@/features/organizations/actions/delete-organization"
import { OrganizationActionDialog } from "@/features/organizations/components/organization-action-dialog"
import { SlugForm } from "@/features/organizations/components/organization-settings/slug-form"
import type {
  Organization,
  OrganizationSettingsCapabilities,
} from "@/features/organizations/types"
import { Button } from "@/features/shared/components/ui/button"

export function DangerZone({
  organization,
  capabilities,
}: {
  organization: Organization
  capabilities: OrganizationSettingsCapabilities
}) {
  const t = useTranslations("organizations.settings.dangerZone")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  function submitDeletion() {
    startTransition(async () => {
      const result = await deleteOrganization(organization.id)

      if (!result.success) {
        toast.error(result.error)
        return
      }

      // The organization is gone for this owner too, so there is no page here
      // left to refresh onto.
      router.replace("/")
    })
  }

  return (
    <section className="rounded-lg border border-destructive/30">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ul className="divide-y">
        {capabilities.canChangeSlug && <SlugForm organization={organization} />}
        {capabilities.canDeleteOrganization && (
          <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {t("deleteDescription")}
            </p>
            <Button
              type="button"
              variant="destructive"
              className="shrink-0 self-start sm:self-auto"
              onClick={() => setConfirming(true)}
            >
              <Trash2 />
              {tCommon("actions.delete")}
            </Button>
          </li>
        )}
      </ul>

      <OrganizationActionDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("deleteDialog.title")}
        description={t("deleteDialog.description", {
          organization: organization.name,
        })}
        confirmLabel={t("deleteDialog.confirm")}
        variant="destructive"
        confirmSlug={organization.slug}
        pending={isPending}
        onConfirm={submitDeletion}
      />
    </section>
  )
}
