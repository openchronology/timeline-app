# OpenChronology — Timelines from Logs: Script and Storyboard

**Runtime:** ~2:18 (the scratch narration's cut) · **Format:** animated infographic, **Terminal** look, with captures of the real app for the investigation · **Aspect:** 16:9
**Audience:** system administrators, SREs and on-call engineers, security and incident responders, and safety investigators who reconstruct what happened from records. They live in terminals and will check that the commands are real.
**Purpose:** show how logs become a timeline (files imported, syslog and the systemd journal streamed live), then use one incident's timeline to find a cause across hosts, and finish with the guarantees they need: exact times, retention and scale.

**How it differs:** commands are shown verbatim, as they'd type them; the investigation is the real app on the sample incident, not a drawing.

**Production notes:**

- Narration is 307 words, about 140 wpm when read. Matter-of-fact; an engineer explaining to engineers.
- **The incident is the sample `publicity/video/samples/incident.ochx`** (`incident.mjs`): three hours of made-up syslog from web-1, web-2, db-1 and backup-1, shaped exactly as the receiver makes moments, with **Log severity colors**. A backup job writes to the database's own disk; PostgreSQL panics when it fills; the web servers return 502s for half an hour. The investigator's moments (the page, the find, the fix, the root cause) and two durations sit on top.
- **Commands** in the terminal panels are the documented ones (Appendix B); the API key is shown as `och_key_...`.
- **Accuracy guardrails:**
  - Formats: `syslog`, `rfc5424`, `apache-common`, `apache-combined`, `apache-error`, `nginx-combined`, `nginx-error`, `jsonl`, `journald`, and custom formats from a configuration.
  - The receiver listens on UDP and TCP; the journald follower runs `journalctl --follow` here or over SSH; both write through the public API with an API key.
  - Limits: 200,000 moments per timeline by default; the operator can change it. Retention: **Keep only the last** a period, applied about once an hour.
  - Don't call it a SIEM or claim alerting; it doesn't alert.

---

## ACT 1 · LOGS IN (0:00 – 1:04)

### Scene 1 · 0:00 – 0:20 · An incident is a timeline

**FRAME:** A terminal panel scrolling syslog lines from four hosts. The lines peel off, one by one, and drop onto an axis below as coloured dots: grey for info, yellow for warnings, red for errors.

**MOTION:** The scroll speeds up; dots stream onto the axis and pile into summaries.

**OST:** "Every log line is a moment."

**VO:**
"When something breaks, the first question is always: what happened, and in what order? The answers are in your logs, spread over every host. OpenChronology turns each log entry into a moment on one timeline."

### Scene 2 · 0:20 – 0:44 · Import what you have

**FRAME:** A terminal: `export OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_...`, then `och-import-logs --format syslog --dry-run /var/log/syslog.2.gz`, then `och-import-logs --format nginx-combined --timeline 6f1c… /var/log/nginx/access.log*`. Beside it, a column of format chips: `syslog`, `rfc5424`, `nginx-combined`, `apache-error`, `jsonl`, `journald`, "your own".

**MOTION:** Commands type on; the dry run prints its JSON report (`{ "entries": 12408, "skipped": 0, … }`); chips tick in.

**OST:** "Import the files you have."

**VO:**
"For logs you already have, there's a command-line importer. Point it at syslog files, Apache or nginx logs, JSON lines or the journal, gzipped or not, and try it with a dry run first. Each entry keeps its fields as tags and metadata, and its severity."

### Scene 3 · 0:44 – 1:04 · Or stream them live

**FRAME:** Left: rsyslog on several hosts sending to a receiver box ("syslog receiver · UDP and TCP"). Right: a box "journald follower" with a dotted SSH line to a server. Both feed routing rules (a small JSON snippet: `"host": "db-*"`) that sort entries into two timeline cards, "Database" and "Web". A viewer's screen shows new dots appearing.

**MOTION:** Packets flow along the lines; the rules sort them; the viewer's timeline grows live.

**OST:** "Or stream them as they happen."

**VO:**
"Or stream them as they happen. A syslog receiver listens on UDP and TCP, and a journal follower reads the systemd journal, here or over SSH. Routing rules send each entry to the right timeline, and anyone with it open watches the new entries arrive."

---

## ACT 2 · FINDING WHAT HAPPENED (1:04 – 2:12)

### Scene 4 · 1:04 – 1:30 · The night of the outage

**FRAME:** The browser frame with the incident timeline after **Fit all**: three hours, 2,297 moments, as numbered summaries; the "Disk filling" and "Outage: 502s" bands. The capture zooms into 02:45–03:25 and on into the outage's first minute around 02:52: the summaries split, and the 502s show as a red run from web-1 and web-2, with the database's critical entries just before.

**MOTION:** A continuous zoom; colour floods in as the summaries open.

**OST:** "Three hours. Four hosts. One line."

**VO:**
"Here's one night's incident: three hours of syslog from four hosts, about two thousand three hundred entries. From a distance they're summaries. Zoom into the outage, and the colours tell the story: a run of red five-oh-twos from both web servers, and just before them, critical errors from the database."

### Scene 5 · 1:30 – 2:12 · Follow the cause

**FRAME:** **Separate by tags** with `host:db-1`: the database's entries rise into a track above: disk usage warnings climbing from 85% to 99%, then "No space left on device" and the PANIC. With **View mode** on, the investigator's moment "Root cause: backup on the database volume" opens in the reader, with its notes and "Related to: Disk filling", and "3 more through other relationships". Arcs connect cause to effect on the timeline.

**MOTION:** The db-1 track lifts; the warnings step up in colour from yellow to red; the reader slides in; the arcs draw cause to effect.

**OST:** "Pull out a host. Link cause to effect."

**VO:**
"Separate by tags, choose the database host, and its entries get a track of their own: disk usage climbing for forty minutes, then no space left, and PostgreSQL stops. Go back to the start of the climb and there's a backup job, writing to the database's own disk. Add what you found as moments of your own, link cause to effect, and the timeline becomes the write-up."

---

## ACT 3 · EXACT, AND KEPT IN BOUNDS (2:12 – 2:45)

### Scene 6 · 2:12 – 2:32 · Exact times, bounded growth

**FRAME:** Three panels. (1) An rsyslog timestamp `2026-10-09T08:15:01.123456+02:00` and below it, in green, `1791526501 + 1929/15625`: "microseconds, exactly". (2) A **Keep only the last** field reading "90 days", with old dots falling off the left of an axis. (3) "Up to 200,000 moments a timeline" with "operators can change it".

**MOTION:** The timestamp converts to the fraction; the old dots drop away; the limit chip ticks in.

**OST:** "To the microsecond. Kept in bounds."

**VO:**
"Every entry keeps its exact time, to the microsecond where the log has it, so entries from different hosts sort correctly. A timeline that keeps growing can keep only its recent past, such as the last ninety days. And one timeline holds up to two hundred thousand entries."

### Scene 7 · 2:32 – 2:45 · Point your syslog at it

**FRAME:** A terminal line: `*.* @@timeline.example:5514`, then the end card: "Point your syslog at it", the ◷ wordmark, and "docs: log import · syslog · journald".

**MOTION:** The line types; the end card fades in and holds.

**OST:** "Point your syslog at it."

**VO:**
"Point your syslog at it, and the next time something breaks, the timeline is already there."

**[END · ~2:18]**

---

## Appendix A · Narration only (for the voice session)

> When something breaks, the first question is always: what happened, and in what order? The answers are in your logs, spread over every host. OpenChronology turns each log entry into a moment on one timeline.
>
> For logs you already have, there's a command-line importer. Point it at syslog files, Apache or nginx logs, JSON lines or the journal, gzipped or not, and try it with a dry run first. Each entry keeps its fields as tags and metadata, and its severity.
>
> Or stream them as they happen. A syslog receiver listens on UDP and TCP, and a journal follower reads the systemd journal, here or over SSH. Routing rules send each entry to the right timeline, and anyone with it open watches the new entries arrive.
>
> Here's one night's incident: three hours of syslog from four hosts, about two thousand three hundred entries. From a distance they're summaries. Zoom into the outage, and the colours tell the story: a run of red five-oh-twos from both web servers, and just before them, critical errors from the database.
>
> Separate by tags, choose the database host, and its entries get a track of their own: disk usage climbing for forty minutes, then no space left, and PostgreSQL stops. Go back to the start of the climb and there's a backup job, writing to the database's own disk. Add what you found as moments of your own, link cause to effect, and the timeline becomes the write-up.
>
> Every entry keeps its exact time, to the microsecond where the log has it, so entries from different hosts sort correctly. A timeline that keeps growing can keep only its recent past, such as the last ninety days. And one timeline holds up to two hundred thousand entries.
>
> Point your syslog at it, and the next time something breaks, the timeline is already there.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                  | Source                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 2     | `och-import-logs` with its formats, gzipped files, `--dry-run`, `--timeline`                                                           | [Importing log files](../docs/log-import.md)                                   |
| 2     | Fields become tags and metadata; severity kept                                                                                         | [Log import: formats](../docs/log-import.md#formats); `server/log-formats.mjs` |
| 3     | Syslog receiver on UDP and TCP; routing rules; live refresh for viewers                                                                | [Syslog](../docs/syslog.md), [routing](../docs/syslog.md#routing)              |
| 3     | Journald follower, here or over SSH                                                                                                    | [The systemd journal](../docs/journald.md)                                     |
| 4–5   | The incident: 2,297 moments, four hosts, three hours; disk warnings 85% → 99% from 02:10 to 02:45, the PANIC at 02:52; backup at 02:05 | `incident.mjs` (made up)                                                       |
| 5     | Separate by tags on `host:db-1`; relationships; the reader                                                                             | [Tags](../docs/tags.md), [relationships](../docs/relationships.md)             |
| 6     | `08:15:01.123456+02:00` is exactly `1791526501 + 1929/15625`                                                                           | [Log import: formats](../docs/log-import.md#formats)                           |
| 6     | **Keep only the last**; about once an hour                                                                                             | [Data retention](../docs/retention.md)                                         |
| 6     | 200,000 moments per timeline; operators can change it                                                                                  | [Guide: large timelines](../docs/guide.md#large-timelines)                     |
| 7     | rsyslog forwarding line                                                                                                                | [Syslog: set up](../docs/syslog.md#set-up) (`*.* @@127.0.0.1:5514` there)      |

## Appendix C · Questions this audience is likely to ask

1. **Does it alert?** No. It's for reading and reconstructing, not monitoring.
2. **What about more than 200,000 entries?** Route to several timelines (per host or service), use retention, or raise the limit on your own server.
3. **Where do the entries count?** Against the storage of the account whose API key writes them.
4. **Can I import history and then stream without duplicates?** Yes, for the journal: the importer and the follower make the same moments with the same IDs.
