import { createHash, randomBytes } from "node:crypto"

// A throwaway relying party for exercising the provider by hand: discovery,
// authorization code with PKCE, token exchange, then the claims that came back.
//
//   bun run oidc --client-id <id> [--client-secret <secret>]
//
// Register the application with http://localhost:4455/callback as a redirect
// URI first. Loopback http is accepted for exactly this reason.

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

const issuer =
  argument("issuer") ??
  process.env.OIDC_ISSUER ??
  "http://localhost:3000/api/auth"
const clientId = argument("client-id") ?? process.env.OIDC_CLIENT_ID
const clientSecret = argument("client-secret") ?? process.env.OIDC_CLIENT_SECRET
const port = Number(argument("port") ?? 4455)
const redirectUri = `http://localhost:${port}/callback`
const scope = argument("scope") ?? "openid profile email roles groups"

if (!clientId) {
  console.error("Missing --client-id")
  process.exit(1)
}

const base64url = (input: Buffer) =>
  input
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")

const verifier = base64url(randomBytes(32))
const challenge = base64url(createHash("sha256").update(verifier).digest())
const state = base64url(randomBytes(16))

const discovery = await fetch(
  `${issuer}/.well-known/openid-configuration`
).then((response) => {
  if (!response.ok) throw new Error(`Discovery failed: ${response.status}`)
  return response.json() as Promise<{
    authorization_endpoint: string
    token_endpoint: string
    userinfo_endpoint?: string
  }>
})

const authorizeUrl = new URL(discovery.authorization_endpoint)
for (const [key, value] of Object.entries({
  response_type: "code",
  client_id: clientId,
  redirect_uri: redirectUri,
  scope,
  state,
  code_challenge: challenge,
  code_challenge_method: "S256",
})) {
  authorizeUrl.searchParams.set(key, value)
}

console.log("\nOpen this in a browser and sign in:\n")
console.log(authorizeUrl.toString())
console.log(`\nWaiting for the redirect on ${redirectUri} ...\n`)

const code = await new Promise<string>((resolve, reject) => {
  const server = Bun.serve({
    port,
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname !== "/callback")
        return new Response(null, { status: 404 })

      const error = url.searchParams.get("error")
      if (error) {
        server.stop()
        reject(
          new Error(`${error}: ${url.searchParams.get("error_description")}`)
        )
        return new Response("Authorization failed. Check the terminal.")
      }

      // Proves the response belongs to the request this process started.
      if (url.searchParams.get("state") !== state) {
        server.stop()
        reject(new Error("state mismatch"))
        return new Response("State mismatch. Check the terminal.")
      }

      const received = url.searchParams.get("code")
      if (!received) {
        server.stop()
        reject(new Error("no code in the redirect"))
        return new Response("No code. Check the terminal.")
      }

      setTimeout(() => server.stop(), 100)
      resolve(received)
      return new Response("Done. You can close this tab.")
    },
  })
})

const body = new URLSearchParams({
  grant_type: "authorization_code",
  code,
  redirect_uri: redirectUri,
  client_id: clientId,
  code_verifier: verifier,
})

const tokenResponse = await fetch(discovery.token_endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    ...(clientSecret && {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    }),
  },
  body,
})

const tokens = (await tokenResponse.json()) as Record<string, string>

if (!tokenResponse.ok) {
  console.error("Token exchange failed:", tokens)
  process.exit(1)
}

console.log("Token response:", Object.keys(tokens).join(", "), "\n")

if (tokens.id_token) {
  const payload = JSON.parse(
    Buffer.from(tokens.id_token.split(".")[1], "base64url").toString()
  )
  console.log("id_token claims:")
  console.dir(payload, { depth: null })
}

if (discovery.userinfo_endpoint && tokens.access_token) {
  const userinfo = await fetch(discovery.userinfo_endpoint, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  })
  console.log(`\nuserinfo (${userinfo.status}):`)
  console.dir(await userinfo.json(), { depth: null })
}

process.exit(0)
