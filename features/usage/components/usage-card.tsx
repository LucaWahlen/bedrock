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
import { cn } from "@/features/shared/lib/ui/utils"

// One section of a Usage page: a titled card, optionally linking to the page
// where its subject is managed.
export function UsageCard({
  title,
  description,
  link,
  className,
  children,
}: {
  title: string
  description: string
  link?: { href: string; label: string }
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
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
      <CardContent className="flex-1">{children}</CardContent>
    </Card>
  )
}
