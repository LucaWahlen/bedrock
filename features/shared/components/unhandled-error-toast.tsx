"use client"

import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"

// A failed Server Action rejects in an event handler, which no error boundary sees.
export function UnhandledErrorToast() {
  const t = useTranslations("common.errors")
  const message = t("unexpected")

  useEffect(() => {
    function notify() {
      toast.error(message, { id: "unhandled-error" })
    }

    window.addEventListener("unhandledrejection", notify)
    return () => window.removeEventListener("unhandledrejection", notify)
  }, [message])

  return null
}
