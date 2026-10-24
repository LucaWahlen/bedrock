import { readSync } from "node:fs"

const NEWLINE = 0x0a

function readByte(buffer: Buffer) {
  for (;;) {
    try {
      return readSync(0, buffer, 0, 1, null)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "EOF") return 0
      if (code !== "EAGAIN") throw error
      // Non-blocking stdin with nothing to read yet.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
  }
}

/**
 * Asks a question and reads one line from stdin, synchronously, like Bun's
 * `prompt()`. Node.js has no `prompt()`, and the bundled CLI in the image runs
 * under Node.js. Returns null when stdin is closed before anything was typed.
 */
export function prompt(question: string) {
  process.stdout.write(`${question} `)

  const buffer = Buffer.alloc(1)
  const bytes: number[] = []
  for (;;) {
    if (readByte(buffer) === 0) {
      if (bytes.length === 0) return null
      break
    }
    if (buffer[0] === NEWLINE) break
    bytes.push(buffer[0] ?? 0)
  }

  return Buffer.from(bytes).toString("utf8").replace(/\r$/, "")
}
