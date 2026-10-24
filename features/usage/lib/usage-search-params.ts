import { createLoader, parseAsNumberLiteral } from "nuqs/server"

import { USAGE_PERIODS } from "@/features/usage/types"

export const usageSearchParams = {
  period: parseAsNumberLiteral(USAGE_PERIODS).withDefault(30),
}

export const loadUsageSearchParams = createLoader(usageSearchParams)
