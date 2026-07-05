import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { betterAuth } from "better-auth/minimal"
import { organization } from "better-auth/plugins"

import { db } from "@/features/shared/lib/db"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization({
      schema: {
        organization: {
          additionalFields: {
            isRoot: {
              type: "boolean",
              input: false,
              required: true,
              defaultValue: false,
            },
          },
        },
      },
    }),
  ],
})
