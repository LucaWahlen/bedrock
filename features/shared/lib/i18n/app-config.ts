import type { Locale } from "@/features/shared/lib/i18n/config"
import type { formats } from "@/features/shared/lib/i18n/formats"
import type { Messages } from "@/features/shared/lib/i18n/messages"

// Types every next-intl API by the English messages: an unknown key, a missing
// argument or an unknown format name fails `bun run typecheck`.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale
    Messages: Messages
    Formats: typeof formats
  }
}
