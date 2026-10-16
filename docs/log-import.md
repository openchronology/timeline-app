# Importing log files

`och-import-logs` (`server/import-logs.mjs`) imports historic logs into timelines: one moment per log entry, at the entry's exact time, with its fields as metadata. It runs beside the [syslog receiver](syslog.md) and the [journald follower](journald.md), which handle live streams, and uses the same API key, variables and routing rules.

```sh
export OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_...

och-import-logs --format nginx-combined --timeline 6f1c… /var/log/nginx/access.log*
och-import-logs --format syslog --timezone +02:00 --dry-run /var/log/syslog.2.gz
journalctl -o json --since yesterday | och-import-logs --format journald --timeline 0b7e… -
och-import-logs --config import.json --format myapp app.log
```

Set up the timelines and an API key as for the [syslog receiver](syslog.md#set-up): **Gregorian** time display, and a **read/write** key of an account that can write them. `npm run import:logs -- …` runs it from a checkout; packages and images install the `och-import-logs` command ([below](#packages)).

## Options

| Option                      | Meaning                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--format <name>`           | A [built-in format](#formats) or one from the configuration.                                                                                       |
| `--config <file>`           | JSON configuration: custom formats, routes, filters ([below](#configuration)).                                                                     |
| `--timeline <uuid>`         | The timeline for entries no route matches (the routing `default`).                                                                                 |
| `--timezone <zone>`         | Zone of times without one: `UTC`, `+02:00` or an IANA name such as `Europe/Berlin` (daylight saving time included). Default: this computer's zone. |
| `--year <year>`             | Year of the first classic syslog time (see [years](#years)).                                                                                       |
| `--only <filter>`           | Import only matching entries: `status>=400`, `host=web-*`, `method!=GET`, `severity>=warning`. Repeat to require several.                          |
| `--since`, `--until <time>` | Import entries in this range (ISO 8601, inclusive).                                                                                                |
| `--dry-run`                 | Read everything and report, without writing ([below](#dry-run)).                                                                                   |
| `--sample <n>`              | Moments `--dry-run` prints (default 3).                                                                                                            |
| `--quiet`                   | No progress display; the final summary is still printed.                                                                                           |

Files are read in the order given, line by line. Gzipped files (by their contents, whatever their name) are read as they are; `-` reads standard input. Exit codes: **0** imported; **1** some entries were refused or could not be saved; **2** a usage or configuration error; **3** the import does not fit the account's storage quota (nothing was written).

## Formats

| Format            | Reads                                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `syslog`          | Syslog files: rsyslog's ISO lines (`2026-10-09T08:15:01.123456+02:00 host app[pid]: …`), classic lines (`Oct  9 08:15:01 host app[pid]: …`) and lines with a priority.            |
| `rfc5424`         | Lines with a `<priority>`: RFC 5424, and RFC 3164 (the receiver's parser).                                                                                                        |
| `apache-common`   | Apache's common log format.                                                                                                                                                       |
| `apache-combined` | Apache's combined format (referer and user agent).                                                                                                                                |
| `nginx-combined`  | nginx's default access format; fields appended after it are kept as `extra`.                                                                                                      |
| `apache-error`    | Apache 2.2 and 2.4 error logs; the level becomes the severity.                                                                                                                    |
| `nginx-error`     | nginx error logs; the level becomes the severity, and `client`, `server`, `request`, `upstream` and `host` are read from the message.                                             |
| `jsonl`           | One JSON object per line. The time is the first of `time`, `timestamp`, `@timestamp`, `ts`, `date`; numbers are epoch seconds, milliseconds, microseconds or nanoseconds by size. |
| `journald`        | `journalctl -o json`: `__REALTIME_TIMESTAMP`, `MESSAGE` (also byte arrays), `PRIORITY`, host, application, process, unit and facility.                                            |

Each format turns an entry into named **fields**, a **severity** (syslog levels, or none) and an exact **time** in Unix seconds, fractions kept: `2026-10-09T08:15:01.123456+02:00` is exactly `1791526501 + 1929/15625`. Access logs also get `method`, `path`, `protocol` and `status_class` (`2xx`…`5xx`); their severity is `err` for 5xx, `warning` for 4xx and `info` otherwise. A `-` field is empty. Lines a format cannot read are skipped and counted; the first are reported.

### Years

Classic syslog times have no year. The first line of each file takes the latest year that puts it at or before the file's modification time (for standard input, now), or `--year`. Later lines keep that year and step to the next when a time falls more than half a year before the previous line, as a log crossing New Year does. A line written a little out of order does not step the year; one written late across New Year itself (`Dec 31` after `Jan  1`) is placed a year late.

## Configuration

```json
{
  "formats": {
    "myapp": {
      "pattern": "^(?<ts>\\S+ \\S+) (?<level>[A-Z]+) +\\[(?<thread>[^\\]]+)\\] (?<message>.*)$",
      "time": { "field": "ts", "as": "iso" },
      "multiline": { "start": "^\\d{4}-\\d{2}-\\d{2} " },
      "tags": ["myapp", "severity:{severity}", "thread:{thread}"]
    },
    "timed": {
      "extends": "nginx-combined",
      "pattern": "… (?<request_time>[\\d.]+)$",
      "types": { "status": "int", "bytes": "int", "request_time": "number" },
      "duration": { "field": "request_time", "unit": "s" }
    }
  },
  "format": "myapp",
  "timezone": "Europe/Berlin",
  "routes": [{ "timeline": "6f1c…", "status": ">=500", "continue": true }],
  "default": "0b7e…",
  "only": ["status>=400"]
}
```

The configuration may set `format`, `formats`, `timezone`, `year`, `routes`, `default`, `only`, `since`, `until` and `multiline`; options on the command line take precedence. Unknown settings are refused.

A **format** is a `pattern` (a JavaScript regular expression whose named groups become fields) or `"json": true`, with:

- `time`: `{ "field", "as" }`, where `as` is `iso`, `apache` (`10/Oct/2026:13:55:36 -0700`), `ctime` (`Fri Oct 09 08:15:01.123 2026`), `nginx` (`2026/10/09 08:15:01`), `syslog` (classic), `epoch-s`, `epoch-ms`, `epoch-us` or `epoch-ns`. A list of fields takes the first present. `timezone` overrides the zone for this format.
- `types`: fields as `string`, `int`, `number`, `bool` or `json` (embedded JSON).
- `extends`: a built-in format whose settings this one starts from.
- `multiline`: `{ "start": regex }` (a line not matching starts no new entry) or `{ "continuation": regex }` (a matching line continues the previous one), for stack traces and other entries spanning lines. Entries are kept up to 64 KiB.

## Moments

Each entry becomes a moment; the mapping is part of each format and can be overridden there.

- **Title** and **notes** are templates over the fields: `"{method} {path} → {status}"`. `{a.b}` reads into objects; `{line}` is the entry's whole text and `{message}` defaults to it. The title is the first line, up to 200 characters; the notes default to the whole entry, up to 16 KiB.
- **Tags** are templates, such as `["status:{status_class}", "vhost:{vhost}"]`. A tag whose fields are empty is left out; tags are made valid (lowercase, without commas or control characters, up to 64 characters, at most 40).
- **Metadata** stores every field, typed by the format, under `metadata.<format>` (`metadata.syslog` for syslog, as the receiver does). Set `"keepFields": false` to leave it out. A `metadata` template adds any JSON structure: strings are templates; `{ "$field": "status", "type": "int" }`, `{ "$template": "{ms}", "type": "number" }` and `{ "$const": … }` are values; other objects and arrays nest; empty values are dropped. Use it to fill keys plugins read (sources, colors, icons, stacks), so imported moments look right in the editor. `title`, `description` and `tags` are set by the options above.
- **Severity** comes from the format, or from `"severity": { "field": "lvl", "map": { "W": "warning" }, "rules": [{ "contains": "error", "severity": "err" }, { "match": "time ?out", "field": "line", "severity": "warning" }], "default": "info" }`. Rules check the message (or `field`) in order; the first that matches applies.
- **Durations**: `"duration": { "field": "request_time", "unit": "s" | "ms" | "us" | "ns" }` adds a duration from `time − request_time` to `time`, with the same metadata.

Each moment is checked as the server would check it, so an invalid one (a malformed plugin value, say) is refused alone and reported, instead of failing its batch.

## Routing

Routes are the [receiver's](syslog.md#routing), generalised to any field: each condition is a glob pattern (or a list of them), a numeric comparison (`">=500"`, `"<400"`, `"!=200"`), `severity` (that level or more severe) or `facility`. Dotted names read into objects (`"http.version"`). The first matching route wins; `"continue": true` checks later routes too; entries no route matches go to `default` (`--timeline`) or are counted as unrouted. Without a route or timeline only `--dry-run` runs.

## Delivery

- **One moment per entry, always.** Nothing is aggregated or sampled: PostgreSQL summarises dense stretches at whatever zoom a viewer is at, without losing entries ([duration summaries](durations.md#summaries)). `--only`, `--since` and `--until` choose what to import.
- **Nothing is dropped.** Moments go to each timeline in batches, and reading waits for each save (backpressure). A batch is at most `max(64, the timeline's moments ÷ 2)` entries (a moment and its duration count two), so the server applies each save in place; a larger save would rebuild the timeline's whole index each time. Batches therefore grow with the timeline, up to 5,000 entries or 12 MiB. Each save also adapts to how long the server takes: one taking 8 s or more halves the next ones (down to 64 entries), as does one the server stops as too slow (503, sent again halved), and quick full saves let them grow back. A save that is rate-limited (429), refused by a busy or failing server (5xx) or unreachable is retried with growing delays (honouring `Retry-After`); a 409 (someone else saved) fetches the new revision and sends again. A batch refused for another reason is reported, and the exit code is 1.
- **Re-runnable.** Moment IDs derive from each entry's text and its occurrence among identical entries at the same time (`log:<hash>` and `log:<hash>.1`, …), so importing the same logs again overwrites rather than duplicates; the server skips changes identical to what it stores. journald entries are named by their journal cursor instead (`__CURSOR`): journalctl prints an entry's fields in a different order each time, so its text changes from one run to the next. Before this release, journald imports were named by that text, so importing an overlapping range again added duplicates; journald moments imported since are named the same whenever they are imported, and the same as the [journald follower](journald.md) names them live. Identical entries more than 1,024 distinct times apart in a log (not normally possible, since they would share a time) would share an ID.
- **Storage.** When the account has a quota, the importer first reads everything to estimate the storage the import adds, as the server charges it (the timeline's growth, the versions each save keeps in [history](architecture.md#saved-history), and one copy of the timeline when its history starts being kept as rows), and writes nothing if it does not fit (exit code 3). The estimate starts from each timeline's current size.
- **Speed** follows the API key's rate limit (`API_KEY_REQUESTS_PER_MINUTE`, default 120): a million entries take about 500 saves. Raise the limit for large imports.

## Keeping recent logs

Log timelines grow without end. Set **Keep only the last** (say `90 days`) in a timeline's **Sharing & settings**, and the server deletes older moments and history about once an hour, freeing storage; see [data retention](retention.md). Turn off **Keep saved history** there too: nobody reviews a log's past revisions, and without them it takes about half the storage ([timelines without saved history](collaboration.md#timelines-without-saved-history)).

## Dry run

`--dry-run` reads and maps everything without writing, and prints JSON to standard output: entries per timeline, skipped, filtered, unrouted and refused counts, the storage estimate, and, with `OCH_API_URL` and `OCH_API_KEY` set, the account's usage, quota and whether the import fits; then the first problems and the first moments (`--sample`).

## Progress

A progress line on standard error shows bytes read of the total (a spinner for standard input), entries read, moments saved per timeline, the rate, the elapsed time and an estimate of the time left, and skipped, filtered, unrouted and refused counts. On a terminal it redraws in place a few times a second; elsewhere (CI, pipes) it prints a line every ten seconds; `--quiet` turns it off. A summary is always printed at the end.

## Packages

- **Checkout:** `npm run import:logs -- --help`, or the `och-import-logs` command from `npm link`.
- **Docker:** the web image includes the command, so it runs beside the Compose `syslog` service with its variables:

  ```sh
  docker compose run --rm -v /var/log:/logs:ro syslog och-import-logs --format syslog /logs/syslog.1
  ```

- **Debian and Ubuntu package:** `/usr/bin/och-import-logs`, using `OCH_API_URL` and `OCH_API_KEY` from the environment or, when unset and readable, `/etc/openchronology/syslog.env`.
