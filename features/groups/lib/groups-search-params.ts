import {
  createLoader,
  parseAsIndex,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server"

import { GROUP_SORTS } from "@/features/groups/types"
import { SORT_DIRECTIONS } from "@/features/shared/lib/query"

export const GROUPS_PAGE_SIZE = 25

export const groupsSearchParams = {
  search: parseAsString.withDefault(""),
  role: parseAsNativeArrayOf(parseAsString),
  sort: parseAsStringLiteral(GROUP_SORTS).withDefault("name"),
  direction: parseAsStringLiteral(SORT_DIRECTIONS).withDefault("asc"),
  // Zero-based in state, one-based in the URL.
  page: parseAsIndex.withDefault(0),
}

export const loadGroupsSearchParams = createLoader(groupsSearchParams)
