"use server"

import { eq } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import { user } from "@/features/shared/lib/db/schema"

// Asked by the session hook before any session is created, whichever factor
// proved the person. Answers about nobody but the account about to sign in.
export async function isAccountDisabled(userId: string) {
  const [account] = await db
    .select({ disabledAt: user.disabledAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  return Boolean(account?.disabledAt)
}
