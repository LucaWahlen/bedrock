import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./features/shared/lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
