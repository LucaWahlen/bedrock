"use client"

import { Braces, Copy, Ellipsis } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"

import type { AuditEventDisplay } from "@/features/audit/types"
import { describeAuditAction } from "@/features/audit/utils/describe-audit-action"
import { Button } from "@/features/shared/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/features/shared/components/ui/dropdown-menu"
import { copyToClipboard } from "@/features/shared/lib/ui/clipboard"

type AuditEventRowActionsProps = {
  event: AuditEventDisplay
}

export function AuditEventRowActions({ event }: AuditEventRowActionsProps) {
  const t = useTranslations("audit")
  const tClipboard = useTranslations("common.clipboard")
  const format = useFormatter()

  function copy(value: string, label: string) {
    return copyToClipboard(value, {
      copied: tClipboard("copied", { label }),
      failed: tClipboard("failed", { label }),
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("rowActions.label", {
              action: describeAuditAction(t, event.action),
              date: format.dateTime(new Date(event.createdAt), "dateTime"),
            })}
          />
        }
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-48 whitespace-nowrap"
      >
        <DropdownMenuItem
          onClick={() => copy(event.id, t("rowActions.eventId"))}
        >
          <Copy />
          {t("rowActions.copyId")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            copy(JSON.stringify(event, null, 2), t("rowActions.event"))
          }
        >
          <Braces />
          {t("rowActions.copyJson")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
