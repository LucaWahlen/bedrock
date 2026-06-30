import Image from "next/image"

const AVATAR_VARIANTS = [
  {
    bg: "bg-blue-100 dark:bg-blue-900/60",
    text: "!text-blue-700 dark:!text-blue-300",
  },
  {
    bg: "bg-violet-100 dark:bg-violet-900/60",
    text: "!text-violet-700 dark:!text-violet-300",
  },
  {
    bg: "bg-pink-100 dark:bg-pink-900/60",
    text: "!text-pink-700 dark:!text-pink-300",
  },
  {
    bg: "bg-green-100 dark:bg-green-900/60",
    text: "!text-green-700 dark:!text-green-300",
  },
  {
    bg: "bg-orange-100 dark:bg-orange-900/60",
    text: "!text-orange-700 dark:!text-orange-300",
  },
  {
    bg: "bg-sky-100 dark:bg-sky-900/60",
    text: "!text-sky-700 dark:!text-sky-300",
  },
  {
    bg: "bg-teal-100 dark:bg-teal-900/60",
    text: "!text-teal-700 dark:!text-teal-300",
  },
  {
    bg: "bg-fuchsia-100 dark:bg-fuchsia-900/60",
    text: "!text-fuchsia-700 dark:!text-fuchsia-300",
  },
  {
    bg: "bg-rose-100 dark:bg-rose-900/60",
    text: "!text-rose-700 dark:!text-rose-300",
  },
  {
    bg: "bg-indigo-100 dark:bg-indigo-900/60",
    text: "!text-indigo-700 dark:!text-indigo-300",
  },
]

function hashId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return hash
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

interface OrgLogoProps {
  logoUrl?: string | null
  name: string
  id: string
  variant: "md" | "sm"
}

const VARIANT_STYLES = {
  md: { sizeClass: "size-8", fontSize: 12, imageSize: 32, priority: true },
  sm: { sizeClass: "size-6", fontSize: 10, imageSize: 24, priority: false },
}

export function OrgLogo({ logoUrl, name, id, variant }: OrgLogoProps) {
  const { sizeClass, fontSize, imageSize, priority } = VARIANT_STYLES[variant]

  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={name}
        className={`${sizeClass} rounded-md`}
        width={imageSize}
        height={imageSize}
        priority={priority}
      />
    )
  }

  const color = AVATAR_VARIANTS[hashId(id) % AVATAR_VARIANTS.length]

  return (
    <div
      className={`${sizeClass} ${color.bg} flex shrink-0 items-center justify-center rounded-md`}
      style={{ fontSize }}
    >
      <span className={`leading-none font-semibold ${color.text}`}>
        {getInitials(name)}
      </span>
    </div>
  )
}
