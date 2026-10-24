"use client"

import { Copy } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/features/shared/components/ui/button"
import { Field, FieldLabel } from "@/features/shared/components/ui/field"
import { Input } from "@/features/shared/components/ui/input"
import { copyToClipboard } from "@/features/shared/lib/ui/clipboard"

type CopyableFieldProps = {
  id: string
  label: string
  value: string
  hint?: string
}

export function CopyableField({ id, label, value, hint }: CopyableFieldProps) {
  const t = useTranslations("applications.connection")

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input
          id={id}
          readOnly
          value={value}
          className="font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("copy", { label })}
          onClick={() => copyToClipboard(value, label)}
        >
          <Copy />
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Field>
  )
}
