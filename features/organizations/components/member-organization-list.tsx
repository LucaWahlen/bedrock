import { ChevronRight, Landmark } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"

import { MEMBER_ROLE_DISPLAY } from "@/features/organizations/lib/member-role-display"
import type { MemberOrganization } from "@/features/organizations/types"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"

export function MemberOrganizationList({
  organizations,
}: {
  organizations: MemberOrganization[]
}) {
  const t = useTranslations("organizations")

  if (organizations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("memberOrganizations.empty")}
      </p>
    )
  }

  return (
    <ul className="-mx-2 flex flex-col">
      {organizations.map((organization) => {
        const RoleIcon = MEMBER_ROLE_DISPLAY[organization.role].icon

        return (
          <li key={organization.id}>
            <Link
              href={`/org/${organization.slug}`}
              className="group/row flex items-center gap-3 rounded-md px-2 py-2 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <IdentityAvatar
                seed={organization.id}
                logo={organization.logo}
                name={organization.name}
                variant="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate font-medium">
                    {organization.name}
                  </span>
                  {organization.isRoot && (
                    // A tooltip trigger is a button, which cannot sit in a link.
                    <>
                      <Landmark
                        className="size-3.5 shrink-0 text-[var(--root-primary,var(--muted-foreground))]"
                        aria-hidden="true"
                      />
                      <span className="sr-only">
                        {t("memberOrganizations.root")}
                      </span>
                    </>
                  )}
                </div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <RoleIcon className="size-3 shrink-0" aria-hidden="true" />
                  {t(`roles.${organization.role}.label`)}
                </p>
              </div>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground group-hover/row:text-foreground"
                aria-hidden="true"
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
