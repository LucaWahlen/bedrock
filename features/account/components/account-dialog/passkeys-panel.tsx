"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { startRegistration } from "@simplewebauthn/browser"
import { Fingerprint, KeyRound, Pencil, Plus, Trash2 } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useMemo, useState, useTransition } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { deletePasskey } from "@/features/account/actions/delete-passkey"
import { finishPasskeyRegistration } from "@/features/account/actions/finish-passkey-registration"
import { renamePasskey } from "@/features/account/actions/rename-passkey"
import { startPasskeyRegistration } from "@/features/account/actions/start-passkey-registration"
import { AccountForm } from "@/features/account/components/account-dialog/account-form"
import {
  createAddPasskeySchema,
  createPasskeyNameSchema,
} from "@/features/account/schemas/account"
import type { AccountPasskey, AddPasskeyInput } from "@/features/account/types"
import { Badge } from "@/features/shared/components/ui/badge"
import { Button } from "@/features/shared/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"
import { PasswordInput } from "@/features/shared/components/ui/password-input"

function wasDismissed(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "NotAllowedError" || error.name === "AbortError")
  )
}

// A tag renderer for `t.rich`, built outside the component so it is not a new
// component type on every render.
function strong(chunks: React.ReactNode) {
  return <strong>{chunks}</strong>
}

function AddPasskeyForm({
  onAdded,
  onCancel,
}: {
  onAdded: () => void
  onCancel: () => void
}) {
  const t = useTranslations("account")
  const schema = useMemo(() => createAddPasskeySchema(t), [t])
  const form = useForm<AddPasskeyInput>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", currentPassword: "" },
  })

  async function onSubmit(values: AddPasskeyInput) {
    const options = await startPasskeyRegistration({
      currentPassword: values.currentPassword,
    })
    if (!options.success) {
      form.setError("root", { message: options.error })
      return
    }

    let credential: unknown
    try {
      credential = await startRegistration({ optionsJSON: options.data })
    } catch (error) {
      form.setError("root", {
        message: wasDismissed(error)
          ? t("passkeys.notCreated")
          : error instanceof Error && error.name === "InvalidStateError"
            ? t("passkeys.alreadyOnDevice")
            : t("passkeys.browserFailed"),
      })
      return
    }

    const result = await finishPasskeyRegistration(values.name, credential)
    if (!result.success) {
      form.setError("root", { message: result.error })
      return
    }

    toast.success(t("passkeys.added"))
    onAdded()
  }

  return (
    <AccountForm
      id="account-passkey-add-form"
      form={form}
      onSubmit={onSubmit}
      submitLabel={t("passkeys.create")}
      requireDirty={false}
      onCancel={onCancel}
    >
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="account-passkey-name">
                {t("fields.name")}
              </FieldLabel>
              <Input
                {...field}
                id="account-passkey-name"
                placeholder={t("passkeys.namePlaceholder")}
                autoComplete="off"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "account-passkey-name-error" : undefined
                }
              />
              {fieldState.invalid && (
                <FieldError
                  id="account-passkey-name-error"
                  errors={[fieldState.error]}
                />
              )}
            </Field>
          )}
        />
        <Controller
          name="currentPassword"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="account-passkey-password">
                {t("fields.currentPassword")}
              </FieldLabel>
              <PasswordInput
                {...field}
                id="account-passkey-password"
                autoComplete="current-password"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid
                    ? "account-passkey-password-error"
                    : undefined
                }
              />
              {fieldState.invalid && (
                <FieldError
                  id="account-passkey-password-error"
                  errors={[fieldState.error]}
                />
              )}
            </Field>
          )}
        />
      </FieldGroup>
    </AccountForm>
  )
}

