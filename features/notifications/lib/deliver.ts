import { after } from "next/server"

/**
 * Sends once the response is on its way, so a notice never delays, fails or
 * undoes what it reports. Callers schedule it only after their transaction has
 * committed. Outside a request, such as in an administration script, `after`
 * has nothing to wait for and the send simply starts.
 */
export function deliverAfterResponse(send: () => Promise<unknown>) {
  const run = async () => {
    try {
      await send()
    } catch (error) {
      console.error(
        "[notifications] A notice could not be delivered",
        error instanceof Error ? error.message : error
      )
    }
  }

  try {
    after(run)
  } catch {
    void run()
  }
}
