---
label: Operations
heading: Your logs and incidents on one timeline
title: Log and incident timelines from syslog and journald
promise: Stream syslog and the systemd journal into timelines, import old log files, and watch an incident unfold to the microsecond.
description: OpenChronology for operations: syslog and journald receivers, a log importer for syslog, Apache, nginx and JSON lines, live updates and retention.
card: Syslog, journald and log files, live and at their exact times.
---

## What you can do

- **Stream logs live.** The syslog receiver listens over UDP and TCP, and the journald follower reads the systemd journal, on this machine or over SSH. Routing rules choose each message's timeline, and an open timeline shows new entries as they arrive.
- **Import old logs.** `och-import-logs` reads syslog, RFC 5424, Apache, nginx, JSON lines and `journalctl -o json`, one moment per entry, with its fields kept.
- **See severity at a glance.** The **Log severity colors** plugin colors entries from debug gray to critical red.
- **Write up the incident beside the logs.** Add the cause, the outage and what was done as moments and durations on the same line.
- **Keep only the recent past.** Set **Keep only the last** to a period such as `90 days`, and about once an hour the server deletes older moments.

## What you can count on

- **Exact times.** `2026-10-09T08:15:01.123456+02:00` is stored exactly, fractions kept.
- **No duplicates.** A journal history imported first and a live stream started afterwards make the same moments, with the same IDs.
- **Scoped keys.** The receivers write through the API with a key that reaches timelines only, read or read/write, with an expiry and a rate limit.
- **Packaged.** The Debian and Ubuntu packages install the receivers as services beside the server.
