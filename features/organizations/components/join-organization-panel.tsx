"use client"

import { LoaderCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { joinOrganization } from "@/features/organizations/actions/join-organization"
import { FormHeading } from "@/features/shared/components/form-heading"
import { Button } from "@/features/shared/components/ui/button"
import { FieldError, FieldGroup } from "@/features/shared/components/ui/field"

// A tag renderer for `t.rich`, built outside the component so it is not a new
// component type on every render.
function strong(chunks: React.ReactNode) {
  return <strong>{chunks}</strong>
}

function signOutLink(href: string) {
  return function SignOutLink(chunks: React.ReactNode) {
    return (
      <Link href={href} className="underline underline-offset-4">
        {chunks}
      </Link>
    )
  }
}

/** Someone who already has an account, on an organization open to anyone. */
export function JoinOrganizationPanel({
  organizationName,
  organizationSlug,
  email,
}: {
  organizationName: string
  organizationSlug: string
  email: string
}) {
  const t = useTranslations("organizations.join")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function join() {
    startTransition(async () => {
      const result = await joinOrganization(organizationSlug)
      if (!result.success) {
        setError(result.error)
        return
      }

      router.push(`/org/${result.slug}`)
    })
  }

  return (
    <FieldGroup>
      <FormHeading
        title={t("title", { organization: organizationName })}
        description={t.rich("description", {
          organization: organizationName,
          email,
          strong,
        })}
      />
      {error && <FieldError errors={[{ message: error }]} />}
      <Button onClick={join} disabled={pending}>
        {pending ? (
          <>
            <LoaderCircle className="animate-spin" />
            {t("joining")}
          </>
        ) : (
          t("title", { organization: organizationName })
        )}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t.rich("wrongAccount", {
          link: signOutLink(`/org/${organizationSlug}/logout`),
        })}
      </p>
    </FieldGroup>
  )
}
