"use server"

import { APIError } from "better-auth/api"
import { asc, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { getTwoFactorRequirements } from "@/features/account/actions/get-two-factor-requirements"
import type { SecurityOverview } from "@/features/account/types"
import { auth, getAccessContext } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { passkey, user as userTable } from "@/features/shared/lib/db/schema"
import type { QueryResult } from "@/features/shared/types"

// How many unused backup codes are left. The codes themselves are decrypted
// only to be counted, and never leave the server.
async function remainingBackupCodes(userId: string) {
  try {
    const { backupCodes } = await auth.api.viewBackupCodes({
      body: { userId },
    })

    return backupCodes.length
  } catch (error) {
    if (error instanceof APIError) return null
    throw error
  }
}

// Called by the Security section when it opens. Only the caller's own factors
// are read, and nothing that could stand in for one is returned.
export async function getSecurityOverview(): Promise<
  QueryResult<SecurityOverview>
> {
  const t = await getTranslations("common")
  const { user } = await getAccessContext()
  if (!user) return { success: false, error: t("errors.notSignedIn") }

  const [[account], passkeys, twoFactorRequiredBy] = await Promise.all([
    db
      .select({ twoFactorEnabled: userTable.twoFactorEnabled })
      .from(userTable)
      .where(eq(userTable.id, user.id))
      .limit(1),
    db
      .select({
        id: passkey.id,
        name: passkey.name,
        createdAt: passkey.createdAt,
        deviceType: passkey.deviceType,
        backedUp: passkey.backedUp,
      })
      .from(passkey)
      .where(eq(passkey.userId, user.id))
      .orderBy(asc(passkey.createdAt)),
    getTwoFactorRequirements(),
  ])
  const twoFactorEnabled = account?.twoFactorEnabled ?? false

  return {
    success: true,
    data: {
      twoFactorEnabled,
      backupCodesRemaining: twoFactorEnabled
        ? await remainingBackupCodes(user.id)
        : null,
      passkeys: passkeys.map((row) => ({
        ...row,
        createdAt: row.createdAt?.toISOString() ?? null,
      })),
      twoFactorRequiredBy,
    },
  }
}
