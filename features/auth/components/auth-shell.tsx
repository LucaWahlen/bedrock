import Image from "next/image"

import { getAccessContext } from "@/features/auth/actions/get-access-context"
import { LanguageSwitcher } from "@/features/auth/components/login-page/language-switcher"
import type { LoginOrganization } from "@/features/auth/types"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import { env } from "@/features/shared/lib/config/env"

/**
 * The frame every page outside the application wears: login, sign-up,
 * invitations, password reset and verification. Branding comes from the
 * organization in the URL, so all of them look like the tenant they belong to.
 *
 * The language switcher is for visitors: it sets a cookie, which a signed-in
 * person's own choice would outrank. They change it from the user menu.
 */
export async function AuthShell({
  organization,
  wide = false,
  children,
}: {
  organization?: LoginOrganization
  // For a page that holds more than one short form, such as enrolling a
  // second factor.
  wide?: boolean
  children: React.ReactNode
}) {
  const { user } = await getAccessContext()

  return (
    // Only the content column scrolls; the image beside it stays put.
    <div className="grid h-svh lg:grid-cols-2">
      <ScrollArea className="h-svh">
        <div className="flex min-h-svh flex-col gap-4 p-6 md:p-10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium">
              {organization && (
                <IdentityAvatar
                  logo={organization.logo}
                  name={organization.name}
                  seed={organization.id}
                  variant="sm"
                  eager
                />
              )}
              {organization?.name}
            </div>
            {!user && <LanguageSwitcher />}
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className={wide ? "w-full max-w-md" : "w-full max-w-xs"}>
              {children}
            </div>
          </div>
        </div>
      </ScrollArea>
      <div className="relative hidden bg-muted lg:block">
        <Image
          src={organization?.backgroundImage ?? env.defaultBackgroundImageUrl}
          alt=""
          fill
          loading="eager"
          sizes="50vw"
          unoptimized
          className="object-cover"
        />
      </div>
    </div>
  )
}
