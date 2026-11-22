"use client"

import Image from "next/image"
import { useState } from "react"

import {
  AVATAR_VARIANTS,
  avatarInitials,
  avatarVariantIndex,
} from "@/features/shared/lib/ui/avatar-palette"

interface IdentityAvatarProps {
  logo?: string | null
  name: string
  seed: string | null
  variant: "lg" | "md" | "sm"
  eager?: boolean
  onLogoError?: () => void
}

// `size` matches the vocabulary the avatar group styles react to.
const VARIANT_STYLES = {
  lg: {
    sizeClass: "size-14",
    fontSize: 18,
    imageSize: 56,
    eager: true,
    size: "lg",
  },
  md: {
    sizeClass: "size-8",
    fontSize: 12,
    imageSize: 32,
    eager: true,
    size: "default",
  },
  sm: {
    sizeClass: "size-6",
    fontSize: 10,
    imageSize: 24,
    eager: false,
    size: "sm",
  },
}

export function IdentityAvatar({
  logo,
  name,
  seed,
  variant,
  eager,
  onLogoError,
}: IdentityAvatarProps) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  const {
    sizeClass,
    fontSize,
    imageSize,
    size,
    eager: defaultEager,
  } = VARIANT_STYLES[variant]

  if (logo && logo !== failedLogo) {
    return (
      <Image
        ref={(element) => {
          if (element?.complete && element.naturalWidth === 0) {
            setFailedLogo(logo)
            onLogoError?.()
          }
        }}
        data-slot="avatar"
        data-size={size}
        src={logo}
        alt={name}
        className={`${sizeClass} rounded-md`}
        width={imageSize}
        height={imageSize}
        loading={(eager ?? defaultEager) ? "eager" : "lazy"}
        onError={() => {
          setFailedLogo(logo)
          onLogoError?.()
        }}
      />
    )
  }

  const color =
    seed === null
      ? { bg: "bg-muted", text: "!text-muted-foreground" }
      : AVATAR_VARIANTS[avatarVariantIndex(seed)]

  return (
    <div
      data-slot="avatar"
      data-size={size}
      aria-hidden="true"
      className={`${sizeClass} ${color.bg} flex shrink-0 items-center justify-center rounded-md`}
      style={{ fontSize }}
    >
      <span className={`leading-none font-semibold ${color.text}`}>
        {avatarInitials(name)}
      </span>
    </div>
  )
}
