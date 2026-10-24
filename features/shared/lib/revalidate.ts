import { revalidatePath } from "next/cache"

// Called by every mutation instead of `refresh()`, which only re-renders the
// page that made the change. A group renamed on the Groups page has to read the
// same on Members, so the whole client cache is purged and every page is
// rendered afresh on its next visit. Nothing here is cached on the server, so
// that is the only cache there is to clear.
export function revalidateEverywhere() {
  revalidatePath("/", "layout")
}
