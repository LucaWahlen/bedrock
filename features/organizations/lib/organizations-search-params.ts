import {
  createLoader,
  parseAsIndex,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server"

import {
  ORGANIZATION_SORTS,
  ORGANIZATION_STATUSES,
} from "@/features/organizations/types"
import { SORT_DIRECTIONS } from "@/features/shared/lib/query"

export const ORGANIZATIONS_PAGE_SIZE = 10

export const organizationsSearchParams = {
  search: parseAsString.withDefault(""),
  status: parseAsNativeArrayOf(parseAsStringLiteral(ORGANIZATION_STATUSES)),
  sort: parseAsStringLiteral(ORGANIZATION_SORTS).withDefault("name"),
  direction: parseAsStringLiteral(SORT_DIRECTIONS).withDefault("asc"),
  // Zero-based in state, one-based in the URL.
  page: parseAsIndex.withDefault(0),
}

export const loadOrganizationsSearchParams = createLoader(
  organizationsSearchParams
)
