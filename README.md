# Bedrock

Self-hosted identity for teams that run more than one organization. Bedrock is
a multi-tenant account system and OpenID Connect provider: one person, one
account, as many organizations as they belong to, each with its own branding,
members, applications and sign-in policy.

> **Beta.** Bedrock is usable and covered by an extensive test suite, but it has
> not had an external security review yet. Expect rough edges between `0.x`
> releases.

## Features

- **Organizations**: tenants with their own branding, members, invitations,
  public sign-up and suspension or deletion by the instance administrators.
- **OpenID Connect provider**: register applications per organization, with
  exact redirect URIs, hashed client secrets, consent and claims for the
  organization, roles and groups.
- **Roles and groups**: application roles assigned directly or through groups,
  shown as effective access everywhere and carried in tokens.
- **Sign-in**: passwords (checked against Have I Been Pwned), email
  confirmation, TOTP two-factor with backup codes, and passkeys. Organizations
  can require a second factor.
- **Accounts**: profile, password, email change, sessions and deletion in one
  settings dialog; root administrators can disable accounts.
- **Audit log, usage and health**: an append-only audit log, usage analytics
  per organization and instance, and a health page for operators.
- **Notifications**: security and membership emails in the recipient's
  language. The interface is available in English and German.
- **Operations**: container images for amd64 and arm64, Kubernetes manifests,
  readiness and liveness endpoints, optional OpenTelemetry.

## Quick start

