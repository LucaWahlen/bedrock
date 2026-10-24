import { toast } from "sonner"

// What the toast says either way. Translate it where the hooks are, such as
// `t("clipboard.copied", { label })` from `common`. A bare string is the
// legacy English label.
export type ClipboardMessages = { copied: string; failed: string }

// `navigator.clipboard` is missing outside secure contexts, so the failure path
// covers an absent API as well as a denied permission.
export async function copyToClipboard(
  value: string,
  label: string | ClipboardMessages
) {
  const messages =
    typeof label === "string"
      ? { copied: `${label} copied`, failed: `${label} could not be copied` }
      : label

  try {
    await navigator.clipboard.writeText(value)
    toast.success(messages.copied)
  } catch {
    toast.error(messages.failed)
  }
}
