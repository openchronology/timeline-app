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
change visibility, and delete timelines. **Reports** is the review queue for what readers report ([moderation](moderation.md)). Each user shows its [standing](browsing.md), which decides whether browsing lists its public timelines; mark an account trusted or untrusted to override it. Suspensions preserve user-owned data;
there is no automatic ownership transfer or destructive account removal.
The last active administrator cannot be suspended or demoted. Private timelines
are available to site administrators for management; private-fork publication
restrictions still apply. Operators should disclose their access to private data.

**Releasing an account from the directory.** An account made by a [directory sign-in](authentication.md#directory-sign-in-ldap-and-active-directory) has no password, and cannot add one or another way to sign in, so that the directory decides who signs in. When directory sign-in is turned off, or a person moves off the directory, such an account is stranded. Its user card says **Signs in only through the directory** and offers **Release from directory**, confirmed like any change. It unlinks the directory account, signs the account out everywhere, revokes its API keys, and emails a link to choose a password to its confirmed address; the link lasts 30 minutes, and **Forgot password** on `/login` sends another. Signing in through the directory again afterwards makes a new account. The release is recorded in the audit with whether a link was sent (`reset_link_sent`; none without a confirmed address or configured email, in which case the person uses **Forgot password** once email works). It is deliberately never automatic: a directory that is unconfigured only by mistake does not release anyone. An administrator who itself signs in only through the directory and is locked out uses the [password reset command](#resetting-the-administrators-password), which gives it a password, then releases the others from `/admin`; there is no separate command.

Admin mutations require a live interactive session, the current password, and a
fresh authenticator/recovery code when MFA is enabled. An administrator without a
password (signed up through a provider) instead signs in again within five minutes
of the change. Mutations are recorded in
`oc_admin_audit` without passwords or codes. Suspension/demotion revokes sessions,
API keys, and pending desktop login requests. Access checks query live account
state instead of trusting a browser-supplied role.

### Upgrading

An upgrade of the Linux and FreeBSD packages stops the server, the mail worker and the log importers ([syslog](syslog.md) and, on Linux, [journald](journald.md)) until the database is migrated. `openchronology-migrate` then starts the server, and each of the mail worker and the log importers that is enabled (on macOS, whose launchd agent was started; on Windows, whose service starts with Windows, as the installer also does). One left disabled, because it is not configured, stays stopped. `openchronology-migrate --no-restart` migrates only and starts nothing. Releases up to 0.12.1 started only the server, so account email (confirmations, password resets, security notices) waited in `oc_mail_outbox` until someone started the worker (#371), and logs went unimported until someone started the importers (#374); after upgrading such an installation, check them with `systemctl is-active openchronology-mail openchronology-syslog openchronology-journald`. With Docker Compose, see [upgrades](docker.md#upgrades-and-backups).

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
reads or changes only part of it, at a cost that grows slowly with its size:

- **Saving** changes the timeline's index in place and keeps, in its
  [saved history](architecture.md#saved-history), only the versions of what changed. A
  save's time and its storage charge follow the change, not the timeline's size.
- **Viewing** reads only what is on screen.

Some work handles the whole timeline at once, and its time grows with it: **exporting** to
`.ochx` and **reading a saved revision** (history pages). Both stream: the server sends the
document as it reads it, a page at a time, so its memory stays about the same at any size.
The editor exports a server timeline of over 100,000 moments with no unsaved edits the same
way, straight from the server to the file, rather than assembling it in the browser; images
it links to by address are then not embedded (those the timeline stores are).
Forking, pull requests, merges and syncs read only what changed.

These figures come from an 8-core virtual machine with PostgreSQL 17, using the
[benchmark timelines](benchmarks.md) (moments with titles, descriptions and tags, plus one
duration and one relationship for every ten moments):

| Moments   | Saving 10 moments | Saving 5,000 new moments | History it keeps | Reading a saved revision | Exporting | Server memory |
| --------- | ----------------: | -----------------------: | ---------------: | -----------------------: | --------: | ------------: |
| 200,000   |            0.05 s |                    2–3 s |           0.4 MB |                    3.4 s |       3 s |        0.1 GB |
| 1,000,000 |         0.1–0.2 s |                    4–6 s |           0.4 MB |                     14 s |      12 s |        0.1 GB |

A save reads the index nodes it changes in one statement, which follows the nodes on the
paths to its moments rather than the moments themselves: appended log moments share nearly
their whole path. `bench/save-size.mjs` measures saves against timeline size. The server
stops any statement after 30 s and answers 503; the log importer and the syslog receiver
save at most 5,000 entries at a time (the importer 4,999), and halve their saves when one takes 8 s or more or is
stopped, so they keep working as timelines grow.

Upgrading copies each timeline's current state into its saved history once, during
`openchronology-migrate`: about 14 s for 200,000 moments and 45 s for a million. Earlier
revisions keep the form they were saved in.

Upgrading to a release that keeps background addresses of up to 1,024 characters
([#365](https://github.com/openchronology/timeline-app/issues/365)) rebuilds, once, the
indexes of timelines with a duration whose web address is 257 to 1,024 characters long, and
of the forks reading through to them, so those backgrounds show. Finding them reads every
duration's definition once; `oc_migrations` records that it ran, so later upgrades skip it.

**The large tables are maintained more often than PostgreSQL's defaults.** By default,
autovacuum waits until a fifth of a table has changed, or grown by a fifth, and refreshes
the planner's statistics after a tenth. With hundreds of millions of rows, that's far too
late. `openchronology-migrate` sets the timelines' index tables, their retired versions and
their saved history to be vacuumed after about 2% of their rows change or are added, and
analysed after 1%. Vacuum skips pages nothing changed, so small installations barely notice.
A value you've set yourself on one of these tables, with `ALTER TABLE ... SET`, stays across
upgrades.

**A timeline can stop keeping saved history** (**Keep saved history** in its settings), for
logs and other timelines whose past revisions nobody reviews. History roughly doubles what a
timeline is charged: at 200,000 moments, a 38 MB timeline was charged 78 MB with it and
38 MB without. Turning it off took 1 s; turning it on again copies the current state once,
as upgrading does (15 s). Upgrades start no history for timelines without it. See
[timelines without saved history](collaboration.md#timelines-without-saved-history).

**Forks and duplicates share saved history** with the timeline they copy, instead of
copying it: a new copy keeps no history beyond its settings, and its saves keep only what
they change. At 200,000 moments, a fork used to add 37 MB of history and now adds a few
hundred bytes. **A copy shares its source's index too**: it reads through to it, keeping
rows of its own only for what it changes, so a fork of any size is ready at once (at 200,000
moments it used to take 30 s to copy, and before that 2 minutes to rebuild). Reading a fork
takes about 1.2 to 1.5 times as long as reading its source. Once forked, a timeline keeps
the earlier version of each index row it changes while a fork reads it, so its index grows
by about one row per row its saves change. Those versions go when the forks reading them
are deleted, saved as whole documents, or compacted: a fork that has rewritten half of its
moments copies the rest of its index in the background after saving and stops reading
through. A deleted timeline's index is kept while forks read through to it, then removed.
Upgrading removes the versions earlier releases kept after a fork was deleted. A copy of a copy of a copy of a copy (four levels) reads through
to all of them; a copy one level deeper copies only what its source changed itself, inside the
database, and reads through to the rest, so it costs what its source changed rather than the
whole timeline. When that is 20,000 rows or more, the copy is answered at once
and made afterwards, while its page says it is being prepared. At 200,000 moments, a copy
whose source changed 1,000 moments took 5.5 s (most of it refreshing the planner's statistics,
as after a save of 1,000 changes to a fork), and one whose source changed 26,000 was
answered in 0.4 s and ready in 9 s (a whole copy used to take about 30 s). Until it is ready,
the API answers HTTP 409 for its index, and only its metadata, sharing, settings and deletion
are available. A copy left unprepared by a restart is prepared when the server starts. Reading one of the copy's saved revisions takes about a third longer than
reading the original's (6 s rather than 4.6 s), because it reads through to the original.

**Pull requests keep no whole timelines.** A pull request refers to saved revisions, and a
timeline submitted for review is kept as rows that read through to its base, so it is charged
only for what it changes. Reviewing, merging and rebasing one, and syncing a fork, read only
what changed. At 200,000 moments, merging a fork's pull request of 200 changes took 0.35 s
(150 s when merges read whole timelines), and syncing 100 upstream changes into a fork
0.9 s (161 s before). Opening the proposed timeline reads it whole, as does submitting one
from the editor.

Some limits stay the same whatever this setting is:

- The offline HTML file and the desktop app's `.och` files hold 200,000 moments. The
  platform's pages follow the server's limit, including timelines kept in the browser, but
  the browser is slow well before that: past about 10,000 moments, save the timeline to the
  server (see [Timeline size and platforms](capacity.md)).
- An HTTP request carries at most 16 MiB, so creating or importing a whole timeline in one
  request stays below roughly 100,000 moments. Larger timelines grow through saves: the
  platform's editor, the [log importer](log-import.md) and the [syslog receiver](syslog.md)
  all save in batches.
- `.och` files exchanged with the server are at most 64 MiB. `TIMELINE_FILE_BYTES` in the
  environment file changes this: a size from `1MiB` to `1GiB`, such as `128MiB`. An invalid
  value stops the server at startup. The limit applies to uploads, exports, and the
  converter's input and output; the converter's memory limit is 512 MiB, or eight times the
  file limit when that is more. At most two conversions run at once, so a raised limit can
  briefly use two uploads' worth of server memory, and up to twice the converter's memory
  limit. An `.och` file is usually larger than the same timeline as `.ochx`, mostly from
  its indexes: 200,000 moments with a title and a 150-character note make about 61 MB of
  JSON and a file just over 64 MiB. A conversion stopped by a limit says which one.

## Cached downloads

Downloading a whole timeline (`.ochx` or `.och`) makes the file from the database each time,
which at 100,000 moments takes over a second. With the export cache, the server keeps each
file it makes for a revision and sends that file to the next person who downloads the same
revision. A save makes a new revision, so the next download is made fresh and kept in turn.
The cache covers the editor's **Export** of large timelines (`/api/timelines/{id}/export/…`),
`.ochx` downloads with `?download=1` (of a timeline or of a saved revision), and `.och`
files (`/api/timelines/{id}/file`). Comparisons are not cached: they are read from their
sources.

Measured on the [benchmark timelines](benchmarks.md#cached-downloads) (`bench/export-cache.mjs`),
to the last byte:

| Moments | `.ochx` size | Without the cache | First download | From the cache |
| ------: | -----------: | ----------------: | -------------: | -------------: |
|  20,000 |       3.5 MB |            0.32 s |         0.39 s |         0.08 s |
| 100,000 |        18 MB |             1.4 s |          1.7 s |         0.26 s |
| 200,000 |        36 MB |             2.6 s |          2.6 s |         0.46 s |

The first download of a revision is sent as it is made, as without the cache, while it is
written to the cache beside it. A file is only kept once it is complete, and only for the
revision it was asked for: a save landing while it is made makes it a newer revision's, sent
but not kept.

**Who may download is checked on every download**, cached or not, exactly as without the
cache: a cached file of a private timeline goes only to those who may see it. A saved
revision whose content was later forgotten (saved history turned off) is no longer served.

Settings in the environment file:

- `EXPORT_CACHE`: `disk`, `s3` or `off`. Unset, the cache is on (`disk`) when it has a
  directory, and off otherwise. The Debian and RPM packages' service gives it one
  (systemd's `CacheDirectory`, `/var/cache/openchronology/exports`), so it is on there by
  default. Set `off` to turn it off.
- `EXPORT_CACHE_DIR`: the directory for `disk`. With `s3`, where files are written before
  they are uploaded (the system's temporary directory when unset).
- `EXPORT_CACHE_MAX_BYTES`: the most the cache holds, a size such as `10GB` or `500MiB`
  (at least `1MiB`). Unset, 2 GiB. When a new file takes it past the limit, the files
  downloaded least recently are removed until it fits. A file larger than the whole limit is
  sent but not kept.
- `EXPORT_CACHE_PUBLIC_URL`: an address where the cache's files can be downloaded directly:
  a web server or CDN in front of `EXPORT_CACHE_DIR`, or the bucket's public address (or a CDN
  in front of it). When set, downloads of **public** timelines' files, once cached, redirect
  there (`302`) from the editor's export address and saved revisions' downloads, so the
  file is served by that server rather than by OpenChronology. A file's address is
  `<EXPORT_CACHE_PUBLIC_URL>/<key>`: its folder (32 random hexadecimal digits) and file name
  under the directory, or the bucket key (with `EXPORT_CACHE_S3_PREFIX`). Private
  timelines' files are never redirected: OpenChronology checks access and sends them itself.
- For `s3` (AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO, SeaweedFS or another
  S3-compatible store):
  - `EXPORT_CACHE_S3_ENDPOINT`: the service's address, such as `https://s3.us-east-1.amazonaws.com`,
    `https://<account>.r2.cloudflarestorage.com` or `https://nyc3.digitaloceanspaces.com`;
  - `EXPORT_CACHE_S3_REGION`: `us-east-1` unless set (R2 uses `auto`);
  - `EXPORT_CACHE_S3_BUCKET` and `EXPORT_CACHE_S3_PREFIX` (such as `exports/`);
  - `EXPORT_CACHE_S3_ACCESS_KEY_ID` and `EXPORT_CACHE_S3_SECRET_ACCESS_KEY`: a key allowed
    to put, get and delete objects under the prefix, and nothing else;
  - `EXPORT_CACHE_S3_PATH_STYLE`: `1` (the default) addresses the bucket in the path
    (`https://endpoint/bucket/key`), `0` as a host name (`https://bucket.endpoint/key`).

A setting the server cannot use stops it at startup, saying which. If the cache's directory
cannot be written, it logs why and serves downloads without the cache.

**The files are named so they can't be guessed**, with 32 random hexadecimal digits each, but
a server or CDN in front of the cache's directory or bucket serves every file in it, private
timelines' included, to anyone who has its address. OpenChronology never hands out a private
timeline's file address, so keep directory listings off (and the bucket's listing private).
When a timeline is deleted, its cached files go at once. When one that was handed out at the
public address stops being public (made private by its owner, or restricted by moderators),
its files go within ten minutes (the cache sweeps every ten minutes as downloads arrive). A
CDN may keep its own copy until that copy expires: the files are sent with
`Cache-Control: public, max-age=31536000, immutable` from S3, so set a shorter lifetime at
the CDN if that matters, or purge it. A storage provider or CDN that holds cached files is
a processor of timelines' contents: name it in your privacy notice.

Several servers can share one cache (one database, one bucket or shared directory): a
revision is made and stored by one of them, and the others send their own copy while it is
being made. A download that starts on the same server while the file is being made waits
for it and is then sent from the cache.

## Name and analytics

`PLATFORM_NAME` (for example `timescale.info`) replaces "openchronology" in the platform's header. It is also used as the site name in page titles, link previews and oEmbed responses, and the footer then adds "Powered by OpenChronology". When it is empty, OpenChronology's name is shown. The name is at most 60 characters, and the server refuses to start if it is longer.

`SUPPORT_URL` is where visitors can support the platform, such as `https://github.com/sponsors/you`, an Open Collective page or a page of your own. When it is set, the header ends with a **♥ Support** link and the footer has **Support this site**. When it is empty, neither appears. It must be an `https://` address; the server refuses to start with anything else.

`GOOGLE_ANALYTICS_ID` enables Google Analytics 4 with a measurement ID such as `G-ABC123DEF4`. When it is empty, nothing changes: pages load no analytics, and the content security policy allows no Google hosts. When it is set:

- The content security policy allows Google's tag script and measurement endpoints.
- Each visitor is first asked in a small banner, and Google's script loads only for visitors who choose **Allow analytics**.
- The choice is kept in the visitor's browser. **Analytics settings** in the footer asks again; declining after accepting stops analytics from that page on.
- Analytics run with Google signals and ad personalization turned off.
- Embedded timelines (`/embed/…`) and the editor's frame never load analytics.

An ID that is not a measurement ID is refused at startup. Mention analytics in your privacy notice; `legal/PRIVACY.md` describes the default.

## Landing page

A server opens on the timeline browser at `/`. To pitch it to particular audiences instead, turn on the landing page ([#379](https://github.com/openchronology/timeline-app/issues/379)):

```sh
LANDING_PAGE=1
LANDING_EXAMPLES=athan/deep-time,athan/ancient-egypt,athan/computer-science
LANDING_EXAMPLES_EDUCATORS=athan/abraham-lincoln,athan/ancient-egypt,athan/deep-time
LANDING_VIDEO_EDUCATORS=https://www.youtube.com/watch?v=…
```

`LANDING_PAGE` is on when it is `1`, `true` or `yes`, and off otherwise, which is the default. When it is on:

- **`/`** is the landing page: "Any span of time, on one exact line" (titled "OpenChronology: free timeline editor for history and research" for search engines and link previews), with **Explore timelines**, **Sign up** (when the site takes registrations; **Your timelines** when signed in) and **Start a timeline**, the video, a card for each audience, a few public timelines, and the page's copy.
- **`/for`** lists the audiences, and **`/for/<audience>`** is each one's page: `educators`, `researchers`, `investigators`, `operations`, `writers` and `developers`. Each has a one-line promise, its example timelines, its video, what that audience can do, and what it can count on. Any other audience is not found.
- **`/explore`** is the timeline browser, with everything `/` had: your timelines, favorites and drafts, and the public timelines, with each list's search, tag, sort and page in the address. The header gains an **Explore** link, the account menu **Your timelines**, and signing in without a page to return to goes there.
- The sitemap's `pages.xml` lists `/explore`, `/for` and each audience's page. Each page has its own title, description, canonical address, link preview and schema.org `WebPage` description, and all of them work without JavaScript, at phone width, and in light or dark mode.

When it is off, `/` is the timeline browser as before, `/explore` shows the same browser (its canonical address is `/`), and `/for` is not found. The username `for` is reserved for these pages; an account that already has it keeps its profile at `/users/for`.

**Example timelines.** `LANDING_EXAMPLES` names the landing page's, and `LANDING_EXAMPLES_EDUCATORS`, `_RESEARCHERS`, `_INVESTIGATORS`, `_OPERATIONS`, `_WRITERS` and `_DEVELOPERS` each audience's: `owner/slug` addresses separated by commas, shown in that order as the browser's cards, with their images. Two or three suit a page; it shows at most six. A timeline that is missing, private, labelled as sensitive, still being copied, or whose owner is suspended is left out without a word. When a page names none, it shows the first three public timelines the browser lists, featured first ([featuring](collaboration.md)).

**Videos.** `LANDING_VIDEO` and `LANDING_VIDEO_<AUDIENCE>` take a YouTube address (`youtube.com/watch?v=…`, `youtu.be/…`, `/embed/…` or `/shorts/…`). The page shows a poster that links to the video on YouTube; nothing is loaded from YouTube until a visitor clicks it, when YouTube's privacy-enhanced player (`youtube-nocookie.com`) plays it in place, and the page says so beside it. The player is sent the site's origin as its referrer, which YouTube needs; the site sends none elsewhere. When any video is set, the content security policy of `/` and `/for/…` allows frames from `https://www.youtube-nocookie.com`, and nothing else changes. An address that names no YouTube video stops the server starting, with the setting's name. Mention the videos in your privacy notice if you set them.

**The copy** is Markdown in [`platform/content/landing/`](../platform/content/landing/README.md): `home.md`, `audiences.md` and one file for each audience. Each begins with front matter: `title` (the page's title in search results, browser tabs and link previews, followed by the site's name unless it already contains it), `heading` (the heading the page shows, when it differs from its title, such as "Any span of time, on one exact line"), `promise`, `description` (for search engines and link previews; at most about 160 characters shows whole), and for an audience its `label` and the `card` line on the landing page. To write your own, copy the files you want to change into a directory, edit them, and set `LANDING_CONTENT_DIR` to it; a file it lacks is read from the built-in copy. Pages read the files as they are asked for, so changes show without a restart. The Markdown can have headings, lists, emphasis, code and links to the site's pages or to `https:` and `mailto:` addresses; HTML shows as text. A directory that does not exist stops the server starting. In Docker, mount it into the `app` service, for example `- ./landing:/landing:ro` under `volumes` with `LANDING_CONTENT_DIR=/landing`.

## IndexNow

[IndexNow](https://www.indexnow.org/documentation) tells search engines that take it (Bing, Yandex, Naver, Seznam and others; not Google, which reads the [sitemap](sharing.md#search-engines)) which pages changed, so they visit them within minutes instead of at their next crawl ([#389](https://github.com/openchronology/timeline-app/issues/389)). It is off unless you set a key:

```sh
INDEXNOW_KEY=$(openssl rand -hex 16)
```

The key is 8 to 128 letters, digits and dashes; anything else stops the server starting. Once it is set:

- The site serves the key at `/<key>.txt`, which is how the engines know submissions for your site are yours. Keep the same key; a new one is fine, but the old file stops being served.
- About once a minute, the server compares the pages the sitemap lists (public timelines, and the profiles of accounts that own one and are not suspended) with what it saw a minute before, and sends the addresses that changed to `https://api.indexnow.org/indexnow`, which passes them on to every participating engine: a timeline created or made public, saved, given a new address (the old and the new), made private or deleted (its old address, so engines drop it), and a profile that gains or loses public timelines. Up to 10,000 addresses go in one request, with `APP_ORIGIN`'s host and `/<key>.txt` as the key's location.
- Each address is sent at most once an hour, so a timeline a log stream saves all day is sent hourly. A timeline that was never public is never sent, and nor are moments' and durations' pages, which only the sitemap lists.
- It runs in the background of the platform's process, with a ten-second limit on each request, and never holds up a page or a save. A request that gets no answer, `429` or a server error is tried again after a minute, then two, four and so on up to an hour; one refused (`400`, `403`, `422`: a wrong key or `APP_ORIGIN`) is logged and dropped.
- What changed while the server was stopped is not sent: the first comparison after a start only takes stock. The sitemap covers it.
- Nothing is sent while `APP_ORIGIN` is `localhost` or a loopback address, which the engines could not reach.

Check it works by opening `https://<your site>/<key>.txt`, then watch the log for `IndexNow: submitted …` after you save a public timeline. Bing Webmaster Tools lists what it received under **IndexNow**.

## Terms and privacy policy

Every account agrees to the terms of service and privacy policy in force: at registration, at a social account's email step, or, for an account made earlier (including the first administrator), when asked on its next visit. Until then it can read and manage its account but not save or share. Each account records the version (`oc_users.terms_version`, the policies' effective date) and when (`terms_accepted_at`); `SELECT username,terms_version,terms_accepted_at FROM oc_users` lists them. Changing the policies materially means changing `POLICY_VERSION` in `server/policies.mjs` and `oc_policy_version()` in `schema.sql`; see [authentication](authentication.md#agreeing-to-the-terms).

## Account settings

`/account` includes password changes, verified email changes, MFA/recovery codes,
session revocation, Google/GitHub/Facebook/Microsoft and directory-account linking and
unlinking, and avatar settings. OAuth provider registrations, directory (LDAP and
Active Directory) sign-in and Resend configuration are described in
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
`PUT /api/timelines/<id>/changes`, or merge onto a newer revision when they say what they
were made on; see [saving while others save](collaboration.md#saving-while-others-save).
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
