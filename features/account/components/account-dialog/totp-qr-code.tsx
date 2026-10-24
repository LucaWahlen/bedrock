"use client"

import { useMemo } from "react"
import { encode } from "uqr"

// Drawn as inline SVG rather than an image: the secret never becomes a URL, a
// request, or something `img-src` has to allow. Always dark on white, whatever
// the theme, because that is what every camera reads reliably. It must not
// shrink: a flex row would squeeze the width while the height holds.
export function TotpQrCode({ value, label }: { value: string; label: string }) {
  const { path, size } = useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 4 })
    const commands: string[] = []
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) commands.push(`M${x} ${y}h1v1h-1z`)
      })
    )

    return { path: commands.join(""), size: qr.size }
  }, [value])

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-44 shrink-0 rounded-md bg-white"
    >
      <title>{label}</title>
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
