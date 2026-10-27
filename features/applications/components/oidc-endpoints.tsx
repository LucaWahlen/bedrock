"use client"

import { useTranslations } from "next-intl"

import { CopyableField } from "@/features/applications/components/copyable-field"
import type { ClientAuthMethod } from "@/features/applications/schemas/application"
import type { OidcConfiguration } from "@/features/applications/types"

type OidcEndpointFieldsProps = {
  configuration: OidcConfiguration
  isConfidential: boolean
  tokenEndpointAuthMethod?: ClientAuthMethod | null
}

export function OidcEndpointFields({
  configuration,
  isConfidential,
  tokenEndpointAuthMethod,
}: OidcEndpointFieldsProps) {
  const t = useTranslations("applications.endpoints")

  return (
    <div className="flex flex-col gap-4">
      <CopyableField
        id="oidc-discovery"
        label={t("discovery")}
        value={configuration.discovery}
        hint={t("discoveryHint")}
      />
      <CopyableField
        id="oidc-issuer"
        label={t("issuer")}
        value={configuration.issuer}
      />
      <CopyableField
        id="oidc-authorization"
        label={t("authorization")}
        value={configuration.authorization}
      />
      <CopyableField
        id="oidc-token"
        label={t("token")}
        value={configuration.token}
      />
      <CopyableField
        id="oidc-jwks"
        label={t("jwks")}
        value={configuration.jwks}
      />
      <CopyableField
        id="oidc-userinfo"
        label={t("userinfo")}
        value={configuration.userinfo}
      />
      <CopyableField
        id="oidc-end-session"
        label={t("endSession")}
        value={configuration.endSession}
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("signingAlgorithm")}</dt>
        <dd className="font-mono text-xs leading-5">
          {configuration.signingAlgorithm}
        </dd>
        <dt className="text-muted-foreground">{t("scopes")}</dt>
        <dd className="font-mono text-xs leading-5">
          {configuration.scopes.join(" ")}
        </dd>
        <dt className="text-muted-foreground">{t("clientAuthentication")}</dt>
        <dd className="font-mono text-xs leading-5">
          {tokenEndpointAuthMethod ??
            (isConfidential ? "client_secret_basic" : "none")}
        </dd>
        <dt className="text-muted-foreground">{t("pkce")}</dt>
        <dd className="font-mono text-xs leading-5">S256</dd>
      </dl>
    </div>
  )
}
