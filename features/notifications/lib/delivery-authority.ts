import { ForbiddenError } from "@/features/shared/lib/authorization-error"

// Only direct, in-process calls can present this identity. A local Symbol
// (unlike Symbol.for) cannot be represented in a Server Action request.
export const deliveryAuthority = Symbol("notification delivery")

export function requireDeliveryAuthority(authority: symbol) {
  if (authority !== deliveryAuthority) throw new ForbiddenError()
}
