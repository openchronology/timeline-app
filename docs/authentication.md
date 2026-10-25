# Accounts, sessions and deployment

The official desktop default is `https://timescale.info`. In **Server connection**, connect to other HTTPS origins as well, or disconnect from all of them and continue working locally. HTTP is accepted only for loopback development origins. Only the connected origins are persisted; desktop credentials live in native process memory and a restart requires signing in again.

## Several servers on the desktop

The desktop connects to up to eight servers at once, each with its own sign-in. Signing in to one server, signing out of it or disconnecting from it leaves the others as they are. Once more than one server is connected, the dialog is named **Servers (n)**. It lists each server with its account and offers **Use**, **Sign in**, **Sign out** and **Disconnect**.

One server is _in use_ at a time:

- The account button shows its account.
- New timelines are saved to it.
- Comparisons are of its timelines.
- The plugin library opens on it.

When a server timeline is open, the server in use is always that timeline's server. Opening a timeline from another server switches to that server without signing in again. **Use** is unavailable while a server timeline is open. The server in use is listed first and is used again at the next start.

When several servers are connected, the desktop shows which server each item comes from with a chip naming it:

- The dashboard lists your timelines and favorites from every server you are signed in to, and public timelines from every reachable server.
- The open timeline shows a chip with its server.
- The plugin library can browse any connected server's plugins.

Desktop timeline links name their server too: `#server/<origin>/timeline/<id>`. Disconnecting from the server in use keeps its open timeline as an unsaved local copy and switches to the next server.

Accounts support username/password, Google, GitHub and Facebook sign-in, and directory (LDAP / Active Directory) sign-in on servers that configure it. Private timelines and explicit viewer/contributor/writer memberships apply equally to browser and desktop requests. Public timelines can be viewed without signing in. Open **Your OpenChronology account** to see active sessions and sign out every other session. Social accounts initially receive a generated username, shown in the account button and usable for sharing.

## Agreeing to the terms

