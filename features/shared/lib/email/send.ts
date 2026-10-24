import { createSmtpTransport } from "@/features/shared/lib/email/smtp-transport"
import type {
  EmailMessage,
  EmailTransport,
} from "@/features/shared/lib/email/types"
import { recordEmailSent } from "@/features/shared/lib/telemetry/metrics"

let transport: EmailTransport | undefined

function getEmailTransport() {
  transport ??= createSmtpTransport()

  return transport
}

/**
 * Resolves false when the message could not be handed to the transport, so a
 * caller can tell a user their mail is on the way or that it is not.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const active = getEmailTransport()

  try {
    await active.send(message)
    recordEmailSent("success")
    return true
  } catch (error) {
    console.error(`[email] ${active.name} failed to send`, error)
    recordEmailSent("failure")
    return false
  }
}
