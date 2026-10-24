import { DangerZone } from "@/features/organizations/components/organization-settings/danger-zone"
import { ProfileForm } from "@/features/organizations/components/organization-settings/profile-form"
import type {
  Organization,
  OrganizationSettingsCapabilities,
} from "@/features/organizations/types"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"

export function OrganizationSettings({
  organization,
  capabilities,
}: {
  organization: Organization
  capabilities: OrganizationSettingsCapabilities
}) {
  const readOnly = !capabilities.canEditProfile

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        <ProfileForm
          key={[
            organization.id,
            organization.name,
            organization.slug,
            organization.color,
            organization.logo,
            organization.backgroundImage,
            organization.favicon,
          ].join(":")}
          organization={organization}
          disabled={readOnly}
        />
        {(capabilities.canDeleteOrganization || capabilities.canChangeSlug) && (
          <DangerZone organization={organization} capabilities={capabilities} />
        )}
      </div>
    </ScrollArea>
  )
}
