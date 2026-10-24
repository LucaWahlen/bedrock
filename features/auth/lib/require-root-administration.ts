import { getAccessContext } from "@/features/auth/actions/get-access-context"
import type { AccessContext } from "@/features/auth/types"
import { isRootAdministrator } from "@/features/auth/utils/access"
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"

// The guard every instance-wide read shares. It distinguishes no session from
// insufficient standing, which a Server Component turns into 401 and 403.
export async function requireRootAdministration(
  cannot: string
): Promise<AccessContext> {
  const access = await getAccessContext()
  if (!access.user) throw new UnauthorizedError()
  if (!isRootAdministrator(access)) throw new ForbiddenError(cannot)

  return access
}
