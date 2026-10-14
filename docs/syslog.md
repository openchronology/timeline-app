# Syslog to timelines

`server/syslog-receiver.mjs` listens for syslog over UDP and TCP and adds each message as a moment to the timelines chosen by your routing rules. To import historic log files (syslog, Apache, nginx, JSON lines, journald), use the [log importer](log-import.md) instead of replaying them into the receiver. It uses the public API with an [API key](administration.md#api-keys), so it can run beside the platform or on another machine, and viewers with the timeline open see new messages as they arrive ([live refresh](comparison.md#live-refresh)).

## Set up

1. Create the timelines to receive logs. Choose the **Gregorian** time display (**Time display**), because moments are placed at their Unix time in seconds.
2. In **Account → API keys**, create a key with **read/write** access for an account that can write those timelines. Moments count towards that account's storage quota.
3. Write the routing rules (below) to `syslog-routes.json`.
4. Run the receiver:

```sh
# With Docker Compose, next to the platform (listens on host loopback port 5514):
SYSLOG_API_KEY=och_key_... docker compose --profile syslog up -d syslog

# Or directly, against any OpenChronology server:
OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_... \
  SYSLOG_ROUTES=./syslog-routes.json npm run syslog
```

5. Point a sender at it, for example rsyslog: `*.* @@127.0.0.1:5514` (TCP) or `*.* @127.0.0.1:5514` (UDP), or `logger --server 127.0.0.1 --port 5514 --tcp "hello"`.

| Variable                     | Default              | Meaning                                                                                                                                  |
| ---------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `OCH_API_URL`                | (required)           | The server's origin, such as `https://timescale.info`. Compose uses `http://app:5173`.                                                   |
| `OCH_API_KEY`                | (required)           | A read/write API key (`och_key_…`). In Compose, set `SYSLOG_API_KEY`.                                                                    |
| `SYSLOG_ROUTES`              | `syslog-routes.json` | Path of the routing rules; `SYSLOG_ROUTES_JSON` may hold the rules inline instead. In Compose, `SYSLOG_ROUTES_FILE` names the host file. |
| `SYSLOG_HOST`, `SYSLOG_PORT` | `127.0.0.1`, `5514`  | Address and port for both UDP and TCP.                                                                                                   |
| `SYSLOG_FLUSH_MS`            | `1000`               | How long messages gather before they are saved; 500 queued messages save at once.                                                        |
| `SYSLOG_QUEUE_LIMIT`         | `10000`              | Messages kept per timeline while the server is unreachable; beyond it the oldest are dropped.                                            |
| `SYSLOG_TIMEZONE`            | `UTC`                | Time zone of BSD timestamps, which carry none: `UTC`, `+02:00` or an IANA name such as `Europe/Berlin`.                                  |

The receiver has no TLS or sender authentication: keep it on a trusted network (Compose publishes it on host loopback only) and relay remote logs to it with a syslog daemon that provides TLS.

## Routing

```json
{
  "routes": [
    { "timeline": "6f1c…", "host": ["web-*", "edge-?"], "severity": "err", "continue": true },
    { "timeline": "0b7e…", "app": "sshd", "facility": ["auth", "authpriv"] },
    { "timeline": "9a42…", "msgid": "deploy" }
  ],
  "default": "c3d9…"
}
```

Each route names a `timeline` (its UUID, from the timeline's address) and optional conditions; every condition given must match.

- `host`, `app` and `msgid` are patterns where `*` matches any text and `?` one character, ignoring case. A list matches any of its patterns.
- `facility` is a facility name (`kern`, `user`, `mail`, `daemon`, `auth`, `syslog`, `lpr`, `news`, `uucp`, `cron`, `authpriv`, `ftp`, `ntp`, `security`, `console`, `solaris-cron`, `local0`–`local7`) or a list of them.
- `severity` is a level (`emerg`, `alert`, `crit`, `err`, `warning`, `notice`, `info`, `debug`) and matches that level or more severe.

A message goes to the first route that matches. If that route sets `"continue": true`, later routes are checked too, so one message can reach several timelines. A message no route matches goes to `default`, or is dropped (and counted) when there is none. The rules are checked when the receiver starts, which refuses unknown settings and invalid values.

## Messages as moments

Both [RFC 5424](https://www.rfc-editor.org/rfc/rfc5424) and the BSD format of [RFC 3164](https://www.rfc-editor.org/rfc/rfc3164) are read; TCP accepts octet-counted and newline-separated framing ([RFC 6587](https://www.rfc-editor.org/rfc/rfc6587)). Messages up to 64 KiB are accepted.

- **Time** is the message's timestamp in exact Unix seconds, including RFC 5424 fractions of a second and time-zone offsets. rsyslog's ISO lines (`2026-10-09T08:15:01.123+02:00 host app[pid]: …`, which some relays forward) keep their time. BSD timestamps have no year or zone: they are read in `SYSLOG_TIMEZONE` (UTC unless set), in the year that puts them nearest to when they arrived. Messages without a timestamp use the time they arrived.
- **Title** is the first line of the message (up to 200 characters); longer or multi-line messages keep the full text, up to 16 KiB, as notes.
- **Tags** are `syslog`, `severity:<level>`, `facility:<name>`, `host:<host>` and `app:<app>`, so **Separate by tags** and search can pick out a host, an application or the errors.
- **Additional metadata** keeps the parsed fields under `syslog`: format, facility, severity, host, app, process ID, message ID and RFC 5424 structured data.
- Text that matches neither format is kept whole as a `user.notice` message received now.

## Delivery

Messages for each timeline gather for `SYSLOG_FLUSH_MS` and are saved together through `PUT /api/timelines/<id>/changes`, at most 5,000 at a time, fewer while saves are slow: one taking 8 s or more halves the next ones (down to 64), as does one the server stops as too slow (503, sent again halved), and quick full saves let them grow back. Each save sends the timeline's current revision. If someone else saved in between (409), the receiver fetches the new revision and saves again. While the server is unreachable, rate-limited (429) or failing (5xx), messages stay queued and the receiver retries with growing delays up to 30 seconds. Each message has an ID fixed when it arrives, so a save that is retried never adds a moment twice. A save refused for another reason (no write access, missing timeline, storage quota) is dropped and logged.

The receiver logs its counts every minute: received, invalid, unmatched, queued, sent, dropped (queue limit) and rejected. On `SIGTERM` or `SIGINT` it stops listening and saves what is queued, waiting up to ten seconds.

API keys are rate-limited per key (`API_KEY_REQUESTS_PER_MINUTE`, default 120). The receiver makes about one save per second per busy timeline, so the default fits one or two busy timelines; raise the limit for more.

## Keeping recent logs

Log timelines grow without end. Set **Keep only the last** (say `90 days`) in a timeline's **Sharing & settings**, and the server deletes older moments and history about once an hour, freeing storage; see [data retention](retention.md). Turn off **Keep saved history** there too: nobody reviews a log's past revisions, and without them it takes about half the storage ([timelines without saved history](collaboration.md#timelines-without-saved-history)).

## Realtime testing

`test/syslog-live-postgres.mjs` runs the whole path against PostgreSQL and the production Next.js server: syslog over UDP and TCP, the receiver, the API, the live event stream and an open editor in Chromium. It checks that:

- moments appear in the open editor without reloading, and routing sends other messages to the default timeline;
- **Follow latest** moves an idle viewer to messages arriving outside its view;
- after the server restarts mid-stream, the receiver resends what it queued and the viewer reconnects and catches up;
- a sustained-rate soak delivers every message exactly once, measuring how long each takes to reach the viewer.

CI soaks at 20 messages a second for ten seconds. `npm run bench:realtime` soaks at 100 a second for a minute; set `SOAK_RATE` and `SOAK_SECONDS` to change it. Results are in [benchmarks](benchmarks.md#realtime-updates).