Requirements: [Bun](https://bun.sh) 1.3 and Podman or Docker.

```bash
podman compose up -d          # Postgres, S3 (MiniStack) and Mailpit
cp .env.example .env          # works as is with the compose services
bun install
bun run db:migrate
bun run dev
```

Open http://localhost:3000 and sign in with `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` from `.env`. Mail sent locally lands in Mailpit at
http://localhost:8025.

The repository ships a [dev container](.devcontainer/) with Bun, opencode and
the Podman client. It starts the Compose stack on create through the host Podman
socket, so `bun run db:migrate` and `bun run dev` work straight away; copy
`.env.example` to `.env` first.

To run Bedrock in production, see [Deployment](#deployment),
[`deploy/docker`](deploy/docker/) and [`deploy/kubernetes`](deploy/kubernetes/). Every setting is documented in
[`.env.example`](.env.example). Contributors, and coding agents, should read
[`AGENTS.md`](AGENTS.md) first.

## Database migrations

Schema changes are committed under `drizzle/` and applied with:

```bash
bun run db:migrate
```

In production the server applies pending migrations itself when it starts,
before it serves, with drizzle-orm's migrator and the `drizzle/` folder shipped
in the image. It holds a Postgres advisory lock while it does, so with several
replicas one migrates and the others wait, then find nothing to do. A failing
migration stops the server with a non-zero exit; a database that is not
reachable yet is retried in the background, and `/api/ready` answers 503 until
both migrations and the initial setup have finished.

```env
# Defaults to true in production and false in development, where
# `bun run db:migrate` applies them. Set false to run `bedrock migrate`
# (`bun run db:migrate:deploy` from a checkout) yourself, which takes the same
# lock.
MIGRATE_ON_START=true
```

Because a new version migrates while the previous one is still serving, every
migration must be safe to run under the old code: additive first, destructive
in a later release. Keep `bun run db:push` for disposable local databases only.

## Object storage

Organization logos, background images, and favicons are uploaded directly from
the browser to a user-owned staging prefix using short-lived presigned URLs.
After an organization is created, the server verifies each object's media type
and size, copies it to `organizations/<organization-id>/branding/`, updates the
organization with the promoted public URLs, and removes the staging objects.

Profile pictures take the same staging path and are promoted to
`users/<user-id>/avatar/`. Replacing or removing one deletes the previous
object only when its URL decodes back to that user's prefix, and deleting an
account removes everything under `users/<user-id>/`.

### Local development with Podman

The Compose stack includes MiniStack's S3-compatible emulator (a free,
MIT-licensed LocalStack alternative) and initializes the `bedrock-media`
bucket automatically:

```bash
podman compose up -d
```

No S3 environment variables are required in development; the application uses
these MiniStack defaults:

```env
S3_REGION=us-east-1
S3_BUCKET=bedrock-media
S3_ENDPOINT=http://localhost:4566
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_URL=http://localhost:4566/bedrock-media
S3_ACCESS_KEY_ID=test
S3_SECRET_ACCESS_KEY=test
```

The MiniStack initialization hook configures browser upload CORS and public
object reads. The `ministack_data` volume persists local objects.

### Production with Cloudflare R2

Create an R2 bucket, an API token with object read/write permissions, and a
public custom domain for the bucket. Configure:

```env
S3_REGION=auto
S3_BUCKET=bedrock-media
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_FORCE_PATH_STYLE=false
S3_PUBLIC_URL=https://assets.example.com
S3_ACCESS_KEY_ID=<r2-access-key-id>
S3_SECRET_ACCESS_KEY=<r2-secret-access-key>
```

Configure the R2 bucket CORS policy to allow uploads from the application
origin, and reads back to it:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://app.example.com"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

`GET` is what lets the avatar group cut its silhouette out of a logo: a CSS mask
needs a CORS-clean image, and without the header the browser refuses the mask
and the outline silently disappears. Raster logos are unaffected because
`next/image` proxies them, but it serves SVG untouched from its own origin.

Use the public custom domain as `S3_PUBLIC_URL`; do not use the authenticated R2
API endpoint for stored organization URLs. Configure a lifecycle rule for the
`staging/organization-branding/` prefix to remove abandoned uploads after an
appropriate retention period.

## Transactional email

Invitations, password resets and address confirmation all need mail, so there is
one SMTP adapter behind one interface in `features/shared/lib/email`:

```env
EMAIL_SENDER_NAME=Bedrock
EMAIL_SENDER_ADDRESS=no-reply@example.com
EMAIL_REPLY_TO_ADDRESS=

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
```

There is no provider SDK and none is needed: every service worth using speaks
SMTP, Resend included. `SMTP_SECURE` means implicit TLS on connect, which is
port 465; port 587 negotiates STARTTLS and leaves it off.

### Local development

`compose.yaml` runs [Mailpit](https://mailpit.axllent.org), an SMTP sink with a
web inbox, and development defaults to it with no configuration:

```bash
podman compose up -d
open http://localhost:8025
```

If Mailpit is not running, delivery fails without logging the message or its
recovery link. Start the Compose service before testing invitations, address
verification, or password resets locally.

The messages themselves are React Email components rendered to both HTML and
plain text. They wear the organization's own logo and colour, so an invitation
looks like the tenant it came from rather than like the platform.

### Notifications

`features/notifications` tells people when something changes about their
account or their memberships. Account notices wear the root organization's
branding; membership notices wear the organization's own.

| Notice                                  | Sent to                        | When                                                     |
| --------------------------------------- | ------------------------------ | -------------------------------------------------------- |
| Password changed                        | The account                    | `changePassword` succeeds                                |
| New email address requested             | The old address                | `changeEmail` succeeds; the new address appears masked   |
| Email address changed                   | The old address                | The confirmation link is followed                        |
| Two-factor turned on / off              | The account                    | Enrolment confirmed / two-factor disabled                |
| New backup codes                        | The account                    | Backup codes regenerated                                 |
| Passkey added / removed                 | The account                    | A passkey is registered / deleted                        |
| Account deleted                         | The deleted address            | After the deletion commits                               |
| New sign-in                             | The account                    | A sign-in passes the gate from an unrecognised device    |
| Added to / removed from an organization | The member                     | Someone else adds or removes them; leaving sends nothing |
| Role changed                            | The member                     | Someone else changes their role                          |
| Invitation accepted                     | The inviter, if still a member | Their invitation is accepted, or settled by joining      |

A device is recognised when the account signed in successfully with the same
browser and operating system in the last 90 days (from the audit log), or has
another live session with them. An account's first sign-in after it was
created is not reported.

Every notice says what happened, when (in UTC), from which IP address and
device where that applies, and what to do if it was not you, with a link to the
account's security settings. None carries a password, code, token or link that
acts on the account. Notices are sent with `after()` once the change has
committed: delivery is best effort and its failure never fails the change.
`sendAccountDisabledNotice` and `sendAccountEnabledNotice` exist for account
suspension but are not sent by anything yet.

## Invitations

An organization's administrators invite by email address from
`/org/[slug]/members`. An invitation carries an organization, a role, an
inviter and an expiry, and it is redeemed with a single-use token that only ever
exists in the mail: the database stores its SHA-256 digest, so a dump is not a
stack of usable links. Sending again mints a new token, which retires the old
one.

Following the link works whether or not the recipient already has an account.
The page settles everything itself rather than handing off to the login form,
and that is not a convenience: `login` refuses anyone who is not already a
member of the organization, which is precisely what accepting the invitation is
about to make them. So an existing account signs in and joins in a single step,
a new one picks a name and password on the spot, and signing out of the wrong
account comes back to the invitation instead of to the login page. Either way
the address is already proven by the token, so the account is confirmed and
never sees a second link.

Someone who never opens the mail is not stranded either. Signing in to an
organization you have been invited to lands on the invitation rather than on a
refusal, and the 403 page offers it too. That acceptance has no token to go on,
since only the digest is stored, so it rests on the session instead — which is
the stronger proof of the two, a token being a bearer credential that can be
forwarded or left in a shared inbox. What the token additionally proves is
control of the mailbox, so a **confirmed address is required** for the
token-free path; an unconfirmed one is told to confirm, or to open the link.
Accepting always stays an explicit act, never a side effect of signing in.

There is one way in. An administrator knows the person, not whether that person
already has an account, so a single dialog takes both: search picks an existing
account, and typing an address nobody holds offers to invite it. `addPeople`
delegates each half to `addMembers` and `inviteMember` rather than repeating
them, so authorization, audit and rate limiting are written once.

It asks by default. Membership here is not decoration — it feeds OIDC claims
into other applications, so being placed in an organization changes what someone
reaches elsewhere. Granting access outright stays possible, because an identity
provider that cannot provision anyone without waiting on an inbox is not much of
one, but it is a checkbox you have to clear rather than the path of least
resistance. When any chosen address has no account the checkbox is forced,
since there is nobody to add; the server enforces that too, so one request
cannot quietly do two different things to two halves of a list.

There is no separate invitations page. "Who is in this organization" is one
question, and an invitation is the part of the answer nobody has confirmed yet,
so the members list is a `union all` of memberships and open invitations. One
status column carries the whole answer — confirmed, unconfirmed, or invited —
because exactly one of those is true of a row, which is also what lets a single
filter narrow the list back down to either. An invited row offers resend and
withdraw where a member offers a role change. An address nobody has claimed gets
the neutral avatar, and one that already has an account is shown under the name
it goes by.

Only invitations still waiting for an answer exist. Accepting one deletes it,
withdrawing one deletes it, and housekeeping deletes the ones nobody took up, so
the table is a queue of outstanding work rather than a pile of settled rows
carrying the addresses of people who never joined. Who was invited, by whom, and
what came of it is the audit log's job, and it keeps that record whether or not
anyone ever answered.

Being let in by any other route settles the invitation too — added directly,
signed up to an open organization, joined one. Otherwise the token outlives the
membership it asked for: it is refused while they belong, and becomes redeemable
again the moment that membership is removed, which would quietly undo the
removal.

Two things are hidden from the list rather than deleted on the spot: an
invitation past its expiry, which housekeeping has not swept yet, and one to
somebody who was let in by another route in the meantime. Both would otherwise
read as pending against the evidence. Because a lapsed row is invisible but
still holds its address in the unique index, inviting the same person again
clears it first, so nobody is refused on behalf of a row they cannot see.

Refusals are explicit where they can be: an expired token, an address that
already belongs, and an organization suspended between sending and accepting
each say so. A withdrawn or already used invitation is simply gone, so it reads
as an unrecognised link — which is also all a stranger holding a stale token
should be able to learn from it. Every one of those decisions is made in one
place, `resolveInvitationByToken`, which both the preview and the acceptance go
through.

### Who may join without being invited

`organization.allowPublicSignUp` decides whether `/org/[slug]/signup` accepts
anyone. It is off by default, and a check constraint keeps it off for the root
organization for good: administering the instance is granted, never claimed.
A tenant's administrators switch it under **Authentication → Sign-up**.

The page serves whoever arrives. Without an account it takes a name, an address
and a password; with one already signed in it offers to join, because having an
account is not a reason to be turned away from an organization open to anyone.
The 403 page offers the same thing rather than being a dead end. `isOpenToAnyone`
is the single statement of the rule, and both actions re-read it from the
organization rather than trusting the page that rendered the control.

## Email confirmation

An unconfirmed account can sign in and reach nothing else. The authenticated
layout sends it to `/org/[slug]/verify-email`, where it can request another link
or sign out, and both people tables show whether an address has been confirmed.

The token is spent on a deliberate click rather than on page load, so a scanner
following the link in the mail cannot burn it before its owner does. The
bootstrap administrator and accounts created by `bun run admin` are confirmed on
creation, since nothing can send mail at first boot and both addresses come from
someone with access to the deployment.

## Passwords

New passwords are scored with [zxcvbn](https://zxcvbn-ts.github.io/zxcvbn/),
which estimates how many guesses one would actually take rather than checking it
for a digit and a capital. Composition rules produce `P@ssw0rd1`, which looks
varied and falls in seconds; zxcvbn knows that, along with the dictionary words,
keyboard walks, dates and letter substitutions behind it. The name and address
being registered are passed in as known inputs, so a password made of them
scores as badly as it deserves.

A meter shows the estimate as you type, using zxcvbn's own explanations. The
engine and its dictionaries load on first use, so no page carries them until
someone types in a password field. The floor is eight characters and a score of
2 out of 4; above that the meter advises rather than forbids.

Separately, and on the server only, a new password is checked against
[Have I Been Pwned](https://haveibeenpwned.com/Passwords). This catches what
zxcvbn cannot: `correct horse battery staple` scores full marks and has appeared
in 391 breaches.

```env
PWNED_PASSWORD_CHECK=true
```

The lookup is free and needs no account. Only the first five characters of the
password's SHA-1 are sent, which name a bucket of roughly two thousand hashes,
and the response is padded so its size says nothing either. Turn it off where
the deployment has no outbound access, or where a request leaving the instance
during sign-up is not acceptable.

The two ways it can fail are treated differently, because only one of them is a
caller's to arrange. If Have I Been Pwned cannot be reached, the check is
skipped and the password is allowed: an unreachable third party must not become
an outage of your sign-up, and nobody can arrange that unreachability on demand.
The number of lookups one source may cause, on the other hand, is capped, and
exhausting that budget **refuses the request** rather than skipping the check —
otherwise the check would be optional to anyone willing to spend sixty throwaway
submissions first and then register the breached password they came for.

Choosing a poor password never spends the budget for creating an account or
redeeming a reset token. Those exist to limit attempts at the operation, and
being told to pick a better password is not one.

## Two-factor authentication

Anyone can turn on an authenticator app (TOTP) under **Settings → Security**.
Setting it up asks for the password, shows a QR code and the key to type in by
hand, and only switches on once a code from the app is accepted. Ten backup
codes are shown once at that point, to copy or download; each works once, and
new ones can be created later, which voids the old set. Turning it off, and
deleting the account, take the password and a current code.

After a correct password, an account with it on gets a second step at
`/org/<slug>/two-factor`, or `/oauth2/two-factor` during an OIDC sign-in, which
keeps the authorization request and resumes it afterwards. The pending step is
a short-lived cookie that is not a session and grants nothing. Codes are limited
per account and source on top of Better Auth's own limits, which also lock the
account for 15 minutes after ten wrong codes in a row. "Trust this device" skips
the step on that browser for 30 days.

The issuer shown in authenticator apps is the root organization's name.

### Requiring it in an organization

A tenant's **Authentication** page (`/org/<slug>/authentication`, owners and
admins; root has none) holds the sign-up toggle and **Require two-factor
authentication**. Only owners can switch the requirement, only once they hold a
second factor themselves, and the page counts the active members who would be
affected before it is turned on. It is recorded as `organization.updated` with
`requireTwoFactor` among the changed fields. The page also lists which members
hold an authenticator app or a passkey, and the Members table shows the same as
a **2FA** column to administrators.

Either factor satisfies the requirement. A member without one can still sign
in, and the organization's pages send them to `/org/<slug>/setup-security` to
enrol one; until then their membership grants nothing there, and its
applications refuse them both a code at `/oauth2/authorize` and a token. When
that refusal interrupted an application's sign-in, the page carries the
authorization request, and **Continue** replays it at the authorize endpoint,
which validates it again; an application of another organization, or one no
longer available, just leads to the organization.

While any organization they belong to requires it, a member cannot give up
their last factor: turning off the authenticator app without a passkey, or
removing the only passkey without the app, is refused by name, and the Security
section disables the control and says why. Someone who loses their only factor
is recovered with **Reset a user's two-factor authentication** in
`bun run admin`, after which they enrol again on that page.

## Passkeys

People can add passkeys under **Settings → Security** (the password is asked for
first) and then use **Sign in with a passkey** or their browser's autofill on
either sign-in page. A passkey counts as both factors, so no code is asked for,
and it passes the same membership and suspension checks as a password.

Passkeys are bound to the host of `BETTER_AUTH_URL`, which is the WebAuthn
relying party. **Changing the domain makes every registered passkey unusable**;
people then sign in with their password and register new ones. Only that exact
origin is accepted.

The WebAuthn challenge travels as a signed cookie set by one Server Action and
read by the next, so no Better Auth HTTP route is mounted for passkeys.

## OpenID Connect

Bedrock is an OpenID Provider for applications that organizations register on
their Applications page.

There is one issuer for the instance, `${BETTER_AUTH_URL}/api/auth`, with
discovery at `/api/auth/.well-known/openid-configuration`. Changing
`BETTER_AUTH_URL` changes the issuer, and every application has to be
reconfigured. `sub` is the user's global id. The organization that owns the
application is sent in `urn:bedrock:organization`. Tokens are signed with
RS256.

Two further scopes describe the member inside that organization. Both claims
appear in the ID token, the access token and the userinfo response, and only
when their scope was granted:

- `roles` sends `urn:bedrock:roles`, the sorted keys of the application roles
  the member holds, directly or through one of their groups, that are linked to
  the requesting application.
- `groups` sends `urn:bedrock:groups`, the sorted keys of every group the
  member belongs to in the organization owning the application.

Role and group keys are what applications match on, so neither can be changed
once created; renaming a role or a group changes only its display name. Both
come from the current membership whenever a token or userinfo response is
issued, so someone who leaves the organization loses their groups and every
role they granted.

The Members table, the Roles page and a member's own overview show that same
effective set, marking which roles come through a group. Assigning roles to a
member or a role to members changes only direct assignments; a role held
through a group goes away only when the member leaves the group or the group
stops granting it.

The authorization code flow is supported, with refresh tokens. There are no
client credentials and no dynamic registration. Requests must include the
`openid` scope. Only current members of the organization that owns the
application can sign in to it. A signed-in non-member is sent to that
organization's access page instead of getting a code. The same check runs again
when the token is issued, so a membership removed in between is also refused.

An application that asks for `offline_access` also gets a refresh token. Every
refresh resolves the membership, roles and groups again, so a refresh is how an
application learns that a role was taken away; once the person has left the
organization, been disabled or the organization is suspended, the refresh is
refused with `invalid_grant`. Access and ID tokens live for an hour and refresh
tokens for seven days, rotating on every use, with a 30-second grace period for
an application that refreshes the same token in parallel. A refresh token never
outlives the Bedrock session it was issued from: signing out, resetting the
password or revoking the session on the account page revokes it too.

Applications that sign people in only once and keep their own session never
hear about a revoked role until that session ends. Give them a refresh token
and refresh often, for example oauth2-proxy with `offline_access` in its scope
and `--cookie-refresh=5m`, or keep their sessions short.

Every application may use the end-session endpoint to sign someone out of
Bedrock with the ID token it was given. It is then sent to one of the
application's registered post-logout redirect URIs, matched exactly like
redirect URIs, or left on Bedrock's signed-out page when none is registered.

A refused token request is logged as one `[oidc] token request refused` line
with the client id, grant type and OAuth error, and counted in
`bedrock.oidc.tokens_refused`. Codes, secrets and tokens are never logged.

Redirect URIs must use https. The exception is development, which also accepts
http on `localhost`, `127.0.0.1` and `[::1]` so you can test against a local
instance. Production refuses them.

To exercise the flow by hand, register an application with
`http://localhost:4455/callback` as a redirect URI, then run:

```bash
bun run oidc --client-id <id> [--client-secret <secret>]
```

It prints an authorize URL, waits for the redirect, exchanges the code, and
prints the ID token claims and the userinfo response. A hosted application
cannot reach `localhost`. To test with one, run
`cloudflared tunnel --url http://localhost:3000`, set `BETTER_AUTH_URL` to the
tunnel URL, and restart the dev server.

## Administration

`scripts/admin` is an interactive script that reaches the database directly, so
it works even when nobody can sign in and act:

```bash
bun run admin
```

In the image it is `bedrock admin`, bundled for Node.js:
`docker compose exec bedrock bedrock admin` or
`kubectl exec -it deploy/bedrock -- bedrock admin`. It creates users, grants
and changes organization roles, removes members, lists
users and members, resets a user's two-factor authentication, disables and
enables accounts (see [Disabled accounts](#disabled-accounts)), and seeds
development data. The reset is for someone who has lost both their authenticator
and their backup codes: it turns two-factor authentication off, forgets their
trusted devices, and records `account.two_factor_reset` in the audit log. They
sign in with their password afterwards and can set it up again. Confirm who is
asking before using it; it is exactly what an attacker would ask for. Root
administrators can make the same reset from the Directory (see
[Supporting accounts](#supporting-accounts)); the script is for when nobody can
sign in to do it. Seeding is refused when `NODE_ENV` is `production`.

## Supporting accounts

A root administrator supports accounts from the **Directory** row menu. Every
act is recorded in the audit log:

| Act                                               | Needs the administrator's second factor | Tells the person      |
| ------------------------------------------------- | --------------------------------------- | --------------------- |
| Send a password reset link                        | No                                      | The reset mail        |
| Resend verification, or mark the address verified | No                                      | The verification mail |
| Sign out everywhere                               | Yes                                     | No                    |
| Reset the second factor                           | Yes                                     | Yes                   |
| Delete the account                                | Yes                                     | Yes                   |

Signing out ends every session and the OAuth tokens issued on them. Deleting is
refused while the account is the last owner of an organization. Root can never
change someone's name or email address, act on their own account here, or act on
a root member's account unless they are a root owner: taking over an
administrator's account would change who runs the instance.

## Break-glass access

A root administrator can enter an active organization as its owner from the
**Organizations** row menu (**Enter as owner**) to repair what nobody inside
can, such as a tenant that has lost every owner. It needs a second factor on
their own account and a written reason, and lasts 60 minutes unless they end it
from the banner shown on every page meanwhile. It also ends when they stop
administering root or lose their second factor.

It is never a membership: applications never see it in a token or userinfo
response. Starting and ending it appear in the organization's audit log and the
instance's, its owners are emailed with the reason, and everything done under
it is recorded as root's, with the grant it happened under.

## Deleting organizations

Deleting an organization hides it at once and keeps it restorable for
`ORGANIZATION_RETENTION_DAYS`, after which housekeeping purges it. A root
administrator can purge a deleted organization straight away with **Delete
permanently**, confirmed by typing its slug. Only an organization that is
already deleted can be purged, and its audit history stays.

## Disabled accounts

A root administrator can disable an account from the **Directory** row menu,
with a reason, and enable it again from the same menu. Disabling signs the
account out everywhere in the same transaction that records `user.disabled`:
every session, OAuth access and refresh token, and consent is deleted. From then
on every way in — password, second factor, passkey, accepting an invitation, and
OIDC — answers "This account is disabled. Contact your administrator." and logs
a denied sign-in, and a password reset does not change that. Memberships are
kept, so enabling (`user.enabled`) restores what the account could reach.

Nobody can disable their own account, only a root owner can disable another
root owner, and the last active root owner cannot be disabled at all. If the
account is the only active owner of a tenant, the dialog says so before it is
confirmed. From a shell, with the same rules, audited as the system:

```bash
bun run admin disable person@example.com --reason "Left the company"
bun run admin enable person@example.com
```

## Housekeeping

Housekeeping purges organizations whose retention period has elapsed along
with their stored media, removes invitations nobody took up, applies the audit
retention period, removes stale rate limit counters, rolls up usage (see
[Usage](#usage)), and removes expired sessions, OAuth access and refresh
tokens, and verification values. Each task is independent, so one failure does
not skip the others.

Better Auth only deletes an expired session or token when someone presents it,
and refresh tokens rotate on every use, so without the last task those tables
grow for good. A refresh token never outlives the session it was issued from:
an expired session is deleted together with every token issued from it, even
one not yet past its own expiry. A rotated refresh token is kept until it
expires, since presenting it again until then is what revokes its whole family
as stolen.

The server runs it in process: every task a minute or two after start-up, then
hourly. Each run holds a Postgres advisory lock for its task, so replicas never
run the same task at once; a replica that finds the lock taken, or the task
done within the hour, skips it without recording anything. The tasks live in
`scripts/housekeeping` and talk to the database and object storage directly, so
there is no endpoint to expose and no shared secret to manage.

Every run is recorded in `system_task_run`, one row per task: when it last
started and finished, whether it succeeded, a one-line redacted error, and what
it reported. The [Health](#health) page reads it, so a scheduler that stopped is
visible rather than silent.

A development server does not run it unless `HOUSEKEEPING_ENABLED=true`: a
development database has no organization past its retention period and no audit
events old enough to prune. Run a single pass when you want to exercise it:

```bash
bun run housekeep          # in the image: bedrock housekeep
```

That runs every task once, skipping any another process is running, and exits
non-zero if one failed. In development audit retention is 90 days; in
production it is off unless set:

```env
# Defaults to true in production. Set false to schedule `bedrock housekeep`
# yourself instead.
HOUSEKEEPING_ENABLED=true
# Unset keeps the audit log forever. Minimum 30 days.
AUDIT_RETENTION_DAYS=90
# How long a deleted organization stays restorable by the instance
# administrators before it is purged.
ORGANIZATION_RETENTION_DAYS=30
```

The tasks are safe to repeat: expired organizations are re-checked inside the
deleting transaction and the retention deletes are idempotent, so the locks
only save work.

Nothing is purged until it runs. An instance with housekeeping turned off and
nothing scheduled stays correct: deleted organizations stay restorable and
counters accumulate, but no data is lost.

## Health

Root administrators have a Health page under System. It runs every check at
once, each with a five-second timeout, and streams each row in as it answers:

| Check          | What it reports                                                                         |
| -------------- | --------------------------------------------------------------------------------------- |
| Database       | Latency, and migrations applied against those this build ships                          |
| Object storage | Whether the bucket answers a `HeadBucket`                                               |
| Email          | Whether the SMTP server accepts a connection; a loopback host is a sink, not a delivery |
| Signing keys   | Algorithm, age of the newest key, and how many are usable                               |
| Housekeeping   | The last run of each task from `system_task_run`; never run, failed, or overdue         |

Beside them it lists configuration worth a second look (a `BETTER_AUTH_URL`
that is not https, no `AUDIT_RETENTION_DAYS`, a local mail sink, OpenTelemetry
off), and below them the build: the app and Next.js versions and, when the
image was built with one, the commit from `GIT_COMMIT` or `SOURCE_COMMIT`
(a 7–40 character hex revision; anything else is ignored).

Nothing on the page is a secret: checks report hosts, buckets and migration
names, never credentials or key material, and stored errors are redacted. It is
still instance detail, so every check rechecks root administration, and the
page answers 404 in a tenant. `/api/health` and `/api/ready` remain the
anonymous liveness and readiness probes.

## Usage

Each tenant's owners and admins have a Usage page, and root administrators have
one for the whole instance. Both offer the last 7, 30 or 90 days against the
period before:

- Tenant: sign-ins, daily active users, tokens issued, and second-factor
  adoption; a daily chart of sign-ins and active users; and tokens per
  application.
- Instance: organizations, users, sign-ins and daily active users; the same
  chart across every organization; and the organizations with the most active
  users. Root's own administrators are left out of that list.

A sign-in counts toward the organization it was made at, and a token toward the
organization owning the application. An active user signed in or received a
token that day; distinct people do not add up across days, so periods show the
daily average. Days are UTC.

The figures come from `usage_daily`, one counter per day, organization (null is
the instance), metric and, for tokens, OAuth client. The housekeeping `usage`
task counts yesterday again on every run and fills any day missing within the
audit retention period, capped at 90 days, since past that the events a day is
counted from may be gone. Recounting a day replaces it under an advisory lock,
so runs are idempotent and may overlap. Today is always counted live.

Member counts, second-factor adoption, applications, organizations and users
are snapshots: what a run sees, recorded once for yesterday by the first run
after midnight. Past days cannot be reconstructed, so a backfill writes none,
and comparisons with a period before the first snapshot say there is nothing to
compare yet.

So keep housekeeping running in production: without it the pages show today
and nothing else. The server runs it hourly; if you turn that off and schedule
`bedrock housekeep` yourself, run it at least daily shortly after midnight UTC,
so snapshots land close to the end of the day they describe. Only stored access tokens are counted; a JWT access token issued for
a `resource` is not stored and does not appear.

## Languages

The interface is in English and German, with no language in the URL. Each
request uses the signed-in person's choice from the user menu (`user.locale`),
else the `NEXT_LOCALE` cookie the sign-in pages' switcher sets, else the
browser's `Accept-Language`, else English. Mail is written in the recipient's
language. Messages live in `messages/<locale>/<namespace>.json`;

```bash
bun run i18n:check
```

fails when the languages hold different keys, an empty message, invalid ICU,
or different arguments. Conventions are in `AGENTS.md`.

## Tests

```bash
bun run test
```

The suite runs against the database in `DATABASE_URL` (the development
database from `compose.yaml` by default) and removes every row it creates. It
needs no storage or mail server.

Server Actions are called directly, as real users. `tests/support/request.ts`,
preloaded through `bunfig.toml`, stands in for the Next request: `actAs(user)`
creates a real Better Auth session and hands its signed cookie to `headers()`,
so `getAccessContext()` resolves the caller exactly as it does in production.
`tests/support/mail.ts` captures outgoing mail in `outbox`. next-intl's server
functions run the real `i18n/request.ts`, so actions answer in English unless a
test sets `setRequestHeader("accept-language", ...)`, a cookie, or a user's
locale.

`createFixture()` in `tests/support/fixtures.ts` seeds an owner of the existing
root organization, two tenants with an owner each (`alice` owns A, `bob` owns
B), and a plain member of A (`carol`), all unique to the run. Its `cleanup()`
removes them with their sessions, memberships, invitations, and audit events.
Authorization tests should cover both tenants: the allowed path and the denied
cross-tenant one.

CI (`.github/workflows/ci.yml`) runs `typecheck`, `lint`, `i18n:check`,
`format:check`, migrations, the tests against Postgres 18, `build`, and `audit`
on every push and pull request. Once they pass, `.github/workflows/images.yml`
builds the image for amd64 and arm64; pull requests only build it, see
[Images](#images) for what gets published.

## Deployment

Bedrock is one image and one container, `ghcr.io/lucawahlen/bedrock`, beside
Postgres 16+ and S3-compatible storage that it does not run itself:

- [`deploy/docker`](deploy/docker/README.md): Docker Compose with Bedrock and
  Postgres on one host.
- [`deploy/kubernetes`](deploy/kubernetes/README.md): a Deployment with a
  Service, an example Ingress and a PodDisruptionBudget.

The server migrates the database when it starts and runs
[housekeeping](#housekeeping) hourly in process, both coordinated across
replicas by Postgres advisory locks, so there is no migrate job and no cron job
to run. Opt out with `MIGRATE_ON_START=false` or `HOUSEKEEPING_ENABLED=false`
and run `bedrock migrate` or `bedrock housekeep` from your own tooling instead.
Run it behind a reverse proxy that terminates TLS, as described below.

Sign-in and upload rate limiting is keyed on the client address, resolved from
`cf-connecting-ip`, `x-real-ip`, or the first hop of `x-forwarded-for`, in that
order. Any standard proxy or platform (Cloudflare, nginx, Caddy, a cloud load
balancer) sets one of these, so no deployment-specific configuration is needed.
Two caveats follow from that: if no proxy sets a header every caller shares one
bucket, and a client reaching the app directly can spoof these headers — so the
address is a best-effort signal, never an identity.

Edge rate limiting is expected for volumetric protection but is not relied upon
for account protection: the application enforces per-account sign-in limits
itself, because only it knows which account an attempt targets.

TLS is expected to end at that proxy. Nothing about security depends on the
scheme the application sees: `BETTER_AUTH_URL` alone decides it. When it is
https, session cookies get the `__Secure-` prefix and the `Secure` attribute
even though the proxy talks plain HTTP to the container, HSTS is sent, and the
OIDC issuer and every link in email are built from it. The proxy must still
pass the original `Host` (or `X-Forwarded-Host`) and `X-Forwarded-Proto`, since
Next.js builds its own redirects from them, and it must overwrite rather than
append to the client address headers above, or a client can choose its own.
Serve the application only through the proxy.

In production the pages send a Content Security Policy with a per-request
nonce. Besides the application itself, it allows images from `S3_PUBLIC_URL`
and uploads to the storage endpoint (the bucket's virtual host when
`S3_FORCE_PATH_STYLE=false`), both read from the environment at request time.

### Images

Every release is published to GHCR for `linux/amd64` and `linux/arm64`, with
SBOM and provenance attestations, as `ghcr.io/lucawahlen/bedrock`: the Next.js
standalone server under Node.js on port 3000, running as a non-root user.

| Tag                   | Published by                                                 |
| --------------------- | ------------------------------------------------------------ |
| `X.Y.Z`               | A `vX.Y.Z` tag, which also creates the GitHub release        |
| `X.Y`, `latest`       | The same, except for prereleases such as `v0.1.0-beta.1`     |
| `edge`, `sha-<short>` | Every push to `main`; for trying changes, not for production |

The configuration is the environment, described in
[`.env.example`](.env.example). To build the image locally, use the
`Dockerfile`.

The image also carries a `bedrock` command for operators: the scripts from
`scripts/`, bundled for Node.js at build time, so nothing else needs installing.

| Command             | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `bedrock admin`     | The [admin CLI](#administration), interactive or with a verb |
| `bedrock migrate`   | Apply pending migrations, under the same lock as the server  |
| `bedrock housekeep` | One [housekeeping](#housekeeping) pass, then exit            |

Run it inside the running container, which already has the environment:

```bash
docker compose exec bedrock bedrock admin
kubectl -n bedrock exec -it deploy/bedrock -- bedrock admin
docker run --rm --env-file .env.production ghcr.io/lucawahlen/bedrock:X.Y.Z bedrock migrate
```

To upgrade, roll out the new image. The first new container migrates while the
old ones keep serving; if a migration fails it exits non-zero, so the
orchestrator holds the rollout with the old version still up.

The application serves two unauthenticated probes, both `Cache-Control:
no-store`:

- `GET /api/health` is liveness. It touches no dependency and always answers
  `{"status":"ok"}`; the image's `HEALTHCHECK` uses it.
- `GET /api/ready` is readiness. It answers 200 once start-up has migrated and
  set up the instance, the database is reachable, and every migration this
  build ships with has been applied, and 503 otherwise, with only
  `{"status":…}` in the body.

Podman builds OCI images by default, which drop `HEALTHCHECK`; pass
`--format docker` to keep it.

In production the application refuses to start with a placeholder or
development `BETTER_AUTH_SECRET`, and warns when `BETTER_AUTH_URL` is not
https. `next build` is exempt, so the image builds with the placeholder values
the `Dockerfile` sets in its build stage only.

OpenTelemetry is opt-in. Setting an OTLP/HTTP endpoint exports Next.js's own
request spans and the application's metrics (sign-ins, sent email, issued and
refused tokens, request errors):

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
# Optional. Defaults to bedrock.
OTEL_SERVICE_NAME=bedrock
# Optional, e.g. an authorization header for a hosted backend.
OTEL_EXPORTER_OTLP_HEADERS=
```

### Backups and recovery

Back up Postgres with `pg_dump` on a schedule, and test restoring it. It holds
everything but media: users, memberships, audit events, OIDC applications and
their hashed secrets, and the `jwks` table with the private keys that sign
tokens. **Losing `jwks` invalidates every token ever issued**, and relying
parties have to fetch new keys. Those keys are encrypted with
`BETTER_AUTH_SECRET`, so store dumps apart from the secret: together they can
sign tokens as this instance.

Back up the object storage bucket separately (R2 and S3 support versioning or
replication). It holds only media, so losing it costs logos and avatars, not
access.

To restore, start from an empty database, load the dump, then start the
application with the same `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`; it
applies any migrations newer than the dump on start. A
different secret invalidates every session and leaves the signing keys and
two-factor secrets unreadable; a different URL changes the issuer and orphans
every passkey.

For lockouts, `bun run admin` (`bedrock admin` in the image) works without
anyone signing in: it resets a user's two-factor authentication, enables a disabled
account, and grants ownership of an organization that has lost its last owner,
root included.

### Production checklist

- `BETTER_AUTH_URL` is the public https URL. It is the OIDC issuer and the
  passkey relying party, so treat it as a contract that never changes.
- `BETTER_AUTH_SECRET` is long and random (`openssl rand -base64 32`), and kept
  out of images and logs.
- SMTP is configured and a test invitation arrives.
- Object storage, its public URL, CORS and the staging lifecycle rule are set
  up, per [Object storage](#object-storage).
- Migrations run on start (`MIGRATE_ON_START`, default true), or by
  `bedrock migrate` before each rollout.
- Housekeeping runs in the server (`HOUSEKEEPING_ENABLED`, default true) or on
  your own schedule, with `AUDIT_RETENTION_DAYS` and
  `ORGANIZATION_RETENTION_DAYS` set deliberately.
- Postgres and the bucket are backed up, and a restore has been tried.
- OpenTelemetry is optional; set `OTEL_EXPORTER_OTLP_ENDPOINT` to use it.

## License

Bedrock is licensed under the [GNU Affero General Public License v3.0](LICENSE).
If you run a modified version as a network service, you must offer its source
to the people who use it.
