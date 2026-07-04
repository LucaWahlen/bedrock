import { betterAuth } from "better-auth/minimal"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "../../shared/lib/db"
import { organization } from "better-auth/plugins"

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
