# Bedrock

Guidance for anyone, human or coding agent, changing this repository. The
README covers running and deploying Bedrock; this file covers how the code is
meant to be changed.

Bedrock is a self-hosted, multi-organization identity platform and OpenID
Provider. A single global user account can belong to several organizations.
Each tenant organization owns its branding, members, groups, applications,
roles and sign-in policy. One root organization administers the instance.

## Stack

- Next.js 16 App Router and React 19, built as a standalone server. Route
  parameters are promises, and `proxy.ts` is the request interception
  convention.
- Better Auth with the organization, two-factor, passkey, JWT and OAuth
  provider plugins, on the Drizzle adapter.
- PostgreSQL 16+ with Drizzle ORM. The schema lives in
  `features/shared/lib/db/schema.ts`.
- Tailwind CSS 4 and local shadcn components on Base UI under
  `features/shared/components/ui`; charts are shadcn's `chart` over recharts.
- next-intl for English and German.
- Any S3-compatible object storage; MiniStack locally.
- Optional OpenTelemetry over OTLP.
- Bun is the package manager (`bun.lock`). Use `bun run <script>` and
  `bun add`.

Next.js 16 and Better Auth 1.7 differ from older releases in ways that matter.
Before changing framework or authentication behavior, read the relevant local
documentation in `node_modules/next/dist/docs/` and the installed Better Auth
types. Do not rely on remembered APIs.

## Product and security invariants

- Users are instance-wide identities. Do not duplicate users per organization.
- Organization-owned data must carry an immutable `organizationId`. Resolve a
  URL slug to an ID once, then scope every tenant query and mutation by that ID.
- There is exactly one root organization, enforced by the partial unique index
  on `organization.isRoot`. Only bootstrap code may create it. Its name, slug,
  colour and branding come from `features/shared/lib/config/env.ts` and the
  files shipped in `public/`, seeded once when the row is first created. They
  are not editable afterwards: root has no settings page, and
  `updateOrganization` refuses an organization with `isRoot`. Recovery is
  `bun run admin`, deliberately outside the web application.
- The root organization has two roles: `owner` and `admin`, and no plain
  members. Every root owner has equal authority. Both roles can create tenant
  organizations and administer root's own membership; only owners can grant or
  revoke root ownership, or otherwise change the root organization.
- Root administration is a server-side authorization capability derived from a
  current root membership, not merely a route, slug, `isRoot` flag, or visible
  navigation item. Recheck that membership for every global operation.
- Never remove or demote the final root owner. Adding, removing, promoting, or
  demoting a root member requires a root owner and an audit event.
- Tenant access requires a fresh server-side membership and permission check.
  A cookie, client state, hidden UI, or `session.activeOrganizationId` is not an
  authorization decision.
- `proxy.ts` may perform optimistic redirects only. Keep secure authorization
  in Server Components, Server Actions, Route Handlers, or domain services.
- Never accept an organization ID, role, owner ID, storage key, redirect URI,
  or permission from the client without validating it against the session and
  persisted tenant state.
- Prevent the last owner of any organization from being removed or demoted.
- Suspension is the instance's sanction alone: only a root administrator may
  impose or lift one, and while it is in force nobody may enter the
  organization, its owners included.
- Deletion is immediate and an owner's own last word, so root may join them in
  it but no one else. The organization stops existing for everyone who belongs
  to it at once, and every tenant-facing route answers 404 rather than
  explaining itself. Only a root administrator can still see it, in the
  organizations table, and only they can restore it; housekeeping purges it
  once `ORGANIZATION_RETENTION_DAYS` have passed.
- A disabled account (`user.disabledAt`) is nobody: `getAccessContext` returns
  no user, the session-create hook refuses every sign-in path, and OIDC claims
  refuse it. Only root administration disables or enables one, never oneself,
  and never the last active root owner.
