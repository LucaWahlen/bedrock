import Image from "next/image"

const AVATAR_VARIANTS = [
  {
    bg: "bg-blue-200 dark:bg-blue-900",
    text: "!text-blue-700 dark:!text-blue-300",
  },
  {
    bg: "bg-violet-200 dark:bg-violet-900",
    text: "!text-violet-700 dark:!text-violet-300",
  },
  {
    bg: "bg-pink-200 dark:bg-pink-900",
    text: "!text-pink-700 dark:!text-pink-300",
  },
  {
    bg: "bg-green-200 dark:bg-green-900",
    text: "!text-green-700 dark:!text-green-300",
  },
  {
    bg: "bg-orange-200 dark:bg-orange-900",
    text: "!text-orange-700 dark:!text-orange-300",
  },
  {
    bg: "bg-sky-200 dark:bg-sky-900",
    text: "!text-sky-700 dark:!text-sky-300",
  },
  {
    bg: "bg-teal-200 dark:bg-teal-900",
    text: "!text-teal-700 dark:!text-teal-300",
  },
  {
    bg: "bg-fuchsia-200 dark:bg-fuchsia-900",
    text: "!text-fuchsia-700 dark:!text-fuchsia-300",
  },
  {
    bg: "bg-rose-200 dark:bg-rose-900",
    text: "!text-rose-700 dark:!text-rose-300",
  },
  {
    bg: "bg-indigo-200 dark:bg-indigo-900",
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

interface IdentityAvatarProps {
  logo?: string | null
  name: string
  seed: string | null
  variant: "lg" | "md" | "sm"
  eager?: boolean
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
}: IdentityAvatarProps) {
  const {
    sizeClass,
    fontSize,
    imageSize,
    size,
    eager: defaultEager,
  } = VARIANT_STYLES[variant]

  if (logo) {
    return (
      <Image
        data-slot="avatar"
        data-size={size}
        src={logo}
        alt={name}
        className={`${sizeClass} rounded-md`}
        width={imageSize}
        height={imageSize}
        loading={(eager ?? defaultEager) ? "eager" : "lazy"}
        crossOrigin="anonymous"
      />
    )
  }

  const color =
    seed === null
      ? { bg: "bg-muted", text: "!text-muted-foreground" }
      : AVATAR_VARIANTS[hashId(seed) % AVATAR_VARIANTS.length]

  return (
    <div
      data-slot="avatar"
      data-size={size}
      aria-hidden="true"
      className={`${sizeClass} ${color.bg} flex shrink-0 items-center justify-center rounded-md`}
      style={{ fontSize }}
    >
      <span className={`leading-none font-semibold ${color.text}`}>
        {getInitials(name)}
      </span>
    </div>
  )
}
