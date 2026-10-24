import { createTranslator } from "next-intl"
import type {
  Messages as AppMessages,
  NamespaceKeys,
  NestedKeyOf,
} from "next-intl"

import type { Locale } from "@/features/shared/lib/i18n/config"
import { formats } from "@/features/shared/lib/i18n/formats"
import { messagesFor } from "@/features/shared/lib/i18n/messages"

export type Namespace = NamespaceKeys<AppMessages, NestedKeyOf<AppMessages>>

// What `useTranslations(namespace)` and `getTranslations(namespace)` return,
// for code that takes a translator as an argument, such as a schema factory.
export type Translator<N extends Namespace> = ReturnType<
  typeof createTranslator<AppMessages, N>
>

// A translator for an explicit locale, outside any request: emails, scripts
// and background work. Inside a request, use `getTranslations` instead.
export function translatorFor<N extends Namespace>(
  locale: Locale,
  namespace: N
): Translator<N> {
  return createTranslator({
    locale,
    messages: messagesFor(locale) as AppMessages,
    namespace,
    formats,
  })
}
