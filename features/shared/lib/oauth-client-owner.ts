import { AsyncLocalStorage } from "node:async_hooks"

// The OAuth provider plugin resolves client ownership from the session alone,
// and one session row holds one `activeOrganizationId`. That cannot describe a
// user with two tabs open in two organizations, so the owning organization is
// carried per request instead. Absence is a refusal, never a fallback.
const ownerStorage = new AsyncLocalStorage<string>()

export function withOAuthClientOwner<T>(
  organizationId: string,
  run: () => Promise<T>
): Promise<T> {
  return ownerStorage.run(organizationId, run)
}

export function currentOAuthClientOwner(): string | undefined {
  return ownerStorage.getStore()
}