- A tenant with `requireTwoFactor` grants nothing to a member without TOTP or a
  passkey: `membershipIn` returns null for them, so every guard built on it
  refuses, while `heldMembershipIn` lets routing send them to
  `/org/[slug]/setup-security`.
- Since root membership grants nothing inside a tenant, no one in the product
  can restore a tenant that has lost every owner. `bun run admin` is the
  recovery path, for that and for root itself, and it is deliberately outside
  the web application.

## Audit log

- Record security-relevant mutations in an append-only audit log, including
  actor, organization, action, target, outcome, and timestamp. Avoid secrets
  and sensitive tokens in logs.
- Every subject on an event is two separate things. The **statement** is what
  was true when it happened, written once and never re-read from elsewhere. The
  **reference** is the id, resolved against the subject as it stands now.
- Denormalise facts, never decoration. A name and a slug are part of what
  happened; a logo is not. Facts are recorded on the event, decoration is
  resolved live, and the avatar colour is seeded by the immutable id.
- Statement and reference never substitute for each other. Any `recorded ?? live`
  is a fallback for rows written before a column existed, not the rule.
- Resolving a reference has exactly three outcomes: it matches, so show the
  statement alone; it differs, so show the statement and disclose the current
  identity beside it; or it does not resolve, so show the statement with a
  deleted marker.
- Audit references are plain columns, not foreign keys. `on delete set null`
  would rewrite history, which contradicts an append-only table.
- Retention is opt-in and time-bounds the personal data an event keeps. Set it
  in production, since it is what makes retaining a deleted user's name and
  email defensible.

## Architecture boundaries

- `app/` owns routing, layouts, metadata, and HTTP boundaries. Keep business
  rules out of route files and layouts.
- `features/auth/` owns Better Auth configuration, clients, and auth schemas.
- `features/app/` owns the authenticated shell: sidebar, navigation, user
  menu, and the overview, usage and health pages that compose other features.
  Domain workflows live in their own features (`account`, `organizations`,
  `applications`, `groups`, `audit`, `usage`, `health`, `notifications`).
- `features/shared/` owns reusable UI and infrastructure such as database,
  configuration, and storage clients. It must not depend on feature UI.
- Prefer server code for data access. Mark the smallest interactive component
  with `"use client"` and pass only the data it needs.
- Export a feature's public surface through its `index.ts`; avoid reaching into
  another feature's private component tree when a public export is suitable.

### Feature structure

Product and domain features follow this structure:

```text
features/<feature>/
├── index.ts
├── types.ts
├── actions/
│   ├── one-action-per-file.ts
│   └── another-action.ts
├── components/
├── schemas/       # optional; Zod and other validation schemas
├── lib/           # optional; feature configuration and non-query internals
└── utils/         # optional; pure helpers without database or auth access
```

- Do not create `actions/index.ts`. Re-export public actions from the feature's
  root `index.ts` alongside its public components and types.
- Inside a feature, import that feature's files directly. Outside a feature,
  including from `app/` or another feature, import only from the feature's root
  barrel, for example `@/features/app`. `features/shared/` is exempt and may be
  imported directly at any depth because it has no root barrel.
- Same-feature direct imports use the existing `@/features/<feature>/...`
  aliases, not relative paths. The Oxlint `boundaries/dependencies` rule
  enforces this boundary generically for every feature without feature-specific
  configuration.
- Keep one exported Server Action per file in most cases. Name the file after
  the action using kebab-case.
- Every file in `actions/` starts with `"use server"`. This includes read-only
  queries used by Server Components, not only mutations called by clients.
- Put every executed Drizzle query and Better Auth API operation in an action
  file owned by the relevant feature. Components, layouts, pages, route
  handlers, `lib/`, and `utils/` must not execute them directly.
- Database and Better Auth setup remain in `lib/`: creating the Drizzle client,
  declaring schema, configuring `betterAuth`, and adapting its catch-all HTTP
  handler are infrastructure, not executed application queries.
