# sqlite-rational

A GMP-backed SQLite extension for exact arbitrary-precision rational arithmetic,
indexed range queries, and persisted proximity summaries. This directory builds
independently of OpenChronology and the browser library.

Version 0.1.0 provides two storage choices: a normal TEXT column ordered by
RATIONAL_V1, and an augmented rational_index virtual table that skips dense
regions during overview queries.

## Build and test

Requires a C99 compiler, CMake 3.16+, pkg-config, GMP development files, and SQLite
3.37+ headers/runtime. Python 3 runs the extension test suite.

Tests are enabled by default and require Python. To embed without test dependencies,
configure with -DBUILD_TESTING=OFF. See [GitHub CI](CI.md) for repository layout,
compiler matrices, source-package checks, and downloadable artifacts.

~~~sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
ctest --test-dir build --output-on-failure
cmake --install build --prefix /your/install/prefix
cpack --config build/CPackSourceConfig.cmake -B /your/release/directory
~~~

Builds a loadable module (sqlite_rational.so on Linux), a static library, and the
public sqlite_rational.h header. CPack creates an independent source tarball.
In SQLite's CLI:

~~~sql
.load ./build/sqlite_rational
SELECT q_add(q_decimal('0.1'), q_decimal('0.2')); -- 3/10
SELECT q_make('123456789012345678901234567890', '7');
~~~

Register **per connection**. For static embedding, link sqlite_rational_static
and call sqlite_rational_register(db) after opening the connection. It uses the
host's SQLite implementation without extension loading. Static embedding in
SQLite/WASM requires GMP and SQLite for that platform and is not yet validated.

## Ordinary SQL tables and indexes

~~~sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  time TEXT NOT NULL COLLATE RATIONAL_V1
    CHECK(q_is_canonical(time) = 1),
  title TEXT
) STRICT;
CREATE INDEX events_time ON events(time);

INSERT INTO events(time,title) VALUES(q('2/4'),'half'),(q('1'),'one');
SELECT * FROM events
WHERE time >= q('1/3') AND time < q('1')
ORDER BY time;
-- half

SELECT * FROM events WHERE time BETWEEN q('1/2') AND q('1');
-- half and one: SQL BETWEEN includes both endpoints
~~~

Use the column/index's rational collation consistently. Binary text order is not
rational order. UNIQUE rational indexes consider equivalent fractions equal.
The check enforces canonical storage; q normalizes input. SQLite overflow pages
allow long TEXT keys; tests exercise 10,000-digit components in an ordinary index.

This storage choice allows separate metadata rows at the same time. It provides
exact ordered lookups, but SQL aggregation enumerates selected rows. For cached
overviews, use the virtual table.

## Persisted augmented index

~~~sql
CREATE VIRTUAL TABLE points USING rational_index;
INSERT INTO points(time,value,weight) VALUES
  ('0','bucket-0',2), ('1/1000000','bucket-1',3), ('1','bucket-2',1);

SELECT time,value,weight FROM points
WHERE time >= q('0') AND time < q('1') ORDER BY time;

SELECT time,last_time,weight,distinct_count,max_gap,visited_nodes
FROM points
WHERE lower=q('0') AND upper=q('2')
  AND threshold=q('2') AND mode='neighbors';

SELECT time,last_time,weight,distinct_count
FROM points
WHERE lower=q('0') AND upper=q('2')
  AND threshold=q('1/1000') AND mode='span';

UPDATE points SET time=q('3/2') WHERE time=q('1');
DELETE FROM points WHERE time=q('0');
~~~

Writable columns: time, value, weight. Time is unique by rational value and
normalized on insert/update. Store application buckets for multiple events at
one coordinate; value can be a bucket ID joined to conventional metadata tables.
Value accepts SQLite scalars and BLOBs. Weight defaults to 1 and must be a positive
INTEGER. Replace buckets with UPDATE; duplicate-coordinate INSERT raises an error.

Rows retain stable positive integer rowids when moved. Explicit positive rowids
can be inserted, but changing rowids is rejected. Computed and hidden columns are
read-only. Transactions, statement rollback, savepoints, reopen, and attached schemas
are tested. The index owns <name>_nodes and <name>_meta shadow tables; do not edit
them directly. ALTER TABLE RENAME is not implemented.

