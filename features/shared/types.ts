// Mutations return their expected failures; unexpected ones still throw.
export type ActionResult = { success: true } | { success: false; error: string }

// A read consumed by a Server Component throws, because failing the render is
// the useful outcome. A read a client component calls itself has to return its
// expected failures instead: Next.js replaces a thrown message with a generic
// one in production, so there would be nothing to tell the user.
export type QueryResult<TData> =
  | { success: true; data: TData }
  | { success: false; error: string }
