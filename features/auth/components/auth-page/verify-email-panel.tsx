"use client"

import { CircleCheck, LoaderCircle, MailCheck } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { resendVerificationEmail } from "@/features/auth/actions/resend-verification-email"
import { verifyEmail } from "@/features/auth/actions/verify-email"
import type { LoginOrganization } from "@/features/auth/types"
import { emailChangeOf } from "@/features/auth/utils/email-change-token"
import { FormHeading } from "@/features/shared/components/form-heading"
import { Button } from "@/features/shared/components/ui/button"
import { FieldError, FieldGroup } from "@/features/shared/components/ui/field"

// Tag renderers for `t.rich`, built outside the component so they are not new
// component types on every render.
function linkTo(href: string) {
  return function LinkTag(chunks: React.ReactNode) {
    return (
      <Link href={href} className="underline underline-offset-4">
        {chunks}
      </Link>
    )
  }
}

function strong(chunks: React.ReactNode) {
  return <strong>{chunks}</strong>
}

export function VerifyEmailPanel({
  organization,
  email,
  token,
}: {
  organization: LoginOrganization
  email: string | null
  token: string | null
}) {
  const router = useRouter()
  const t = useTranslations("auth.verifyEmail")
  const tCommon = useTranslations("common")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  // A link that moves an existing account to a new address, rather than one
  // that finishes a sign-up. It ends in the account dialog, not here.
  const change = token ? emailChangeOf(token) : null

  function confirm() {
    if (!token) return

    startTransition(async () => {
      const result = await verifyEmail(token)
      if (!result.success) {
        setError(result.error)
        return
      }

      if (change) {
        router.replace(
          `/org/${organization.slug}?account=email&accountNotice=email-changed`
        )
        return
      }

      setConfirmed(true)
      router.refresh()
    })
  }

  function resend() {
    startTransition(async () => {
      const result = await resendVerificationEmail(organization.slug)
      if (result.success) {
        toast.success(t("resent"))
        return
      }

      toast.error(result.error)
    })
  }

  if (confirmed) {
    return (
      <FieldGroup>
        <div className="flex flex-col items-center gap-3 text-center">
          <CircleCheck className="size-8 text-muted-foreground" />
          <FormHeading
            title={t("confirmed.title")}
            description={t("confirmed.description", {
              organization: organization.name,
            })}
          />
        </div>
        <Button
          nativeButton={false}
          render={<Link href={`/org/${organization.slug}`} />}
        >
          {tCommon("actions.continue")}
        </Button>
      </FieldGroup>
    )
  }

  // The token is spent on a deliberate click rather than on page load, so a
  // scanner following the link in the mail cannot burn it before its owner does.
  if (token) {
    return (
      <FieldGroup>
        {change ? (
          <FormHeading
            title={t("confirmChange.title")}
            description={t.rich("confirmChange.description", {
              to: change.to,
              from: change.from,
              strong,
            })}
          />
        ) : (
          <FormHeading
            title={t("confirm.title")}
            description={t("confirm.description")}
          />
        )}
        {error && <FieldError errors={[{ message: error }]} />}
        <Button onClick={confirm} disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle className="animate-spin" />
              {t("submitting")}
            </>
          ) : (
            t("submit")
          )}
        </Button>
      </FieldGroup>
    )
  }

  return (
    <FieldGroup>
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-8 text-muted-foreground" />
        <FormHeading
          title={t("inbox.title")}
          description={
            email
              ? t.rich("inbox.descriptionWithEmail", { email, strong })
              : t("inbox.description")
          }
        />
      </div>
      <Button onClick={resend} disabled={pending} variant="outline">
        {pending ? (
          <>
            <LoaderCircle className="animate-spin" />
            {t("resending")}
          </>
        ) : (
          t("resend")
        )}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t.rich("wrongAddress", {
          link: linkTo(`/org/${organization.slug}/logout`),
        })}
      </p>
    </FieldGroup>
  )
}
