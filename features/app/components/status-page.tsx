import Image from "next/image"
import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"

import { IdentityAvatar } from "@/features/app/components/identity-avatar"
import type { organization } from "@/features/app/lib/types"
import { Button } from "@/features/shared/components/ui/button"

type StatusPageProps = {
  organization?: organization
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
  const primaryStyle = organization?.color
    ? ({ "--primary": organization.color } as CSSProperties)
    : undefined

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <div className="flex items-center gap-2 font-medium">
            {organization ? (
              <IdentityAvatar
                logo={organization.logo}
                name={organization.name}
                id={organization.id}
                variant="sm"
                eager
              />
            ) : (
              <Image
                src="/bedrock-logo.svg"
                alt="Bedrock"
                className="size-6 rounded-md"
                width={24}
                height={24}
                loading="eager"
              />
            )}
            {organization?.name ?? "Bedrock"}
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
                style={primaryStyle}
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
      <div className="relative hidden bg-muted lg:block">
        <Image
          src={
            organization?.backgroundImage ??
            process.env.DEFAULT_BACKGROUND_IMAGE_URL!
          }
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
