"use client"

import { Combobox } from "@base-ui/react/combobox"
import { Check, MailPlus, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import { findAssignableUsers } from "@/features/organizations/actions/find-assignable-users"
import type {
  OrganizationPerson,
  PersonSelection,
} from "@/features/organizations/types"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import { IdentityLabel } from "@/features/shared/components/identity-label"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import { Spinner } from "@/features/shared/components/ui/spinner"
import { cn } from "@/features/shared/lib/ui/utils"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function keyOf(selection: PersonSelection) {
  return selection.kind === "user" ? selection.id : selection.email
}

function labelOf(selection: PersonSelection) {
  return selection.kind === "user" ? selection.name : selection.email
}

type UserPickerProps = {
  id: string
  value: PersonSelection[]
  onChange: (people: PersonSelection[]) => void
  // Omitted while choosing owners for an organization that does not exist yet.
  organizationId?: string
  // A viewer who cannot search the directory has to name an address exactly.
  canSearchDirectory: boolean
  // Offers an address nobody holds yet, for callers that can invite one.
  invitable?: string
  // Replaces the default search for people who could be added. Must be stable.
  lookup?: typeof findAssignableUsers
  disabled?: boolean
  invalid?: boolean
}

export function UserPicker({
  id,
  value,
  onChange,
  organizationId,
  canSearchDirectory,
  invitable,
  lookup = findAssignableUsers,
  disabled,
  invalid,
}: UserPickerProps) {
  const t = useTranslations("organizations.userPicker")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<OrganizationPerson[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Without a query the server suggests likely candidates, so a lookup runs on
  // open as well as on typing, except for a viewer who has to name an address.
  const idle = !query.trim() && !canSearchDirectory

  function changeQuery(next: string) {
    setQuery(next)

    if (!next.trim() && !canSearchDirectory) {
      setResults([])
      setError(null)
      setIsSearching(false)
    }
  }

  useEffect(() => {
    if (idle) return

    const controller = new AbortController()
    const timeout = window.setTimeout(
      async () => {
        setIsSearching(true)
        setError(null)

        try {
          const result = await lookup(query, organizationId)
          if (controller.signal.aborted) return

          if (result.success) {
            setResults(result.data)
          } else {
            setResults([])
            setError(result.error)
          }
        } catch {
          if (controller.signal.aborted) return
          setResults([])
          setError(t("lookupFailed"))
        } finally {
          if (!controller.signal.aborted) setIsSearching(false)
        }
      },
      query.trim() ? 300 : 0
    )

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [idle, lookup, organizationId, query, t])

  const taken = new Set(value.map(keyOf))
  const term = query.trim().toLowerCase()
  const found: PersonSelection[] = results
    .filter((person) => !taken.has(person.id))
    .map((person) => ({ kind: "user", ...person }))

  // Only once the lookup has settled, or a half-typed address flickers an offer
  // to invite somebody the directory was about to return.
  const unclaimed =
    invitable &&
    !isSearching &&
    EMAIL_PATTERN.test(term) &&
    !taken.has(term) &&
    !results.some((person) => person.email.toLowerCase() === term)

  const items: PersonSelection[] = unclaimed
    ? [...found, { kind: "address", email: term }]
    : found

  const emptyMessage = isSearching
    ? t("searching")
    : (error ??
      (!query.trim()
        ? canSearchDirectory
          ? t("nobodyLeft")
          : t("enterExactAddress")
        : canSearchDirectory
          ? t("noMatch")
          : t("noAccount")))

  return (
    <Combobox.Root
      items={items}
      value={value}
      multiple
      disabled={disabled}
      // Results come from the server already filtered by the query.
      filter={null}
      inputValue={query}
      onInputValueChange={changeQuery}
      onValueChange={onChange}
      itemToStringLabel={labelOf}
      isItemEqualToValue={(
        selection: PersonSelection,
        other: PersonSelection
      ) => keyOf(selection) === keyOf(other)}
    >
      <Combobox.InputGroup
        className={cn(
          "flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border bg-transparent px-2 py-1 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          invalid && "border-destructive ring-destructive/20",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <Combobox.Chips className="flex w-full flex-wrap items-center gap-1">
          <Combobox.Value>
            {(selected: PersonSelection[]) => (
              <>
                {selected.map((selection) => (
                  <Combobox.Chip
                    key={keyOf(selection)}
                    className="flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-0.5 pl-1 text-xs outline-none focus-within:ring-2 focus-within:ring-ring/50 data-highlighted:ring-2 data-highlighted:ring-ring/50"
                    aria-label={labelOf(selection)}
                  >
                    <IdentityAvatar
                      seed={selection.kind === "user" ? selection.id : null}
                      logo={
                        selection.kind === "user" ? selection.image : undefined
                      }
                      name={labelOf(selection)}
                      variant="sm"
                    />
                    <span className="max-w-40 truncate">
                      {labelOf(selection)}
                    </span>
                    <Combobox.ChipRemove
                      className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={t("remove", { name: labelOf(selection) })}
                    >
                      <X className="size-3" />
                    </Combobox.ChipRemove>
                  </Combobox.Chip>
                ))}
                <Combobox.Input
                  id={id}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={invalid}
                  placeholder={
                    selected.length
                      ? ""
                      : canSearchDirectory
                        ? t("searchPlaceholder")
                        : t("addressPlaceholder")
                  }
                  className="h-7 min-w-32 flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground"
                />
              </>
            )}
          </Combobox.Value>
          {isSearching && (
            <Spinner
              className="mr-1 size-3.5 shrink-0"
              aria-label={t("searchingLabel")}
            />
          )}
        </Combobox.Chips>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner className="z-50 outline-none" sideOffset={4}>
          <Combobox.Popup className="w-(--anchor-width) origin-(--transform-origin) rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition-[transform,scale,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {/* Base UI keeps this mounted and empties it once there are items. */}
            <Combobox.Empty className="px-2 py-3 text-center text-sm text-muted-foreground empty:hidden">
              {emptyMessage}
            </Combobox.Empty>
            <ScrollArea className="group/results *:data-[slot=scroll-area-viewport]:max-h-64">
              {/* Only inset the items when the scrollbar is actually there. */}
              <Combobox.List className="group-data-has-overflow-y/results:pr-2.5">
                {(selection: PersonSelection) => (
                  <Combobox.Item
                    key={keyOf(selection)}
                    value={selection}
                    className="flex cursor-default items-center justify-between gap-2 rounded-md p-1.5 outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    {selection.kind === "user" ? (
                      <IdentityLabel
                        name={selection.name}
                        secondary={selection.email}
                        avatar={{ seed: selection.id, logo: selection.image }}
                      />
                    ) : (
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                          <MailPlus className="size-4 text-muted-foreground" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {selection.email}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {invitable}
                          </span>
                        </span>
                      </span>
                    )}
                    <Combobox.ItemIndicator>
                      <Check className="size-4" />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </ScrollArea>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
