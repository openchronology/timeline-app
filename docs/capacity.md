# Timeline size and platforms

A timeline holds at most **200,000 moments** (and at most 200,000 durations and 200,000 relationships) on every platform. Within that limit, the platforms differ in how responsive large timelines feel. The data below comes from the [capacity benchmarks](benchmarks.md#capacity).

## Which platform to use

| Platform                                                     | Comfortable                    | Noticeably slow                                                                    | Recommendation beyond that                                                                                               |
| ------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Browser** on a fast computer (guest editing, offline HTML) | up to ~4,000 moments           | ~15,000 moments and more: opening takes over a second, and each redraw over 100 ms | Open the timeline in the **desktop app**, or save it to your account and edit it on the **platform**                     |
| **Browser** on a phone or slower computer                    | up to ~1,000 moments           | a few thousand moments and more                                                    | Edit on the **platform** (signed in); there is no desktop app for phones                                                 |
| **Desktop app** (`.och` files)                               | up to the 200,000-moment limit | Opening takes about a second from ~100,000 moments; views and saves stay fast      | The **platform** for sharing and collaboration, or on a slow computer. It is not faster for one person on a fast machine |
| **Platform** (signed in, server timelines)                   | up to the 200,000-moment limit | —                                                                                  | Split timelines that approach the limit                                                                                  |

Why the browser is different: guest editing and the offline HTML file keep the whole timeline in the page. Opening parses and indexes every moment, and every redraw summarizes them in JavaScript. The desktop app and the platform keep timelines in a database and read only what is on screen, so their costs grow far more slowly. Memory is rarely the problem: an open timeline takes about 0.6 KB of browser memory per moment (about 115 MB at 200,000).

Signed-in users who edit a timeline kept only in the browser (imported, and not yet saved to their account) also wait after each edit while a draft is saved. Saving the timeline to the account avoids this; [#40](https://github.com/openchronology/timeline-app/issues/40) tracks making drafts incremental.

## Advice in the app

The editor suggests another platform when a timeline outgrows the one in use. The advice appears as a notice under the header; it never blocks editing, and dismissing it holds for that timeline.

- **Browser:** The notice appears when this device measured the timeline as slow:
  - opening took more than 1.5 s;
  - the median of recent redraws exceeded 150 ms;
  - keeping a draft took more than 100 ms after each change (signed in, for a timeline kept only in the browser).

  Without such measurements it appears from 20,000 moments. It offers **Export** (to open the file in the desktop app), **Save to server** or **Sign in** where the browser is connected to a server, a link to the desktop app, and, in the offline HTML file, a link to the platform.

- **Desktop app:** The notice appears when views of the timeline consistently take more than a second on this computer. It suggests saving the timeline to a server.
- **Every platform:** The notice appears from 150,000 moments, durations or relationships, since a timeline holds at most 200,000 and no platform lifts that limit. It suggests splitting the timeline. On the platform and in the desktop app the count covers moments; in the browser it also covers durations and relationships.

These rules live in `src/capacity.ts`.

## Data

Medians from `npm run bench` on a 16-core Linux desktop, with Chromium for the browser. "4× slower CPU" throttles Chromium's processor 4×, roughly a mid-range phone.

| Moments | Browser open | Browser open, 4× slower CPU | Desktop open | Platform open |
| ------: | -----------: | --------------------------: | -----------: | ------------: |
|   1,000 |       0.14 s |                      0.48 s |        17 ms |         10 ms |
|  10,000 |       0.70 s |                       2.6 s |       0.10 s |         18 ms |
|  50,000 |        3.5 s |                        13 s |       0.25 s |         25 ms |
| 100,000 |        8.6 s |                        34 s |        1.1 s |         24 ms |
| 200,000 |         21 s |                        81 s |        1.1 s |         35 ms |

| Moments | Browser redraw | Browser redraw, 4× slower CPU | Desktop view | Platform view |
| ------: | -------------: | ----------------------------: | -----------: | ------------: |
|   1,000 |          57 ms |                        0.21 s |         7 ms |          9 ms |
|  10,000 |         0.14 s |                        0.57 s |        16 ms |         18 ms |
|  50,000 |         0.18 s |                        0.70 s |        23 ms |         24 ms |
| 100,000 |         0.23 s |                        0.89 s |        31 ms |         27 ms |
| 200,000 |         0.21 s |                         1.0 s |        46 ms |         36 ms |

| Moments | Pause after an edit (browser, signed in) | Same, 4× slower CPU | Desktop save | Platform save |
| ------: | ---------------------------------------: | ------------------: | -----------: | ------------: |
|   1,000 |                                    33 ms |              0.15 s |       2.1 ms |        3.7 ms |
|  10,000 |                                    67 ms |              0.30 s |       2.3 ms |        3.7 ms |
|  50,000 |                                   0.10 s |              0.42 s |       2.5 ms |        3.8 ms |
| 100,000 |                                   0.15 s |              0.65 s |       2.8 ms |        3.9 ms |
| 200,000 |                                   0.35 s |               1.4 s |       2.6 ms |        3.8 ms |

| Moments | Browser memory | Desktop file | Platform rows |
| ------: | -------------: | -----------: | ------------: |
|  10,000 |         7.3 MB |       3.3 MB |        9.0 MB |
| 200,000 |         116 MB |        68 MB |        184 MB |

Platform rows exclude PostgreSQL's indexes and revision history.

A response within 100 ms feels instant, and a task that takes more than a second loses the user's attention. The browser crosses these lines first:

- At full speed, a redraw exceeds 100 ms from about 4,000 moments, and opening exceeds a second from about 14,000.
- With the CPU slowed 4×, a redraw exceeds 100 ms even at 1,000 moments, and opening exceeds a second from about 3,000.

The desktop app opens in about a second at 100,000 moments and more. Its views and saves, and all of the platform's operations, stay well under 100 ms up to the limit.

The Benchmarks workflow reproduces these on GitHub's runners (**Actions → Benchmarks**), and its report shows them as charts. On a standard GitHub-hosted runner the curves had the same shapes, about 1.3× slower:

| Moments | Browser open | Same, 4× slower CPU | Browser redraw | Desktop open | Platform open |
| ------: | -----------: | ------------------: | -------------: | -----------: | ------------: |
|   1,000 |       0.18 s |              0.73 s |          70 ms |        18 ms |         12 ms |
|  10,000 |       0.95 s |               4.3 s |         0.19 s |        82 ms |         23 ms |
|  50,000 |        4.4 s |                22 s |         0.21 s |       0.36 s |         28 ms |
| 100,000 |         10 s |                47 s |         0.30 s |       0.76 s |         32 ms |
| 200,000 |         24 s |               116 s |         0.40 s |        1.5 s |         42 ms |

There, the browser opens in about a second at 10,000 moments, and in about a second at 1,000 with the CPU slowed. The desktop app opens 200,000 moments in 1.5 s.
