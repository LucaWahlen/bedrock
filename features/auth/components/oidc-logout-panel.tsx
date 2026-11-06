"use client"

import { CircleAlert, CircleCheck, LogOut } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"

import type { LoginOrganization, OidcLogoutState } from "@/features/auth/types"
import { FormHeading } from "@/features/shared/components/form-heading"
import { Button } from "@/features/shared/components/ui/button"
import { FieldGroup } from "@/features/shared/components/ui/field"

type OidcLogoutPanelProps = {
  state: OidcLogoutState
  organization: LoginOrganization
  applicationName?: string
  launchUrl?: string | null
  clientId?: string
  unregisteredRedirect?: boolean
}

export function OidcLogoutPanel({
  state,
  organization,
  applicationName,
  launchUrl,
  clientId,
  unregisteredRedirect = false,
}: OidcLogoutPanelProps) {
  const t = useTranslations("auth.oidcLogout")
  const tCommon = useTranslations("common")

  if (state === "confirm") {
    const confirmAction = clientId
      ? `/api/auth/oauth2/end-session/confirm?client_id=${encodeURIComponent(clientId)}`
      : "/api/auth/oauth2/end-session/confirm"

    return (
      <FieldGroup>
        <div className="flex flex-col items-center gap-3 text-center">
          <LogOut className="size-8 text-muted-foreground" />
          <FormHeading
            title={t("confirm.title")}
            description={
              applicationName
                ? t("confirm.descriptionWithApplication", {
                    application: applicationName,
                    organization: organization.name,
                  })
                : t("confirm.description", {
                    organization: organization.name,
                  })
            }
          />
        </div>
        <form
          method="post"
          action={confirmAction}
          className="flex flex-col gap-2"
        >
          <input type="hidden" name="action" value="confirm" />
          <Button type="submit">{t("confirm.submit")}</Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={launchUrl ?? `/org/${organization.slug}`} />}
          >
            {tCommon("actions.cancel")}
          </Button>
        </form>
      </FieldGroup>
    )
  }

  if (state === "error") {
    return (
      <FieldGroup>
        <div className="flex flex-col items-center gap-3 text-center">
          <CircleAlert className="size-8 text-muted-foreground" />
          <FormHeading
            title={t("error.title")}
            description={t("error.description")}
          />
        </div>
        <Button
          nativeButton={false}
          render={<Link href={`/org/${organization.slug}`} />}
        >
          {t("backToOrganization", { organization: organization.name })}
        </Button>
      </FieldGroup>
    )
  }

  const description = unregisteredRedirect
    ? t("signedOut.unregisteredRedirect")
    : applicationName
      ? t("signedOut.descriptionWithApplication", {
          application: applicationName,
        })
      : t("signedOut.description")

  return (
    <FieldGroup>
      <div className="flex flex-col items-center gap-3 text-center">
        <CircleCheck className="size-8 text-muted-foreground" />
        <FormHeading title={t("signedOut.title")} description={description} />
      </div>
      <div className="flex flex-col gap-2">
        {launchUrl && applicationName ? (
          <>
            <Button nativeButton={false} render={<Link href={launchUrl} />}>
              {t("signedOut.returnToApplication", {
                application: applicationName,
              })}
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/org/${organization.slug}/login`} />}
            >
              {t("signedOut.signInAgain")}
            </Button>
          </>
        ) : (
          <Button
            nativeButton={false}
            render={<Link href={`/org/${organization.slug}/login`} />}
          >
            {t("signedOut.signInAgain")}
          </Button>
        )}
      </div>
    </FieldGroup>
  )
}
