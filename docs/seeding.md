# Public example timelines

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

After building and migrating the platform, run:

```sh
docker compose up --build --wait -d
docker compose run --rm seed
```

Outside Docker, with the usual PostgreSQL connection environment configured:

```sh
npm run build:editor
npm run migrate
npm run seed
# Equivalently: pnpm seed or yarn seed
```

This creates the `seed` account and six public, tagged, featured timelines:
Era of Dinosaurs, Fall of Constantinople, Ice Age — Pleistocene, World War II — European Campaign, World War II — Pacific Campaign, and World War II.
The five ordinary timelines have immutable checkpoints and rational query indexes. World War II is a saved, read-only comparison referencing both campaign timelines.
All six appear in the guest dashboard and participate in full-text search. Individual source timelines can be forked by registered users. Moment metadata retains source URLs and date precision.
Seeding makes no remote requests. Viewing illustrated moments loads small, anonymous CORS-readable Wikimedia thumbnails; source articles are opened only when clicked.

The seed account has no password, email, or social identity. There is no default
credential. To manage its timelines and review/merge contributions, first register
a normal account and verify its email, then explicitly grant it writer access:

```sh
docker compose run --rm -e SEED_MANAGER=your_username seed
# Outside Docker: SEED_MANAGER=your_username npm run seed
```

That account continues to use the platform's regular authentication and MFA.
This grants writer access to the five ordinary examples (the comparison remains read-only) while retaining `seed` ownership;
it does not grant a login to `seed` or change anyone's account credentials.
Operator configuration can also set `SEED_MANAGER` in `.env`. Unset it after the
grant if desired; reruns without it preserve existing collaborators. Revoking these operator-issued
grants requires database administration; this command does not revoke grants.

All inserts run in one transaction, serialized by a PostgreSQL advisory lock.
Fixed IDs make repeated runs preserve existing timeline edits, visibility,
featured status and collaborators. A one-time official-plugin enrichment creates a
new checkpoint for older seeds while preserving their existing content and history. Missing examples are recreated.
Conflicts with an existing unrelated `seed` username or reserved ID cause a
rollback instead of assigning another person's data to the seed account. The
command never resets a timeline to the catalog's original contents.

## Official plugins and enrichment

