import { defineConfig } from "drizzle-kit"

import { env } from "@/features/shared/lib/config/env"

export default defineConfig({
  schema: "./features/shared/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.database.url,
  },
})
