import { pgTable, text, uuid, boolean } from "drizzle-orm/pg-core"

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  isRoot: boolean("is_root").notNull().default(false),
})
