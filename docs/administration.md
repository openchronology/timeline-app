# Administration, storage limits and automation

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

## Installation administrator

Set these values in the operator's private `.env` before starting Compose:

```dotenv
ADMIN_USERNAME=admin
ADMIN_EMAIL=operator@example.org
ADMIN_INITIAL_PASSWORD=use-a-unique-password-of-at-least-15-characters
DEFAULT_USER_STORAGE_BYTES=500MiB
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
permissions.

### Resetting the administrator's password

An administrator who cannot sign in can have their password set back to `ADMIN_INITIAL_PASSWORD` from the configuration. To choose a new password, write it there first. The command needs access to the server and its configuration:

| Installation                                    | Command                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Debian, Ubuntu, Rocky, RHEL and Fedora packages | `sudo openchronology-reset-admin-password`                                            |
| FreeBSD package                                 | `openchronology-reset-admin-password`, as root                                        |
| macOS (Homebrew)                                | `openchronology-reset-admin-password`                                                 |
| Windows                                         | `openchronology-reset-admin-password` in the installation folder, as an administrator |
| Docker Compose                                  | `docker compose run --rm migrate node server/reset-admin-password.mjs`                |
| From the source                                 | `npm run reset-admin-password` (reads `.env`)                                         |

It resets the `ADMIN_USERNAME` account, or the administrator the installation created first if `ADMIN_USERNAME` is empty:

- Its sessions, pending desktop sign-ins and password-reset links end, and the reset is recorded in the administration audit.
- Its API keys and authenticator stay. If two-factor authentication is on, signing in still asks for the code.

Changing the configuration alone, or restarting, does not change an existing password.

The configuration is read the way systemd and Docker Compose read it: `#` starts a comment only at the beginning of a line, so a password may contain `#` (#118). Releases before this one read it in `openchronology-migrate` with Node's `--env-file`, which ends a value at an unquoted `#`. An administrator created that way has a password cut off at the `#`. Sign in with the part before it, or run the reset command after upgrading.

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

The default quota per user comes from the environment file or from `/admin`:

- **Set in the environment file:** `DEFAULT_USER_STORAGE_BYTES` (a byte count, or a size
  such as `500MiB` or `2GB`; decimal units are powers of 1000, binary ones of 1024) applies
  at every start. `/admin` shows it, and changes it only when the variable is removed.
- **Unset or empty:** the default starts at **100 MiB** and is changed in `/admin`, where it
  persists across restarts.

An invalid value stops the server at startup with a message saying why. A user's quota can
inherit the site default, override it with an exact
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

## Timeline size

A timeline holds at most **200,000 moments**, and at most as many durations and as many
relationships. `TIMELINE_ENTRY_LIMIT` in the environment file changes this for the server:
a whole number of at least 1000 (such as `1000000`), or `unlimited`. Empty or unset is
200,000. An invalid value stops the server at startup with a message saying why. The server
tells its pages the limit, and they warn when a timeline reaches three quarters of it.

The default suits a public platform, where the server is shared. Most work on a timeline
reads or changes only part of it, at a cost that grows slowly with its size. Some work handles
the whole timeline at once, and that cost grows with it:

- **Saved revisions:** a save stores only what changed. Every 1,000 saves, or once the
  changes since the last full copy add up to the timeline's size, the save also stores a full
  copy of the timeline. This keeps history quick to replay, and each copy counts towards the
  owner's storage quota. While it is written, other saves to that timeline wait.
- **Exporting** to `.ochx`, **forking**, and **pull requests** read the whole timeline into
  the server's memory.

These figures come from an 8-core virtual machine with PostgreSQL 17, using the
[benchmark timelines](benchmarks.md) (moments with titles, descriptions and tags, plus one
duration and one relationship for every ten moments):

| Moments   | Saving 5,000 new moments | Saving with a full copy | Exporting | Full copy | Server memory |
| --------- | -----------------------: | ----------------------: | --------: | --------: | ------------: |
| 200,000   |                      6 s |                    10 s |       4 s |     35 MB |        0.4 GB |
| 500,000   |                     15 s |                    22 s |      11 s |     87 MB |        0.7 GB |
| 1,000,000 |                     20 s |                    49 s |      19 s |    173 MB |        1.3 GB |

**`unlimited` still has a ceiling.** PostgreSQL stores each full copy as one `jsonb` value,
which cannot exceed about 256 MB. The server refuses a save whose full copy would exceed
200 MB as JSON, with HTTP 413 and a message to split the timeline. With content like the
benchmark's, that is about 1.1 million moments. Short titles without descriptions reach it
later.

Some limits stay the same whatever this setting is:

- The offline HTML file and the desktop app's `.och` files hold 200,000 moments. The
  platform's pages follow the server's limit, including timelines kept in the browser, but
  the browser is slow well before that: past about 10,000 moments, save the timeline to the
  server (see [Timeline size and platforms](capacity.md)).
- An HTTP request carries at most 16 MiB, so creating or importing a whole timeline in one
  request stays below roughly 100,000 moments. Larger timelines grow through saves: the
  platform's editor, the [log importer](log-import.md) and the [syslog receiver](syslog.md)
  all save in batches.
- `.och` files exchanged with the server are at most 32 MiB.

## Name and analytics

`PLATFORM_NAME` (for example `timescale.info`) replaces "openchronology" in the platform's header. It is also used as the site name in page titles, link previews and oEmbed responses, and the footer then adds "Powered by OpenChronology". When it is empty, OpenChronology's name is shown. The name is at most 60 characters, and the server refuses to start if it is longer.

`GOOGLE_ANALYTICS_ID` enables Google Analytics 4 with a measurement ID such as `G-ABC123DEF4`. When it is empty, nothing changes: pages load no analytics, and the content security policy allows no Google hosts. When it is set:

- The content security policy allows Google's tag script and measurement endpoints.
- Each visitor is first asked in a small banner, and Google's script loads only for visitors who choose **Allow analytics**.
- The choice is kept in the visitor's browser. **Analytics settings** in the footer asks again; declining after accepting stops analytics from that page on.
- Analytics run with Google signals and ad personalization turned off.
- Embedded timelines (`/embed/…`) and the editor's frame never load analytics.

An ID that is not a measurement ID is refused at startup. Mention analytics in your privacy notice; `legal/PRIVACY.md` describes the default.

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
