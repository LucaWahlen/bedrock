// Labels come from free-form ids: metadata keys are camelCase, action and
// target segments are snake_case.
export function humanizeLabel(value: string) {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()

  return words.charAt(0).toUpperCase() + words.slice(1)
}
