import { and, eq, like } from "drizzle-orm"

import type { db } from "@/features/shared/lib/db/client"
import { twoFactor, user, verification } from "@/features/shared/lib/db/schema"

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Recovery for someone who has lost both their authenticator and their backup
// codes. Every device trusted to skip the second factor is forgotten with it,
// and any sign-in halfway through its second step, so the account's next
// sign-in is a plain password sign-in and they can enrol again. The caller
// authorizes and audits inside the same transaction.
export async function resetSecondFactor(tx: Transaction, userId: string) {
  const [updated] = await tx
    .update(user)
    .set({ twoFactorEnabled: false })
    .where(eq(user.id, userId))
    .returning({ id: user.id })
  if (!updated) return false

  await tx.delete(twoFactor).where(eq(twoFactor.userId, userId))
  for (const prefix of ["trust-device-%", "2fa-%"]) {
    await tx
      .delete(verification)
      .where(
        and(
          eq(verification.value, userId),
          like(verification.identifier, prefix)
        )
      )
  }

  return true
}
