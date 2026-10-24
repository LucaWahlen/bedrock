export function normalizeThemeColor(color: string) {
  const normalizedColor = color.trim().toLowerCase()
  return ["#000000", "#ffffff"].includes(normalizedColor) ? "" : normalizedColor
}
