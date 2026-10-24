import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const nextConfig: NextConfig = {
  // `next dev` would otherwise rewrite a block at the top of AGENTS.md on every
  // start. The project's own instructions already point at the local docs.
  agentRules: false,
  // A self-contained server in `.next/standalone` for the container image; see
  // `Dockerfile`.
  output: "standalone",
  // Lets the dev server be reached through `cloudflared tunnel`, so an external
  // relying party can test the OIDC flow. Development only.
  allowedDevOrigins: ["*.trycloudflare.com"],
  images: {
    unoptimized: true,
  },
}

// Links `i18n/request.ts` to next-intl. The declarations give the English
// messages exact types, so `t()` arguments are checked too; they are written
// by `next dev`, `next build` and `next typegen`, and not committed.
const withNextIntl = createNextIntlPlugin({
  experimental: {
    createMessagesDeclaration: [
      "./messages/en/common.json",
      "./messages/en/app.json",
      "./messages/en/auth.json",
      "./messages/en/account.json",
      "./messages/en/organizations.json",
      "./messages/en/applications.json",
      "./messages/en/groups.json",
      "./messages/en/audit.json",
      "./messages/en/usage.json",
      "./messages/en/health.json",
      "./messages/en/notifications.json",
      "./messages/en/emails.json",
    ],
  },
})

export default withNextIntl(nextConfig)
