import type { BetterAuthRateLimitOptions } from "better-auth"

import { consumeRateLimit } from "@/features/shared/lib/rate-limit"

// Points Better Auth's own limiter at our table instead of its per-process
// memory store, which resets on deploy and gives every replica its own budget.
export const authRateLimitStorage = {
  consume: consumeRateLimit,
} satisfies NonNullable<BetterAuthRateLimitOptions["customStorage"]>
