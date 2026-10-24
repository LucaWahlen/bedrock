// Shared through `globalThis` because Next.js may load the instrumentation
// hook and the route handlers as separate module instances in one process.
const state = globalThis as typeof globalThis & {
  bedrockStartupComplete?: boolean
}

/** Migrations, if enabled, and the initial setup have both finished. */
export function markStartupComplete() {
  state.bedrockStartupComplete = true
}

export function isStartupComplete() {
  return state.bedrockStartupComplete === true
}
