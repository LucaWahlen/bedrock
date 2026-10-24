import {
  FastAverageColor,
  type FastAverageColorOptions,
} from "fast-average-color"

import { normalizeThemeColor } from "@/features/organizations/utils/normalize-theme-color"

// The near-black, grey and near-white bands are ignored so a logo suggests its
// brand colour rather than its background.
const IGNORED_COLORS = [
  [0, 0, 0, 0],
  [0, 0, 0, 255, 48],
  [64, 64, 64, 255, 24],
  [128, 128, 128, 255, 24],
  [192, 192, 192, 255, 24],
  [255, 255, 255, 255, 48],
] as const satisfies FastAverageColorOptions["ignoredColor"]

export async function extractThemeColor(logo: File) {
  const averageColor = new FastAverageColor()
  const objectUrl = URL.createObjectURL(logo)

  try {
    const result = await averageColor.getColorAsync(objectUrl, {
      algorithm: "dominant",
      ignoredColor: [...IGNORED_COLORS],
    })
    return normalizeThemeColor(result.hex)
  } catch {
    return undefined
  } finally {
    URL.revokeObjectURL(objectUrl)
    averageColor.destroy()
  }
}
