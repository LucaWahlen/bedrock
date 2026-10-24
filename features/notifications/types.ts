export type NoticeRecipient = {
  name: string
  email: string
  // Their `user.locale` when the caller already has it; otherwise it is read
  // from the account at this address before the notice is written.
  locale?: string | null
}

// Where a change came from, read from the request before the response is sent,
// because the mail itself goes out after it.
export type NoticeRequest = {
  at: Date
  ipAddress: string | null
  userAgent: string | null
}

export type NoticeOrganization = {
  name: string
  slug: string
  logo: string | null
  color: string | null
}

// "first" is a person's first sign-in at all, which has nothing to compare
// against and so is not news to them.
export type SignInRecognition = "recognised" | "first" | "new"

export type AccountNoticeInput = {
  recipient: NoticeRecipient
  request: NoticeRequest
  // An organization the recipient belongs to, whose settings dialog the mail
  // links to. Null when there is none to send them to.
  organizationSlug: string | null
}

export type MembershipNoticeInput = {
  recipient: NoticeRecipient
  organization: NoticeOrganization
  actorName: string
  at?: Date
}

export type AccountStatusNoticeInput = {
  recipient: NoticeRecipient
  at?: Date
  // An organization they can sign in to again once enabled.
  organizationSlug?: string | null
  // An administrator's own words, shown as written.
  reason?: string | null
}
