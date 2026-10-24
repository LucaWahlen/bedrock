import type { Instrumentation } from "next"

import { recordRequestError } from "@/features/shared/lib/telemetry/metrics"

export async function register() {
  // Written as a branch, not an early return, so the bundler drops the Node.js
  // only code (database, storage, the OpenTelemetry SDK) from the Edge build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { refuseToStart } =
      await import("@/features/shared/lib/refuse-to-start")
    try {
      const { startNodeRuntime } =
        await import("@/features/shared/lib/start-node-runtime")
      await startNodeRuntime()
    } catch (error) {
      if (process.env.NODE_ENV !== "production") throw error
      refuseToStart(error)
    }
  }
}

// Next.js logs the error itself. This adds a structured line and a metric that
// carry no request path, headers, cookies, body or error message, any of which
// may hold a token or personal data.
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context
) => {
  const routeError = {
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  }
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined

  recordRequestError(error, routeError)
  console.error(
    JSON.stringify({
      event: "request_error",
      ...routeError,
      errorType: error instanceof Error ? error.name : typeof error,
      digest,
    })
  )
}
