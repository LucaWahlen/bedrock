"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"

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
import { Field, FieldLabel } from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"

// A tag renderer for `t.rich`, built outside the component so it is not a new
// component type on every render.
function code(chunks: React.ReactNode) {
  return <span className="font-mono">{chunks}</span>
}

type OrganizationActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Absent while the dialog animates closed, once the action has been cleared.
  title?: string
  description?: string
  confirmLabel?: string
  variant?: "default" | "destructive"
  // The slug the reader must type. Set it for an act nobody should reach by
  // mistake, and leave it out for one that can simply be undone.
  confirmSlug?: string | null
  pending: boolean
  onConfirm: () => void
}

// Shared by an organization's own danger zone and the instance's row menu, so
// the same act is confirmed the same way wherever it is offered.
export function OrganizationActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  variant = "default",
  confirmSlug,
  pending,
  onConfirm,
}: OrganizationActionDialogProps) {
  const t = useTranslations("organizations.actionDialog")
  const tCommon = useTranslations("common")
  const [confirmation, setConfirmation] = useState("")
  const confirmed = !confirmSlug || confirmation === confirmSlug

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirmation("")
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {confirmSlug && (
          <Field>
            <FieldLabel htmlFor="organization-action-confirmation">
              {t.rich("typeToConfirm", { slug: confirmSlug, code })}
            </FieldLabel>
            <Input
              id="organization-action-confirmation"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </Field>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>
            {tCommon("actions.cancel")}
          </DialogClose>
          <Button
            variant={variant}
            disabled={pending || !confirmed}
            onClick={onConfirm}
          >
            {pending ? tCommon("states.saving") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
