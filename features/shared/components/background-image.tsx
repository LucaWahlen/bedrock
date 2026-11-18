"use client"

import Image from "next/image"
import { useState } from "react"

export function BackgroundImage({
  src,
  fallbackSrc,
}: {
  src?: string | null
  fallbackSrc: string
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [fallbackFailed, setFallbackFailed] = useState(false)

  const primary = src && src !== failedSrc ? src : null
  const activeSrc = primary ?? (fallbackFailed ? null : fallbackSrc)
  if (!activeSrc) return null

  function markFailed() {
    if (primary) setFailedSrc(primary)
    else setFallbackFailed(true)
  }

  return (
    <Image
      ref={(element) => {
        if (element?.complete && element.naturalWidth === 0) {
          markFailed()
        }
      }}
      src={activeSrc}
      alt=""
      fill
      loading="eager"
      sizes="50vw"
      unoptimized
      className="object-cover"
      onError={markFailed}
    />
  )
}
