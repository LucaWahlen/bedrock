import { mock } from "bun:test"

import { createFormatter, createTranslator } from "next-intl"
import * as nextCache from "next/cache"
import * as nextServer from "next/server"

// Every Server Action resolves its caller from the request through
// `getAccessContext()`, which reads `headers()`. Outside Next there is no
// request, so this stands one in: the module mocks below hand Next's request
// APIs a cookie for a real session, and Better Auth then reads that session
// exactly as it would in production. Nothing about authorization is stubbed.
//
// Preloaded through `bunfig.toml`, so the mocks are in place before any test
// file loads an action, and every file shares the same stand-in request.

// Unique to this run and recorded on every audit event the stand-in request
// produces, so cleanup can find the ones that name nobody it created, such as
// an anonymous caller's refusal.
export const TEST_USER_AGENT = `bun-test/${crypto.randomUUID()}`

let cookieHeader: string | null = null
const cookieJar = new Map<string, string>()
// Further request headers, such as `accept-language`, until the next `actAs` or
// `browse`.
const extraHeaders = new Map<string, string>()
// Set by `browse`: the jar is then sent back on every request, as a browser
// would, for flows that span more than one request.
let sendsCookieJar = false

function requestHeaders() {
  const headers = new Headers({ "user-agent": TEST_USER_AGENT })
  for (const [name, value] of extraHeaders) headers.set(name, value)
  const cookies = [
    ...(cookieHeader ? [cookieHeader] : []),
    ...(sendsCookieJar
      ? Array.from(
          cookieJar,
          ([name, value]) => `${name}=${encodeURIComponent(value)}`
        )
      : []),
  ]
  if (cookies.length > 0) headers.set("cookie", cookies.join("; "))

  return headers
}

type Cookie = { name: string; value: string }

type CookieOptions = { maxAge?: number; expires?: Date | number | string }

const nameOf = (cookie: string | Cookie) =>
  typeof cookie === "string" ? cookie : cookie.name

// What Better Auth's `nextCookies` plugin writes to after a call that sets a
// cookie. Read back only under `browse`; otherwise the session cookie from
// `actAs` is what identifies a caller.
function cookieStore() {
  const entries = () =>
    Array.from(cookieJar, ([name, value]): Cookie => ({ name, value }))

  const store = {
    get: (cookie: string | Cookie) =>
      entries().find((entry) => entry.name === nameOf(cookie)),
    getAll: (cookie?: string | Cookie) =>
      cookie
        ? entries().filter((entry) => entry.name === nameOf(cookie))
        : entries(),
    has: (name: string) => cookieJar.has(name),
    set: (...args: [string, string, CookieOptions?] | [Cookie]) => {
      const [name, value, options] =
        typeof args[0] === "string"
          ? [args[0], String(args[1]), args[2] as CookieOptions | undefined]
          : [args[0].name, args[0].value, undefined]
      // How Better Auth expires a cookie, which a browser takes as deleting it.
      const expired =
        (options?.maxAge !== undefined && options.maxAge <= 0) ||
        (options?.expires !== undefined &&
          new Date(options.expires).getTime() <= Date.now())
      if (expired) cookieJar.delete(name)
      else cookieJar.set(name, value)

      return store
    },
    delete: (cookie: string | Cookie) => {
      cookieJar.delete(nameOf(cookie))

      return store
    },
  }

  return store
}

mock.module("next/headers", () => ({
  headers: async () => requestHeaders(),
  cookies: async () => cookieStore(),
  draftMode: async () => ({ isEnabled: false, enable() {}, disable() {} }),
}))

// `after` defers work past the response, and there is no response here. What it
// schedules is held until a test runs it with `runDeferred`, such as the notices
// a mutation sends, or discards it; a suite that does neither never sees it.
let deferred: (() => unknown)[] = []

mock.module("next/server", () => ({
  ...nextServer,
  after: (task: Promise<unknown> | (() => unknown)) => {
    deferred.push(typeof task === "function" ? task : () => task)
  },
}))

// Runs everything scheduled with `after` since the last run or discard, as the
// end of a response would.
export async function runDeferred() {
  const tasks = deferred
  deferred = []
  await Promise.allSettled(tasks.map(async (task) => task()))
}

