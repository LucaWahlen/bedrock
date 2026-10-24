"use client"

import { Copy, Download } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/features/shared/components/ui/button"
import { copyToClipboard } from "@/features/shared/lib/ui/clipboard"

// Shown once, straight after they were created. Nothing reads them back later,
// so this is the only chance to keep them.
export function BackupCodes({
  codes,
  onDone,
}: {
  codes: string[]
  onDone: () => void
}) {
  const t = useTranslations("account")
  const tc = useTranslations("common")
  const text = codes.join("\n")

  function download() {
    const url = URL.createObjectURL(
      new Blob([`${text}\n`], { type: "text/plain" })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = "backup-codes.txt"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border px-4 py-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t("backupCodes.title")}</p>
        <p className="text-sm text-muted-foreground">
          {t("backupCodes.description")}
        </p>
      </div>
      <ol
        aria-label={t("backupCodes.label")}
        className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md bg-muted px-4 py-3 font-mono text-sm sm:grid-cols-3"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void copyToClipboard(text, t("backupCodes.label"))}
        >
          <Copy />
          {tc("actions.copy")}
        </Button>
        <Button type="button" variant="outline" onClick={download}>
          <Download />
          {t("backupCodes.download")}
        </Button>
        <Button type="button" onClick={onDone}>
          {t("backupCodes.done")}
        </Button>
      </div>
    </div>
  )
}
