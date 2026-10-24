import {
  createLoader,
  parseAsIndex,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server"

import {
  ACCOUNT_STATUSES,
  MEMBER_ROLES,
  MEMBER_STATUSES,
  PEOPLE_SORTS,
} from "@/features/organizations/types"
import { SORT_DIRECTIONS } from "@/features/shared/lib/query"

export const MEMBERS_PAGE_SIZE = 25

export const DIRECTORY_PAGE_SIZE = 25

const peopleSearchParams = {
  search: parseAsString.withDefault(""),
  sort: parseAsStringLiteral(PEOPLE_SORTS).withDefault("name"),
  direction: parseAsStringLiteral(SORT_DIRECTIONS).withDefault("asc"),
  // Zero-based in state, one-based in the URL.
  page: parseAsIndex.withDefault(0),
}

export const membersSearchParams = {
  ...peopleSearchParams,
  role: parseAsNativeArrayOf(parseAsStringLiteral(MEMBER_ROLES)),
  status: parseAsNativeArrayOf(parseAsStringLiteral(MEMBER_STATUSES)),
  applicationRole: parseAsNativeArrayOf(parseAsString),
  group: parseAsNativeArrayOf(parseAsString),
}

export const directorySearchParams = {
  ...peopleSearchParams,
  organization: parseAsNativeArrayOf(parseAsString),
  account: parseAsNativeArrayOf(parseAsStringLiteral(ACCOUNT_STATUSES)),
}

export const loadMembersSearchParams = createLoader(membersSearchParams)

export const loadDirectorySearchParams = createLoader(directorySearchParams)
