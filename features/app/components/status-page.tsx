import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

import type { Organization } from "@/features/organizations"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import { Button } from "@/features/shared/components/ui/button"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import { env } from "@/features/shared/lib/config/env"

type StatusPageProps = {
  organization?: Organization
  code: string
  title: string
  description: ReactNode
  action: {
    href: string
    label: string
  }
  secondaryAction?: {
    href: string
    label: string
  }
}

export function StatusPage({
  organization,
  code,
  title,
  description,
  action,
  secondaryAction,
}: StatusPageProps) {
  return (
    // Only the content column scrolls; the image beside it stays put.
    <div className="grid h-svh lg:grid-cols-2">
      <ScrollArea className="h-svh">
        <div className="flex min-h-svh flex-col gap-4 p-6 md:p-10">
          <div className="flex justify-center gap-2 md:justify-start">
            <div className="flex items-center gap-2 font-medium">
              {organization ? (
                <IdentityAvatar
                  logo={organization.logo}
                  name={organization.name}
                  seed={organization.id}
                  variant="sm"
                  eager
                />
              ) : (
                <Image
                  src="/bedrock-logo.svg"
                  alt={env.rootOrganization.name}
                  className="size-6 rounded-md"
                  width={24}
                  height={24}
                  loading="eager"
                />
              )}
              {organization?.name ?? env.rootOrganization.name}
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="flex w-full max-w-xs flex-col gap-8 text-center">
              <div className="flex flex-col gap-2">
                <h1 className="text-7xl font-bold">{code}</h1>
                <h2 className="text-2xl font-semibold">{title}</h2>
                <p className="text-muted-foreground">{description}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  nativeButton={false}
                  render={<Link href={action.href} />}
                >
                  {action.label}
                </Button>
                {secondaryAction && (
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<Link href={secondaryAction.href} />}
                  >
                    {secondaryAction.label}
                  </Button>
                )}
              </div>
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