export function discardDeferred() {
  deferred = []
}

// next-intl's server functions find `i18n/request.ts` through an alias the Next
// plugin installs, and outside the `react-server` condition they refuse to run
// at all. These run the real request config instead, so a test resolves its
// locale exactly as a request would: English unless the stand-in request or
// its user says otherwise.
async function requestConfig(locale?: string) {
  const { default: createRequestConfig } = await import("@/i18n/request")
  return createRequestConfig({
    locale: locale as Parameters<typeof createRequestConfig>[0]["locale"],
    requestLocale: Promise.resolve(undefined),
  })
}

type IntlOptions = { locale?: string; namespace?: string } | string | undefined

function intlOptions(options: IntlOptions) {
  return typeof options === "string" ? { namespace: options } : (options ?? {})
}

mock.module("next-intl/server", () => ({
  getRequestConfig: <T>(create: T) => create,
  getLocale: async () => (await requestConfig()).locale,
  getMessages: async (options?: { locale?: string }) =>
    (await requestConfig(options?.locale)).messages,
  getTranslations: async (options: IntlOptions) => {
    const { locale, namespace } = intlOptions(options)
    const config = await requestConfig(locale)
    return createTranslator({
      locale: config.locale,
      messages: config.messages ?? undefined,
      formats: config.formats ?? undefined,
      namespace: namespace as never,
    })
  },
  getFormatter: async (options?: { locale?: string }) => {
    const config = await requestConfig(options?.locale)
    return createFormatter({
      locale: config.locale,
      formats: config.formats ?? undefined,
    })
  },
  getNow: async () => new Date(),
  getTimeZone: async () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  setRequestLocale: () => {},
}))

// Sets a header on every following request, until the next `actAs` or
// `browse`. `null` removes it.
export function setRequestHeader(name: string, value: string | null) {
  if (value === null) extraHeaders.delete(name.toLowerCase())
  else extraHeaders.set(name.toLowerCase(), value)
}

// Revalidation needs Next's request store and has nothing to invalidate here.
mock.module("next/cache", () => ({
  ...nextCache,
  refresh: () => {},
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
}))

const sessionCookies = new Map<string, string>()

async function sessionCookieFor(userId: string) {
  const known = sessionCookies.get(userId)
  if (known) return known

  // Loaded lazily so Better Auth sees the mocks above when it first loads.
  const [{ auth }, { makeSignature }] = await Promise.all([
    import("@/features/auth/lib/auth"),
    import("better-auth/crypto"),
  ])
  const context = await auth.$context
  const session = await context.internalAdapter.createSession(userId)
  if (!session) throw new Error(`Could not create a session for ${userId}`)

  // The same signed cookie Better Auth sets on sign-in.
  const signature = await makeSignature(session.token, context.secret)
  const cookie = `${context.authCookies.sessionToken.name}=${session.token}.${signature}`
  sessionCookies.set(userId, cookie)

  return cookie
}

// Every following call runs as this user, through a real session row, until
// the next `actAs`. `null` is a visitor without a session.
//
// `keepCookies` also sends back whatever the calls set, as `browse` does, for a
// signed-in flow that spans requests, such as adding a passkey.
export async function actAs(
  person: { id: string } | null,
  { keepCookies = false }: { keepCookies?: boolean } = {}
) {
  cookieJar.clear()
  extraHeaders.clear()
  sendsCookieJar = keepCookies
  cookieHeader = person ? await sessionCookieFor(person.id) : null
}

// A fresh visitor whose browser keeps every cookie a response sets and sends it
// back, so a sign-in can carry its own state from one step to the next.
export function browse() {
  cookieJar.clear()
  extraHeaders.clear()
  sendsCookieJar = true
  cookieHeader = null
}

// The cookies the browser from `browse` currently holds.
export function browserCookies() {
  return new Map(cookieJar)
}

// Sessions are deleted with their users, so cleanup only has to forget the
// cookies that pointed at them.
export function forgetSessions(userIds: Iterable<string>) {
  for (const userId of userIds) sessionCookies.delete(userId)
  cookieHeader = null
}
