import { ArrowRight } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/features/shared/components/ui/card"

type OverviewSectionProps = {
  title: string
  description?: string
  // Where the full list lives, when there is a page for it.
  link?: { href: string; label: string }
  children: ReactNode
}

// The frame renders at once; only its content waits on data.
export function OverviewSection({
  title,
  description,
  link,
  children,
}: OverviewSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {link && (
          <CardAction>
            <Link
              href={link.href}
              className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {link.label}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
