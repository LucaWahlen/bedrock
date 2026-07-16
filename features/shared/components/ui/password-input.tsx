"use client"

import { Eye, EyeOff } from "lucide-react"
import * as React from "react"

import { Button } from "@/features/shared/components/ui/button"
import { Input } from "@/features/shared/components/ui/input"
import { cn } from "@/features/shared/lib/utils"

function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className={cn("relative", className)}>
      <Input type={visible ? "text" : "password"} className="pr-8" {...props} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 my-auto text-muted-foreground hover:bg-transparent dark:hover:bg-transparent"
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  )
}

export { PasswordInput }
