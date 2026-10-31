# Exact rational time

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

OpenChronology represents every point in time as an exact rational number: a pair of arbitrary-precision integers (numerator, denominator), reduced, with the sign carried by the numerator and the canonical text `n/d` (always including `/1`). The same value, the same order and the same text are used in the browser (JavaScript `BigInt`), in PostgreSQL (the pgmp extension's `mpq` type) and in SQLite (the sqlite-rational extension's `RATIONAL_V1` collation and `rational_index` virtual table). Moments at the same coordinate are ordered by an ASCII ID whose order is identical in all three. Each store keeps an augmented ordered tree whose nodes cache their subtree's first and last time, moment count and distinct-time count, so a viewport is summarized into groups of nearby moments by walking a number of nodes that depends on the number of groups and the tree height, not on the number of moments. Grouping distances come from screen measurements that are quantized to 1/1024 CSS pixel before they enter rational arithmetic. Disclosed at commit [`007091c`](https://github.com/openchronology/timeline-app/tree/007091ce62fdb402346c0712b0c420eac0a29dff); first public disclosure: commit `88aea8c` of 2026-10-05 (see [First public disclosure](#first-public-disclosure)).

## Field and problem

A timeline viewer has to place, order, group and page through points in time across scales that a single numeric type does not cover: a geological timeline in billions of years and, in the same document, two events a nanosecond apart; a log with millions of entries sharing one second; a fictional chronology at `1/3` of a day. It has to give the same answer in a browser, on a server and in a desktop file.

The usual representations fail at these extremes:

- **Binary floating point** (`double`) holds 53 bits of significand. At 10<sup>16</sup> units two adjacent doubles are 2 units apart, so distinct events collapse onto one value; `0.1 + 0.2 != 0.3`, so a value typed as a decimal is stored as a different number; `1/3` has no exact representation at all. Sorting, equality and range queries then depend on rounding, which differs between languages and between operations done in a different order.
- **Integer epoch counts** (milliseconds or nanoseconds in 64 bits) fix one resolution and one range. Nanoseconds in a signed 64-bit integer cover about ±292 years; anything finer or longer needs a different unit and a conversion that loses information.
- **Decimal types** (`numeric`, `BigDecimal`) are exact for decimal fractions but not for `1/3`, and division must round.
- **Storing exact rationals as database keys** solves exactness but creates a new problem: a rational with thousands of digits is a poor B-tree key (PostgreSQL limits a B-tree index entry to roughly a third of a page, about 2.7 KB), and plain text order of `n/d` strings is not numeric order (`"10/1" < "9/1"` as text).
- **Summarizing a viewport by enumerating its points** costs time proportional to the points visible: a whole-timeline view of a million moments reads a million rows to draw a few hundred groups.
- **Mixing exact data with screen measurements** (pixel positions are doubles) reintroduces floating point at the boundary: `0.1` px is not an exact binary fraction and its exact rational expansion has a 2<sup>55</sup>-sized denominator.

## Summary of the mechanism

1. **One value type.** A time is an immutable rational `Q` with `BigInt` numerator and positive `BigInt` denominator, reduced by the GCD after every operation. Its canonical text is `n/d` (`"1/2"`, `"-3/2"`, `"5/1"`, `"0/1"`). JSON never carries a time as a JSON number.
2. **Exact parsing.** Input is accepted as an integer fraction (`"6/-4"`), a finite decimal with optional exponent (`"-1.250"`, `"1e-3"`), or a calendar timestamp, and is converted to `Q` without passing through a floating-point value.
3. **Exact order.** Two rationals compare by the sign of `a.n * b.d - b.n * a.d` (cross-multiplication). Moments are totally ordered by `(time, id)`. IDs are restricted to 1–128 characters of `[A-Za-z0-9_.:-]`, so JavaScript's UTF-16 code-unit comparison, PostgreSQL's `COLLATE "C"` and SQLite's default `BINARY` collation give the same order.
4. **Augmented ordered map.** One node per distinct time, holding the bucket of moments at that time (sorted by ID), weighted by the bucket's size. Every node caches its subtree's first time, last time, total weight, distinct count and (in the browser and SQLite) the largest gap between adjacent times.
5. **Anchored-span grouping.** For a closed window `[left, right]`, a drawable width of `W` pixels and a grouping distance of `P` pixels, the threshold is `(right - left) * P / W`, computed exactly. A group starts at the first remaining time `a` and takes every time `t` with `t - a < threshold`. A walk over the tree takes a cached subtree whole when it lies inside the window and cannot cross a group boundary.
6. **Three stores, one contract.** The browser keeps the map in memory. PostgreSQL stores the tree as rows keyed by `(timeline_id, node_id)` integers, with `mpq` times as payloads, and walks it in PL/pgSQL. SQLite stores canonical text under the `RATIONAL_V1` collation and keeps the weighted tree in the `rational_index` virtual table.
7. **Boundary quantization.** Screen measurements (pixel offsets, widths, grouping distances) become rationals with denominator 1024 before any arithmetic with times.
8. **Counts as decimal strings.** Group counts are sent as base-10 strings, so counts beyond 2<sup>53</sup> are not rounded by JavaScript numbers.

