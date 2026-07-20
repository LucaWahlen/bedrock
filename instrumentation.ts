export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureInitialSetup } = await import("@/features/app/lib/initialize")

    await ensureInitialSetup()
  }
}
