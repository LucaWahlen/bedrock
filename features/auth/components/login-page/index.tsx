import { AuthShell } from "@/features/auth/components/auth-shell"
import { LoginForm } from "@/features/auth/components/login-page/form"
import type { LoginOrganization } from "@/features/auth/types"

export function LoginPage({
  organization,
  allowSignUp,
}: {
  organization?: LoginOrganization
  allowSignUp?: boolean
}) {
  return (
    <AuthShell organization={organization}>
      <LoginForm organization={organization} allowSignUp={allowSignUp} />
    </AuthShell>
  )
}
