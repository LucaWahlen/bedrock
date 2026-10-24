"use client"

import { ShieldAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useState } from "react"

import { SecuritySection } from "@/features/account/components/account-dialog/security-section"
import type { SecurityOverview } from "@/features/account/types"
import { FormHeading } from "@/features/shared/components/form-heading"
import { Button, buttonVariants } from "@/features/shared/components/ui/button"

// A tag renderer for `t.rich`, built outside the component so it is not a new
// component type on every render.
function linkTo(href: string) {
  return function LinkTag(chunks: React.ReactNode) {
    return (
      <Link
        href={href}
        prefetch={false}
        className="underline underline-offset-4"
      >
        {chunks}
      </Link>
    )
  }
}

function holdsSecondFactor(overview: SecurityOverview) {
  return overview.twoFactorEnabled || overview.passkeys.length > 0
}

// The Security section on its own, for a member whose organization requires a
// second factor they do not have yet. Continuing is offered rather than done
// for them, so a freshly shown set of backup codes is not navigated away from.
export function SecuritySetup({
  organizationName,
  continueHref,
  continueLabel,
  resumesAuthorization = false,
  signOutHref,
}: {
  organizationName: string
  continueHref: string
  continueLabel: string
  // Continuing returns to an application's authorization, which is a route
  // handler rather than a page, so it is a full navigation.
  resumesAuthorization?: boolean
  signOutHref: string
}) {
  const t = useTranslations("account")
  const [ready, setReady] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <ShieldAlert className="size-8 text-muted-foreground" aria-hidden />
        <FormHeading
          title={t("setup.title")}
          description={t("setup.description", {
            organization: organizationName,
          })}
        />
      </div>
      <SecuritySection
        onFactorsChanged={() => {}}
        onOverviewChange={(overview) => setReady(holdsSecondFactor(overview))}
      />
      {ready && resumesAuthorization ? (
        <a href={continueHref} className={buttonVariants()}>
          {continueLabel}
        </a>
      ) : ready ? (
        <Button
          nativeButton={false}
          render={<Link href={continueHref} prefetch={false} />}
        >
          {continueLabel}
        </Button>
      ) : (
        <Button disabled>{continueLabel}</Button>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {t.rich("setup.notNow", { link: linkTo(signOutHref) })}
      </p>
    </div>
  )
}
