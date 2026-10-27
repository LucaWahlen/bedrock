"use client"

import { TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"

import { CopyableField } from "@/features/applications/components/copyable-field"
import { OidcEndpointFields } from "@/features/applications/components/oidc-endpoints"
import type { ClientAuthMethod } from "@/features/applications/schemas/application"
import type { OidcConfiguration } from "@/features/applications/types"
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
import { Separator } from "@/features/shared/components/ui/separator"

export type ApplicationConnection = {
  clientId: string
  name: string
  isConfidential: boolean
  tokenEndpointAuthMethod?: ClientAuthMethod | null
  // Only present straight after creation or rotation: the stored copy is a
  // hash, so reopening the dialog later cannot show it again.
  clientSecret?: string
}

type ConnectionDialogProps = {
  connection: ApplicationConnection | null
  configuration: OidcConfiguration
  onOpenChange: (open: boolean) => void
}

export function ConnectionDialog({
  connection,
  configuration,
  onOpenChange,
}: ConnectionDialogProps) {
  const t = useTranslations("applications.connection")

  return (
    <Dialog open={connection !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {connection
              ? t("title", { name: connection.name })
              : t("fallbackTitle")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {connection && (
          <DialogBody>
            <div className="flex flex-col gap-4">
              <CopyableField
                id="connection-client-id"
                label={t("clientId")}
                value={connection.clientId}
              />

              {connection.clientSecret ? (
                <>
                  <CopyableField
                    id="connection-client-secret"
                    label={t("clientSecret")}
                    value={connection.clientSecret}
                  />
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    {t("secretShownOnce")}
                  </p>
                </>
              ) : connection.isConfidential ? (
                <p className="text-sm text-muted-foreground">
                  {t("secretIssued")}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("publicClient")}
                </p>
              )}

              <Separator />

              <OidcEndpointFields
                configuration={configuration}
                isConfidential={connection.isConfidential}
                tokenEndpointAuthMethod={connection.tokenEndpointAuthMethod}
              />
            </div>
          </DialogBody>
        )}

        <DialogFooter>
          <DialogClose render={<Button />}>{t("done")}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
