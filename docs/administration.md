# Administration, storage limits and automation

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

## Installation administrator

Set these values in the operator's private `.env` before starting Compose:

```dotenv
ADMIN_USERNAME=admin
ADMIN_EMAIL=operator@example.org
ADMIN_INITIAL_PASSWORD=use-a-unique-password-of-at-least-15-characters
DEFAULT_USER_STORAGE_BYTES=104857600
API_KEY_REQUESTS_PER_MINUTE=120
```

Use your own password, never the example. `ADMIN_EMAIL` is optional; configure a
real recovery address and Resend before offering password recovery. Migration
creates one verified installation administrator with a storage exemption. It
refuses to promote an existing username/email, protecting against username
squatting. The bootstrap ID is saved in PostgreSQL: restarting, rebuilding, or
changing the environment password does **not** reset an existing account.
Configure `RESEND_API_KEY`, `AUTH_EMAIL_FROM` and a persistent
`AUTH_ENCRYPTION_KEY` to enable the existing password/email/MFA management flows.
After first login, change the password in **Account**, enable authenticator MFA,
and store recovery codes. Remove `ADMIN_INITIAL_PASSWORD` from the environment
after successful setup. Keep `.env` out of source control and restrict its file
permissions. Losing all administrator credentials requires an operator-assisted
database recovery; changing the bootstrap password is not a recovery mechanism.

Open `/account`, sign in, and follow **Site administration** to `/admin`.
Administrators can search and paginate users and timelines, grant/revoke admin
access, suspend/reactivate users, set quotas and exemptions, feature timelines,
change visibility, and delete timelines. Suspensions preserve user-owned data;
there is no automatic ownership transfer or destructive account removal.
The last active administrator cannot be suspended or demoted. Private timelines
are available to site administrators for management; private-fork publication
restrictions still apply. Operators should disclose their access to private data.

Admin mutations require a recent interactive session (five minutes), the current
password where one exists, and a fresh authenticator/recovery code when MFA is
enabled. Sign out and back in if confirmation expires. Mutations are recorded in
`oc_admin_audit` without passwords or codes. Suspension/demotion revokes sessions,
API keys, and pending desktop login requests. Access checks query live account
state instead of trusting a browser-supplied role.

## Data quotas

The installation default is **100 MiB per user**. `DEFAULT_USER_STORAGE_BYTES`
initializes it once; subsequent changes are made in `/admin` and persist across
restarts. A user's quota can inherit the site default, override it with an exact
byte count, or bypass the limit. Administrators and the reserved, non-login seed
account are exempt. Set the default to **0** for a read-only installation, then
grant exemptions or positive limits to designated data suppliers. Reading public
or shared data is unaffected; local in-memory drafts and `.ochx` exports remain
available. Timeline-data deletion is allowed to free space.

Usage measures logical UTF-8 JSON bytes: the current timeline, every retained
saved revision, proposals (including base/proposed documents), comments, and
published plugin definitions. Moment metadata, embedded images, custom scripts,
and presentation settings are inside those documents. Saved revisions count
separately even if physical snapshot storage is shared. Proposals and their
revisions are charged to their author; ordinary timeline/history writes are
charged to the timeline's owner. Indexes, database overhead, account settings and
bounded avatar uploads are excluded. This is a predictable contribution quota,
not a disk-volume limit; operators still need database backups and disk monitoring.

PostgreSQL triggers maintain a storage ledger and serialize charges against the
user row. Concurrent writes cannot both consume the same remaining allowance;
over-limit growth rolls the entire transaction back with HTTP **413**. A zero
limit denies contribution operations with **403**. Lowering a limit or migrating
existing data never deletes it: existing usage is retained, and future growth is
blocked. Deleting a timeline can retain historical ancestors required by forks
or pull requests, so usage may not drop to zero. History is intentionally
immutable; saving checkpoints consumes quota even if edits are small.

## Account settings

`/account` includes password changes, verified email changes, MFA/recovery codes,
session revocation, Google/GitHub/Facebook linking and unlinking, and avatar
settings. OAuth provider registrations and Resend configuration are described in
[authentication](authentication.md). Linking uses the existing explicit OAuth
flow; unlinking requires fresh confirmation and retains at least one sign-in
method. Avatars accept HTTPS image URLs or PNG/JPEG/WebP uploads up to 256 KiB.
Remote images are requested by the browser, not fetched by the server; their
hosts receive the viewer's network request. SVG and executable URL schemes are
not accepted. Changing/resetting a password also revokes existing API keys.

## API keys

In **Account → API keys**, name a key, choose read access or read/write access,
and set an expiry of 1–365 days (default 90). Confirm your password/MFA as above.
The complete secret is shown **once**; only its SHA-256 hash and safe metadata
are stored. Copy it to your ingestion service's secret store. Keys can be revoked
immediately or removed. At most 100 key records per account are retained.

Use the HTTPS API with `Authorization: Bearer <key>`; never put keys in URLs,
exports, client-side scripts, logs, or timeline metadata. A key cannot manage
accounts, create other keys, change authentication settings, use file conversion
endpoints, or access site administration. It acts with the user's existing
permissions and quota on `/api/timelines` endpoints only. Read scope includes
POST search and bounded query operations. Write scope permits creating/saving
user-owned timelines and other contribution actions allowed by their role.
Private timelines belonging to other users remain inaccessible unless the key's
user already has access. Requests are rate-limited per key (default 120/minute,
operator-configurable from 1–1000). MFA is required when issuing keys, not for
every unattended API request. Suspension, expiry, revocation, and password
changes stop their use.

Example ingestion sequence (store the key in your process environment):

```sh
# Create a timeline from an exported, validated .ochx JSON document.
curl --fail-with-body https://timescale.info/api/timelines \
  -H "Authorization: Bearer $OCH_API_KEY" \
  -H 'Content-Type: application/json' --data-binary @timeline.ochx
```

Keep the returned timeline UUID and revision. To update, fetch
`GET /api/timelines/<id>` for the current revision, then send
`PUT /api/timelines/<id>` with `{ "revision": "<current>", "document": <document> }`.
A stale revision returns **409**; fetch again and reconcile instead of
blindly overwriting. Partial moment updates use the same revision check at
`PUT /api/timelines/<id>/changes`; see [collaboration API](collaboration.md).
Use `POST /api/timelines/<id>/query` for bounded windows instead of downloading
whole large documents. Keys are also accepted from desktop/aggregation clients;
interactive browser sessions retain their existing CSRF protection.

Design references: [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
and [REST security guidance](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html).

## Verification

`node --test test/administration.test.mjs` validates quota, avatar, key-definition
and scope boundaries. With `DATABASE_URL` pointing to a **dedicated test database**
with pgmp, run `node test/administration-postgres.mjs`. It tests real HTTP and
PostgreSQL enforcement, bootstrap idempotence, permission/CSRF failures, quota
rollback and concurrent writes, key hashing/scopes/expiry/revocation, suspension,
and migration accounting. The integration test temporarily changes installation
policy and creates an administrator; never run it against a production database.
GitHub CI runs it with the other PostgreSQL integration suites.
