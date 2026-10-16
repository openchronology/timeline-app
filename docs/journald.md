# The systemd journal to timelines

`server/journald-receiver.mjs` follows the systemd journal and adds each entry as a moment to a timeline, or to the timelines chosen by routing rules ([#151](https://github.com/openchronology/timeline-app/issues/151)). It runs `journalctl --follow --output=json`, on this machine or over SSH on another. It writes through the public API with an [API key](administration.md#api-keys), and viewers with the timeline open see new entries as they arrive.

It reads entries exactly as the [log importer](log-import.md) reads `journalctl -o json`, and makes the same moments with the same IDs. A history imported with `och-import-logs --format journald` and a live stream started afterwards fit together: entries both cover are the same moments, never duplicates.

## Journald or syslog?

Services run by systemd (Forgejo, nginx, PostgreSQL, sshd) write to the journal. The journal can also forward to syslog (`ForwardToSyslog=` in `journald.conf`, or rsyslog's `imjournal`), so the [syslog receiver](syslog.md) can receive the same messages. Here is what each carries:

|                                                                                                                                                                              | Journald follower                                       | Syslog receiver (forwarded from the journal)                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| Message text                                                                                                                                                                 | Yes                                                     | Yes                                                                        |
| Time                                                                                                                                                                         | To the microsecond                                      | To the second (RFC 3164), or as precise as the sender's RFC 5424 timestamp |
| Severity, facility, host, program, process ID                                                                                                                                | Yes                                                     | Yes                                                                        |
| systemd unit (`forgejo.service`)                                                                                                                                             | Yes: a `unit:` tag, and routes can match it             | No                                                                         |
| Everything else the journal keeps: user and group, command line, executable, boot ID, source file and line, a program's own structured fields (`CODE_FUNC`, `MESSAGE_ID`, …) | Yes, under **Additional metadata** (`journald`)         | No                                                                         |
| The same moments as importing `journalctl -o json`                                                                                                                           | Yes                                                     | No: a different format, with different IDs                                 |
| Missing nothing while it is down                                                                                                                                             | Yes: it resumes after the last entry sent               | No: messages sent while it is down are lost unless the sender queues them  |
| Senders                                                                                                                                                                      | This machine's journal, or one other machine's over SSH | Any number of machines and devices, over UDP or TCP                        |

So for Forgejo's history imported with `journalctl`, the journald follower gives the same data live. The syslog receiver gives the message lines, but loses the unit and the journal's own fields. Its moments aren't the same ones the import made, so a range covered by both would appear twice.

## Set up

1. Create the timeline to receive the entries. Choose the **Gregorian** time display, because moments are placed at their Unix time.
2. In **Account → API keys**, create a **read/write** key for an account that can write the timeline. Moments count towards that account's storage quota.
3. Configure and start it.
   - **Debian or RPM package:** edit `/etc/openchronology/journald.env`, then run `sudo systemctl enable --now openchronology-journald`. The service runs as `openchronology` in the `systemd-journal` group, which may read the system journal.
   - **From a checkout:**

     ```sh
     OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_... \
       JOURNALD_TIMELINE=<timeline UUID> JOURNALD_UNITS=forgejo.service npm run journald
     ```

     The account running it must be able to read the journal: root, or a member of the `systemd-journal` (or `adm`) group.

| Variable                                    | Default                                                                                                     | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OCH_API_URL`                               | (required)                                                                                                  | The server's origin, such as `https://timescale.info`.                                                                                                                                                                                                                                                                                                                                                                          |
| `OCH_API_KEY`                               | (required)                                                                                                  | A read/write API key (`och_key_…`).                                                                                                                                                                                                                                                                                                                                                                                             |
| `JOURNALD_TIMELINE`                         |                                                                                                             | The timeline every entry goes to. Or:                                                                                                                                                                                                                                                                                                                                                                                           |
| `JOURNALD_ROUTES`                           |                                                                                                             | Path of routing rules, as for the [log importer](log-import.md#routing): `{"routes": [{"timeline": "<uuid>", "unit": "forgejo.service"}, {"timeline": "<uuid>", "severity": "warning"}], "default": "<uuid>"}`. Rules may match any journal field (`_SYSTEMD_UNIT`, `SYSLOG_IDENTIFIER`, `_HOSTNAME`, …) and the derived `unit`, `app`, `host`, `severity` and `facility`. `JOURNALD_ROUTES_JSON` may hold them inline instead. |
| `JOURNALD_UNITS`                            | (all)                                                                                                       | Only these systemd units, comma-separated (`journalctl --unit`).                                                                                                                                                                                                                                                                                                                                                                |
| `JOURNALD_MATCHES`                          |                                                                                                             | Journal matches, space-separated `FIELD=value` (`SYSLOG_IDENTIFIER=forgejo _UID=1001`).                                                                                                                                                                                                                                                                                                                                         |
| `JOURNALD_SINCE`                            | `now`                                                                                                       | Where the first run starts (`journalctl --since`): `now`, `-1h`, `2026-10-01 00:00:00`, or `today`. Later runs resume after the last entry sent, wherever this says.                                                                                                                                                                                                                                                            |
| `JOURNALD_CURSOR_FILE`                      | `$STATE_DIRECTORY/cursor` (the package's `/var/lib/openchronology-journald/cursor`), else `journald.cursor` | Where the cursor of the last entry sent is kept.                                                                                                                                                                                                                                                                                                                                                                                |
| `JOURNALD_HOST`                             |                                                                                                             | Another machine to follow, over SSH: `logs@forge.example.org`.                                                                                                                                                                                                                                                                                                                                                                  |
| `JOURNALD_SSH_KEY`                          |                                                                                                             | The SSH key for `JOURNALD_HOST`, readable by the account running the follower.                                                                                                                                                                                                                                                                                                                                                  |
| `JOURNALD_COMMAND`                          | `journalctl`                                                                                                | The journalctl to run.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `JOURNALD_FLUSH_MS`, `JOURNALD_QUEUE_LIMIT` | `1000`, `10000`                                                                                             | As for the [syslog receiver](syslog.md#set-up).                                                                                                                                                                                                                                                                                                                                                                                 |

### Another machine's journal

To follow a service on another machine, such as Forgejo on its own server, use one of these:

- **Over SSH:** set `JOURNALD_HOST` and `JOURNALD_SSH_KEY`.
  - **On the other machine:** the account needs only to read the journal (add it to `systemd-journal`). A forced command in its `authorized_keys` can limit the key to `journalctl`.
  - **Host keys:** the follower accepts the host's key the first time, and checks it after. It keeps the key in `known_hosts` beside its cursor.
  - **Reconnecting:** if the connection drops, it reconnects after the last entry it read.
- **Run the follower there:** install the server package (and leave the platform disabled), or run it from a checkout, with `OCH_API_URL` pointing at the platform.
- **Collect the journals onto one machine** with `systemd-journal-upload` and `systemd-journal-remote`, and follow them there. Use `JOURNALD_MATCHES=_HOSTNAME=forge`, or routes by `host`, to tell the machines apart.

## Entries as moments

These are the [log importer's journald moments](log-import.md#moments):

| Part                                 | From                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Time                                 | `__REALTIME_TIMESTAMP`, to the microsecond                                       |
| Title                                | The first line of `MESSAGE`                                                      |
| Notes                                | The entry as journalctl printed it                                               |
| Tags                                 | `journald`, `severity:<level>`, `host:<host>`, `app:<identifier>`, `unit:<unit>` |
| **Additional metadata** (`journald`) | Every field of the entry                                                         |

Each moment's ID comes from the entry's journal cursor. journalctl prints an entry's fields in a different order each time, so the cursor is what stays the same.

## Delivery and restarts

Entries gather for `JOURNALD_FLUSH_MS` and are saved together, retried and backed off as the [syslog receiver's](syslog.md#delivery) are.

- **The cursor:** once everything read so far has been sent, it keeps the cursor of the last entry.
- **Restarting:** a restart (an upgrade, a reboot, a crash) runs journalctl again with `--after-cursor`. Nothing written meanwhile is missed, and nothing sent is sent again.
- **After a crash:** at worst, the entries since the last kept cursor are read twice. They have the same IDs, so they only overwrite.
- **If journalctl stops** (the journal was vacuumed, or an SSH connection dropped), it is started again after the last entry read. Repeated quick failures, such as journalctl missing, no permission or SSH refused, back off up to a minute and are logged.

The journal keeps entries only as long as its own retention (`SystemMaxUse=`, `MaxRetentionSec=` in `journald.conf`). A follower stopped for longer than that resumes from the oldest entry still kept. To keep only recent moments in the timeline, use the timeline's own [retention](retention.md).

## Testing

`test/journald.test.mjs` covers the command, the moments, the cursor and restarting, with a stand-in journalctl. `test/journald-live-postgres.mjs` follows the real journal end to end. It writes entries with `systemd-cat`, stops and restarts the follower, and imports the same entries again with `och-import-logs`. It skips, saying so, where its account cannot read the system journal.
