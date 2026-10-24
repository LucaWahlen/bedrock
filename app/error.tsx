"use client"

import { useTranslations } from "next-intl"
import Image from "next/image"
import Link from "next/link"

import { Button } from "@/features/shared/components/ui/button"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"

export default function ErrorPage() {
  const t = useTranslations("app.status.error")

  return (
    <ScrollArea className="h-svh">
      <div className="grid min-h-svh place-items-center">
        <div className="flex max-w-sm flex-col items-center gap-8 text-center">
          <Image src="/bedrock-logo.svg" alt="" width={64} height={64} />
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("description")}</p>
          </div>
          <div className="flex w-full flex-col gap-2">
            <Button className="w-full" onClick={() => window.location.reload()}>
              {t("reload")}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              nativeButton={false}
              render={<Link href="/">{t("home")}</Link>}
            />
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}
