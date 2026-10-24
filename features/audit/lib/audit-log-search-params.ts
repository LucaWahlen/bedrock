import {
  createLoader,
  parseAsIndex,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server"

import { AUDIT_ACTIONS, AUDIT_OUTCOMES } from "@/features/audit/types"
import { SORT_DIRECTIONS } from "@/features/shared/lib/query"

export const AUDIT_EVENTS_PAGE_SIZE = 50

export const auditLogSearchParams = {
  search: parseAsString.withDefault(""),
  action: parseAsNativeArrayOf(parseAsStringLiteral(AUDIT_ACTIONS)),
  outcome: parseAsNativeArrayOf(parseAsStringLiteral(AUDIT_OUTCOMES)),
  actor: parseAsNativeArrayOf(parseAsString),
  organization: parseAsNativeArrayOf(parseAsString),
  direction: parseAsStringLiteral(SORT_DIRECTIONS).withDefault("desc"),
  // Zero-based in state, one-based in the URL.
  page: parseAsIndex.withDefault(0),
}

export const loadAuditLogSearchParams = createLoader(auditLogSearchParams)
