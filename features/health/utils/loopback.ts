// Hosts that can only be this machine or a sidecar beside it, such as the
// Mailpit service from `compose.yaml`.
export function isLoopbackHost(host: string) {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "")

  return (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name === "::1" ||
    name.startsWith("127.") ||
    name === "mailpit"
  )
}
