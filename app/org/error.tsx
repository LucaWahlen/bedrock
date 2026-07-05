"use client"

import Image from "next/image"
import Link from "next/link"

import { Button } from "@/features/shared/components/ui/button"

export default function OrgError() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex max-w-sm flex-col items-center gap-8 text-center">
        <Image src="/bedrock-logo.svg" alt="Bedrock" width={64} height={64} />
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">Unable to load workspace</h1>
          <p className="text-sm text-muted-foreground">
            We ran into a problem connecting to our services. This is usually
            temporary - please try again.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Button className="w-full" onClick={() => window.location.reload()}>
            Reload page
          </Button>
          <Button className="w-full" variant="outline" asChild>
            <Link href="/">Go to home</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