| Hidden input | Meaning |
| --- | --- |
| lower, upper | Rational TEXT bounds; omitted or NULL means unbounded |
| include_lower, include_upper | INTEGER 0/1; default 1/0 |
| threshold | Nonnegative rational TEXT; omitted or NULL requests raw rows |
| mode | span (default) or neighbors |
| visited_nodes | Read-only diagnostic number of node visits |

Pass inputs with equality constraints as shown. Hidden viewport bounds are useful
for summaries; ordinary comparisons on time also constrain coordinates before
summarizing. Reversed bounds are empty. Equal bounds select a coordinate only when
both endpoints are inclusive.

Summary outputs: time (first coordinate), last_time, weight (total bucket weights),
distinct_count, and max_gap (largest adjacent gap). Raw rows have equal first/last
times, distinct count 1, and gap 0/1. Value is returned for a single-coordinate
group and NULL for larger groups. A summary's rowid identifies its first coordinate.

Span greedily gathers [a, a+threshold) from the first remaining coordinate a.
Neighbors connects successive gaps strictly below the threshold and permits long
chains. Equality with the threshold separates groups; zero emits distinct coordinates.
Viewport membership and grouping remain exact.

Caches cover **all indexed coordinates** in the viewport. Predicates on value or
computed output columns are applied **after** summarizing; they do not filter
entries contributing to a summary. Use separate indexes per dataset/filter scope
when needed. Editing through a summary query affects its first-coordinate rowid;
use raw queries for application edits.

## Functions and encoding

Canonical interchange is reduced n/d TEXT with positive denominator, always
including /1. Parsers consume the entire input, accept signed integer components,
and reject whitespace, malformed input, and zero denominators. No REAL conversion
occurs.

| Functions | Result |
| --- | --- |
| q(text), q_make(numerator_text,denominator_text) | Canonical rational TEXT |
| q_decimal(text) | Exact finite decimal/exponent conversion |
| q_is_canonical(value) | 1 for canonical rational TEXT, otherwise 0 |
| q_cmp(a,b) | INTEGER -1, 0, or 1 |
| q_add, q_sub, q_mul, q_div, q_min, q_max | Canonical rational TEXT |
| q_neg, q_abs, q_floor, q_ceil | Canonical rational TEXT |
| q_num, q_den | Arbitrary-precision integer TEXT |

Rational arguments must be TEXT; bind strings or use q_decimal. NULL propagates
through arithmetic; q_is_canonical(NULL) returns 0. Invalid arithmetic raises an
SQL error. Functions are deterministic and innocuous, supporting checks with
trusted_schema=OFF.

RATIONAL_V1 orders valid rationals numerically, then malformed strings in a
separate class ordered by bytes. Equivalent valid strings compare equal. This
remains transitive for unchecked columns. SQLite collation callbacks cannot signal
allocation failure: that failure terminates the process, consistent with GMP's
default allocator. Time precision has no fixed numeric ceiling; SQLite value-size,
memory, and GMP allocation limits still apply. Virtual-table weights, counts,
distinct counts, and rowids are signed 64-bit; overflow raises an error.

## Costs and release scope

The persisted AVL uses small rowids and caches exact first/last coordinates,
entry/distinct counts, and maximum adjacent gap. Lookup and edits use O(log n)
node operations; raw ranges O(log n+k); span overviews O(g log n) for g groups.
Neighbor overviews can consume a whole cached subtree without loading descendants
or payloads, with O(n) worst-case traversal. The dense test reduces 2,000 coordinates
to a summary with **one node visit**. Arithmetic cost depends on operand bit lengths.

Current cursors materialize their output, using O(k) memory for raw results and
O(g) for summary groups. SQL LIMIT does not yet short-circuit construction.
This release includes no interval overlap index, PostgreSQL summary extension,
or custom summary reducers. Linux dynamic/static builds are tested; macOS,
Windows, and WASM need validation before binary releases.

Own code is MIT licensed. GMP is a separate dependency under LGPLv3+ or GPLv2+.
Meet its applicable terms when distributing linked binaries, particularly static
builds. See THIRD_PARTY.md.
