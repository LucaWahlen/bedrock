"use server"

import { eq } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import { user } from "@/features/shared/lib/db/schema"

/**
 * The language the account at `email` chose, so mail to it is written in that
 * language. Null when there is no such account or it never chose one.
 */
export async function recipientLocale(email: string): Promise<string | null> {
  const [row] = await db
    .select({ locale: user.locale })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  return row?.locale ?? null
}
