export const AVATAR_VARIANTS = [
  {
    bg: "bg-blue-200 dark:bg-blue-900",
    text: "!text-blue-700 dark:!text-blue-300",
    svgBg: "#bedbff",
    svgText: "#1447e6",
  },
  {
    bg: "bg-violet-200 dark:bg-violet-900",
    text: "!text-violet-700 dark:!text-violet-300",
    svgBg: "#ddd6ff",
    svgText: "#7008e7",
  },
  {
    bg: "bg-pink-200 dark:bg-pink-900",
    text: "!text-pink-700 dark:!text-pink-300",
    svgBg: "#fccee8",
    svgText: "#c6005c",
  },
  {
    bg: "bg-green-200 dark:bg-green-900",
    text: "!text-green-700 dark:!text-green-300",
    svgBg: "#b9f8cf",
    svgText: "#008236",
  },
  {
    bg: "bg-orange-200 dark:bg-orange-900",
    text: "!text-orange-700 dark:!text-orange-300",
    svgBg: "#ffd6a7",
    svgText: "#ca3500",
  },
  {
    bg: "bg-sky-200 dark:bg-sky-900",
    text: "!text-sky-700 dark:!text-sky-300",
    svgBg: "#b8e6fe",
    svgText: "#0069a8",
  },
  {
    bg: "bg-teal-200 dark:bg-teal-900",
    text: "!text-teal-700 dark:!text-teal-300",
    svgBg: "#96f7e4",
    svgText: "#00786f",
  },
  {
    bg: "bg-fuchsia-200 dark:bg-fuchsia-900",
    text: "!text-fuchsia-700 dark:!text-fuchsia-300",
    svgBg: "#f6cfff",
    svgText: "#a800b7",
  },
  {
    bg: "bg-rose-200 dark:bg-rose-900",
    text: "!text-rose-700 dark:!text-rose-300",
    svgBg: "#ffccd3",
    svgText: "#c70036",
  },
  {
    bg: "bg-indigo-200 dark:bg-indigo-900",
    text: "!text-indigo-700 dark:!text-indigo-300",
    svgBg: "#c6d2ff",
    svgText: "#432dd7",
  },
] as const

export function avatarVariantIndex(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash % AVATAR_VARIANTS.length
}

export function avatarInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return "?"
  const words = trimmed.split(/\s+/)
  if (words.length >= 2) {
    const first = Array.from(words[0])[0] ?? ""
    const second = Array.from(words[1])[0] ?? ""
    return `${first}${second}`.toUpperCase()
  }
  return Array.from(trimmed).slice(0, 2).join("").toUpperCase()
}
