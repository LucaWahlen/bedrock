"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { LoaderCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { acceptInvitation } from "@/features/organizations/actions/accept-invitation"
import { acceptPendingInvitation } from "@/features/organizations/actions/accept-pending-invitation"
import { registerWithInvitation } from "@/features/organizations/actions/register-with-invitation"
import { signInAndAcceptInvitation } from "@/features/organizations/actions/sign-in-and-accept-invitation"
import { createAccountDetailsSchema } from "@/features/organizations/schemas/invitation"
import type {
  AccountDetailsInput,
  InvitationPreview,
} from "@/features/organizations/types"
import { FormHeading } from "@/features/shared/components/form-heading"
import { PasswordStrengthMeter } from "@/features/shared/components/password-strength-meter"
import { Button } from "@/features/shared/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"
import { PasswordInput } from "@/features/shared/components/ui/password-input"

// A tag renderer for `t.rich`, built outside the component so it is not a new
// component type on every render.
function strong(chunks: React.ReactNode) {
  return <strong>{chunks}</strong>
}

function InvitedBy({ invitation }: { invitation: InvitationPreview }) {
  const t = useTranslations("organizations.invitation")
  const values = {
    email: invitation.email,
    organization: invitation.organizationName,
    strong,
  }

  return invitation.inviterName
    ? t.rich("invitedBy", { ...values, inviter: invitation.inviterName })
    : t.rich("invitedBySomeone", values)
}

export function InvitationPanel({
  invitation,
  token,
}: {
  invitation: InvitationPreview
  // Absent for someone who signed in and was told an invitation is waiting:
  // only the digest is stored, so the link cannot be rebuilt for them.
  token: string | null
}) {
  const t = useTranslations("organizations.invitation")

  // Signed in as somebody else: accepting would put the wrong account in the
  // organization. Signing out has to bring the token along, or they land on a
  // login page that refuses them for not being a member yet.
  if (invitation.viewer === "other") {
    return (
      <FieldGroup>
        <FormHeading
          title={t("otherAccount.title")}
          description={t.rich("otherAccount.description", {
            email: invitation.email,
            signedInAs: invitation.signedInAs ?? "",
            strong,
          })}
        />
        <Button
          nativeButton={false}
          render={
            <Link
              href={
                token
                  ? `/org/${invitation.organizationSlug}/logout?invitation=${encodeURIComponent(token)}`
                  : `/org/${invitation.organizationSlug}/logout`
              }
            />
          }
        >
          {t("otherAccount.signOut")}
        </Button>
      </FieldGroup>
    )
  }

  if (invitation.viewer === "recipient") {
    return <AcceptPanel invitation={invitation} token={token} />
  }

  // Anonymous from here, which the page only reaches with a token in hand: a
  // session is what finds an invitation without one.
  if (!token) return null

  return invitation.hasAccount ? (
    <SignInPanel invitation={invitation} token={token} />
  ) : (
    <RegisterPanel invitation={invitation} token={token} />
  )
}

/**
 * An existing account that is not signed in. Sending them to the login page
 * would strand them, because they are not a member until this invitation is
 * accepted, so the password is taken here and both happen at once.
 */
function SignInPanel({
  invitation,
  token,
}: {
  invitation: InvitationPreview
  token: string
}) {
  const t = useTranslations("organizations.invitation")
  const router = useRouter()
  const form = useForm<{ password: string }>({
    defaultValues: { password: "" },
  })

  async function onSubmit(data: { password: string }) {
    const result = await signInAndAcceptInvitation(token, data.password)
    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    router.push(
      result.next === "two-factor"
        ? `/org/${result.slug}/two-factor`
        : `/org/${result.slug}`
    )
  }

  return (
    <form
      id="invitation-sign-in-form"
      className="flex flex-col gap-6"
      aria-busy={form.formState.isSubmitting}
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FieldGroup>
        <FormHeading
          title={t("join", { organization: invitation.organizationName })}
          description={<InvitedBy invitation={invitation} />}
        />
        <Field>
          <FieldLabel htmlFor="invitation-sign-in-form-email">
            {t("email")}
          </FieldLabel>
          <Input
            id="invitation-sign-in-form-email"
            type="email"
            value={invitation.email}
            readOnly
            disabled
            autoComplete="username"
          />
        </Field>
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invitation-sign-in-form-password">
                {t("password")}
              </FieldLabel>
              <PasswordInput
                {...field}
                id="invitation-sign-in-form-password"
                autoComplete="current-password"
                aria-invalid={fieldState.invalid}
              />
            </Field>
          )}
        />
        {form.formState.errors.root && (
          <FieldError errors={[form.formState.errors.root]} />
        )}
        <Field>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <>
                <LoaderCircle className="animate-spin" />
                {t("joining")}
              </>
            ) : (
              t("signInAndJoin")
            )}
          </Button>
        </Field>
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href={`/org/${invitation.organizationSlug}/forgot-password?invitation=${encodeURIComponent(token)}`}
            className="underline underline-offset-4"
          >
            {t("forgotPassword")}
          </Link>
        </p>
      </FieldGroup>
    </form>
  )
}