- Route Handlers retain HTTP-specific work such as parsing requests, returning
  status codes, redirects, presigned upload responses, and streaming. Delegate
  authentication, authorization, and persisted-data operations through the
  owning feature's root barrel.
- Put schemas shared by a component and action in the feature's `schemas/`
  folder. Put browser-safe, side-effect-free transformations in `utils/`.
- Keep action inputs and serializable result types in the feature's top-level
  `types.ts`; action modules export only their async action function.
- Reads throw; mutations return `ActionResult` from `features/shared/types.ts`.
  A read is consumed by a Server Component, which can only redirect or fail, so
  a thrown error is the useful outcome. A mutation is invoked from a client
  handler that has to tell the user why it failed, and Next.js replaces thrown
  messages with a generic one in production. Only expected failures become
  values; unexpected ones still throw.
- A mutation that changes what any page shows calls `revalidateEverywhere()`
  from `features/shared/lib/revalidate.ts` after it commits, never `refresh()`,
  which re-renders only the page that made the change and leaves every other
  page in the client cache stale.
- Validate untrusted input and recheck authentication and authorization inside
  every action. Return only the minimal serializable data its caller needs.
- Do not create empty placeholder directories or files. Infrastructure-only
  areas such as `features/shared/` add `actions/` or `types.ts` only when they
  have real shared actions or types.

## Authentication and authorization

- `features/auth/lib/auth.ts` is the Better Auth server configuration. Its
  catch-all HTTP router is not mounted: authentication runs through Server
  Actions calling `auth.api`, and only the OIDC endpoints have explicit route
  files under `app/api/auth/`. Do not mount more of it without a reason.
- Every sign-in path (password, two-factor completion, passkey, invitation)
  finishes through the shared gate in `features/auth/lib/finish-sign-in.ts`,
  which applies membership, suspension, disabled-account and required
  two-factor rules, audits the attempt and sends the new-device notice.
- `app/org/[slug]/(app)/layout.tsx` authenticates users and verifies
  membership. Preserve this route-level guard, but enforce permissions again at
  each mutation and sensitive read.
- Organization creation uses a Server Action and is also guarded by Better
  Auth's `allowUserToCreateOrganization`. Keep it restricted to current members
  of the root organization.
- Model authorization as typed capabilities computed on the server
  (`features/app/lib/app-capabilities.ts`) and checked by server helpers. Do
  not spread string comparisons such as `role === "owner"` through the UI.
- Treat root permissions and tenant permissions as separate scopes. A tenant
  owner is not automatically an instance administrator.
- Root membership confers no authority inside a tenant. Someone who administers
  the instance and also belongs to a tenant acts there with that tenant's role
  and nothing more, so a root administrator who is a plain member elsewhere can
  do only what any member can.
- OIDC sessions and token claims use actual tenant memberships and permissions;
  they never inherit root administrative elevation.
- Return `401` for no valid session, `403` for insufficient permission, and
  `404` when concealing a tenant resource is appropriate.

## Database changes

- Define tables, constraints, relations, and indexes with Drizzle. Add foreign
  keys and uniqueness constraints for invariants that must survive concurrent
  requests.
- Generate and commit migrations with `bun run db:generate --name <change>`;
  apply them with `bun run db:migrate`. Use `db:push` only for disposable local
  databases.
- Migrations are a public contract once released: never edit or squash one
  that has shipped in a tagged release. Add a new migration instead.
- Migrations run on server start under a Postgres advisory lock, while
  replicas of the previous version are still serving. Every migration must be
  safe under the old code: additive first, destructive in a later release.
- Prefer explicit, organization-scoped query functions over exporting raw
  tenant tables into UI code. Transactions must preserve ownership and audit
  invariants.

## Branding and media

- Organization branding is untrusted input. Validate media type, size, color,
  and resulting public URL on the server.
- Uploads happen before the record they belong to is saved, so they land in a
  short-lived, user-owned staging prefix and are moved to the organization's
  or user's own prefix when the save succeeds. Abandoned staging objects are
  cleaned up by a bucket lifecycle rule.