## Detailed description

### The rational value type

The browser and Node code use `Rational` from the vendored `rational-ordered-map` package (imported as `Q` in [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L89)). It wraps a fraction.js 5 `Fraction` in `BigInt` mode.

Data:

| Field         | Type     | Invariant                                               |
| ------------- | -------- | ------------------------------------------------------- |
| `numerator`   | `bigint` | carries the sign; `0n` for zero                         |
| `denominator` | `bigint` | `> 0n`; `gcd(abs(numerator), denominator) = 1`; 1 for 0 |

Invariants are established in one place: every constructor and arithmetic result goes through a normalizing step that takes the sign out of both components, divides both by their GCD (Euclid's algorithm on `BigInt`) and puts the sign on the numerator. A zero denominator raises `RangeError`. Values are frozen, and implicit conversion to a JavaScript number throws (`Symbol.toPrimitive`), so a time cannot silently become a double.

```
normalize(n, d):
  if d == 0: error "Zero denominator"
  s = sign(n) * sign(d)
  n, d = |n|, |d|
  g = gcd(n, d)            # Euclid; gcd(0, d) = d, so 0/d becomes 0/1
  return (s * n / g, d / g)
```

Arithmetic is the textbook rational arithmetic, each result normalized:

```
add(a, b) = normalize(a.n * b.d + b.n * a.d, a.d * b.d)
sub(a, b) = normalize(a.n * b.d - b.n * a.d, a.d * b.d)
mul(a, b) = normalize(a.n * b.n, a.d * b.d)
div(a, b) = normalize(a.n * b.d, a.d * b.n)     # b != 0, else RangeError
compare(a, b) = sign(a.n * b.d - b.n * a.d)     # cross-multiplication, never a division
floor(a) = a.n / a.d rounded toward -infinity   # integer division with a correction for negatives
```

Comparison never divides and never approximates, so it is a strict total order on values. The only approximation is the explicit `toApproximateNumber()`, used to place a marker on the screen: it shifts both components right to at most 54 significant bits, divides those as doubles and scales by the power-of-two difference, so huge or tiny values map to a finite double (or 0 or infinity) without overflowing an intermediate.

### Canonical text and parsing

`toString()` is `` `${numerator}/${denominator}` `` of the normalized value, so it always has a slash: `5/1`, `0/1`, `-1/2`. Three parsers accept text:

- `Q.parse(text)`: the whole string must match `^[+-]?\d+(?:\/[+-]?\d+)?$`; both components may be signed, and the result is normalized (`"6/-4"` is `-3/2`, `"2/4"` is `1/2`).
- `Q.decodeCanonical(text)`: accepts only `^-?(0|[1-9]\d*)\/[1-9]\d*$` and only when the text is already the canonical form; `"2/4"` is rejected as noncanonical.
- `Q.parseDecimal(text)`: `^([+-]?)(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$`. The digits before and after the point form one integer `c`; the exponent is `e - (number of fraction digits)`; the value is `c * 10^exp` or `c / 10^-exp`, computed in `BigInt`. `"-1.250"` is `-5/4`, `"1e-3"` is `1/1000`. No step uses a float.

The document parser, [`parseTime`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L227-L230), dispatches on the text: a `T` means a calendar timestamp (converted by the calendar module with `BigInt` arithmetic), a `/` means `Q.parse`, anything else `Q.parseDecimal`. Validation stores `parseTime(text).toString()`, so every stored time is canonical, and export writes times in canonical form sorted by time, then ID. The user-facing number fields use [`parseNumber`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/numeric.ts#L7-L20), which also accepts scientific notation but bounds the exponent to ±10,000, and print through [`printNumber`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/numeric.ts#L49-L74), which rounds half away from zero in `BigInt` to a chosen number of significant digits. Display rounding never feeds back into stored values.

The same canonical form is produced by the other two stores:

- PostgreSQL: `oc_qtext(q mpq)` returns `num(q)::text || '/' || den(q)::text`, so `/1` is present for integers.
- SQLite: `q_text` takes GMP's `mpq_get_str`, which omits `/1` for integers, and appends `/1` when no slash is present. `q()` normalizes input; `q_is_canonical()` enforces the stored form in a `CHECK` constraint.

### Ordering moments: time, then ID

Several moments may share one rational time. Their order is `(time, id)`: time by rational value, then ID by byte order. IDs are validated against `^[A-Za-z0-9_.:-]{1,128}$` ([`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L278-L279)). Restricting IDs to printable ASCII makes three comparisons agree:

| Store      | ID comparison                                  |
| ---------- | ---------------------------------------------- |
| JavaScript | `a < b` on strings (UTF-16 code units)         |
| PostgreSQL | `COLLATE "C"` (bytes)                          |
| SQLite     | default `BINARY` collation (`memcmp` on UTF-8) |

For ASCII, UTF-16 code units, UTF-8 bytes and code points coincide, and no locale-dependent collation is involved. Pages of moments can therefore use a `(time, id)` cursor whose "next" is the same in every store, and a document exported from any store lists moments in the same order.

### The weighted ordered map (`RationalMap`)

The browser index is `RationalMap<readonly PointEvent[]>`, constructed with the weight function `bucket => BigInt(bucket.length)` ([`TimelineIndex`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L330-L331)). It is a persistent AVL tree: nodes are immutable, an update rebuilds the path to the root, and `clone()` is O(1).

Node fields:

| Field                   | Meaning                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `key`                   | a `Q`; no two nodes share one                                 |
| `value`                 | the bucket: moments at `key`, frozen, sorted by ID            |
| `weight`                | `BigInt` bucket size, positive                                |
| `left`, `right`         | children                                                      |
| `height`                | AVL height                                                    |
| `summary.firstTime`     | smallest key in the subtree                                   |
| `summary.lastTime`      | largest key in the subtree                                    |
| `summary.entryCount`    | sum of weights in the subtree (`BigInt`)                      |
| `summary.distinctCount` | number of keys in the subtree                                 |
| `summary.maxGap`        | largest difference between adjacent keys in the subtree (`Q`) |

Summaries combine associatively, left to right:

```
combine(A, B):                      # A entirely before B
  firstTime     = A.firstTime
  lastTime      = B.lastTime
  entryCount    = A.entryCount + B.entryCount
  distinctCount = A.distinctCount + B.distinctCount
  maxGap        = max(A.maxGap, B.firstTime - A.lastTime, B.maxGap)

node.summary = combine(combine(left.summary, singleton(key, weight)), right.summary)
singleton(k, w) = {k, k, w, 1, 0}
```

Operations: `get`, `set`, `delete` in O(log n) comparisons; `minKey`/`maxKey` in O(1) from the root summary; `successor`/`predecessor`; `range(lower, upper, {includeLower, includeUpper})`, which prunes subtrees whose `[firstTime, lastTime]` misses the bounds; `aggregate(lower, upper)`, which returns the combined summary of a range and consumes any subtree lying wholly inside it; and `overview`.

Bulk loading groups moments by canonical time string first, sorts each bucket once by ID, then inserts one key per distinct time, so a document with 10,000 moments at one time is one key with weight 10,000 rather than 10,000 insertions into a growing array ([`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L367-L385)). Editing a moment removes it from its old bucket (deleting the key when the bucket empties) and inserts it into the new one; an auxiliary `Map` from ID to moment finds the old time without searching.

### Window summaries: the grouping threshold and anchored spans

The visible window is closed, `[left, right]`, with `right = left + span`. The threshold is computed by [`Viewport.threshold`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L706-L708):

```
threshold = span * screenQ(P) / screenQ(max(1, W))
screenQ(x) = round(x * 1024) / 1024        # exact rational, denominator 1024
```

`W` is the drawable width in CSS pixels and `P` the grouping distance in pixels (the density setting scaled by the interface scale and text size). Both are measured as doubles; `screenQ` rounds them to a multiple of 1/1024 px and turns them into an exact rational, so the threshold's denominator is the span's denominator times a small factor. The same `screenQ` is applied to pointer positions and drag distances before they move the view ([viewport rasterization](viewport-rasterization.md)). This quantizes the measurement, not the time axis: times themselves are never rounded.

Grouping uses anchored spans (`mode = "span"`):

```
overview_span(map, lower, upper, threshold):
  groups = []
  anchor = first key >= lower                      # lowerBound, O(log n)
  while anchor exists and anchor <= upper:
    cutoff = anchor + threshold
    if upper < cutoff:
      groups.append(aggregate(map, [anchor, upper]))       # closed at upper
      break
    groups.append(aggregate(map, [anchor, cutoff)))        # half-open
    anchor = first key >= cutoff
  return groups
```

A time exactly `threshold` after the anchor starts a new group, because the group interval is half-open. With `threshold = 0` the library uses its per-key walk and every distinct time is its own group. Each group reports its exact first and last time, the total moment count and the distinct-time count, and, when it holds one moment, that moment's ID, title and metadata.

Anchoring bounds each group's extent to less than `threshold`, so no chain of moments each a little closer than the threshold to the next can merge a whole viewport into one group. The library also offers `mode = "neighbors"`, which joins adjacent times whose gap is below the threshold and can consume a subtree whole when its cached `maxGap` is below the threshold; the application does not use it for display.

Cost: each group costs one `lowerBound` and one `aggregate`, each O(log n) node visits, because `aggregate` consumes every subtree lying wholly inside the group's range from its cached summary. A window with `g` groups costs O(g log n) node visits regardless of how many moments the groups hold. Arithmetic cost grows with the bit lengths of the rationals involved.

Durations shorter than the threshold are collapsed into the same groups (described in the durations documentation), and the results of both kinds are coalesced with the same threshold.

### PostgreSQL: `mpq` payloads, integer keys

The server requires the [pgmp](https://github.com/dvarrazzo/pgmp) extension (`CREATE EXTENSION IF NOT EXISTS pgmp`), which provides `mpq`, an exact GMP rational with arithmetic and comparison operators. Times are stored as `mpq` and handed to JavaScript as `oc_qtext` strings.

The moment tree is one persistent AVL tree per timeline, stored as rows:

```sql
CREATE TABLE oc_nodes (
  timeline_id uuid, id bigint,                 -- PRIMARY KEY(timeline_id, id)
  time mpq, first_time mpq, last_time mpq,     -- own time; subtree's earliest and latest
  left_id bigint, right_id bigint,             -- children, NULL for none
  first_id bigint,                             -- the subtree's leftmost node
  bucket_count bigint,                         -- moments at this time
  event_count bigint,                          -- moments in the subtree
  distinct_count integer,                      -- distinct times in the subtree
  moment_ids text[],                           -- this time's moment IDs, "C" order
  height integer);
CREATE TABLE oc_moments (
  timeline_id uuid, id text,                   -- PRIMARY KEY(timeline_id, id)
  time mpq, event jsonb);
```

No rational is part of any primary key or B-tree index on these tables. A rational with thousands of digits would make an oversized index entry and slow every comparison inside the index; here the B-tree keys are a UUID plus a `bigint` or a short ASCII ID, and the `mpq` columns are payloads compared only after a row has been fetched by key. The tree structure (`left_id`, `right_id`, the timeline's `root`) replaces an index on time. Node IDs are stable, so a save rewrites only the nodes on the changed paths.

Where a range scan by time is needed (duration starts), the schema uses a small order-preserving key instead of the rational itself; see [`oc_qkey`](#postgresql-an-order-preserving-key-for-range-scans-oc_qkey) below.

`oc_overview_v2(tid, lo, hi, threshold)` walks the tree with an explicit stack in PL/pgSQL. Each stack entry is a node ID and a flag saying whether it stands for the whole subtree or only the node's own time:

```
stack = [(root, subtree)]
open = none                                     # current group: a, b, weight, distinct, first node
while stack not empty:
  (id, point) = pop(stack); n = node(id)
  if n.last_time < lo or n.first_time > hi: continue                 # prune
  if point:
    if n.time outside [lo, hi]: continue
    (a, b, w, k, whole) = (n.time, n.time, n.bucket_count, 1, true)
  else:
    (a, b, w, k) = (n.first_time, n.last_time, n.event_count, n.distinct_count)
    whole = a >= lo and b <= hi
  if open and a - open.a >= threshold: emit(open); open = none
  if whole and (point or k == 1 or b - (open.a if open else a) < threshold):
    open = open or new group starting at a (first node = id if point else n.first_id)
    open.b = b; open.weight += w; open.distinct += k                 # take subtree whole
  else:
    push(right subtree); push(own time as point); push(left subtree)  # pops in time order
emit(open) if open
```

Emitted rows carry `first_time` and `last_time` as `n/d` text, `event_count` as text, `distinct_count`, and for a one-moment group the moment's ID, title and metadata, found through the group's first node (`moment_ids[1]`) and one primary-key lookup in `oc_moments`. `visited_nodes` counts subtrees entered. `oc_overview` is a compatibility wrapper with the original result columns.

The HTTP layer converts every bound and threshold with `parseTime(...).toString()` and rejects a negative threshold. The store raises a requested threshold to at least `(upper - lower) / 1024`, which bounds an overview to about 1,025 moment groups however small the requested threshold.

`oc_events(tid, lo, hi, after_time, after_id, max_rows)` returns a page of moments in `(time, id)` order with an exact keyset cursor:

```
same in-order walk as above, without groups:
  prune subtree if outside [lo, hi] or n.last_time < after_time
  at a point (node's own time) inside the window and >= after_time:
    for mid in n.moment_ids (already in "C" order):
      e = oc_moments[tid, mid]                                       # primary-key lookup
      if n.time = after_time and e.id COLLATE "C" <= after_id: skip   # already returned
      emit e; if emitted = max_rows: return
```

Either bound may be `NULL` (open). The walk stops as soon as the page is full, so a page costs about its rows plus the tree height, and a visible cluster of a million moments at one time is never sorted or collected to produce a page. The server asks for `limit + 1` rows and returns the last row's `(time, id)` as the next cursor when the extra row exists. Read transactions are `REPEATABLE READ`, so a root and its nodes come from one revision.

### PostgreSQL: an order-preserving key for range scans (`oc_qkey`)

Some queries need a B-tree range scan by time rather than a tree walk: the duration summaries read a small mixed subtree's durations by start, documents and catalogue text stream durations in start order, and retention finds durations inside an expiry range. Indexing the `mpq` start directly would put arbitrarily large values into the B-tree. Instead, `oc_duration_nodes` (and `oc_view_duration_nodes`) has a generated column

```sql
first_key numeric GENERATED ALWAYS AS (oc_qkey(first_time)) STORED
CREATE INDEX oc_duration_nodes_first_key ON oc_duration_nodes(timeline_id, first_key);
```

`oc_qkey(q mpq) RETURNS numeric` (`IMMUTABLE STRICT PARALLEL SAFE`, so it can feed a stored generated column) maps a rational to a fixed-size decimal key:

```
oc_qkey(q):
  n = |num(q)|; d = den(q)
  if n = 0: return 0
  e = len(decimal(n)) - len(decimal(d))          # estimate of floor(log10(n/d))
  if e >= 0 and n < d * 10^e: e = e - 1          # correct the estimate by one,
  if e < 0 and n * 10^-e < d: e = e - 1          # with one exact integer comparison
  m = floor(n * 10^(29 - e) / d)  if e <= 29     # the first 30 significant digits,
      floor(n / (d * 10^(e - 29)))  otherwise     # truncated: 10^29 <= m < 10^30
  return sign(q) * ((2^40 + e) * 10^30 + m)
```

Properties:

- **Non-decreasing in the rational value.** For positive values, `m` has exactly 30 digits, so `(2^40 + e) * 10^30 + m` orders first by the exponent `e` and then by the digits; truncating digits can make two values equal but never reverses them. Negative values are the mirror image (`-key(|q|)`), and zero is 0, between them. `2^40 + e` stays positive unless a value has on the order of 2<sup>40</sup> (about a trillion) decimal digits, so in practice positive keys are above 0 and negative keys below it.
- **No saturation.** Unlike a `float8` approximation, the key has no overflow or underflow: values beyond ±1.8·10<sup>308</sup> or below 10<sup>-308</sup> keep distinct keys with 30 significant digits each. (An earlier `float8` column, `first_approx`, gave every start beyond `float8`'s range one key, so each summary scanned them all; it was replaced by this key.)
- **Equal keys do not mean equal values.** Two values agreeing in their first 30 significant digits share a key.

Because the key is monotone, a key range contains every row in the exact range, and the exact `mpq` predicate rechecks each candidate:

```sql
-- oc_duration_overview: a mixed subtree's durations, in start order
WHERE d.first_key >= oc_qkey(n.min_time) AND d.first_key <= oc_qkey(n.max_first)
  AND d.first_time >= n.min_time AND d.first_time <= n.max_first   -- exact recheck
ORDER BY d.first_key, d.first_time                                   -- ties broken exactly
-- retention.mjs: durations wholly inside an expiry range
AND (first_key >= oc_qkey($2) AND first_time >= $2)
AND (first_key <= oc_qkey($3) AND last_time <= $3)                    -- first <= last <= upper
```

`ORDER BY first_key, first_time` (then ID in `"C"` order where needed) gives exact start order: the key orders all rows that differ in it, and the exact `mpq` sorts the few that share it. Worked values, checked with a `BigInt` transcription of the function run under Node in a scratch script: `oc_qkey(1/3) = 1099511627775·10^30 + 333…3` (30 threes; `e = -1`), `oc_qkey(1) = 1099511627776·10^30 + 10^29`, `oc_qkey(-1/3) = -oc_qkey(1/3)`. The same script compared 600,000 pairs of random rationals with up to 400-digit components and found no pair whose keys were in the opposite order, and confirmed that `1 + 10^-30` and `1 + 2·10^-30` share a key.

Moments do not use this key: their order comes from the moment tree.

### SQLite: `RATIONAL_V1` and `rational_index`

The desktop app and the `.och` file format use the vendored [sqlite-rational](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/vendor/sqlite-rational/README.md) extension (C, GMP), registered per connection with `sqlite_rational_register(db)`. It provides:

- Scalar functions on canonical text: `q`, `q_make`, `q_decimal`, `q_is_canonical`, `q_cmp`, `q_add`, `q_sub`, `q_mul`, `q_div`, `q_neg`, `q_abs`, `q_floor`, `q_ceil`, `q_num`, `q_den`, `q_min`, `q_max`. They are deterministic and innocuous, so they work in `CHECK` constraints with `trusted_schema=OFF`.
- The collation `RATIONAL_V1`. It parses both operands with GMP and compares them with `mpq_cmp`. A valid rational sorts before any malformed string, and two malformed strings compare by bytes then length, so the order stays total and transitive even for an unchecked column. Equivalent valid strings (`2/4`, `1/2`) compare equal.

```
RATIONAL_V1(a, b):
  pa = parse(a); pb = parse(b)
  if pa ok and pb ok: return sign(mpq_cmp(pa, pb))
  if pa ok: return -1
  if pb ok: return +1
  return sign(memcmp(a, b, min(len)) or len(a) - len(b))
```

The file's moments table stores the canonical text and orders by the collation:

```sql
CREATE TABLE events(id TEXT PRIMARY KEY,
  time TEXT NOT NULL COLLATE RATIONAL_V1 CHECK(q_is_canonical(time)=1),
  metadata TEXT NOT NULL) STRICT;
CREATE INDEX events_time ON events(time COLLATE RATIONAL_V1);
CREATE INDEX events_time_id ON events(time COLLATE RATIONAL_V1, id);   -- desktop workspace
```

SQLite stores long index keys on overflow pages, so a text key of thousands of digits remains usable in an ordinary index; the extension's tests exercise 10,000-digit components. Event pages use keyset pagination `(time COLLATE RATIONAL_V1, id) > (q(?), ?)`, with `id` under the default binary collation, which is the same `(time, id)` order as the other stores.

Overviews use a `rational_index` virtual table named `points`, with one row per distinct time: `time` the canonical time, `value` the time again (joined back to `events` for one-moment groups), `weight` the number of moments there. The module keeps a persisted AVL tree in a shadow table, `points_nodes(id, time, value, weight, l, r, height, first, last, count, size, gap, first_id)`, with the root in `points_meta`. `first`, `last`, `count` (total weight), `size` (distinct count) and `gap` (largest adjacent gap) are the cached subtree summary. Hidden input columns `lower`, `upper`, `include_lower`, `include_upper`, `threshold` and `mode` turn a `SELECT` into a summary query:

```sql
SELECT time, last_time, weight, distinct_count, visited_nodes FROM points
WHERE lower=q(?) AND upper=q(?) AND include_upper=1 AND threshold=q(?) AND mode='span'
ORDER BY time;
```

The `span` mode in C follows the same anchored-span algorithm as the browser library: `lower_bound` to the first anchor, a walk over `[anchor, anchor + threshold)` (clipped to the upper bound) that folds wholly contained subtrees from their cached summary, then the next anchor at or after the cutoff. The desktop workspace raises the threshold to at least 1/1024 of the window, as the server does. A file is written by appending one row per distinct time in `'append'` mode and then `INSERT INTO points(mode) VALUES('build')`, which sorts the rows and builds a balanced tree bottom-up, writing each node once.

### Counts as decimal strings

Weights and counts are `BigInt` in the browser library and `bigint` in PostgreSQL, but they cross JSON as base-10 strings: `FrameGroup.count` is `group.entryCount.toString()`, PostgreSQL returns `event_count` as `text`, and SQLite rows are read as text. A JavaScript `number` would round integers above 2<sup>53</sup>; a string carries the exact count to every client.

### Edge cases

- **Zero and signs.** `0/-5` normalizes to `0/1`. Negative times are ordinary values; `floor` and `ceil` handle negative numerators.
- **Equal values in different spellings** (`2/4`, `1/2`, `0.5`) are the same key in every store, because every path canonicalizes before storing and every comparison is by value.
- **Crossed bounds** return no rows; equal bounds select one coordinate when both ends are inclusive.
- **Threshold exactly equal to a gap** separates the two times (half-open group interval).
- **A group of one distinct time** is always taken whole, however many moments it holds.
- **Very large components** cost time proportional to the cost of `BigInt`/GMP multiplication and GCD on their bit lengths; there is no fixed ceiling on precision. Inputs from the network are limited by request size; [`parseNumber`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/numeric.ts#L12-L14) bounds decimal exponents to ±10,000.

### Complexity

| Operation                        | Browser (`RationalMap`) | PostgreSQL            | SQLite (`rational_index`) |
| -------------------------------- | ----------------------- | --------------------- | ------------------------- |
| Insert/delete a time             | O(log n)                | O(log n) node rows    | O(log n) node rows        |
| Overview with g groups           | O(g log n) node visits  | O(g log n) node reads | O(g log n) node visits    |
| Page of k moments after a cursor | O(log n + k)            | O(h + k) lookups      | O(log n + k) index steps  |
| Comparison of a/b with c/d       | two multiplications     | `mpq_cmp`             | `mpq_cmp` after parsing   |

`n` is the number of distinct times, `h` the tree height. Each comparison and summary combination costs arithmetic on the operands' bit lengths. Space is O(n) nodes plus the moments.

### Variations

- The ordered map may be any balanced search tree (red-black, B-tree, skip list, treap) whose nodes cache the same associative summary; AVL is used in all three stores here.
- The summary may carry further associative fields (minimum duration length, per-tag counts) without changing the walk.
- The rational may be stored as two integer columns, as a binary encoding of GMP limbs, or as canonical text, as long as comparisons are by value.
- The tie-break key may be any identifier whose byte order is the same in every store; restricting to ASCII is the simplest such choice.
- The quantization step for screen measurements may be any `1/b^k`; 1/1024 is used.

## Implementation references

- [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L89) — imports `Rational as Q` and `RationalMap` from `rational-ordered-map`.
- [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L227-L230) — `parseTime`: timestamp, fraction or decimal to `Q`.
- [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L278-L279) — moment ID rule `^[A-Za-z0-9_.:-]{1,128}$`.
- [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L330-L385) — `TimelineIndex`: the weighted `RationalMap`, bulk loading of buckets sorted by ID.
- [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L570-L613) — `TimelineIndex.frame`: threshold, `overview(..., 'span', {includeUpper: true})`, counts as strings.
- [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L628-L631) — `screenQ`: 1/1024-pixel quantization.
- [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L706-L708) — `Viewport.threshold`: `span * P / W`.
- [`src/numeric.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/numeric.ts#L7-L74) — `parseNumber`, `fixedDecimal`, `printNumber`: exact decimal and scientific input and output.
- [`vendor/rational-ordered-map-0.1.0.tgz`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/vendor/rational-ordered-map-0.1.0.tgz) — the packed library: `dist/rational.js` (`Rational`: `from`, `parse`, `decodeCanonical`, `parseDecimal`, `compare`, `toApproximateNumber`) and `dist/map.js` (`RationalMap`: `combine`, `aggregate`, `lowerBound`, `overview`). Upstream commit in [`vendor/versions.json`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/vendor/versions.json).
- [`server/schema.sql`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/schema.sql#L16-L30) — design note (rationals never B-tree keys) and `CREATE EXTENSION pgmp`.
- [`server/schema.sql`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/schema.sql#L163-L213) — `oc_nodes`, `oc_moments`, `moment_ids`, `height`, `oc_qtext`.
- [`server/schema.sql`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/schema.sql#L215-L312) — `oc_overview_v2` and the `oc_overview` wrapper.
- [`server/schema.sql`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/schema.sql#L314-L362) — `oc_events`: the `(time, id)` cursor walk.
- [`server/schema.sql`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/schema.sql#L978-L1003) — `oc_qkey`: order-preserving numeric key for rationals.
- [`server/schema.sql`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/schema.sql#L1005-L1015) — `first_key` generated column and the `oc_duration_nodes_first_key` index.
- [`server/schema.sql`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/schema.sql#L1101-L1108) — `oc_duration_overview`: key-range scan with exact recheck.
- [`server/retention.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/retention.mjs#L122-L140) — expiry range scan on `first_key` with exact recheck.
- [`server/store.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/store.mjs#L1806-L1823) — durations streamed in `first_key, first_time, id` order.
- [`server/http.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/http.mjs#L185-L193) — `bound`: canonicalizes request bounds.
- [`server/store.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/store.mjs#L2100-L2113) — minimum threshold `span / 1024` and the overview call.
- [`server/store.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/store.mjs#L2386-L2405) — event pages: `limit + 1` rows and the next cursor.
- [`server/avl.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/server/avl.mjs#L15-L19) — ID order by UTF-16 code units, equal to `COLLATE "C"` for ASCII.
- [`vendor/sqlite-rational/src/rational.c`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/vendor/sqlite-rational/src/rational.c#L39-L43) — `q_text`: canonical `n/d` with `/1`.
- [`vendor/sqlite-rational/src/rational.c`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/vendor/sqlite-rational/src/rational.c#L151-L175) — the `RATIONAL_V1` collation and function registration.
- [`vendor/sqlite-rational/src/index.c`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/vendor/sqlite-rational/src/index.c#L299-L330) — `span`: anchored-span overview in the virtual table.
- [`vendor/sqlite-rational/src/index.c`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/vendor/sqlite-rational/src/index.c#L363-L371) — shadow tables `_nodes` (cached `first`, `last`, `count`, `size`, `gap`) and `_meta`.
- [`native-store/src/lib.rs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/lib.rs#L438-L496) — `events` table under `RATIONAL_V1`, `points` index, bulk `append` and `build`.
- [`native-store/src/workspace.rs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/workspace.rs#L503-L522) — desktop overview: threshold floor of 1/1024 of the window, `points` span query.
- [`native-store/src/workspace.rs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/native-store/src/workspace.rs#L601-L605) — keyset pagination on `(time COLLATE RATIONAL_V1, id)`.
- [`docs/architecture.md`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/docs/architecture.md#L36-L44) — the window-summary contract.

## Benchmarks

Measured numbers that exist in the repository:

- [`docs/benchmarks.md`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/docs/benchmarks.md#L263-L280), local run (16 cores, Node 26, PostgreSQL 16 in Docker, `BENCH_TIME=1000`), mean time to compute a viewport (moment groups plus duration bands and arcs) from the three stores:

  | Operation                    |    Size |          In-memory | SQLite | PostgreSQL |
  | ---------------------------- | ------: | -----------------: | -----: | ---------: |
  | Viewport: whole timeline     |   1,000 |             3.3 ms | 7.1 ms |      10 ms |
  |                              |  10,000 |              13 ms |  16 ms |      14 ms |
  |                              | 100,000 | 292 ms (p50 50 ms) |  31 ms |      27 ms |
  | Viewport: 1% of the timeline |   1,000 |             0.7 ms | 1.9 ms |     3.0 ms |
  |                              |  10,000 |             6.3 ms | 8.5 ms |     7.5 ms |
  |                              | 100,000 |             8.4 ms |  14 ms |      11 ms |
  | Read a page of 100 moments   | 100,000 |              91 µs | 619 µs |     3.6 ms |

- Node-visit counts checked by tests: a 5,000-moment cluster summarized by `oc_overview` in **one** node visit ([`test/sql-oracle.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/sql-oracle.mjs#L272-L274)); 10,000 moments at one time loaded as one key, summarized in fewer than 10 node visits ([`test/core.test.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/core.test.mjs#L177-L199)); 2,000 coordinates reduced to one summary with one node visit in the sqlite-rational test suite ([`vendor/sqlite-rational/README.md`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/vendor/sqlite-rational/README.md)).

## First public disclosure

The repository has been public on GitHub since its creation on 2026-10-05.

| Component                                                         | First commit           | First release tag |
| ----------------------------------------------------------------- | ---------------------- | ----------------- |
| `Q` rational type, `parseDecimal`, canonical `n/d`, `RationalMap` | `88aea8c` (2026-10-05) | `v0.1.0`          |
| ASCII ID rule `[A-Za-z0-9_.:-]{1,128}`                            | `88aea8c` (2026-10-05) | `v0.1.0`          |
| `screenQ` (1/1024 px), `Viewport.threshold`                       | `88aea8c` (2026-10-05) | `v0.1.0`          |
| pgmp `mpq` storage, `oc_qtext`, `oc_overview`, `oc_events`        | `88aea8c` (2026-10-05) | `v0.1.0`          |
| sqlite-rational: `RATIONAL_V1`, `rational_index`                  | `88aea8c` (2026-10-05) | `v0.1.0`          |
| `oc_overview_v2` (metadata column)                                | `5929cca` (2026-10-06) | `v0.1.0`          |
| Server minimum threshold `span / 1024`                            | `6530edf` (2026-10-07) | `v0.1.0`          |
| `oc_moments` table, `moment_ids`, AVL `height` (index version 2)  | `61c0f77` (2026-10-08) | `v0.1.0`          |
| `oc_qkey` order-preserving key for duration starts                | `b91355d` (2026-10-11) | `v0.1.0`          |
| `rational_index` bulk `append` and `build`                        | `ae3bbcf` (2026-10-17) | `v0.1.0`          |

## Figures

The node layout of a moment tree in PostgreSQL (illustrative values). Only the integer node IDs are keys; every rational is a payload.

```
                    (timeline_id, 7)  time=1/2
                    first=-3/1 last=41/3  events=9 distinct=6
                   /                                     \
   (timeline_id, 3)  time=-1/1                (timeline_id, 12)  time=8/1
   first=-3/1 last=1/3  events=4 distinct=3   first=7/2 last=41/3 events=4 distinct=2
       ...                                         ...
```

Anchored spans on one axis with threshold `T`. The group interval is half-open, so a time exactly `T` after the anchor starts the next group:

```
  a1        a1+T  a2              a2+T   a3
  |--x--x-x--)    |--x----x--------)     |--x
  group 1         group 2                 group 3
```

Note on the documentation: [`docs/architecture.md`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/docs/architecture.md#L63) names the SQL operation `oc_overview`; the server now calls `oc_overview_v2` (same arguments, plus a metadata column), and `oc_overview` remains as a wrapper for existing callers and the conformance test.