function AcceptPanel({
  invitation,
  token,
}: {
  invitation: InvitationPreview
  token: string | null
}) {
  const t = useTranslations("organizations.invitation")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function accept() {
    startTransition(async () => {
      // Without a token the session is the proof, which the action requires a
      // confirmed address for.
      const result = token
        ? await acceptInvitation(token)
        : await acceptPendingInvitation(invitation.organizationSlug)

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
        title={t("join", { organization: invitation.organizationName })}
        description={<InvitedBy invitation={invitation} />}
      />
      {error && <FieldError errors={[{ message: error }]} />}
      <Button onClick={accept} disabled={pending}>
        {pending ? (
          <>
            <LoaderCircle className="animate-spin" />
            {t("joining")}
          </>
        ) : (
          t("accept")
        )}
      </Button>
    </FieldGroup>
  )
}

function RegisterPanel({
  invitation,
  token,
}: {
  invitation: InvitationPreview
  token: string
}) {
  const t = useTranslations("organizations")
  const schema = useMemo(() => createAccountDetailsSchema(t), [t])
  const router = useRouter()
  const form = useForm<AccountDetailsInput>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", password: "" },
  })
  const name = useWatch({ control: form.control, name: "name" })

  async function onSubmit(data: AccountDetailsInput) {
    const result = await registerWithInvitation(token, data)
    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    router.push(`/org/${result.slug}`)
  }

  return (
    <form
      id="invitation-form"
      className="flex flex-col gap-6"
      aria-busy={form.formState.isSubmitting}
      method="post"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FieldGroup>
        <FormHeading
          title={t("invitation.join", {
            organization: invitation.organizationName,
          })}
          description={<InvitedBy invitation={invitation} />}
        />
        <Field>
          <FieldLabel htmlFor="invitation-form-email">
            {t("invitation.email")}
          </FieldLabel>
          {/* Fixed by the token: changing it would be a different invitation. */}
          <Input
            id="invitation-form-email"
            type="email"
            value={invitation.email}
            readOnly
            disabled
            autoComplete="username"
          />
        </Field>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invitation-form-name">
                {t("invitation.name")}
              </FieldLabel>
              <Input
                {...field}
                id="invitation-form-name"
                autoComplete="name"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "invitation-form-name-error" : undefined
                }
                placeholder={t("invitation.namePlaceholder")}
              />
              {fieldState.invalid && (
                <FieldError
                  id="invitation-form-name-error"
                  errors={[fieldState.error]}
                />
              )}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invitation-form-password">
                {t("invitation.password")}
              </FieldLabel>
              <PasswordInput
                {...field}
                id="invitation-form-password"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid
                    ? "invitation-form-password-error"
                    : undefined
                }
              />
              <PasswordStrengthMeter
                password={field.value}
                name={name}
                email={invitation.email}
              />
              {fieldState.invalid && (
                <FieldError
                  id="invitation-form-password-error"
                  errors={[fieldState.error]}
                />
              )}
            </Field>
          )}
        />
        {form.formState.errors.root && (
          <FieldError errors={[form.formState.errors.root]} />
        )}
        <Field>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <>
                <LoaderCircle className="animate-spin" />
                {t("invitation.creatingAccount")}
              </>
            ) : (
              t("invitation.createAccountAndJoin")
            )}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
