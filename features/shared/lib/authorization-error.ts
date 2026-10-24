// Reads throw, so the thrown value is what tells a caller which response to
// give. Without these every denial is indistinguishable from a genuine fault.
export class UnauthorizedError extends Error {
  readonly name = "UnauthorizedError"

  constructor(message = "Authentication is required") {
    super(message)
  }
}

export class ForbiddenError extends Error {
  readonly name = "ForbiddenError"

  constructor(message = "You do not have access to this resource") {
    super(message)
  }
}
