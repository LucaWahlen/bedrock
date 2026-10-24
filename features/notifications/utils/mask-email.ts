function maskPart(part: string) {
  return part.length <= 1 ? "*" : `${part[0]}${"*".repeat(3)}`
}

/**
 * Enough of an address for its owner to recognise it, not enough to hand it to
 * whoever else reads the mail: `jane.doe@example.com` becomes `j***@e***.com`.
 */
export function maskEmail(address: string) {
  const at = address.lastIndexOf("@")
  if (at <= 0) return maskPart(address)

  const domain = address.slice(at + 1)
  const dot = domain.lastIndexOf(".")
  const maskedDomain =
    dot > 0
      ? `${maskPart(domain.slice(0, dot))}${domain.slice(dot)}`
      : maskPart(domain)

  return `${maskPart(address.slice(0, at))}@${maskedDomain}`
}
