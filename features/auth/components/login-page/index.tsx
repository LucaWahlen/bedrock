import { organization } from "../../../app/lib/types"
import { OrgLogo } from "../../../app/components/org-logo"
import Image from "next/image"
import { LoginForm } from "./form"

export function LoginPage({ organization }: { organization?: organization }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <div className="flex items-center gap-2 font-medium">
            {organization && (
              <OrgLogo
                logo={organization.logo}
                name={organization.name}
                id={organization.id}
                variant="sm"
                priority
              />
            )}
            {organization?.name}
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm organization={organization} />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <Image
          src={
            organization?.backgroundImage ??
            process.env.DEFAULT_BACKGROUND_IMAGE_URL!
          }
          alt="Image"
          fill
          priority
          sizes="50vw"
          unoptimized
          className="object-cover"
        />
      </div>
    </div>
  )
}
