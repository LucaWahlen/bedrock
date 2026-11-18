import { config } from "zod"

// Production CSP forbids eval(); without jitless, Zod probes `new Function("")`
// on schema creation and browsers report a script-src violation despite the catch.
config({ jitless: true })
