import { createTransport, type Transporter } from "nodemailer"

import { env } from "@/features/shared/lib/config/env"
import type { EmailTransport } from "@/features/shared/lib/email/types"

let transporter: Transporter | undefined

function getTransporter() {
  const smtp = env.email.smtp

  transporter ??= createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user
      ? { user: smtp.user, pass: smtp.password ?? "" }
      : undefined,
  })

  return transporter
}

/** Connects and authenticates without sending anything, for health checks. */
export async function verifySmtpConnection() {
  await getTransporter().verify()
}

export function createSmtpTransport(): EmailTransport {
  const smtp = env.email.smtp
  const activeTransporter = getTransporter()

  const sender = {
    name: env.email.senderName,
    address: env.email.senderAddress,
  }

  return {
    name: `smtp(${smtp.host}:${smtp.port})`,
    send: async (message) => {
      await activeTransporter.sendMail({
        from: sender,
        to: message.to,
        replyTo: env.email.replyToAddress,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })
    },
  }
}