Every account agrees to the terms of service and privacy policy in force (#277; `server/policies.mjs`):

- **Registering with a password** needs the unticked **I agree to the terms of service and have read the privacy policy** box. The form sends the version shown (`acceptTerms`, the policies' effective date from `/api/session`'s `terms`), and the server refuses a missing or older one with 400. The version and time are kept with the pending registration and copied to the account it becomes.
- **A new account from Google, GitHub or Facebook** exists before it has agreed, but cannot sign in until it confirms an email address, and the same box is required at that step (`POST /api/auth/email/enroll`).
- **Existing accounts**, made before the version in force (or before an administrator ran the bootstrap), have none recorded: `/api/session` reports `user.termsRequired`, and a panel under the header on every page asks them to agree (`POST /api/auth/terms`). Until they do, the server refuses their browser and desktop sessions' changes with 403 and `terms`. Still allowed: every read (and the query and search POSTs), signing out, the rest of the account's own settings and security under `/api/auth/` except creating API keys, deleting the account or its timelines, exporting a file, reporting and asking for a moderation review. API keys made before keep working, so integrations do not stop until their owner signs in.

Each account keeps `terms_version` and `terms_accepted_at`. When either policy changes materially, set `POLICY_VERSION` (and `oc_policy_version()` in `schema.sql`, which a test keeps equal) to the new effective date: every account is then asked again.

## Configure timescale.info

Build the app, apply `npm run migrate` using a migration database account, and serve it behind an HTTPS reverse proxy. Set `APP_ORIGIN=https://timescale.info` with no trailing slash. The existing schema migration is idempotent and adds identity, device approval, throttle and session columns to older installations.

Each provider is disabled unless both its client ID and secret are set on the Node server. Secrets belong in deployment environment variables or a secret manager, never TypeScript, HTML, desktop build variables or committed files. Compose forwards the settings listed in `.env.example`.

| Provider | Environment variables                                                                      | Registered callback URL                             |
| -------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Google   | `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`                                     | `https://timescale.info/api/auth/google/callback`   |
| GitHub   | `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET`                                     | `https://timescale.info/api/auth/github/callback`   |
| Facebook | `OAUTH_FACEBOOK_CLIENT_ID`, `OAUTH_FACEBOOK_CLIENT_SECRET`, `OAUTH_FACEBOOK_GRAPH_VERSION` | `https://timescale.info/api/auth/facebook/callback` |

Google uses a confidential **Web application** OAuth client and the `openid profile` scopes. Configure the consent screen and authorized redirect URI in Google Cloud. GitHub uses a confidential OAuth app with `read:user`; configure its homepage and callback. Facebook uses a Meta app with Facebook Login, `public_profile` and the callback under Valid OAuth Redirect URIs; set its Graph API version explicitly, for example `vN.N` matching that app. Complete the provider's production/domain/app review requirements before allowing ordinary users to sign in. Development callback URLs must match `APP_ORIGIN` exactly; separate development registrations are preferable.

References: [Google web authorization](https://developers.google.com/identity/protocols/oauth2/web-server), [Google identity verification](https://developers.google.com/identity/openid-connect/openid-connect), [GitHub authorization](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [Facebook manual login flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/), [Facebook secure requests](https://developers.facebook.com/docs/graph-api/guides/secure-requests/).

Do not register desktop callback URLs with these providers. The provider login always completes on the web server. The desktop uses the account established there.

## Directory sign-in (LDAP and Active Directory)

A server for a school or organisation can let people sign in with the accounts they already have in its directory: Active Directory, OpenLDAP, 389 Directory Server, FreeIPA or another LDAP server (#286). **Sign in with** the configured label (for example "School account") then appears on `/login`, beside any social providers. It is off unless `LDAP_URL` is set.

| Setting                   | Meaning                                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LDAP_URL`                | The directory: `ldaps://dc.school.example` (port 636), or `ldap://…` with `LDAP_STARTTLS=1`. Plain `ldap://` without STARTTLS is refused unless `LDAP_ALLOW_INSECURE=1`, since passwords would cross in clear. |
| `LDAP_STARTTLS`           | `1` to upgrade an `ldap://` connection with STARTTLS.                                                                                                                                                          |
| `LDAP_TLS_CA`             | A PEM file of the certificate authority that signed the directory's certificate, when it is not publicly trusted (an internal CA). Certificates are always verified; TLS 1.2 is the minimum.                   |
| `LDAP_BIND_DN`            | The service account the server searches with, such as `CN=openchronology,OU=Service,DC=school,DC=example`. Leave it and the password empty for an anonymous search, where the directory allows one.            |
| `LDAP_BIND_PASSWORD`      | That service account's password. Give the account read access only.                                                                                                                                            |
| `LDAP_BASE_DN`            | Where to look for people, such as `DC=school,DC=example` or `OU=Students,DC=school,DC=example`. Required.                                                                                                      |
| `LDAP_USER_FILTER`        | How a typed username finds its account; `{username}` is replaced by the escaped name. Default, for Active Directory: `(&(objectClass=user)(sAMAccountName={username}))`. OpenLDAP: `(uid={username})`.         |
| `LDAP_USERNAME_ATTRIBUTE` | The attribute a new account's OpenChronology username is taken from (default `sAMAccountName`; `uid` for OpenLDAP).                                                                                            |
| `LDAP_REQUIRED_GROUP`     | Optionally, the DN of a group a person must belong to (through `memberOf`; OpenLDAP needs its `memberof` overlay).                                                                                             |
| `LDAP_NESTED_GROUPS`      | `1` on Active Directory to count membership through nested groups too.                                                                                                                                         |
| `LDAP_LABEL`              | What the sign-in button calls it (default "Directory account"), at most 40 characters.                                                                                                                         |

Signing in looks the person up with the service account (exactly one entry must match), then binds to the directory as that entry with the password they typed; an empty password is refused before anything is sent, since many directories treat it as an anonymous bind. The password is used only for that bind: it is not stored, logged or sent anywhere else. Unknown names, wrong passwords and people outside the required group all get the same "Username or password is incorrect." Directory sign-ins share the password sign-in's rate limits (ten a minute per address and per name) and its human-verification challenge after repeated failures. The server refuses to start with an incomplete or unsafe configuration.

A directory account is held as the provider identity `ldap`, keyed by Active Directory's `objectGUID` (or the standard `entryUUID`, else the entry's DN), so renaming the account in the directory keeps it. The first sign-in creates an account named after the directory account when that username is free and allowed (lowercased, with dots and spaces as hyphens), else a generated one. Like a new social account, it then gives an email address to confirm and a year of birth before it can sign in, so the server needs email configured (Resend). Two-factor authentication, suspensions and session rules apply as for any account. An existing account can link a directory account on **Account → Sign-in methods** within five minutes of signing in, and unlink it as it unlinks a social provider. Matching email addresses never merge accounts.

The desktop app signs in to such a server through **Sign in using your browser**, which completes on the website.

Schools on Microsoft 365 whose accounts are only in Entra ID (formerly Azure AD) have no LDAP directory to point at; they will need a Microsoft OpenID Connect provider instead (#292).

## Browser and desktop flow

Browser sessions use 256-bit random credentials stored as SHA-256 hashes in PostgreSQL. Session cookies are HTTP-only, SameSite=Lax, Path=/ and use Secure plus the `__Host-` prefix when `APP_ORIGIN` is HTTPS. Sign-in replaces an existing session. Both anonymous sign-in and authenticated writes require a CSRF token bound to a server-issued cookie/session, and foreign Origin mutation requests are rejected. The server returns identity-provider availability to the UI; disabled providers have no sign-in buttons.

Social authorization uses a ten-minute, browser-bound, one-use state record and an allowlisted local return location. Google and GitHub additionally use S256 PKCE; Google ID tokens are checked against Google's RSA signing keys, issuer, audience, nonce and expiry. GitHub and Facebook identities come from authenticated provider API calls; Facebook includes `appsecret_proof`. Before a web provider redirect, authenticated editable timeline contents can be saved in a temporary browser record and recovered on return, retaining the original server revision for conflict detection. Guest drafts are in memory only and are not written to this record; export .ochx before leaving the editor to sign in. If browser storage is unavailable, the app asks the user to export before navigating. Provider tokens are discarded after identity verification and are never returned to the frontend or saved as application sessions.

Accounts are identified by `(provider, provider subject)`. Matching email addresses do not merge accounts. An existing signed-in user can explicitly **Link Google/GitHub/Facebook** in the web account dialog. Linking requires the same application session that started the flow and rejects a provider identity already belonging to another account. The desktop can use any linked provider through its system-browser sign-in flow; linking itself is performed on the website.

**Sign in using your browser** in the desktop opens the configured server in the operating system browser. The desktop displays a ten-character code. After signing in, the website requires explicit approval of the matching code. Approval exchanges a separate secret held by the native process for a desktop session, expires after ten minutes and can be consumed only once. Polling is limited to once every three seconds. A desktop session is accepted only as a Bearer credential; a browser cookie is accepted only as a web session. Native HTTPS requests verify certificates, do not follow redirects, and stay under the configured origin's API. The bearer and pending authorization secret never enter the webview, localStorage or browser cookies. Switching servers/disconnecting invalidates pending native responses and clears all credentials.

Sessions expire after fourteen days or twenty-four hours of inactivity. Activity updates at most once every five minutes. Logout revokes the current database record; **Sign out other sessions** revokes all other browser and desktop records immediately. There is no silent refresh token or persistent desktop login store.

## Passwords and throttles

Passwords use salted scrypt with `N=131072`, `r=8`, `p=1` and constant-time comparison, following the [OWASP scrypt guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). At most two password derivations run concurrently per Node process. Older version-1 hashes are verified and upgraded on successful login. New passwords require 15–1024 characters with a matching confirmation; existing shorter passwords remain usable for sign-in. Spaces, Unicode, pasted passwords, and password managers are supported, without arbitrary composition rules or periodic expiry. New passwords are checked against known breached passwords through the padded HIBP range API using only the first five SHA-1 hash characters; stored passwords remain salted scrypt. A failed safety check blocks new password creation, not existing sign-ins; missing and social-only accounts perform the same costly verification work and receive the same failure message.

Sign-in, social starts and device approvals share database-backed throttles (ten attempts per minute per client address) across instances, with an additional local memory cap. File conversion has a separate per-user throttle. By default the client address is the direct TCP peer. Set `TRUST_PROXY=1` only when a trusted proxy overwrites `X-Forwarded-For` with one validated client IP and direct access to the Node port is blocked; chains and malformed headers are ignored. The Compose port is bound to host loopback. Configure the proxy's request-body limit to at least the `.och` file limit for uploads (`TIMELINE_FILE_BYTES`, 64 MiB by default).

## Human verification

Actions spam would use ask for a quick check first. The server refuses them with `428` and a challenge; the web editor, website and desktop app show it in a small dialog and retry with the answer in an `X-Challenge` header. Each answer works once, for the action it was issued for.

| Action                                                     | When it asks                                                                                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration, **Forgot password**, adding an email address | Always: these send email to an address the requester types.                                                                                    |
| Password sign-in                                           | After three failures in fifteen minutes from the client address or for the account, instead of locking the account out.                        |
| Opening a pull request or commenting on one                | When the account is newer than `CHALLENGE_TRUST_DAYS` (default 7) and is not the timeline's owner or a member. Administrators are never asked. |
| Publishing a plugin                                        | Always, except for administrators.                                                                                                             |

`CHALLENGE_PROVIDER` chooses the check:

- `pow` (default) is self-hosted proof of work. The browser finds a number whose SHA-256 with a server-signed salt matches, trying up to `CHALLENGE_DIFFICULTY` (default 150,000) hashes, which takes under a second on a typical computer and a few seconds on a phone. Nothing is sent to a third party and the strict content security policy is unchanged. Answers expire after ten minutes and are recorded in `oc_challenge_uses` so they cannot be replayed. Proof of work makes each submission cost a bot CPU time and slows bulk scripts, but a determined attacker with native code can still answer quickly; the rate limits above still apply.
- `turnstile` uses [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/). Create a widget for your hostname and set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. The server checks each token with Cloudflare's siteverify API, including its action and hostname, and the content security policy then allows `https://challenges.cloudflare.com` scripts and frames. Visitors' browsers contact Cloudflare. Signed-in desktop and API-key sessions, which cannot show the widget, are given proof of work; signing up or signing in from the desktop app is not possible with Turnstile, so use **Sign in using your browser**.
- `off` disables checks, for example behind another bot filter.

Challenges are signed with a key derived from `AUTH_ENCRYPTION_KEY`; without it, each process signs its own, which only suits a single development server. Without `TRUST_PROXY=1` behind Next.js, every anonymous visitor shares one client address, so after three sign-in failures from anyone, every sign-in asks for a check until the window passes (rather than being locked out).

## Resend and verified registration

Set `RESEND_API_KEY`, `AUTH_EMAIL_FROM` (for example `OpenChronology <accounts@timescale.info>`), and `AUTH_ENCRYPTION_KEY` in your server environment. Generate the encryption key once with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep it secret and back it up separately from the database: losing it prevents decrypting enrolled authenticator secrets. Do not regenerate it on container rebuilds.

Verify the sending domain in Resend and apply its DNS instructions for SPF/DKIM; configure DMARC appropriate to the domain. Use a restricted sending API key. The app uses the Resend HTTPS API, so SMTP configuration is unnecessary. Start the durable delivery worker with `docker compose --profile mail up --build --wait -d`. Jobs are encrypted in PostgreSQL, retried with exponential backoff, and use stable Resend idempotency keys. Expired queued messages and temporary proofs are removed by the worker. Emails contain plain text; no timeline data is sent to Resend.

Registration is disabled until email delivery and encryption are configured. A signup creates a pending record, not an account or session. The emailed confirmation expires after 24 hours, requires an explicit POST, and is bound to the browser that requested it. Open it in that browser; mail scanners cannot confirm by fetching a link. Tokens appear in URL fragments, are removed from browser history by the account page, and are stored only as hashes in the database. Register again to request another confirmation. Existing accounts and new social accounts must confirm an email address before obtaining an application session. Provider email claims never implicitly link accounts.

Accounts are for people 13 and older ([ages](moderation.md#ages)). Registration asks for a year of birth, kept with the pending record and copied to the account when it is confirmed. A new social account gives it at the email step, before it can obtain a session; one that gives an age under 13 is deleted there, since it cannot have been used.

## Two-factor authentication and recovery

In `/account`, enroll an authenticator app using the supplied key or `otpauth` link and confirm its six-digit code. TOTP uses RFC 6238, 30-second steps, a one-step clock tolerance, and rejects already consumed codes. Synchronize the server clock. Encrypted secrets use AES-256-GCM with account-bound authenticated data. Ten random 128-bit recovery codes are shown once and stored only as hashes; each works once after a successful password or social sign-in. Store them offline.

When enabled, application MFA applies to both password and social logins. A browser-bound challenge expires after five minutes and closes after five failed attempts; it provides no timeline access. Desktop sign-in uses the system browser and explicit device approval after a fully authenticated, recent browser sign-in. This also supports verified registration and MFA without exposing credentials to the webview.

Security changes require a live session, the current password where the account has one, and a fresh authenticator/recovery code if MFA is enabled. The password confirms the change however long ago the session began; an account without one (signed up through a provider) needs a sign-in within five minutes instead. Enrollment, disablement, and recovery-code replacement revoke other sessions and send notifications. Password changes revoke all sessions. Security changes also revoke approved-but-unclaimed desktop authorizations, so an earlier device approval cannot restore access after a password reset. Provider linking and desktop approval require recent authentication as well.

Forgot-password links expire after 30 minutes and work once. Recovery requests return the same response for eligible and unknown accounts. Resetting a password revokes all sessions and **does not disable MFA**. Email changes require reauthentication, confirmation of the new address in the requesting browser, and notify the old address; confirmation revokes sessions. There is no email-only MFA bypass. Losing both the authenticator and recovery codes requires an operator-reviewed recovery policy; automated support bypass is deliberately unavailable.

TOTP is opt-in and is not phishing resistant. Passkeys/WebAuthn would be a stronger future option; this release does not claim an independent security audit or regulatory certification.

## Verification

Core tests cover browser-bound CSRF, PKCE, Google JWT signatures/claims, malformed upstream responses, one-use OAuth callbacks, web/native session separation, and directory filter escaping, settings and identities. `test/ldap-postgres.mjs` signs in against a real OpenLDAP server (a Docker container it starts itself, or `LDAP_TEST_URL`), and skips when neither is available. The PostgreSQL GitHub CI job runs the real HTTP account, sharing, identity-linking, device approval, idle/absolute expiry, revocation and SQLite exchange tests with mocked provider HTTP responses. Native tests check credential removal, URL restrictions and connection changes. No live provider credentials are needed in CI. Actual provider registrations and the live `timescale.info` deployment must be configured by the operator before provider login can work publicly.

## Next.js platform integration

Browser accounts live at `/login` and `/account`. App Router handlers own `/api/session`, `/api/auth/*`, and all protected timeline APIs. OAuth callbacks retain the same provider URLs under `/api/auth/<provider>/callback`; register those URLs on `https://timescale.info`. Return destinations are restricted to application pages, never arbitrary URLs. Desktop authorization opens `/connect/desktop/<code>` and redirects through Next login if necessary. Legacy hash links remain supported.

The platform uses the existing PostgreSQL-backed session/OAuth service, with Next.js handling business pages and routing. No provider credentials are exposed to client components. SSR checks access independently of API checks, and private pages never enter a shared static cache. The per-request CSP nonce supports Next hydration without allowing arbitrary inline scripts.