- Deletion and replacement must prove that the requested object belongs to the
  authorized organization. Never delete an arbitrary client-provided key.
- Preserve accessible contrast and usable fallbacks when applying tenant
  branding.

## OIDC applications

- Use the installed Better Auth OIDC provider support or another maintained,
  standards-compliant implementation. Do not hand-roll OAuth/OIDC protocol
  validation, discovery, token signing, PKCE, or refresh-token behavior.
- There is one issuer per instance, `${BETTER_AUTH_URL}/api/auth`, and `sub` is
  the global user id. The organization travels as `urn:bedrock:organization`,
  roles as `urn:bedrock:roles` (direct and via groups, limited to the
  requesting application) and groups as `urn:bedrock:groups`. These are
  long-lived external contracts: never rename a claim, scope or role/group key.
- Only the authorization code grant with PKCE is offered; dynamic client
  registration is off.
- OIDC applications belong to an organization. Store exact redirect URI
  allowlists and validate them server-side; never allow wildcard or prefix
  matching for production clients.
- Generate client secrets with a cryptographically secure source, display them
  once, store only a hash where protocol support permits, and support rotation
  and revocation. Never log secrets or return them from list endpoints.
- Derive token claims and scopes from current persisted membership and policy,
  not from client-provided values or stale UI state.

## UI conventions

- Preserve the existing shadcn/Base UI patterns and organization-aware visual
  language. Use Lucide icons for familiar actions and existing primitives
  before adding a new component library.
- Cards have a plain background; no decorative gradients.
- Root-only and tenant-only navigation may differ, but hiding navigation is not
  authorization. Render controls from server-provided capabilities where
  practical.
- Keep forms backed by shared Zod schemas when the same data crosses client and
  server boundaries. Surface field errors and pending states accessibly.
