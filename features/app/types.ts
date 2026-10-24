// What the signed-in person may reach from the shell of one organization,
// decided on the server and handed to the navigation. Hiding a link is not
// authorization: every page still guards itself.
export const APP_CAPABILITIES = [
  "overview",
  "manageOrganization",
  // A tenant's sign-in policy. Root has none: its members are the instance's.
  "manageAuthentication",
  "viewAuditLog",
  "administerInstance",
] as const

export type AppCapability = (typeof APP_CAPABILITIES)[number]
