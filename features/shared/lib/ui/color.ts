const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** Organization colours arrive from user input, so only an exact hex is used. */
export function normalizeHexColor(value: string | null | undefined) {
  return value?.match(HEX_COLOR)?.[0] ?? null
}

export function contrastingForeground(color: string) {
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
  if (!hex) return "#ffffff"

  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((character) => character.repeat(2))
          .join("")
      : hex
  const channels = [0, 2, 4].map((offset) =>
    Number.parseInt(normalized.slice(offset, offset + 2), 16)
  )
  const luminance = channels
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    )
    .reduce(
      (value, channel, index) =>
        value + channel * [0.2126, 0.7152, 0.0722][index],
      0
    )

  return luminance > 0.179 ? "#000000" : "#ffffff"
}