- Every menu item has a Lucide icon and a verb label ("Change role", "Manage
  members"), never a bare noun and never a trailing ellipsis. Row-action menus
  size to their content (`w-auto min-w-48 whitespace-nowrap`), so no label
  wraps.
- Dialogs and panels must not flicker or shift on open. Render the form at
  once and disable only the submit until async data arrives; do not swap a
  skeleton for content of a different size, and do not wrap dialog content in
  `{open && …}`, which cuts the close animation.
- Cancel sits in the footer beside the submit button, never inline in the form
  body.
- Scrollable regions use the shadcn `ScrollArea`, never a native scrollbar;
  dialogs scroll their body between a fixed header and footer.
- A list the user enters, such as redirect URIs, is one input per item with add
  and remove buttons and its own error. Never ask for comma- or line-separated
  text.
- Server code must never import a client-only module. Shared search-param
  parsers come from `nuqs/server`; anything reachable from a feature barrel is
  potentially server code.

## Internationalization

next-intl, English and German, without i18n routing: no locale in any URL.
`i18n/request.ts` resolves each request: `user.locale`, then the `NEXT_LOCALE`
cookie, then `Accept-Language`, then `en`. Locales, their native names and
flag countries live only in `features/shared/lib/i18n/config.ts`; render a
language with `LocaleLabel` from `features/shared/components/locale-flag.tsx`.

- Never hard-code user-visible text: UI, metadata, toasts, action errors,
  validation messages and mail. Audit `reason`s and other recorded statements
  stay English; they are facts, not interface.
- Messages are `messages/{en,de}/<namespace>.json`, one namespace per feature:
  `common`, `app`, `auth`, `account`, `organizations`, `applications`,
  `groups`, `audit`, `usage`, `health`, `notifications`, `emails`. Edit only
  your feature's pair; `common` holds generic actions and states and is not
  extended casually. A new namespace is a file pair plus a line in
  `features/shared/lib/i18n/messages.ts`.
- Keys are camelCase and nested by screen or component, then element:
  `login.title`, `overview.stats.members`, `errors.invalidCredentials`. Use ICU
  arguments (`{count, plural, one {# member} other {# members}}`,
  `{count, number}`) and rich tags (`<link>Sign up</link>` with `t.rich`),
  never string concatenation. Build `t.rich` tag renderers outside the
  component (see `linkTo` in the login form).
- English is the source of truth and types every key and argument through
  `AppConfig`; `bun run i18n:check` requires the same keys, arguments and tags
  in German, none empty. German uses du, concise product German.
- Client Components: `useTranslations("<namespace>")`, `useFormatter()`,
  `useLocale()` from `next-intl`. Server Components: the same hooks when
  synchronous, `getTranslations`, `getFormatter` and `getLocale` from
  `next-intl/server` when async, in `generateMetadata`, and in actions.
- Server Actions translate their own expected failures with
  `getTranslations`, so `ActionResult.error` is a finished string.
- Shared Zod schemas are factories taking a translator:
  `createLoginSchema(t: Translator<"auth">)`, called with
  `useMemo(() => createLoginSchema(t), [t])` in the form and
  `createLoginSchema(await getTranslations("auth"))` in the action. Every rule
  passes its message; Zod's English defaults are never shown. Infer types with
  `z.infer<ReturnType<typeof createLoginSchema>>`.
- Dates and numbers go through `format.dateTime(value, "date" | "dateTime" |
"preciseDateTime")`, `format.number` and `format.relativeTime`; never
  `Intl.*Format` or `toLocale*` directly.
- Mail: pick the language with `emailLocale(recipient.locale, sender.locale)`
  from `features/shared/lib/email/locale.ts`, pass `locale` to the template,
  and translate inside it with `translatorFor(locale, "emails.<template>")`.
  `verify-email.tsx` is the reference.
- Tests run the real request config through the harness: English by default,
  `setRequestHeader("accept-language", "de")` or a stored `user.locale` for
  German.

## Validation

Run the narrowest relevant check after each change, then the full suite before
finishing substantial work. CI runs the same steps on every push and pull
request:

```bash
bun run typecheck
bun run lint
bun run format:check
bun run i18n:check
bun run test        # needs the compose.yaml database
bun run build
```

`bun run test` drives real Server Actions against the development database
through the harness in `tests/support/` (`createFixture`, `actAs`, the captured
mail `outbox`), and every test removes the rows it creates. For authorization,
membership, organization, storage ownership or OIDC work, add focused tests in
the same change. At minimum cover two users and two organizations, and prove
the allowed path as well as denied cross-tenant reads and writes.

After a change that affects rendering, load the affected page on a running dev
server: the test suite does not start Next.js, so a client-only import reaching
server code, for example, only shows up there.

## Change discipline

- Keep changes inside the owning feature and avoid unrelated refactors.
- Update `README.md`, `.env.example`, `deploy/docker/` and `deploy/kubernetes/`
  when setup, environment variables, storage behavior or deployment steps
  change.
- This repository is public. Never commit credentials, real hostnames or
  personal data, not even in tests or scratch files; use `example.com`,
  `example.test` and obviously fake values.
- Do not expose development defaults in production. `env.ts` refuses a
  placeholder `BETTER_AUTH_SECRET` when `NODE_ENV=production`; keep it that way.
- Do not weaken tenant checks to make a UI flow pass. Fix the ownership or
  authorization boundary instead.

## Releases

- Versions follow semantic versioning; `0.x` releases may change behavior
  between minors, but never the OIDC contract above or a shipped migration.
- The release is one image, `ghcr.io/lucawahlen/bedrock`: the server plus the
  `bedrock admin | migrate | housekeep` CLI bundled for Node.js. A push to
  `main` publishes `edge` and `sha-<short>`. Tagging `vX.Y.Z` publishes
  `X.Y.Z`, `X.Y` and `latest` (amd64 and arm64) and creates a GitHub Release; a
  prerelease tag such as `v0.2.0-beta.1` publishes only itself.
- Bump `version` in `package.json` in the same commit that is tagged.
