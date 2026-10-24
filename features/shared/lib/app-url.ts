import { env } from "@/features/shared/lib/config/env"

/** Mailed links have no browser origin to resolve against. */
export function absoluteUrl(path: string) {
  return new URL(path, env.auth.url).toString()
}
