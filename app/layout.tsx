import { NextIntlClientProvider } from "next-intl"
import { getLocale } from "next-intl/server"
import { Geist_Mono, Inter } from "next/font/google"
import { headers } from "next/headers"
import { NuqsAdapter } from "nuqs/adapters/next/app"

import "@/app/globals.css"
import { ThemeProvider } from "@/features/shared/components/theme-provider"
import { Toaster } from "@/features/shared/components/ui/sonner"
import { UnhandledErrorToast } from "@/features/shared/components/unhandled-error-toast"
import { cn } from "@/features/shared/lib/ui/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // next-themes' anti-FOUC script is inline, so it needs the CSP nonce too.
  const [requestHeaders, locale] = await Promise.all([headers(), getLocale()])
  const nonce = requestHeaders.get("x-nonce") ?? undefined

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        {/* Hands the request's locale, messages and formats to every Client
            Component below. */}
        <NextIntlClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            nonce={nonce}
          >
            <NuqsAdapter>{children}</NuqsAdapter>
            <Toaster />
            <UnhandledErrorToast />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
