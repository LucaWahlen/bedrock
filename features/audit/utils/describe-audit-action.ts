import { humanizeLabel } from "@/features/audit/utils/humanize-label"
import type { Translator } from "@/features/shared/lib/i18n/translator"

type AuditTranslator = Translator<"audit">

// Actions are free-form text in the database, so a key is derived rather than
// looked up: `organization.member_added` reads `actions.organization.memberAdded`.
// An action no catalogue knows yet still reads as its humanized English id.
function messageKey(group: string, action: string) {
  const [domain = "", ...rest] = action.split(".")
  const event = rest
    .join("_")
    .replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())

  return `${group}.${domain}.${event}`
}

function translated(t: AuditTranslator, key: string) {
  // The key is built at run time, so its type is only checked by `t.has`.
  const known = key as Parameters<AuditTranslator["has"]>[0]

  return t.has(known) ? (t as (key: string) => string)(key) : null
}

export function describeAuditAction(t: AuditTranslator, action: string) {
  const [domain = "", ...rest] = action.split(".")

  return (
    translated(t, messageKey("actions", action)) ??
    `${humanizeLabel(domain)} ${rest.join(" ").replaceAll("_", " ")}`.trim()
  )
}

// Shown inside a domain group, where repeating the domain is noise.
export function describeAuditActionShort(t: AuditTranslator, action: string) {
  const segments = action.split(".")

  return (
    translated(t, messageKey("actionsShort", action)) ??
    humanizeLabel(segments[segments.length - 1] ?? action)
  )
}

export function describeAuditDomain(t: AuditTranslator, action: string) {
  const domain = action.split(".")[0] ?? action

  return translated(t, `domains.${domain}`) ?? humanizeLabel(domain)
}

// Free-form ids recorded with an event, such as a target type or a metadata
// key: `application_role` reads `details.targets.applicationRole`.
export function describeAuditField(
  t: AuditTranslator,
  group: "targets" | "metadata",
  id: string
) {
  const key = id.replace(/_([a-z0-9])/g, (_, letter: string) =>
    letter.toUpperCase()
  )

  return translated(t, `details.${group}.${key}`) ?? humanizeLabel(id)
}
