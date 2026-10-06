# Accounts, sessions and deployment

The official desktop default is `https://timescale.info`. In **Server connection**, choose another HTTPS origin or disconnect and continue working locally. HTTP is accepted only for loopback development origins. Only the selected origin is persisted; desktop credentials live in native process memory and a restart requires signing in again.

Accounts support username/password and Google, GitHub and Facebook sign-in. Private timelines and explicit viewer/editor memberships apply equally to browser and desktop requests. Public timelines can be viewed without signing in. Open **Your OpenChronology account** to see active sessions and sign out every other session. Social accounts initially receive a generated username, shown in the account button and usable for sharing.

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

## Browser and desktop flow

Browser sessions use 256-bit random credentials stored as SHA-256 hashes in PostgreSQL. Session cookies are HTTP-only, SameSite=Lax, Path=/ and use Secure plus the `__Host-` prefix when `APP_ORIGIN` is HTTPS. Sign-in replaces an existing session. Both anonymous sign-in and authenticated writes require a CSRF token bound to a server-issued cookie/session, and foreign Origin mutation requests are rejected. The server returns identity-provider availability to the UI; disabled providers have no sign-in buttons.

Social authorization uses a ten-minute, browser-bound, one-use state record and an allowlisted local return location. Google and GitHub additionally use S256 PKCE; Google ID tokens are checked against Google's RSA signing keys, issuer, audience, nonce and expiry. GitHub and Facebook identities come from authenticated provider API calls; Facebook includes `appsecret_proof`. Before a web provider redirect, editable timeline contents are saved in a temporary browser record and recovered on return, retaining the original server revision for conflict detection. If browser storage is unavailable, the app asks the user to export before navigating. Provider tokens are discarded after identity verification and are never returned to the frontend or saved as application sessions.

Accounts are identified by `(provider, provider subject)`. Matching email addresses do not merge accounts. An existing signed-in user can explicitly **Link Google/GitHub/Facebook** in the web account dialog. Linking requires the same application session that started the flow and rejects a provider identity already belonging to another account. The desktop can use any linked provider through its system-browser sign-in flow; linking itself is performed on the website.

**Sign in using your browser** in the desktop opens the configured server in the operating system browser. The desktop displays a ten-character code. After signing in, the website requires explicit approval of the matching code. Approval exchanges a separate secret held by the native process for a desktop session, expires after ten minutes and can be consumed only once. Polling is limited to once every three seconds. A desktop session is accepted only as a Bearer credential; a browser cookie is accepted only as a web session. Native HTTPS requests verify certificates, do not follow redirects, and stay under the configured origin's API. The bearer and pending authorization secret never enter the webview, localStorage or browser cookies. Switching servers/disconnecting invalidates pending native responses and clears all credentials.

Sessions expire after fourteen days or twenty-four hours of inactivity. Activity updates at most once every five minutes. Logout revokes the current database record; **Sign out other sessions** revokes all other browser and desktop records immediately. There is no silent refresh token or persistent desktop login store.

## Passwords and throttles

Passwords use salted scrypt with `N=131072`, `r=8`, `p=1` and constant-time comparison, following the [OWASP scrypt guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). At most two password derivations run concurrently per Node process. Older version-1 hashes are verified and upgraded on successful login. Passwords are 12–1024 characters; missing and social-only accounts perform the same costly verification work and receive the same failure message.

Sign-in, social starts and device approvals share database-backed throttles (ten attempts per minute per client address) across instances, with an additional local memory cap. File conversion has a separate per-user throttle. By default the client address is the direct TCP peer. Set `TRUST_PROXY=1` only when a trusted proxy overwrites `X-Forwarded-For` with one validated client IP and direct access to the Node port is blocked; chains and malformed headers are ignored. The Compose port is bound to host loopback. Configure the proxy's request-body limit to at least 32 MiB for `.och` uploads.

Password recovery, email verification and application-level MFA are not implemented. Provider accounts can use their provider's recovery and MFA; an account with multiple explicitly linked providers can sign in through another linked identity. Username/password registration is open in this version.

## Verification

Core tests cover browser-bound CSRF, PKCE, Google JWT signatures/claims, malformed upstream responses, one-use OAuth callbacks and web/native session separation. The PostgreSQL GitHub CI job runs the real HTTP account, sharing, identity-linking, device approval, idle/absolute expiry, revocation and SQLite exchange tests with mocked provider HTTP responses. Native tests check credential removal, URL restrictions and connection changes. No live provider credentials are needed in CI. Actual provider registrations and the live `timescale.info` deployment must be configured by the operator before provider login can work publicly.
