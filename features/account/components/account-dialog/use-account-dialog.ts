"use client"

import { useQueryStates } from "nuqs"

import { accountSearchParams } from "@/features/account/lib/account-search-params"
import type { AccountSection } from "@/features/account/types"

// What opens the account dialog from anywhere inside the shell. The dialog
// itself is mounted once, by the user menu, and follows the URL.
export function useAccountDialog() {
  const [, setQuery] = useQueryStates(accountSearchParams)

  return {
    open: (section: AccountSection = "profile") =>
      void setQuery({ account: section, accountNotice: null }),
  }
}
