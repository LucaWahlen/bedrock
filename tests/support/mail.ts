import { mock } from "bun:test"

import type { EmailMessage } from "@/features/shared/lib/email/types"

// Captures what would have been sent, so actions that mail someone run without
// an SMTP server and a test can read the message instead.
export const outbox: EmailMessage[] = []

mock.module("@/features/shared/lib/email/send", () => ({
  sendEmail: async (message: EmailMessage) => {
    outbox.push(message)
    return true
  },
}))
