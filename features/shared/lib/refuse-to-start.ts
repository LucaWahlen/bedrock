// Next.js reports a failed instrumentation hook but keeps listening, answering
// every request with a 500. A production server with an invalid configuration
// or a failing migration exits instead, so the orchestrator sees it fail to
// start. Node.js only: imported inside the hook's `nodejs` branch.
export function refuseToStart(error: unknown): never {
  console.error("Refusing to start:", error)
  process.exit(1)
}
