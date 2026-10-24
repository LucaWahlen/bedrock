export type EmailAddress = { name?: string; address: string }

export type EmailMessage = {
  to: EmailAddress
  subject: string
  html: string
  text: string
}

export type EmailTransport = {
  name: string
  send: (message: EmailMessage) => Promise<void>
}
