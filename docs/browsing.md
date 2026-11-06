# Browsing, popularity and account standing

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The dashboard's timeline browser lists public timelines. To keep spam out of it without blocking anyone from publishing, it ranks by **account standing**. Standing is computed from what an account has done and how long it has existed. Only administrators see it ([#103](https://github.com/openchronology/timeline-app/issues/103)).

## What browsing lists

Browsing (public timelines with no search text) lists:

- the public timelines of **established** accounts;
- featured timelines, whoever owns them.

A timeline with [sensitive-content labels](moderation.md#sensitive-content-labels) is never featured, and readers who aren't signed in, or whose accounts may be under 18, don't browse it.

Other public timelines are still reachable:

- **By link:** anyone with the address can open them, as before.
- **By search:** a text search finds them, listed after established accounts' matches.
- **On their owner's profile:** listed there, and among a reader's public favorites.

An owner who isn't established yet sees a note under **Sharing & settings → Visibility** saying how to become established.

## Established accounts

An account is established when it is:

1. **in good standing:** not suspended, not marked untrusted, and with no [moderation](moderation.md) restriction in force on anything it owns; and
2. **confirmed:** a confirmed email address, or a Google, GitHub or Facebook sign-in; and
3. **at least 30 days old**, or **at least 7 days old and endorsed**.

An account is **endorsed** when an endorsing account has starred or publicly forked one of its public timelines. An endorsing account is any of these, and never the account itself:

- a confirmed account at least 30 days old;
- an administrator;
- an account marked trusted.

Administrators and accounts marked trusted are always established.

## Standing

An established account's standing runs from 0.4 to 1, the sum of:

| Part                      | Adds                          |
| ------------------------- | ----------------------------- |
| Base                      | 0.4                           |
| Age                       | up to 0.4, growing to 30 days |
| Two-factor authentication | 0.1                           |
| Endorsing accounts        | 0.02 each, up to 0.2          |

The total is capped at 1. An account that isn't established has standing 0. Administrators and accounts marked trusted have 1.

## Searching the lists

Every timeline list on the dashboard and on profiles searches, sorts and pages on its own, with its own query parameters, so a search in one keeps the others' state ([#337](https://github.com/openchronology/timeline-app/issues/337)):

| List                   | Parameters                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Explore timelines      | `search`, `tag`, `sort`, `visibility`, `page`, `show`, `within`, `starred`, `entityPage` (and `owner`, for one account's) |
| Drafts in this browser | `draftSearch`, `draftTag`, `draftSort`, `draftPage`                                                                       |
| A profile's timelines  | `search`, `tag`, `sort`, `page`                                                                                           |
| A profile's favorites  | `favoriteSearch`, `favoriteTag`, `favoriteSort`, `favoritePage`                                                           |

Explore takes the place of separate lists of your own timelines and your favorites: signed in, `within=mine` keeps your own timelines, `starred=1` the ones you starred, and `visibility` (`public` or `private`) one or the other, each for timelines and events alike. Any of them, like search text, looks through every timeline you may read rather than the public library alone. A guest's `starred` and `visibility` are ignored. Drafts are searched in the browser, by their titles, descriptions and tags, with the same syntax: words, `"quoted phrases"` and `-exclusions`. The API's search takes the same `visibility` filter and the `updated` sort ([API](api.md)).

With JavaScript, each list searches in place ([#338](https://github.com/openchronology/timeline-app/issues/338)): it changes the address with `history.pushState` (or `replaceState` while typing) and fetches its page from the search API, so the page doesn't load again and Back works. Each result also carries what its card shows of its moments: `first_time` and `last_time` (exact), `time_span` (the two in the timeline's own time display, as precise as the span calls for: years for a 200-year timeline, clock times for a 3-hour incident, ages in deep time) and `shape` (how densely 24 equal parts of the span hold moments, read from the top three levels of its moment tree). Forks that read through to their source, and comparisons, have none of these, as reading them would cost far more.

## Searching events

Explore's search also finds events: moments and durations on every timeline the reader may search ([#459](https://github.com/openchronology/timeline-app/issues/459)). Its parameters:

| Parameter    | Means                                                                                   |
| ------------ | --------------------------------------------------------------------------------------- |
| `show`       | `timelines`, `moments`, `durations`, comma-separated or repeated; all three when absent |
| `within`     | `mine`: the signed-in account's own timelines only                                      |
| `starred`    | `1`: only timelines the signed-in account starred                                       |
| `visibility` | `public` or `private`: only those timelines, signed in                                  |
| `entityPage` | The page of events, 20 to a page; the timelines keep their own `page`                   |

What it searches:

- **Scope:** signed out, public timelines. Signed in, a search with words also covers the account's own private timelines and those it's a member of (not one moderators restricted). Browsing without words stays public and follows the rules above.
- **Matching:** each word matches the start of a word in an event's title (which counts most) or notes. Every word must match.
- **Order:** established accounts' events first, as for timelines, then by how well they match.
- **Not searched:** comparisons, copies still being prepared, and labelled timelines' events, unless the reader is a signed-in adult.
- **Forks:** a fork that reads through to its source shows only the events it changed. The rest are found on the source.
- **Cap:** the text index finds every match, but each search reads and ranks at most 5,000 of them, so a common word doesn't read every event that has it. Past the cap, the count reads "5,000+" ([benchmarks](benchmarks.md#searching-events)).

The words searched for are highlighted in the results: in timelines' titles and descriptions, and events' titles and notes. An event's notes are shown from where the words first match.

The API is `POST /api/timelines/entities/search` ([API](api.md)).

## Related timelines

Below a timeline on the website, **Related timelines** lists up to six others about the same things ([#447](https://github.com/openchronology/timeline-app/issues/447)), as cards that open their pages. The page's text summary, which screen readers and search engines read, lists them as links too.

They match the timeline's own words: the 24 most telling words of its title and tags, then its description, against the same parts of other timelines. Moments' text isn't used, as it would match nearly anything. Sharing a tag counts for more than a word. Ties go to the timeline with more stars.

They follow browsing's rules, since nobody searched for them:

- public timelines of established accounts, or featured ones;
- labelled timelines only for signed-in adults;
- never the timeline itself, its copies or comparisons;
- at most two from any one owner.

The list comes from `GET /api/timelines/{id}/related` ([API](api.md)), which needs the reader to be able to read the timeline. It isn't shown for drafts, comparisons or in the desktop app.

## Popularity and trending

| Sort                    | Ranks by                                                                        |
| ----------------------- | ------------------------------------------------------------------------------- |
| **By popularity**       | The total standing of the accounts that starred or publicly forked the timeline |
| **Trending this month** | The same, counting only stars and forks from the last 30 days                   |
| **By stars**            | The raw star count                                                              |

Each account counts once per timeline, and an owner's own stars and forks count for nothing. So a crowd of new accounts adds nothing, and an established account's star counts more the longer it has been around.

## When it updates

| What changes                                                                              | Updated                                                                                 |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A star or unstar                                                                          | The timeline's popularity at once, and its owner's standing                             |
| An administrator's change to trust, suspension or the administrator role                  | That account at once, the accounts it endorses, and the popularity of what they starred |
| A moderation restriction or lift                                                          | The owner's standing, the same way                                                      |
| Accounts ageing, email confirmation, two-factor authentication, published forks, trending | A sweep every 15 minutes, and once at migration                                         |

At 100,000 accounts, 200,000 public timelines and 200,000 stars, a sweep takes about 4 seconds.

## Administration

**Site administration → Users** shows each account's standing and why:

- established, with its standing and endorsers; or
- what it still lacks (a confirmation, its age, an endorsement, or a restriction in force).

**Standing** overrides it:

| Setting               | Effect                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| **From its activity** | The default: computed as above                                                                               |
| **Trusted**           | Always established, with standing 1. Use it for known contributors, institutions or the site's own accounts. |
| **Untrusted**         | Never established: its timelines leave browsing, and its stars and forks count for nothing                   |

[Seeding](seeding.md) marks the seed account trusted, so the operator's curated timelines are listed.

## Data

| Table                    | Holds                                                              |
| ------------------------ | ------------------------------------------------------------------ |
| `oc_account_standing`    | Each account's standing and endorser count (`server/standing.mjs`) |
| `oc_timeline_popularity` | Each timeline's popularity and trending scores                     |
| `oc_users.trust`         | The administrator's override: `trusted`, `untrusted`, or null      |

The two score tables are kept apart from the accounts and timelines they rank. Recomputing them never rewrites those rows, and never sends live-update notices to open timelines.
