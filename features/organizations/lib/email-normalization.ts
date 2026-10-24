const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(email)
}

/** Trims, lowercases and deduplicates a batch of addresses. */
export function normalizeEmails(emails: string[]) {
  return Array.from(new Set(emails.map(normalizeEmail))).filter(Boolean)
}
