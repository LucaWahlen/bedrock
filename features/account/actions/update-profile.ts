"use server"

import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import {
  deleteReplacedAvatar,
  deleteStoredObjects,
  promoteAvatar,
} from "@/features/account/lib/avatar-storage"
import { createUpdateProfileInputSchema } from "@/features/account/schemas/account"
import type { UpdateProfileInput } from "@/features/account/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { getAccessContext } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { user } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import { isOwnedStagedBrandingKey } from "@/features/shared/lib/storage/media"
import type { ActionResult } from "@/features/shared/types"

export async function updateProfile(
  input: UpdateProfileInput
): Promise<ActionResult> {
  const [t, tc] = await Promise.all([
    getTranslations("account"),
    getTranslations("common"),
  ])
  const parsed = createUpdateProfileInputSchema(t).safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidProfile"),
    }
  }

  const { user: currentUser } = await getAccessContext()
  if (!currentUser) return { success: false, error: tc("errors.notSignedIn") }

  const { name, avatar } = parsed.data
  const actor = auditActorFromUser(currentUser)

  // Only an upload this person staged themselves can become their picture.
  if (
    avatar.action === "replace" &&
    !isOwnedStagedBrandingKey(avatar.key, currentUser.id)
  ) {
    return { success: false, error: t("errors.invalidPicture") }
  }

  let promotedKey: string | undefined

  try {
    const promoted =
      avatar.action === "replace"
        ? await promoteAvatar(currentUser.id, avatar.key)
        : undefined
    promotedKey = promoted?.key

    const nextImage =
      avatar.action === "keep"
        ? undefined
        : avatar.action === "remove"
          ? null
          : (promoted?.publicUrl ?? null)

    const outcome = await db.transaction(async (tx) => {
      // Locked so two saves cannot both read the same previous picture and
      // leave one of the uploaded ones orphaned.
      const [previous] = await tx
        .select({ name: user.name, image: user.image })
        .from(user)
        .where(eq(user.id, currentUser.id))
        .for("update")
        .limit(1)

      if (!previous) return null

      const changed = [
        ...(previous.name !== name ? ["name"] : []),
        ...(nextImage !== undefined && nextImage !== previous.image
          ? ["image"]
          : []),
      ]
      if (changed.length === 0) return { previous, changed }

      await tx
        .update(user)
        .set({ name, ...(nextImage !== undefined && { image: nextImage }) })
        .where(eq(user.id, currentUser.id))

      await recordAuditEvent(
        {
          action: "account.profile_updated",
          actor,
          target: { type: "user", id: currentUser.id, label: name },
          metadata: {
            changed,
            ...(changed.includes("name") && {
              name: { from: previous.name, to: name },
            }),
            ...(changed.includes("image") && {
              image: avatar.action === "remove" ? "removed" : "replaced",
            }),
          },
        },
        tx
      )

      return { previous, changed }
    })

    if (!outcome) {
      if (promotedKey) await deleteStoredObjects([promotedKey])
      return { success: false, error: tc("errors.notSignedIn") }
    }

    if (avatar.action === "replace") await deleteStoredObjects([avatar.key])
    if (outcome.changed.includes("image")) {
      await deleteReplacedAvatar(currentUser.id, outcome.previous.image)
    } else if (promotedKey) {
      await deleteStoredObjects([promotedKey])
    }
    promotedKey = undefined

    revalidateEverywhere()

    return { success: true }
  } catch (error) {
    if (promotedKey) await deleteStoredObjects([promotedKey])
    console.error("Profile could not be changed", error)

    await recordAuditEvent({
      action: "account.profile_updated",
      outcome: "failure",
      actor,
      target: { type: "user", id: currentUser.id, label: currentUser.name },
      reason: "Profile could not be saved",
    })

    return { success: false, error: t("errors.profileNotSaved") }
  }
}
