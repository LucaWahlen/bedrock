import {
  createLoader,
  parseAsIndex,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server"

import {
  APPLICATION_ROLE_SORTS,
  APPLICATION_SORTS,
  APPLICATION_TYPES,
} from "@/features/applications/types"
import { SORT_DIRECTIONS } from "@/features/shared/lib/query"

export const APPLICATIONS_PAGE_SIZE = 25

export const APPLICATION_ROLES_PAGE_SIZE = 25

const listSearchParams = {
  search: parseAsString.withDefault(""),
  direction: parseAsStringLiteral(SORT_DIRECTIONS).withDefault("asc"),
  // Zero-based in state, one-based in the URL.
  page: parseAsIndex.withDefault(0),
}

export const applicationsSearchParams = {
  ...listSearchParams,
  type: parseAsNativeArrayOf(parseAsStringLiteral(APPLICATION_TYPES)),
  sort: parseAsStringLiteral(APPLICATION_SORTS).withDefault("name"),
}

export const applicationRolesSearchParams = {
  ...listSearchParams,
  application: parseAsNativeArrayOf(parseAsString),
  sort: parseAsStringLiteral(APPLICATION_ROLE_SORTS).withDefault("name"),
}

export const loadApplicationsSearchParams = createLoader(
  applicationsSearchParams
)

export const loadApplicationRolesSearchParams = createLoader(
  applicationRolesSearchParams
)