function PasskeyRow({
  passkey,
  removalRefusal,
  onChanged,
}: {
  passkey: AccountPasskey
  removalRefusal: string | null
  onChanged: () => void
}) {
  const t = useTranslations("account")
  const tc = useTranslations("common")
  const format = useFormatter()
  const nameSchema = useMemo(() => createPasskeyNameSchema(t), [t])
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view")
  const [name, setName] = useState(passkey.name ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const label = passkey.name ?? t("passkeys.unnamed")
  const nameId = `account-passkey-${passkey.id}-name`
  const refusalId = `account-passkey-${passkey.id}-removal-refusal`

  function rename(event: React.FormEvent) {
    event.preventDefault()
    const parsed = nameSchema.safeParse(name)
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? t("validation.passkeyNameRequired")
      )
      return
    }

    startTransition(async () => {
      const result = await renamePasskey({ id: passkey.id, name: parsed.data })
      if (!result.success) {
        setError(result.error)
        return
      }
      toast.success(t("passkeys.renamed"))
      setMode("view")
      setError(null)
      onChanged()
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deletePasskey(passkey.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(t("passkeys.removed"))
      onChanged()
    })
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3" aria-busy={isPending}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <KeyRound
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium">{label}</span>
              {passkey.backedUp && (
                <Badge variant="secondary">{t("passkeys.synced")}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {passkey.createdAt
                ? t("passkeys.addedAt", {
                    date: format.dateTime(
                      new Date(passkey.createdAt),
                      "dateTime"
                    ),
                  })
                : t("passkeys.addedAtUnknown")}
            </p>
            {removalRefusal && (
              <p id={refusalId} className="text-xs text-muted-foreground">
                {removalRefusal}.
              </p>
            )}
          </div>
        </div>
        {mode === "view" && (
          <div className="flex shrink-0 gap-2 self-start sm:self-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setMode("rename")}
            >
              <Pencil />
              {t("passkeys.rename")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || removalRefusal !== null}
              aria-describedby={removalRefusal ? refusalId : undefined}
              onClick={() => setMode("delete")}
            >
              <Trash2 />
              {t("passkeys.remove")}
            </Button>
          </div>
        )}
      </div>
      {mode === "rename" && (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          noValidate
          onSubmit={rename}
        >
          <Field data-invalid={Boolean(error)} className="flex-1">
            <FieldLabel htmlFor={nameId}>{t("fields.name")}</FieldLabel>
            <Input
              id={nameId}
              value={name}
              autoComplete="off"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${nameId}-error` : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {error && <FieldError id={`${nameId}-error`}>{error}</FieldError>}
          </Field>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMode("view")
                setName(passkey.name ?? "")
                setError(null)
              }}
            >
              {tc("actions.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {tc("actions.save")}
            </Button>
          </div>
        </form>
      )}
      {mode === "delete" && (
        <div
          role="alertdialog"
          aria-label={t("passkeys.removeLabel", { name: label })}
          className="flex flex-col gap-3 rounded-lg border border-destructive/30 px-3 py-2 sm:flex-row sm:items-center"
        >
          <p className="flex-1 text-sm">
            {t.rich("passkeys.removeConfirm", { name: label, strong })}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMode("view")}
            >
              {tc("actions.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={remove}
            >
              {t("passkeys.removeSubmit")}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

export function PasskeysPanel({
  passkeys,
  supported,
  removalRefusal,
  onChanged,
}: {
  passkeys: AccountPasskey[]
  supported: boolean
  // Why the only passkey cannot be removed, when it is the last factor an
  // organization requires. The action refuses it again.
  removalRefusal: string | null
  onChanged: () => void
}) {
  const t = useTranslations("account")
  const [adding, setAdding] = useState(false)

  return (
    <section
      aria-labelledby="account-passkeys-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-0.5">
          <h4 id="account-passkeys-heading" className="text-sm font-medium">
            {t("passkeys.title")}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t("passkeys.description")}
          </p>
        </div>
        {!adding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start sm:self-auto"
            disabled={!supported}
            onClick={() => setAdding(true)}
          >
            <Plus />
            {t("passkeys.add")}
          </Button>
        )}
      </div>
      {!supported && (
        <p className="text-xs text-muted-foreground">
          {t("passkeys.unsupported")}
        </p>
      )}
      {adding && (
        <AddPasskeyForm
          onCancel={() => setAdding(false)}
          onAdded={() => {
            setAdding(false)
            onChanged()
          }}
        />
      )}
      {passkeys.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {passkeys.map((passkey) => (
            <PasskeyRow
              key={`${passkey.id}:${passkey.name ?? ""}`}
              passkey={passkey}
              removalRefusal={removalRefusal}
              onChanged={onChanged}
            />
          ))}
        </ul>
      ) : (
        !adding && (
          <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            <Fingerprint className="size-5 shrink-0" aria-hidden />
            {t("passkeys.empty")}
          </div>
        )
      )}
    </section>
  )
}
