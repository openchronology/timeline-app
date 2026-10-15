# Browsing, popularity and account standing

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The dashboard's timeline browser lists public timelines. To keep spam out of it without blocking anyone from publishing, it ranks by **account standing**. Standing is computed from what an account has done and how long it has existed. Only administrators see it ([#103](https://github.com/openchronology/timeline-app/issues/103)).

## What browsing lists

Browsing (public timelines with no search text) lists:

- the public timelines of **established** accounts;
- featured timelines, whoever owns them.

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
