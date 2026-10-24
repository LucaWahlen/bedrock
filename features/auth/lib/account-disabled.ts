import { APIError } from "better-auth/api"

// The same words on every way in, so no sign-in path says more than another
// about why the account was disabled or by whom. Sign-in actions show the
// translated `auth.errors.accountDisabled`; this English text is what Better
// Auth and the OIDC error response carry.
export const ACCOUNT_DISABLED_MESSAGE =
  "This account is disabled. Contact your administrator."

const ACCOUNT_DISABLED_CODE = "ACCOUNT_DISABLED"

// Thrown from the session hook, after the credential has been checked, so a
// wrong password still reads as a wrong password and only its owner learns the
// account is disabled.
export function accountDisabledError() {
  return new APIError("FORBIDDEN", {
    code: ACCOUNT_DISABLED_CODE,
    message: ACCOUNT_DISABLED_MESSAGE,
  })
}

export function isAccountDisabledError(error: APIError) {
  return error.body?.code === ACCOUNT_DISABLED_CODE
}
