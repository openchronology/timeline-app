# OpenChronology — Short 8: 2:58 a.m., Everything's Down. Script and Storyboard

**Runtime:** ~0:35 · **Shape:** the zoom · **Look:** Terminal · **Aspect:** 9:16
**For:** developers and on-call engineers on tech feeds. Everyone who has been paged knows the first question (what broke first?) and the pain of answering it from four hosts' logs; the hook is that moment, and the payoff is the answer appearing on a timeline.
**Purpose:** the page at 2:58 a.m., then the made-up incident on a phone: zoom into the outage, separate the database's entries, find the cause at the start of the climb. End on streaming syslog into it.
**Points to:** Video 10, timelines from logs.

**Production notes:**

- About 90 words, an engineer telling the story the morning after: dry, a little wry.
- **The timeline is the sample `publicity/video/samples/incident.ochx`**, captured at phone size and shown in `phoneShot`, with **Separate by tags** on `host:db-1`. A small note on screen in Scene 2 says the incident is made up.

---

## ACT 1 · THE PAGE (0:00 – 0:05)

### Scene 1 · 0:00 – 0:05 · Paged

**FRAME:** A phone's lock screen, large: "02:58" and one alert notification, "web: 502 rate above threshold". Already whole at frame 0.

**MOTION:** The notification shakes once, as a buzz.

**OST:** "2:58 a.m. Everything's down."

**VO:**
"Two fifty-eight a.m. You're paged: the site is down. What broke first?"

---

## ACT 2 · THE ANSWER (0:05 – 0:29)

### Scene 2 · 0:05 – 0:13 · One timeline

**FRAME:** The phone, the whole incident sample: three hours of syslog from four hosts, summaries along the line, the outage's band. A chip beside it: "2,297 log entries · 4 hosts". A small note at the foot of the phone: "A made-up incident".

**MOTION:** The phone rises in; the chip ticks in on "four".

**OST:** "Every host, one timeline"

**VO:**
"Three hours of syslog from four hosts, on one timeline. Zoom into the outage: five-oh-twos from both web servers, and right before them, the database."

### Scene 3 · 0:13 – 0:22 · The database's track

**FRAME:** **Separate by tags** with `host:db-1`: its entries lift into a track of their own: disk warnings climbing from 85 % to 99 %, then "No space left on device", then the PANIC. A bar beside the phone: "disk filling · ~40 min".

**MOTION:** The entries lift on "pull"; the bar fills as "forty minutes" is said; the PANIC flashes red.

**OST:** "Pull out the database"

**VO:**
"Pull out the database's own entries: its disk filling for forty minutes, then no space left."

### Scene 4 · 0:22 – 0:29 · The cause

**FRAME:** The phone zooms back to the start of the climb at 02:05: the backup job's cron entry, "nightly-dump --target db-1", and an arc from it to the PANIC. A chip: "root cause".

**MOTION:** The zoom eases left; the arc draws from cause to effect on "same disk"; the chip pops.

**OST:** "Found it"

**VO:**
"And at the start of the climb: a backup job, writing to the database's own disk."

---

## ACT 3 · THE END (0:29 – 0:35)

### Scene 5 · 0:29 – 0:35 · Already there

**FRAME:** `shortEnd` with "Point your syslog at it".

**MOTION:** The phone eases away; the end card rises and holds.

**OST:** ""

**VO:**
"Point your syslog at OpenChronology, and next time, the timeline's already there. It's free."

**[END · ~0:35]**

---

## Appendix A · Narration only (for the voice session)

> Two fifty-eight a.m. You're paged: the site is down. What broke first?
>
> Three hours of syslog from four hosts, on one timeline. Zoom into the outage: five-oh-twos from both web servers, and right before them, the database.
>
> Pull out the database's own entries: its disk filling for forty minutes, then no space left.
>
> And at the start of the climb: a backup job, writing to the database's own disk.
>
> Point your syslog at OpenChronology, and next time, the timeline's already there. It's free.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                    | Source                                                               |
| ----- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1     | Paged at 02:58 (the 502 alert after five minutes over threshold)                                         | `incident.mjs` (made up)                                             |
| 2     | 2,297 entries, four hosts, three hours; 502s from web-1 and web-2 from 02:52:10                          | `incident.mjs`; [Video 10](../10-timelines-from-logs.md), Appendix B |
| 3     | Disk warnings 85 % → 99 % from 02:10 to 02:45 ("about forty minutes"); no space left, the PANIC at 02:52 | `incident.mjs`                                                       |
| 4     | The backup job at 02:05, targeting db-1's own volume                                                     | `incident.mjs`                                                       |
| 3     | **Separate by tags** on `host:db-1`                                                                      | [Tags](../../docs/tags.md)                                           |
| 5     | A syslog receiver feeds timelines live                                                                   | [Syslog](../../docs/syslog.md)                                       |

## Appendix C · Posting

- **Title (Shorts):** Paged at 2:58 a.m. What broke first?
- **Caption:** Three hours of syslog from four hosts on one timeline: zoom into the outage, pull out the database's entries, and the cause is right where the disk started filling. (The incident is made up; the tool is real.) Free and open source, link in bio. #devops #sre #oncall #linux #sysadmin
- **Cover:** frame 0 (the lock screen at 02:58 and the headline).
- **Pinned comment:** "OpenChronology takes syslog (UDP/TCP), the systemd journal and log files: github.com/openchronology/timeline-app"