All examples enable Sources, Dating context, Moment colors, Moment shapes and
Focus on hover. Historical timelines also enable Historical dates, exposing the
original date and calendar (including Constantinople's Julian dates). Prehistoric
timelines enable Geological ages, exposing the approximate age in years before
reference year 2000 CE. Dating context exposes precision and coordinate convention.

Period/epoch boundaries use violet diamonds; concluding WWII markers use a
terminator shape. Disruptions use muted orange and other points use light blue.
These colors distinguish types of milestones rather than rate historical actors.
Hover cards show the existing titles and notes; all markers retain white outlines.
Selected moments use the Moment icons plugin with credited Wikimedia Commons thumbnails. Illustrations, museum specimens, later portraits and modern glacier/wall photographs are explicitly identified in Notes. No stack entries are invented.

Rebuild and rerun the seed command above to enrich examples already in the database.
The `oc_seed_updates` ledger records `official-plugins-v1` once per seeded timeline.
Enrichment appends missing official plugins and fills absent shape, size and color
values for original moment IDs. It preserves existing plugin definitions and disabled
states, text, exact times, sources, tags, custom events, removed moments and styles.
It saves a checkpoint parented to the previous head. Subsequent runs leave later
plugin removals and settings untouched. The ledger and changes are transactional;
failed upgrades can safely be retried. Forks are independent and aren't modified.

## Time conventions

Historical day markers use exact Unix-second coordinates and Gregorian display.
Midnight is a date marker, not a claim about the actual UTC time of an event.
The Constantinople dates in the sources are Julian: 29 May 1453 corresponds to
7 June in proleptic Gregorian. Both forms are retained in the moment metadata
and notes.

Prehistoric timelines use negative years relative to a fixed reference year 2000,
with `Ma` (millions of years) and `ka` (thousands of years) display units. These
are separate timeline coordinate conventions, not Unix seconds. Rounded ages
are approximate educational markers; storing a rational exactly does not make
the scientific estimate exact. The dinosaur period boundaries follow the
rounded Natural History Museum overview rather than implying the latest
high-precision stratigraphic estimates. Ice Age focuses on the Pleistocene and
regional glacial evidence; the Holocene transition does not mean all ice vanished.

Sources include the [Natural History Museum](https://www.nhm.ac.uk/discover/when-did-dinosaurs-live.html),
[World History Encyclopedia](https://www.worldhistory.org/article/1180/1453-the-fall-of-constantinople/),
[US Holocaust Memorial Museum](https://encyclopedia.ushmm.org/content/en/article/world-war-ii-key-dates),
and [National Park Service](https://www.nps.gov/articles/000/quaternary-period.htm).
The catalog contains original short summaries, source links and credited public image URLs.

GitHub CI runs `node test/seed-postgres.mjs` against real PostgreSQL/pgmp,
checking saved history, rational indexing, guest search, manager permissions,
and preservation of subsequent edits. The integration test rolls back its data
and requires a dedicated test database without an existing `seed` account.

## Expanded content and image upgrade

The catalogue includes **17 dinosaur markers, 16 siege milestones, 40 World War II
moments and 16 Ice Age markers**. Species ages are representative points within
fossil ranges, not claims of exact first appearances. Siege points retain their
Julian dates. The examples remain introductory selections rather than exhaustive
accounts; source references accompany every moment.

There are 11 distinct Commons images across 13 illustrated moments: dinosaur and
mammoth specimens, a siege manuscript illustration, Mehmed II's later portrait,
surviving city walls, WWII photographs and a modern glacier. The 330-pixel JPEG
thumbnails were verified for HTTP success and anonymous CORS on 2026-10-06.
Author/creator and licence names are in Notes; Sources retains Commons file pages
and applicable Creative Commons licence URLs. Image licences are separate from
the software's GPLv3 licence. The code does not download images during seeding.
Existing export embedding can capture reachable CORS images for standalone use.

Rebuild and run `docker compose run --rm seed` to update existing examples. The
`expanded-content-and-icons-v1` ledger applies this upgrade once per original
seed timeline. It adds only newly introduced IDs and never restores deleted IDs
from the previous catalogue. Existing titles, exact coordinates, custom metadata,
tags, permissions and styles are retained. Missing icons receive a credited URL;
existing icon URLs (including deliberately empty values) are retained. Credits
are appended to existing Notes and image source links are added without removing
existing references. Removed plugins and disabled settings remain respected;
Moment icons is added if absent for the initial upgrade. Later reruns preserve
subsequent removals, edits and settings. Forks are untouched. The upgrade saves an
immutable checkpoint parented to the previous head and rebuilds the normal query
index in the same transaction.

## World War II campaign comparison

The existing World War II URL (`28d4e634-1f20-488c-bd62-043c6d5cb003`) now opens a saved comparison:

- European Campaign (`…005`): 29 markers covering Europe, the Mediterranean and North Africa.
- Pacific Campaign (`…006`): 11 markers covering Asia and the Pacific, including diplomatic and American home-front context.

Both campaigns remain independently browsable, searchable and forkable. The public
comparison opens their stacked, shared Gregorian viewport, supports per-source
alignment and combined view, and uses their plugin union and bounded caches.
Campaign updates use the existing live-refresh mechanism. The comparison stores
source IDs and a view mode instead of duplicating moments; it cannot edit, export
or fork the source data as though it were an ordinary timeline. Source links and
its own immutable definition history are available above the viewer.

`wwii-campaign-comparison-v1` applies the conversion once, in the same transaction
as campaign creation. Existing WWII moment IDs, exact times, metadata, plugins and
removed events are preserved in the split. Unknown curator-added events go to the
European campaign unless `metadata.campaign` is `pacific`. New campaign timelines inherit the existing WWII visibility, forking policy and collaborators, so splitting a private curated example does not publish its data. The prior full document
remains in history, parented to the new definition checkpoint. Existing forks are
untouched. Conflicting edits to an already-existing campaign event stop the
transaction rather than overwrite content. Later seed runs leave edits alone.
Public comparisons require public sources, and each source's access is checked
when opening a comparison. Nested comparisons are not stored; adding an existing
comparison to an ad hoc comparison expands and deduplicates its ordinary sources.

## Small-summary hover expansion

All seeded timelines include **Expand on hover**, including the campaign sources
of the WWII comparison. Rebuilding and rerunning `seed` applies the
`expand-on-hover-v1` upgrade once, saving an immutable checkpoint. A previously
installed custom definition or disabled instance is preserved, and subsequent
reruns respect removal. Every seeded illustration is stored in `metadata.iconUrl`
and its timeline includes Moment icons; image URLs are never a separate renderer
or extra unhandled metadata field.
