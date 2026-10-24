# OpenChronology — Run Your Own Server: Script and Storyboard

**Runtime:** ~2:11 (the scratch narration's cut) · **Format:** animated infographic, **Terminal** look · **Aspect:** 16:9
**Audience:** administrators and self-hosters: a school's IT, a club's volunteer, a company's platform team, a homelab. They will decide in the first thirty seconds whether installing and maintaining it is worth it.
**Purpose:** show the footprint (one application and PostgreSQL), the install on their platform, what the first sign-in and configuration involve, how they run it day to day (accounts, storage limits, moderation), and the upgrade path, honestly.

**How it differs:** it's a runbook as much as a video: every command shown is the documented one, and it says plainly what the operator is responsible for (backups, email, OAuth registrations, disclosure of their access).

**Production notes:**

- Narration is 272 words, about 140 wpm when read. Calm and exact; an administrator talking to administrators.
- **The motif:** a layered stack, as in CMR Scanner's leadership brief, drawn as horizontal bands: CLIENTS (browser, desktop app, phone) → REVERSE PROXY (HTTPS) → OPENCHRONOLOGY (Next.js platform on Node.js) → POSTGRESQL (with pgmp). Each scene lights the layer it's about.
- **Accuracy guardrails:**
  - Packages: Debian, Ubuntu, Rocky Linux and RHEL, Fedora, FreeBSD, macOS (Homebrew) and Windows; and Docker Compose for any system. All free, attached to each release with checksums.
  - The .deb's first install creates the service user, the configuration, the database with pgmp, and starts the server; upgrades are "install the new package, then `openchronology-migrate`".
  - Sign-in options: username and password; Google, GitHub and Facebook once the operator registers them; email recovery and two-factor authentication once email (Resend) and an encryption key are configured.
  - Administrators can read private timelines; say the operator should disclose it.
  - Don't claim high availability, clustering or SSO beyond the three OAuth providers.

---

## ACT 1 · THE FOOTPRINT (0:00 – 0:40)

### Scene 1 · 0:00 – 0:20 · One app, one database

**FRAME:** The layered stack draws top to bottom: CLIENTS (browser, laptop, phone icons) → REVERSE PROXY ("HTTPS") → OPENCHRONOLOGY ("Next.js platform · Node.js") → POSTGRESQL ("+ pgmp: exact rationals"). A chip at the side: "Free software · GPL v3".

**MOTION:** Bands slide in one by one from the top; the chip pops last.

**OST:** "One app. One database."

**VO:**
"Running your own OpenChronology server takes one application and one PostgreSQL database, with an extension that stores times as exact rational numbers. Put it behind your usual HTTPS proxy, and browsers, phones and the desktop app all connect to it."

### Scene 2 · 0:20 – 0:40 · Packages for your platform

**FRAME:** A row of package badges beside the stack: "Debian", "Ubuntu", "Rocky · RHEL", "Fedora", "FreeBSD", "macOS · Homebrew", "Windows", and a separate "Docker Compose". A file list beside them: `openchronology-server-ubuntu24.04-amd64.deb`, `SHA256SUMS.txt`.

**MOTION:** Badges light one after another; the checksum file ticks.

**OST:** "Packages for every major platform."

**VO:**
"Every release comes with server packages for Debian, Ubuntu, Rocky Linux and RHEL, Fedora, FreeBSD, macOS through Homebrew, and Windows, plus a Docker Compose setup for anything else, each with checksums to verify."

---

## ACT 2 · INSTALL AND CONFIGURE (0:40 – 1:40)

### Scene 3 · 0:40 – 1:06 · Install

**FRAME:** A terminal: `sha256sum -c --ignore-missing SHA256SUMS.txt` → `OK`; `sudo apt-get install ./openchronology-server-ubuntu24.04-amd64.deb` → "OpenChronology is installed and running at http://localhost:5173."; then `systemctl is-active openchronology` → `active`. A second, smaller terminal: `docker compose up --build --wait`.

**MOTION:** Lines type on; the outputs print in green.

**OST:** "Install the package. It's running."

**VO:**
"Check the download, then install the package. On first install it creates its service user, its configuration and a database with the extension in place, and starts the server. With Docker, it's one compose command, and the database runs in its own container."

### Scene 4 · 1:06 – 1:40 · Your site

**FRAME:** The configuration file `/etc/openchronology/openchronology.env` with a few lines highlighted in turn: `APP_ORIGIN=https://timelines.example.org`, `PLATFORM_NAME=Our timelines`, `ADMIN_USERNAME=…`, `OAUTH_GITHUB_CLIENT_ID=…`, `RESEND_API_KEY=…`. Beside it, the site's header renders "Our timelines" with "Powered by OpenChronology" in the footer, and sign-in buttons appear: "Continue with Google", "GitHub", "Facebook".

**MOTION:** Each highlighted line produces its effect on the site sketch.

**OST:** "Your address, your name, your sign-in."

**VO:**
"Then make it yours, in one configuration file. Set the address it's served at, and a name for your site. The first administrator account is created from it. Register Google, GitHub or Facebook if you want those sign-ins, and add email, which turns on password recovery and two-factor authentication."

---

## ACT 3 · RUNNING IT (1:40 – 2:45)

### Scene 5 · 1:40 – 2:06 · Day to day

**FRAME:** The site administration page drawn simply: a user list with a "Storage limit" column ("500 MiB") and **Suspend**; a timeline list with **Feature**; a **Reports** queue with two items. A note under it: "Administrators can open private timelines: tell your users."

**MOTION:** Rows slide in; a report item is resolved and leaves the queue; the note fades in and holds.

**OST:** "Accounts, limits, moderation."

**VO:**
"Day to day, the administration pages cover accounts, storage limits, featured timelines, and a queue of what readers have reported. One thing to tell your users: private timelines are hidden from other users, but not from you, the people who run the server."

### Scene 6 · 2:06 – 2:30 · Upgrades and backups

**FRAME:** A terminal: `sudo -u postgres pg_dump -Fc openchronology > backup.dump`, then `sudo apt-get install ./openchronology-server-…-amd64.deb`, then `sudo openchronology-migrate` → "OpenChronology schema installed. OpenChronology restarted." The footer's build ticks from one release to the next ("Build: v0.3.0" → "v0.4.0").

**MOTION:** Commands type on; the version number flips.

**OST:** "Back up. Install. Migrate."

**VO:**
"Upgrading is the same three steps every time: back up the database, install the new package, and run the migration, which updates the schema and restarts the server. Backups are yours to schedule, as with any database."

### Scene 7 · 2:30 – 2:45 · Install the package

**FRAME:** The full stack lit, with the end card: "Install the package", the ◷ wordmark, "docs: Docker deployment · administration".

**MOTION:** Every band lights; the end card fades in and holds.

**OST:** "Install the package."

**VO:**
"The packages and the guides are with every release. Install it for your school, your team or your community, and the timelines stay on your own server."

**[END · ~2:11]**

---

## Appendix A · Narration only (for the voice session)

> Running your own OpenChronology server takes one application and one PostgreSQL database, with an extension that stores times as exact rational numbers. Put it behind your usual HTTPS proxy, and browsers, phones and the desktop app all connect to it.
>
> Every release comes with server packages for Debian, Ubuntu, Rocky Linux and RHEL, Fedora, FreeBSD, macOS through Homebrew, and Windows, plus a Docker Compose setup for anything else, each with checksums to verify.
>
> Check the download, then install the package. On first install it creates its service user, its configuration and a database with the extension in place, and starts the server. With Docker, it's one compose command, and the database runs in its own container.
>
> Then make it yours, in one configuration file. Set the address it's served at, and a name for your site. The first administrator account is created from it. Register Google, GitHub or Facebook if you want those sign-ins, and add email, which turns on password recovery and two-factor authentication.
>
> Day to day, the administration pages cover accounts, storage limits, featured timelines, and a queue of what readers have reported. One thing to tell your users: private timelines are hidden from other users, but not from you, the people who run the server.
>
> Upgrading is the same three steps every time: back up the database, install the new package, and run the migration, which updates the schema and restarts the server. Backups are yours to schedule, as with any database.
>
> The packages and the guides are with every release. Install it for your school, your team or your community, and the timelines stay on your own server.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                           | Source                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | One application (Next.js on Node.js) and PostgreSQL with pgmp                                   | [Docker deployment](../docs/docker.md), [architecture](../docs/architecture.md)                                                      |
| 2     | Packages for Debian, Ubuntu, Rocky/RHEL, Fedora, FreeBSD, Homebrew, Windows; Compose; checksums | [`deploy/`](../deploy/README.md); release notes (v0.4.0)                                                                             |
| 3     | First install creates the user, configuration and database with pgmp, and starts the server     | [`deploy/debian-server/`](../deploy/debian-server/README.md) (`postinst`)                                                            |
| 3     | `docker compose up --build --wait`                                                              | [Docker deployment](../docs/docker.md)                                                                                               |
| 4     | `APP_ORIGIN`, `PLATFORM_NAME` and "Powered by OpenChronology"; bootstrap administrator          | [Administration](../docs/administration.md), [Docker: public hosting](../docs/docker.md#public-hosting)                              |
| 4     | Google, GitHub, Facebook; Resend email enables recovery and MFA                                 | [Authentication](../docs/authentication.md)                                                                                          |
| 5     | Users, quotas, suspension, featuring, reports queue                                             | [Administration](../docs/administration.md), [moderation](../docs/moderation.md)                                                     |
| 5     | Administrators can see private timelines; operators should disclose it                          | [Administration](../docs/administration.md), [FAQ](../docs/faq.md#can-the-sites-administrators-see-my-private-timelines)             |
| 6     | Back up; install; `openchronology-migrate`; its output                                          | [`deploy/debian-server/`](../deploy/debian-server/README.md); [Docker: upgrades and backups](../docs/docker.md#upgrades-and-backups) |

## Appendix C · Questions this audience is likely to ask

1. **What does it need to run?** A machine for the application and PostgreSQL 16 with pgmp (the packages install both); size it to your timelines ([capacity](../docs/capacity.md)).
2. **Can it run without internet access?** Yes; OAuth sign-ins and email need to reach their providers, and are optional.
3. **Single sign-on with our directory?** Not beyond Google, GitHub and Facebook in this version.
4. **Logs and audit?** Administrative actions are recorded in the administration audit; the server's own logs go to the journal or Docker.
5. **The administrator lost their password.** `openchronology-reset-admin-password` on the server ([administration](../docs/administration.md#resetting-the-administrators-password)).
