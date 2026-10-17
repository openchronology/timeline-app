-- Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
-- The PostgreSQL schema, applied on every migration (server/migrate.mjs): tables, indexes,
-- triggers and functions are created when missing and altered forward, so this one file
-- takes a database of any earlier release to the current one.
--
-- How it runs: migrate.mjs sends the whole file as one multi-statement query inside a single
-- transaction, on a new database and on every existing one alike, then runs the repairs that
-- need JavaScript (index rebuilds, history start, standing). So every statement is written to
-- be re-run: CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP ... IF EXISTS before re-adding a constraint, trigger or index, and data upgrades whose
-- WHERE clause (or ON CONFLICT DO NOTHING) matches only rows not yet converted. If any
-- statement fails, the whole migration rolls back. Later statements alter what earlier ones
-- created, so a table's full shape is its CREATE TABLE plus the ALTERs further down (search
-- for its name).
--
-- Rational times are pgmp's exact mpq values. They are never B-tree keys, since a rational
-- can have thousands of digits: rows are keyed by small integer or text IDs and keep times as
-- payloads, or as an order-preserving numeric key (oc_qkey) where a range scan is needed.
--
-- Contents, in file order: accounts and sign-in; timelines, the moment tree (oc_nodes,
-- oc_moments) and its walks (oc_overview_v2, oc_events); plugins; catalogue search; pull
-- requests; saved revisions; account security and mail; live notifications; quotas and the
-- storage ledger; stars; durations (oc_duration_nodes, oc_duration_overview); entity search;
-- tag-separation views; relationships; catalogue text (oc_event_text); retention (#91);
-- history as rows (oc_history_*); versioned index rows and fork read-through (#145);
-- optional saved history (#136); autovacuum settings (#135); moderation (#115); account
-- standing (#103); timeline addresses (#148).
--
-- pgmp provides mpq (exact rationals of any size) and mpz, with exact arithmetic and order.
CREATE EXTENSION IF NOT EXISTS pgmp;
-- Accounts (auth.mjs, account-security.mjs, oauth.mjs, administration.mjs and most other
-- modules). Columns added further down: email and two-factor fields, administration and
-- quota fields, trust (#103), birth_year and show_sensitive (#115).
--   username: lower case, 3-32 of [a-z0-9_-] (checked in auth.mjs and account-security.mjs).
--   password_hash: "scrypt:<version>:<salt>:<hash>", upgraded to the current version at
--   sign-in; NULL (allowed below) for an account that signs in only through a provider.
CREATE TABLE IF NOT EXISTS oc_users (
  id uuid PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Signed-in sessions (auth.mjs issues and checks them; account-security.mjs, http.mjs,
-- administration.mjs and moderation.mjs end them).
--   token_hash: SHA-256 of the random token in the session cookie (web) or bearer header
--   (desktop); the token itself is never stored, so the table yields no usable sessions.
--   csrf: the token mutation requests must echo in X-CSRF-Token.
--   expires_at: 14 days after sign-in; a session idle for a day also ends (last_seen_at).
-- Ending an account's sessions (DELETE ... WHERE user_id, on password and two-factor changes,
-- suspension) has no index leading with user_id and reads the table.
CREATE TABLE IF NOT EXISTS oc_sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  csrf text NOT NULL, expires_at timestamptz NOT NULL
);
-- Expired-session sweep: expires_at<=now() in auth.mjs issue (with oc_sessions_idle).
CREATE INDEX IF NOT EXISTS oc_sessions_expiry ON oc_sessions(expires_at);
-- Upgrades, each a no-op once applied (existing rows take the defaults):
--   password_hash becomes optional, for accounts that sign in only through a provider;
--   kind: 'web' (cookie) or 'desktop' (bearer token from the device flow); session() accepts
--   a token only when presented the way its kind was issued;
--   created_at: when the session was issued (approving a desktop sign-in or linking a
--   provider requires one from the last five minutes);
--   last_seen_at: refreshed at most every five minutes by session(); a session idle for a day
--   is refused and swept.
ALTER TABLE oc_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE oc_sessions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'web' CHECK(kind IN ('web','desktop'));
ALTER TABLE oc_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE oc_sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
-- Idle-session sweep: last_seen_at<=now()-1 day in auth.mjs issue.
CREATE INDEX IF NOT EXISTS oc_sessions_idle ON oc_sessions(last_seen_at);
-- Provider sign-ins linked to accounts (oauth.mjs signs in and links; http.mjs lists and
-- unlinks; standing.mjs counts one as confirmation). subject: the provider's stable user ID.
-- The primary key finds the account for a provider sign-in; UNIQUE(user_id,provider) allows
-- one identity per provider and account.
CREATE TABLE IF NOT EXISTS oc_identities (
  provider text NOT NULL CHECK(provider IN ('google','github','facebook')), subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE, PRIMARY KEY(provider,subject),
  UNIQUE(user_id,provider)
);
-- A provider sign-in in progress (oauth.mjs): inserted by start, and deleted with RETURNING
-- by the callback, so each flow is used once; 10 minutes.
--   state_hash: SHA-256 of the OAuth state; browser_hash: hash of the oc_oauth cookie, which
--   binds the flow to the browser that started it (against login CSRF); verifier: the PKCE
--   code verifier; nonce: the OpenID nonce Google's ID token must carry; return_to: the app
--   page to go back to; link_user, link_session: set when linking a provider to the
--   signed-in account, whose same session must finish the flow.
CREATE TABLE IF NOT EXISTS oc_oauth_flows (
  state_hash text PRIMARY KEY, browser_hash text NOT NULL, provider text NOT NULL,
  verifier text NOT NULL, nonce text NOT NULL, return_to text NOT NULL,
  link_user uuid REFERENCES oc_users ON DELETE CASCADE, link_session text,
  expires_at timestamptz NOT NULL
);
-- Expired-flow sweep: expires_at<=now() in oauth.mjs start.
CREATE INDEX IF NOT EXISTS oc_oauth_expiry ON oc_oauth_flows(expires_at);
-- Desktop sign-in by device code (device-auth.mjs), 10 minutes.
--   device_hash: SHA-256 of the secret device code the desktop app polls with;
--   user_code: the short code the person approves in a browser where they are signed in;
--   user_id: set on approval (only while still NULL, so approval happens once);
--   last_poll_at: polls closer than 3 seconds apart are refused.
-- The poll that finds the request approved deletes it and issues the desktop session.
CREATE TABLE IF NOT EXISTS oc_device_logins (
  device_hash text PRIMARY KEY, user_code text UNIQUE NOT NULL,
  user_id uuid REFERENCES oc_users ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, last_poll_at timestamptz
);
-- Expired-request sweep: expires_at<=now() in device-auth.mjs start.
CREATE INDEX IF NOT EXISTS oc_device_expiry ON oc_device_logins(expires_at);
-- Rate-limit counters shared by every server process (auth.mjs rateLimit; challenge.mjs for
-- sign-in failures). key: SHA-256 of what is limited (an address, an account, an email, a
-- kind of failure); count: attempts in the window, which starts at the first attempt and
-- ends at expires_at (1 minute for rateLimit, 15 for sign-in failures).
CREATE TABLE IF NOT EXISTS oc_auth_attempts (
  key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
);
-- Expired-counter sweep: auth.mjs rateLimit deletes expired rows on every call.
CREATE INDEX IF NOT EXISTS oc_attempts_expiry ON oc_auth_attempts(expires_at);
-- Spent human-verification answers (challenge.mjs verifyWork), kept until their challenge
-- expires. id: SHA-256 of the proof-of-work salt; the insert succeeds once, so an answer
-- replayed within its lifetime is refused.
CREATE TABLE IF NOT EXISTS oc_challenge_uses (
  id text PRIMARY KEY, expires_at timestamptz NOT NULL
);
-- Expired-answer sweep: expires_at<=now() in verifyWork.
CREATE INDEX IF NOT EXISTS oc_challenge_uses_expiry ON oc_challenge_uses(expires_at);
-- Timelines: one row each, with its settings and the state of its indexes (store.mjs reads
-- and writes it throughout; collaboration.mjs, versioning.mjs, history.mjs, retention.mjs,
-- standing.mjs and others read it). Columns are added throughout this file.
--   owner_id: no ON DELETE action; account-deletion.mjs deletes an account's timelines first.
--   revision: the current revision number; saves send the one they started from and are
--   refused when it moved (conflict detection).
--   root: the moment tree's root node (oc_nodes.id), NULL without moments;
--   event_count: the timeline's moments, so counts never need COUNT(*).
--   updated_at: the last change; incremental saves advance it at most once a minute.
CREATE TABLE IF NOT EXISTS oc_timelines (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES oc_users,
  title text NOT NULL, description text NOT NULL DEFAULT '', visibility text NOT NULL DEFAULT 'private'
    CHECK(visibility IN ('private','public')),
  revision bigint NOT NULL DEFAULT 1, root bigint, event_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- An owner's timelines: dashboard listings, the catalogue's 'mine' scope, account deletion.
CREATE INDEX IF NOT EXISTS oc_timelines_owner ON oc_timelines(owner_id);
-- Idempotent upgrade for existing installations; NULL preserves older documents.
-- presentation: the document's time presentation (docs/time-presentation.md); plugins:
-- snapshots of the plugin definitions the timeline installs (see oc_plugins).
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS presentation jsonb;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS plugins jsonb;
-- Collaborators the owner invites (http.mjs members routes; store.mjs and collaboration.mjs
-- check access by the primary key). The owner is no member. Roles are upgraded below to
-- viewer, contributor or writer. Listing the timelines shared with an account filters on
-- user_id alone, which no index leads with.
CREATE TABLE IF NOT EXISTS oc_members (
  timeline_id uuid NOT NULL REFERENCES oc_timelines ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('viewer','editor')), PRIMARY KEY(timeline_id,user_id)
);
-- The moment tree: a persistent augmented AVL tree per timeline, one node per distinct moment
-- time (avl.mjs MOMENT_TREE; written by store.mjs and incremental.mjs, read by the walks
-- below and by indexReader queries). Only small IDs are B-tree keys. Arbitrarily large mpq
-- values remain payloads.
--   time: the node's own time; first_time, last_time: the earliest and latest time in its
--   subtree; left_id, right_id: its children (NULL for none);
--   first_id: the subtree's leftmost node, whose first moment is the subtree's first (the
--   singleton lookup in oc_overview_v2);
--   bucket_count: moments at this node's time; event_count: moments in its subtree;
--   distinct_count: distinct times (nodes) in its subtree;
--   events: whole moments, as releases before oc_moments kept them (NULL since, below).
CREATE TABLE IF NOT EXISTS oc_nodes (
  timeline_id uuid NOT NULL REFERENCES oc_timelines ON DELETE CASCADE, id bigint NOT NULL,
  time mpq NOT NULL, first_time mpq NOT NULL, last_time mpq NOT NULL,
  left_id bigint, right_id bigint, first_id bigint NOT NULL, bucket_count bigint NOT NULL,
  event_count bigint NOT NULL, distinct_count integer NOT NULL,
  events jsonb NOT NULL, PRIMARY KEY(timeline_id,id)
);
-- Moments live in their own rows. The moment tree is a persistent AVL tree with stable node
-- IDs: one node per distinct time, holding its moment IDs (sorted, "C" order) and subtree
-- summaries, so a save rewrites only the nodes on a path and a metadata edit touches no node.
-- event: the moment as the document has it ({id, time, metadata}); time repeats its time as
-- an mpq. Read by primary key (oc_events, store.mjs, history.mjs, save-merge.mjs).
CREATE TABLE IF NOT EXISTS oc_moments (
  timeline_id uuid NOT NULL REFERENCES oc_timelines ON DELETE CASCADE, id text NOT NULL,
  time mpq NOT NULL, event jsonb NOT NULL, PRIMARY KEY(timeline_id,id)
);
-- moment_ids: the node's moment IDs in "C" order (replacing events); height: the node's AVL
-- height (NULL in trees built before index version 2, which migrate.mjs rebuilds).
ALTER TABLE oc_nodes ADD COLUMN IF NOT EXISTS moment_ids text[];
ALTER TABLE oc_nodes ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE oc_nodes ALTER COLUMN events DROP NOT NULL;
-- Older installations kept whole moments inside nodes; move them out once: copy each node's
-- events into oc_moments, then keep their IDs in stored order and clear events. Both
-- statements match only nodes that still have events, so a re-run does nothing.
INSERT INTO oc_moments(timeline_id,id,time,event)
SELECT n.timeline_id,e->>'id',n.time,e FROM oc_nodes n CROSS JOIN LATERAL jsonb_array_elements(n.events) e
WHERE n.events IS NOT NULL ON CONFLICT DO NOTHING;
UPDATE oc_nodes SET moment_ids=ARRAY(SELECT x.e->>'id' FROM jsonb_array_elements(events) WITH ORDINALITY x(e,o) ORDER BY x.o),
  events=NULL WHERE events IS NOT NULL;
-- 2: AVL trees with heights and stable IDs; migrate.mjs rebuilds older indexes.
-- index_version: existing timelines take 0 and are rebuilt by rebuildIndexes (store.mjs);
-- saving in place (incremental.mjs) requires version 2.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS index_version integer NOT NULL DEFAULT 0;
-- An mpq as "num/den" text ("/1" for integers): how the walks and queries hand exact times
-- to JavaScript, which never sees them as floats.
CREATE OR REPLACE FUNCTION oc_qtext(q mpq) RETURNS text LANGUAGE sql IMMUTABLE STRICT
AS $$ SELECT num(q)::text || '/' || den(q)::text $$;

-- In-order traversal consumes a cached subtree whenever it fits the current span group.
--
-- Window summaries of a timeline's moments (docs/architecture.md, "Window summaries"; store.mjs
-- overview queries): the moments with times in [lo,hi] in anchored groups. A group starts at
-- its first time and takes each later time less than `threshold` after it; a time exactly
-- threshold after the start opens the next group, and threshold 0 gives one group per
-- distinct time. One row per group: its exact first and last times ("n/d"), its moment count
-- (as text, so JavaScript never rounds it), its distinct times, and for a group of exactly one
-- moment that moment's title, ID and metadata; visited_nodes is how many subtrees the walk had
-- entered so far (checked by tests and benchmarks).
--
-- The walk keeps an explicit stack: ids holds node IDs, and points marks an entry that stands
-- for the node's own time rather than its whole subtree. It prunes subtrees outside the window
-- and takes a subtree's cached totals (first/last time, event_count, distinct_count) whenever
-- the subtree lies inside the window and fits in the current group, so a dense cluster costs
-- a few node reads however many moments it holds: about the groups times the tree's height.
-- Reads only; callers use a repeatable-read transaction so the root and its nodes come from
-- one revision. Raises on missing or negative bounds and on a node the tree names but lacks.
-- Forks are handed to oc_overview_lineage and views use oc_view_overview (both generated
-- below from this definition, which the rewrites there match by text).
CREATE OR REPLACE FUNCTION oc_overview_v2(tid uuid, lo mpq, hi mpq, threshold mpq)
RETURNS TABLE(first_time text,last_time text,event_count text,distinct_count integer,title text,event_id text,visited_nodes integer,metadata jsonb)
LANGUAGE plpgsql AS $$
DECLARE ids bigint[]; points boolean[] := ARRAY[false]; idx integer; nid bigint; point boolean;
  n record; a mpq; b mpq; weight bigint; distinct_n integer; whole boolean;
  current_a mpq; current_b mpq; current_weight bigint; current_distinct integer; current_id bigint; visits integer:=0;
  sample jsonb;
BEGIN
  -- Overviews need exact, finite bounds (event pages accept open ones).
  IF lo IS NULL OR hi IS NULL OR threshold IS NULL OR threshold<'0'::mpq THEN
    RAISE EXCEPTION 'Overview needs finite bounds and a nonnegative threshold';
  END IF;
  IF lo>hi THEN RETURN; END IF;
  -- Start with the root's whole subtree (points[1] is false). No root, no moments: no rows.
  SELECT ARRAY[root] INTO ids FROM oc_timelines WHERE id=tid AND root IS NOT NULL;
  WHILE cardinality(ids)>0 LOOP
    -- Pop the top entry: a node, standing for its own time only (point) or its subtree.
    idx:=cardinality(ids); nid:=ids[idx]; point:=points[idx]; ids:=ids[1:idx-1]; points:=points[1:idx-1];
    SELECT node.time,node.left_id,node.right_id,node.first_id,node.first_time,node.last_time,node.bucket_count,node.event_count,node.distinct_count INTO n FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=nid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Broken timeline index'; END IF;
    -- visited_nodes counts subtrees entered, not points.
    IF NOT point THEN visits:=visits+1; END IF;
    -- Prune entries whose subtree lies wholly outside [lo,hi].
    IF n.last_time<lo OR n.first_time>hi THEN CONTINUE; END IF;
    -- The candidate span a..b, its moment count (weight) and distinct times. It is whole when
    -- it lies inside the window, so its totals count as they are (a point always is, once its
    -- time is in the window).
    IF point THEN
      IF n.time<lo OR n.time>hi THEN CONTINUE; END IF;
      a:=n.time; b:=n.time; weight:=n.bucket_count; distinct_n:=1; whole:=true;
    ELSE
      a:=n.first_time; b:=n.last_time; weight:=n.event_count; distinct_n:=n.distinct_count;
      whole:=a>=lo AND b<=hi;
    END IF;
    -- The candidate starts threshold or more after the open group's first time, so that group
    -- is complete: emit it. A group of exactly one moment also carries the moment's title, ID
    -- and metadata, found through its node (current_id) and the node's first moment ID.
    IF current_a IS NOT NULL AND a-current_a>=threshold THEN
      first_time:=oc_qtext(current_a); last_time:=oc_qtext(current_b); event_count:=current_weight::text;
      distinct_count:=current_distinct; visited_nodes:=visits; title:=NULL; event_id:=NULL; metadata:=NULL;
      IF current_weight=1 THEN
        SELECT m.event INTO sample FROM oc_moments m WHERE m.timeline_id=tid AND m.id=(SELECT node.moment_ids[1] FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=current_id);
        title:=sample->'metadata'->>'title'; event_id:=sample->>'id'; metadata:=sample->'metadata';
      END IF;
      RETURN NEXT; current_a:=NULL;
    END IF;
    -- Take the candidate whole when it is inside the window and cannot cross a group boundary:
    -- a single time (a point, or a subtree of one distinct time), or a subtree ending less than
    -- threshold after the group's first time (or its own first, when it opens a group). A new
    -- group remembers its first node (a subtree's leftmost, first_id) for the lookup above.
    IF whole AND (point OR distinct_n=1 OR b-coalesce(current_a,a)<threshold) THEN
      IF current_a IS NULL THEN current_a:=a; current_id:=CASE WHEN point THEN nid ELSE n.first_id END; current_weight:=0; current_distinct:=0; END IF;
      current_b:=b; current_weight:=current_weight+weight; current_distinct:=current_distinct+distinct_n;
    ELSE
      -- Otherwise descend: push the right subtree, the node's own time, then the left
      -- subtree, so that they pop in time order.
      IF n.right_id IS NOT NULL THEN ids:=array_append(ids,n.right_id); points:=array_append(points,false); END IF;
      ids:=array_append(ids,nid); points:=array_append(points,true);
      IF n.left_id IS NOT NULL THEN ids:=array_append(ids,n.left_id); points:=array_append(points,false); END IF;
    END IF;
  END LOOP;
  -- Emit the last open group, as above.
  IF current_a IS NOT NULL THEN
    first_time:=oc_qtext(current_a); last_time:=oc_qtext(current_b); event_count:=current_weight::text;
    distinct_count:=current_distinct; visited_nodes:=visits; title:=NULL; event_id:=NULL; metadata:=NULL;
    IF current_weight=1 THEN
      SELECT m.event INTO sample FROM oc_moments m WHERE m.timeline_id=tid AND m.id=(SELECT node.moment_ids[1] FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=current_id);
      title:=sample->'metadata'->>'title'; event_id:=sample->>'id'; metadata:=sample->'metadata';
    END IF;
    RETURN NEXT;
  END IF;
END $$;

-- Keep the original result shape for existing callers and conformance tests
-- (test/sql-oracle.mjs): oc_overview_v2 without the metadata column, same arguments.
CREATE OR REPLACE FUNCTION oc_overview(tid uuid, lo mpq, hi mpq, threshold mpq)
RETURNS TABLE(first_time text,last_time text,event_count text,distinct_count integer,title text,event_id text,visited_nodes integer)
LANGUAGE sql AS $$ SELECT g.first_time,g.last_time,g.event_count,g.distinct_count,g.title,g.event_id,g.visited_nodes FROM oc_overview_v2(tid,lo,hi,threshold) g $$;

-- A page of a timeline's moments in (time, ID in "C" order) order: the moment JSON ({id, time,
-- metadata}) of at most max_rows moments with times in [lo,hi] (a NULL bound is open) after
-- the cursor (after_time, after_id; both NULL for the first page). An in-order walk of the
-- moment tree like oc_overview_v2's that prunes subtrees outside the window or before the
-- cursor and stops once the page is full, so a page costs about its rows plus the tree's
-- height: it never sorts or collects a whole visible cluster. Each moment is one
-- primary-key lookup. Callers: store.mjs event pages, retention.mjs (expiring moments in time
-- order), oc_event_text, and the recovery of older installations below. Forks are handed to
-- oc_events_lineage; views use oc_view_events. Raises on a page size outside 1..200001.
CREATE OR REPLACE FUNCTION oc_events(tid uuid,lo mpq,hi mpq,after_time mpq,after_id text,max_rows integer)
RETURNS SETOF jsonb LANGUAGE plpgsql AS $$
DECLARE ids bigint[]; points boolean[]:=ARRAY[false]; idx integer; nid bigint; point boolean;
  n record; e jsonb; mid text; emitted integer:=0;
BEGIN
  -- Pages hold 1 to 200001 moments.
  IF max_rows<1 OR max_rows>200001 THEN RAISE EXCEPTION 'Invalid event page size'; END IF;
  -- Crossed bounds are an empty window.
  IF lo IS NOT NULL AND hi IS NOT NULL AND lo>hi THEN RETURN; END IF;
  -- The same in-order walk as oc_overview_v2, without groups.
  SELECT ARRAY[root] INTO ids FROM oc_timelines WHERE id=tid AND root IS NOT NULL;
  WHILE cardinality(ids)>0 LOOP
    -- Pop the top entry: a node, standing for its own time only (point) or its subtree.
    idx:=cardinality(ids); nid:=ids[idx]; point:=points[idx]; ids:=ids[1:idx-1]; points:=points[1:idx-1];
    SELECT node.time,node.left_id,node.right_id,node.first_time,node.last_time,node.moment_ids INTO n FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=nid;
    -- Prune subtrees outside the window or wholly before the cursor's time.
    IF (lo IS NOT NULL AND n.last_time<lo) OR (hi IS NOT NULL AND n.first_time>hi)
      OR (after_time IS NOT NULL AND n.last_time<after_time) THEN CONTINUE; END IF;
    IF point THEN
      -- The node's own time: skip it outside the window or before the cursor's time.
      IF (lo IS NOT NULL AND n.time<lo) OR (hi IS NOT NULL AND n.time>hi) OR (after_time IS NOT NULL AND n.time<after_time) THEN CONTINUE; END IF;
      -- One primary-key lookup per moment, in the node's ID order.
      FOR mid IN SELECT unnest(n.moment_ids) LOOP
        SELECT m.event INTO e FROM oc_moments m WHERE m.timeline_id=tid AND m.id=mid;
        -- At the cursor's time, IDs up to and including after_id were on earlier pages.
        IF after_time IS NOT NULL AND n.time=after_time AND (e->>'id') COLLATE "C"<=after_id COLLATE "C" THEN CONTINUE; END IF;
        -- Stop as soon as the page is full: nothing past it is read.
        RETURN NEXT e; emitted:=emitted+1; IF emitted>=max_rows THEN RETURN; END IF;
      END LOOP;
    ELSE
      -- Descend in time order: right subtree, own time, left subtree (popped left first).
      IF n.right_id IS NOT NULL THEN ids:=array_append(ids,n.right_id); points:=array_append(points,false); END IF;
      ids:=array_append(ids,nid); points:=array_append(points,true);
      IF n.left_id IS NOT NULL THEN ids:=array_append(ids,n.left_id); points:=array_append(points,false); END IF;
    END IF;
  END LOOP;
END $$;

-- Community definitions are immutable, owner-namespaced versions. Timelines retain snapshots.
-- plugins.mjs publishes (ON CONFLICT DO NOTHING keeps a published version as it was) and
-- lists them; moderation.mjs can restrict one, which hides it from the library. A timeline
-- keeps copies of the definitions it installs (oc_timelines.plugins), so neither deleting nor
-- restricting a version changes a timeline. A manifest is at most 32 KiB.
CREATE TABLE IF NOT EXISTS oc_plugins (
  id text NOT NULL, version bigint NOT NULL CHECK(version>0),
  owner_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  manifest jsonb NOT NULL, published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(id,version), CHECK(octet_length(manifest::text)<=32768)
);
-- Counting an account's versions (the publishing limit in plugins.mjs); the cascade from
-- oc_users.
CREATE INDEX IF NOT EXISTS oc_plugins_owner ON oc_plugins(owner_id);
-- Plugin suites (#78) accounts publish: packages of plugin definitions, versioned like plugins
-- and immutable once published; a suite is at most 256 KiB.
CREATE TABLE IF NOT EXISTS oc_plugin_suites (
  id text NOT NULL, version bigint NOT NULL CHECK(version>0),
  owner_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  suite jsonb NOT NULL, published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(id,version), CHECK(octet_length(suite::text)<=262144)
);
-- Counting an account's suites (plugins.mjs); the cascade from oc_users.
CREATE INDEX IF NOT EXISTS oc_plugin_suites_owner ON oc_plugin_suites(owner_id);

-- Catalogue fields (collaboration.mjs searchTimelines, administration.mjs).
--   tags: the timeline's own tags, from its document's settings;
--   assets: copies of images that earlier releases stored with a timeline, removed by the
--   migration (releaseImageCopies in store.mjs, #109);
--   featured: set by administrators; browsing lists featured timelines first, unless labelled;
--   event_text: the catalogue's text of the timeline's duration and moment titles and notes,
--   at most 1 MiB (eventSearchText in store.mjs, oc_event_text below).
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS assets jsonb;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS event_text text NOT NULL DEFAULT '';
-- array_to_string is only STABLE, so a generated column cannot call it; on text[] its result
-- depends on nothing but its input, which this wrapper declares as IMMUTABLE.
CREATE OR REPLACE FUNCTION oc_tag_text(text[]) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT array_to_string($1,' ') $$;
-- The catalogue's full-text document ('english' stemming): title and tags weigh most, then the
-- description, then the timeline's moment and duration text. Generated, so every update of
-- those columns keeps it current; searchTimelines matches and ranks (ts_rank_cd) it.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS search_document tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english',title),'A') ||
  setweight(to_tsvector('english',coalesce(oc_tag_text(tags),'')),'A') ||
  setweight(to_tsvector('english',description),'B') ||
  setweight(to_tsvector('english',event_text),'C')
) STORED;
-- Catalogue text search: search_document @@ websearch_to_tsquery(...) in searchTimelines.
CREATE INDEX IF NOT EXISTS oc_timelines_search ON oc_timelines USING gin(search_document);
-- Catalogue tag filter: tags @> ARRAY[tag] in searchTimelines.
CREATE INDEX IF NOT EXISTS oc_timelines_tags ON oc_timelines USING gin(tags);
-- Public timelines, most recently changed first (updated_at DESC); partial: public only.
CREATE INDEX IF NOT EXISTS oc_timelines_public ON oc_timelines(updated_at DESC) WHERE visibility='public';
-- Roles were viewer and editor; editor became writer when contributor (who submits pull
-- requests instead of saving) was added. The old CHECK is dropped so editors can be renamed,
-- then the new one is added; a re-run drops and re-adds the same CHECK and renames nothing.
ALTER TABLE oc_members DROP CONSTRAINT IF EXISTS oc_members_role_check;
UPDATE oc_members SET role='writer' WHERE role='editor';
ALTER TABLE oc_members ADD CONSTRAINT oc_members_role_check CHECK(role IN ('viewer','contributor','writer'));
-- Pull requests ("proposals"; collaboration.mjs). A collaborator, or a fork's owner (from_fork,
-- added below), proposes a change for the timeline's writers to merge.
--   base_revision: the timeline's revision number the change was made against;
--   revision: the pull request's own edit counter, sent back by updates for conflict detection;
--   status: open until merged, rejected or closed; resolved_by and merged_revision record who
--   resolved it and the timeline's revision number the merge produced;
--   base_document, document: whole documents earlier versions stored, now NULL (below): the
--   base and source are saved revisions (columns added below).
CREATE TABLE IF NOT EXISTS oc_proposals (
  id uuid PRIMARY KEY, timeline_id uuid NOT NULL REFERENCES oc_timelines ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES oc_users, title text NOT NULL, body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','merged','rejected','closed')),
  base_revision bigint NOT NULL, revision bigint NOT NULL DEFAULT 1,
  base_document jsonb NOT NULL, document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES oc_users, merged_revision bigint
);
-- A timeline's pull requests, newest first (collaboration.mjs, a page at a time).
CREATE INDEX IF NOT EXISTS oc_proposals_timeline ON oc_proposals(timeline_id,created_at DESC);
-- Comments on a pull request (collaboration.mjs). The identity column orders them and is the
-- page cursor.
CREATE TABLE IF NOT EXISTS oc_proposal_comments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES oc_proposals ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES oc_users, body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- A pull request's comments a page at a time: proposal_id and id after the cursor, by id.
CREATE INDEX IF NOT EXISTS oc_proposal_comments_page ON oc_proposal_comments(proposal_id,id);

-- Existing timelines become searchable without requiring their owner to resave them.
-- (At most the first 20,000 moments read: it runs on every upgrade for a timeline whose text
-- stays empty, and saves rebuild the text properly.)
UPDATE oc_timelines t SET event_text=coalesce((
  SELECT left(string_agg(left(coalesce(m.event->'metadata'->>'title','') || ' ' || coalesce(m.event->'metadata'->>'description',''),4096),' '),1048576)
  FROM (SELECT event FROM oc_moments WHERE timeline_id=t.id LIMIT 20000) m
),'') WHERE t.event_text='' AND EXISTS (SELECT 1 FROM oc_moments m WHERE m.timeline_id=t.id);

-- Saved documents and their ancestry are separate from the current rational index.
-- oc_snapshots: whole documents, immutable (trigger below). Since history is kept as rows
-- (below), one is written only for a revision outside a timeline's numbered history whose base
-- is not kept as rows (recordRevision in store.mjs); earlier revisions keep theirs.
CREATE TABLE IF NOT EXISTS oc_snapshots (
  id uuid PRIMARY KEY, document jsonb NOT NULL
);
-- The revision graph (store.mjs, versioning.mjs, history.mjs, retention.mjs, collaboration.mjs);
-- immutable apart from forgetting its content (oc_revision_forget, below).
--   number: the revision's number in timeline_id's history; NULL for the documents of pull
--   requests from before revisions were numbered;
--   kind: what made it (baseline: a recorded current state; sync: merging upstream into a
--   fork; proposal, rebase: a pull request's source and its rebases);
--   timeline_id, author_id: no foreign keys, as revisions outlive deleted timelines and
--   accounts while others still read them, and a pull request's source uses its own ID as
--   timeline_id (its own one-revision history).
-- Its content (a snapshot, a patch or rows) is described by the columns added below.
CREATE TABLE IF NOT EXISTS oc_revisions (
  id uuid PRIMARY KEY, timeline_id uuid NOT NULL, number bigint,
  snapshot_id uuid NOT NULL REFERENCES oc_snapshots,
  author_id uuid, kind text NOT NULL CHECK(kind IN ('baseline','save','fork','duplicate','sync','merge','proposal','rebase')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(timeline_id,number)
);
-- A revision's parents in order: position 0 is the first parent (the revision a patch applies
-- to, or the previous head), position 1 the other side of a merge. Recursive queries walk it
-- for common ancestors (versioning.mjs) and for the revisions others still read (store.mjs).
CREATE TABLE IF NOT EXISTS oc_revision_parents (
  revision_id uuid NOT NULL REFERENCES oc_revisions, parent_id uuid NOT NULL REFERENCES oc_revisions,
  position integer NOT NULL CHECK(position IN (0,1)), PRIMARY KEY(revision_id,position),
  UNIQUE(revision_id,parent_id), CHECK(revision_id<>parent_id)
);
-- A revision's children: retention.mjs keeps a revision another timeline's revision descends
-- from, and deletes the links of pruned revisions.
CREATE INDEX IF NOT EXISTS oc_revision_parent_lookup ON oc_revision_parents(parent_id);
-- Lineage. head_revision_id: the latest saved revision; upstream_id: the timeline a fork was
-- made from (NULL for duplicates, and once upstream is deleted); fork_base_revision_id: the
-- upstream revision it was made from; allow_private_forks: invited readers of a private
-- timeline may copy it; publication_restricted: a copy of a private or restricted timeline,
-- which can never be made public.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS head_revision_id uuid REFERENCES oc_revisions;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS upstream_id uuid REFERENCES oc_timelines ON DELETE SET NULL;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS fork_base_revision_id uuid REFERENCES oc_revisions;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS allow_private_forks boolean NOT NULL DEFAULT false;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS publication_restricted boolean NOT NULL DEFAULT false;
-- Pull requests refer to saved revisions: base_revision_id (the state it was made against),
-- source_revision_id (the proposed state), merged_revision_id (the merge it produced);
-- source_timeline_id: the fork it came from, when from_fork.
ALTER TABLE oc_proposals ADD COLUMN IF NOT EXISTS base_revision_id uuid REFERENCES oc_revisions;
ALTER TABLE oc_proposals ADD COLUMN IF NOT EXISTS source_timeline_id uuid REFERENCES oc_timelines ON DELETE SET NULL;
ALTER TABLE oc_proposals ADD COLUMN IF NOT EXISTS source_revision_id uuid REFERENCES oc_revisions;
ALTER TABLE oc_proposals ADD COLUMN IF NOT EXISTS merged_revision_id uuid REFERENCES oc_revisions;
ALTER TABLE oc_proposals ADD COLUMN IF NOT EXISTS from_fork boolean NOT NULL DEFAULT false;

-- Recover the current saved state of older installations, without inventing lost history:
-- each timeline without a head gets a 'baseline' revision, numbered as its current revision,
-- whose snapshot is a document rebuilt from its index (through oc_events) and settings. The
-- timeline's own ID is reused as the snapshot's and the revision's, so the three statements
-- are re-run safely (ON CONFLICT DO NOTHING, head_revision_id IS NULL).
INSERT INTO oc_snapshots(id,document)
SELECT t.id,jsonb_build_object('format','openchronology','version',1,'title',t.title,'description',t.description,
  'events',coalesce((SELECT jsonb_agg(e.event) FROM oc_events(t.id,NULL,NULL,NULL,NULL,200001) AS e(event)),'[]'::jsonb))
  || CASE WHEN t.presentation IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('presentation',t.presentation) END
  || CASE WHEN t.plugins IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('plugins',t.plugins) END
  || CASE WHEN t.tags IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('tags',t.tags) END
  || CASE WHEN t.assets IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('assets',t.assets) END
FROM oc_timelines t WHERE t.head_revision_id IS NULL ON CONFLICT DO NOTHING;
INSERT INTO oc_revisions(id,timeline_id,number,snapshot_id,author_id,kind)
SELECT id,id,revision,id,owner_id,'baseline' FROM oc_timelines WHERE head_revision_id IS NULL ON CONFLICT DO NOTHING;
UPDATE oc_timelines SET head_revision_id=id WHERE head_revision_id IS NULL;

-- Older open/closed reviews already retained their documents; give those
-- documents immutable IDs too. Their lost ancestry cannot be reconstructed.
-- IDs are derived from the pull request's ID (an md5 of a prefix and the ID, as a UUID), so a
-- re-run computes the same ones and ON CONFLICT skips them. The source revision's parent is
-- the base. Only pull requests still missing a base or source revision are touched.
INSERT INTO oc_snapshots(id,document)
SELECT md5('oc-proposal-base:'||id::text)::uuid,base_document FROM oc_proposals WHERE base_revision_id IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO oc_snapshots(id,document)
SELECT md5('oc-proposal-source:'||id::text)::uuid,document FROM oc_proposals WHERE source_revision_id IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO oc_revisions(id,timeline_id,snapshot_id,kind)
SELECT md5('oc-proposal-base:'||id::text)::uuid,timeline_id,md5('oc-proposal-base:'||id::text)::uuid,'baseline'
FROM oc_proposals WHERE base_revision_id IS NULL ON CONFLICT DO NOTHING;
INSERT INTO oc_revisions(id,timeline_id,snapshot_id,author_id,kind)
SELECT md5('oc-proposal-source:'||id::text)::uuid,timeline_id,md5('oc-proposal-source:'||id::text)::uuid,author_id,'proposal'
FROM oc_proposals WHERE source_revision_id IS NULL ON CONFLICT DO NOTHING;
INSERT INTO oc_revision_parents(revision_id,parent_id,position)
SELECT md5('oc-proposal-source:'||id::text)::uuid,coalesce(base_revision_id,md5('oc-proposal-base:'||id::text)::uuid),0
FROM oc_proposals WHERE source_revision_id IS NULL ON CONFLICT DO NOTHING;
UPDATE oc_proposals SET base_revision_id=coalesce(base_revision_id,md5('oc-proposal-base:'||id::text)::uuid),
  source_revision_id=coalesce(source_revision_id,md5('oc-proposal-source:'||id::text)::uuid)
WHERE base_revision_id IS NULL OR source_revision_id IS NULL;

-- Trigger function: refuses every UPDATE of the rows it guards (saved history is immutable);
-- deletion (retention, account deletion) stays possible. oc_revisions switches to
-- oc_revision_forget further down, which allows one change.
CREATE OR REPLACE FUNCTION oc_immutable_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Saved history is immutable'; END $$;
DROP TRIGGER IF EXISTS oc_revision_immutable ON oc_revisions;
CREATE TRIGGER oc_revision_immutable BEFORE UPDATE ON oc_revisions FOR EACH ROW EXECUTE FUNCTION oc_immutable_revision();
DROP TRIGGER IF EXISTS oc_snapshot_immutable ON oc_snapshots;
CREATE TRIGGER oc_snapshot_immutable BEFORE UPDATE ON oc_snapshots FOR EACH ROW EXECUTE FUNCTION oc_immutable_revision();
DROP TRIGGER IF EXISTS oc_parent_immutable ON oc_revision_parents;
CREATE TRIGGER oc_parent_immutable BEFORE UPDATE ON oc_revision_parents FOR EACH ROW EXECUTE FUNCTION oc_immutable_revision();

-- Verified contact, bounded primary-authentication challenges and application-level MFA
-- (account-security.mjs).
--   email: NULL for accounts without one; email_verified_at: required before a session or
--   API key works;
--   mfa_secret: the TOTP secret, sealed with the server's key; mfa_enabled; mfa_last_step: the
--   last TOTP time step accepted, so a code cannot be used twice;
--   oc_sessions.mfa_verified: the session passed the second factor.
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
-- One account per address, compared case-insensitively; also how registration checks it.
CREATE UNIQUE INDEX IF NOT EXISTS oc_users_email ON oc_users(lower(email)) WHERE email IS NOT NULL;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS mfa_secret text;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS mfa_last_step bigint NOT NULL DEFAULT -1;
ALTER TABLE oc_sessions ADD COLUMN IF NOT EXISTS mfa_verified boolean NOT NULL DEFAULT false;
-- Pending sign-ups (account-security.mjs register and verify). No account exists until the
-- emailed link is opened in the browser that registered (browser_hash); then the row becomes
-- an oc_users row with the reserved id. token_hash: SHA-256 of the link's token;
-- password_hash: already hashed. 24 hours.
CREATE TABLE IF NOT EXISTS oc_registrations (
  token_hash text PRIMARY KEY, id uuid NOT NULL, username text NOT NULL, email text NOT NULL,
  password_hash text NOT NULL, browser_hash text NOT NULL, expires_at timestamptz NOT NULL
);
-- Expired-row sweep (account-security.mjs; flushMail in mail.mjs), as for the next three.
CREATE INDEX IF NOT EXISTS oc_registrations_expiry ON oc_registrations(expires_at);
-- A sign-in waiting on its second step (account-security.mjs begin and pending): 'mfa' for an
-- authenticator or recovery code, 'email' for an account yet to confirm its address. Bound
-- to the browser (browser_hash), with the session kind to issue and where to go after; at
-- most 5 attempts; 5 minutes.
CREATE TABLE IF NOT EXISTS oc_auth_challenges (
  token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  browser_hash text NOT NULL,purpose text NOT NULL CHECK(purpose IN ('mfa','email')),
  kind text NOT NULL CHECK(kind IN ('web','desktop')),return_to text NOT NULL DEFAULT '/',
  attempts integer NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oc_auth_challenges_expiry ON oc_auth_challenges(expires_at);
-- Emailed links (account-security.mjs). purpose: 'verify' confirms an address (24 hours),
-- 'reset' resets a password (30 minutes), 'change' confirms a new address (24 hours;
-- old_email is the address it replaces). token_hash: SHA-256 of the link's token;
-- browser_hash: the browser that must open it (NULL for resets).
CREATE TABLE IF NOT EXISTS oc_email_tokens (
  token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  purpose text NOT NULL CHECK(purpose IN ('verify','reset','change')),email text NOT NULL,
  browser_hash text,old_email text,expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oc_email_tokens_expiry ON oc_email_tokens(expires_at);
-- Two-factor set-up in progress, one per account: the new secret (sealed) until a code from
-- it is confirmed by the same session (session_hash), within 10 minutes.
CREATE TABLE IF NOT EXISTS oc_mfa_setups (
  user_id uuid PRIMARY KEY REFERENCES oc_users ON DELETE CASCADE,session_hash text NOT NULL,
  secret text NOT NULL,expires_at timestamptz NOT NULL
);
-- Two-factor recovery codes, SHA-256 hashed; each is deleted when used.
CREATE TABLE IF NOT EXISTS oc_recovery_codes (
  user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,code_hash text NOT NULL,
  PRIMARY KEY(user_id,code_hash)
);
-- Outgoing mail (mail.mjs queueMail and flushMail). Queued in the transaction that needs it,
-- so a message goes out only if that transaction commits. payload: the message, sealed with
-- the server's key (it holds sign-in links); failed sends are retried with backoff (attempts,
-- next_attempt_at, at most an hour apart); undelivered mail is dropped after 24 hours.
CREATE TABLE IF NOT EXISTS oc_mail_outbox (
  id uuid PRIMARY KEY,payload text NOT NULL,attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
-- Due mail: next_attempt_at<=now() in flushMail, which takes one row at a time FOR UPDATE SKIP
-- LOCKED, so several server processes never send one message twice.
CREATE INDEX IF NOT EXISTS oc_mail_outbox_pending ON oc_mail_outbox(next_attempt_at);

-- Whether the browser session that approved a desktop sign-in passed two-factor
-- authentication: the desktop session inherits it.
ALTER TABLE oc_device_logins ADD COLUMN IF NOT EXISTS mfa_verified boolean NOT NULL DEFAULT false;

-- Transactional, cross-process live invalidation. No timeline contents are broadcast.
-- Each change to a timeline row (or to its memberships, below) notifies the channel
-- oc_timeline_changes with the timeline's ID; live.mjs LISTENs on one connection per process
-- and tells the timeline's subscribers to refresh. Notifications are delivered at commit
-- (never for a rolled-back change), and identical ones in one transaction arrive once.
CREATE OR REPLACE FUNCTION oc_notify_timeline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('oc_timeline_changes', COALESCE(NEW.id,OLD.id)::text);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS oc_timelines_live ON oc_timelines;
CREATE TRIGGER oc_timelines_live AFTER INSERT OR UPDATE OR DELETE ON oc_timelines
FOR EACH ROW EXECUTE FUNCTION oc_notify_timeline();
-- Membership changes notify too: they change who may read the timeline.
CREATE OR REPLACE FUNCTION oc_notify_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('oc_timeline_changes', COALESCE(NEW.timeline_id,OLD.timeline_id)::text);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS oc_members_live ON oc_members;
CREATE TRIGGER oc_members_live AFTER INSERT OR UPDATE OR DELETE ON oc_members
FOR EACH ROW EXECUTE FUNCTION oc_notify_membership();

-- Operator seed enrichments run once, preserving later deliberate plugin removals: seed.mjs
-- inserts (timeline, update_key) before applying an update, and ON CONFLICT DO NOTHING
-- RETURNING tells it whether the update already ran.
CREATE TABLE IF NOT EXISTS oc_seed_updates (
  timeline_id uuid NOT NULL REFERENCES oc_timelines ON DELETE CASCADE,
  update_key text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(timeline_id, update_key)
);

-- Size admission for complete browser copies, measured before serving a document:
-- browser-forks.mjs refuses a copy over 4 MiB from this size, without reading the document.
ALTER TABLE oc_snapshots ADD COLUMN IF NOT EXISTS document_bytes bigint CHECK(document_bytes>=0);
-- One-time operator migration: JSONB text size is a conservative upper bound on
-- compact exported JSON. Requests never perform this measurement themselves.
-- This metadata-only backfill runs under the migration transaction/table lock;
-- restore the snapshot guard before commit. The saved documents remain unchanged.
ALTER TABLE oc_snapshots DISABLE TRIGGER oc_snapshot_immutable;
UPDATE oc_snapshots SET document_bytes=octet_length(document::text) WHERE document_bytes IS NULL;
ALTER TABLE oc_snapshots ENABLE TRIGGER oc_snapshot_immutable;

-- Saved comparisons are live references, not materialized event indexes: comparison names the
-- timelines a comparison shows, and its moments are read from them.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS comparison jsonb;

-- Installation administration, account profiles and scoped automation credentials.
--   is_admin; is_disabled: suspended (no session or API key works); avatar_url: a link to the
--   profile image; quota_bypass: exempt from quotas (bootstrap and seed accounts);
--   quota_bytes: the account's own quota (NULL: the site default); used_bytes: what the
--   account is charged, kept by oc_storage_charge from the storage ledger below.
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS avatar_url text NOT NULL DEFAULT '';
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS quota_bypass boolean NOT NULL DEFAULT false;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS quota_bytes bigint CHECK(quota_bytes>=0);
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS used_bytes bigint NOT NULL DEFAULT 0 CHECK(used_bytes>=0);
-- Installation-wide settings: exactly one row (singleton is always true).
--   default_quota_bytes: the quota of accounts without their own: 100 MiB until /admin
--   changes it, or DEFAULT_USER_STORAGE_BYTES when the environment sets it (applied at every
--   start, administration.mjs applyEnvironmentQuota);
--   initialized: the first bootstrap ran (administration.mjs bootstrapInstallation);
--   bootstrap_admin_id: the administrator ADMIN_INITIAL_PASSWORD created;
--   enforce_quotas: false only while this migration backfills the storage ledger (below).
CREATE TABLE IF NOT EXISTS oc_site_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  default_quota_bytes bigint NOT NULL DEFAULT 104857600 CHECK(default_quota_bytes>=0),
  initialized boolean NOT NULL DEFAULT false, bootstrap_admin_id uuid REFERENCES oc_users,
  enforce_quotas boolean NOT NULL DEFAULT false
);
-- The one row, inserted once.
INSERT INTO oc_site_settings(singleton) VALUES(true) ON CONFLICT DO NOTHING;
-- API keys for automation (api-keys.mjs). token_hash: SHA-256 of the key, which is sent as a
-- bearer token och_key_<id>_<secret>; prefix: och_key_ and the start of the id, shown so a
-- person can tell keys apart; scopes: a non-empty subset of timelines:read and
-- timelines:write. A key works until expires_at unless revoked (revoked_at); last_used_at is
-- refreshed at most every 5 minutes.
CREATE TABLE IF NOT EXISTS oc_api_keys (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  name text NOT NULL, prefix text NOT NULL, token_hash text UNIQUE NOT NULL,
  scopes text[] NOT NULL CHECK(scopes<@ARRAY['timelines:read','timelines:write']::text[] AND cardinality(scopes)>0),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  last_used_at timestamptz, revoked_at timestamptz
);
-- An account's keys: listing, counting (the per-account limit) and revoking them all.
CREATE INDEX IF NOT EXISTS oc_api_keys_user ON oc_api_keys(user_id);
-- Append-only record of administrator and moderator actions (administration.mjs,
-- moderation.mjs, reset-admin-password.mjs): who, which action, on what, and the changes. The
-- server never reads it back; actor_id has no foreign key, so entries outlive accounts.
CREATE TABLE IF NOT EXISTS oc_admin_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid NOT NULL,
  action text NOT NULL, target_id text, changes jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- The storage ledger: one row for each stored thing an account is charged for, keyed by kind
-- (the table it is in) and entry_id (its ID there; "id/version" for plugins and suites). The
-- track triggers below keep it in step with those tables, and oc_storage_charge keeps
-- oc_users.used_bytes equal to each account's sum. store.mjs reads it for history charges.
CREATE TABLE IF NOT EXISTS oc_storage_entries (
  kind text NOT NULL, entry_id text NOT NULL, user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  bytes bigint NOT NULL CHECK(bytes>=0), PRIMARY KEY(kind,entry_id)
);
-- The account foreign key, dropped and added again on every run, so that it is this one (ON
-- DELETE CASCADE) whatever an earlier installation had; the result is the same each time.
ALTER TABLE oc_storage_entries DROP CONSTRAINT IF EXISTS oc_storage_entries_user_id_fkey;
ALTER TABLE oc_storage_entries ADD CONSTRAINT oc_storage_entries_user_id_fkey FOREIGN KEY(user_id) REFERENCES oc_users ON DELETE CASCADE;
-- An account's entries: reconciling used_bytes (below) and the cascade from oc_users.
CREATE INDEX IF NOT EXISTS oc_storage_user ON oc_storage_entries(user_id);
-- storage_bytes: an estimate of the timeline's current document as JSON, charged to its owner
-- (oc_track_storage). Older timelines take their head snapshot's size, once (only rows still
-- at 0 are set).
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS storage_bytes bigint NOT NULL DEFAULT 0;
UPDATE oc_timelines t SET storage_bytes=s.document_bytes FROM oc_revisions r JOIN oc_snapshots s ON s.id=r.snapshot_id WHERE t.head_revision_id=r.id AND t.storage_bytes=0;
-- Existing data is counted without deleting it when the new default is smaller: quota checks
-- are off while the ledger is backfilled below, so an account already over its quota is
-- charged in full instead of failing the migration; they are switched on again once the
-- counters are reconciled.
UPDATE oc_site_settings SET enforce_quotas=false;
-- Trigger function on the ledger: applies each row's change in bytes to its account's
-- used_bytes (never below 0) and refuses growth past the account's quota (its own, else the
-- site default) when quotas are enforced, unless the account is exempt or an administrator.
-- The refusal (SQLSTATE P0001, "Account storage limit exceeded...") fails the statement that
-- caused it, and so its transaction; store.mjs and http.mjs answer it with HTTP 413. An
-- entry's account never changes. The UPDATE locks the account's row until the transaction
-- ends, so charges to one account are serialized.
CREATE OR REPLACE FUNCTION oc_storage_charge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE delta bigint; uid uuid; u record; settings record;
BEGIN
  -- The account charged, and how many bytes this row operation adds (negative: frees).
  uid:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  IF TG_OP='UPDATE' AND NEW.user_id<>OLD.user_id THEN RAISE EXCEPTION 'Storage entries cannot change owner'; END IF;
  delta:=CASE WHEN TG_OP='DELETE' THEN -OLD.bytes WHEN TG_OP='INSERT' THEN NEW.bytes ELSE NEW.bytes-OLD.bytes END;
  -- Charge it, then check the new total against the quota.
  UPDATE oc_users SET used_bytes=greatest(0,used_bytes+delta) WHERE id=uid RETURNING * INTO u;
  SELECT * INTO settings FROM oc_site_settings WHERE singleton;
  IF delta>0 AND settings.enforce_quotas AND NOT u.quota_bypass AND NOT u.is_admin AND u.used_bytes>coalesce(u.quota_bytes,settings.default_quota_bytes) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='Account storage limit exceeded. Delete data or ask the administrator for a larger quota.';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
-- Every change to the ledger is charged, row by row.
DROP TRIGGER IF EXISTS oc_storage_charge ON oc_storage_entries;
CREATE TRIGGER oc_storage_charge AFTER INSERT OR UPDATE OR DELETE ON oc_storage_entries FOR EACH ROW EXECUTE FUNCTION oc_storage_charge();
-- Trigger function keeping one ledger entry per stored row, for the tables it is attached to
-- below (kind: the table's name; entry_id: the row's ID). A deleted row's entry goes;
-- otherwise the entry is upserted with the row's size and the account charged:
--   oc_timelines: storage_bytes, charged to the owner;
--   oc_revisions: what it keeps (stored_bytes for rows, the patch's size, its snapshot's size,
--   or nothing without content), charged to its author for pull request sources and rebases,
--   else to the timeline's owner (or the author once the timeline is gone);
--   oc_proposals: stored documents, body and title; oc_proposal_comments: the body.
-- Its oc_plugins branch is unused: plugins (and suites) have their own functions below,
-- whose ledger key is "id/version". Rows without an account to charge get no entry.
CREATE OR REPLACE FUNCTION oc_track_storage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid uuid; n bigint; key text; v_kind text:=TG_TABLE_NAME;
BEGIN
  -- The ledger key: the table's name and the row's ID.
  key:=CASE WHEN TG_OP='DELETE' THEN OLD.id::text ELSE NEW.id::text END;
  IF TG_OP='DELETE' THEN DELETE FROM oc_storage_entries WHERE entry_id=key AND oc_storage_entries.kind=v_kind; RETURN OLD; END IF;
  -- The account and size, by table.
  IF TG_TABLE_NAME='oc_timelines' THEN uid:=NEW.owner_id; n:=NEW.storage_bytes;
  ELSIF TG_TABLE_NAME='oc_revisions' THEN
    SELECT owner_id INTO uid FROM oc_timelines WHERE id=NEW.timeline_id;
    -- Pull request sources and rebases are their author's; other revisions are charged to
    -- the timeline's owner, or the author once the timeline is gone.
    uid:=CASE WHEN NEW.kind IN ('proposal','rebase') THEN NEW.author_id ELSE coalesce(uid,NEW.author_id) END;
    -- What the revision keeps: versions as rows, a patch, a snapshot, or nothing (NULL: 0).
    IF NEW.history_rows THEN n:=NEW.stored_bytes;
    ELSIF NEW.snapshot_id IS NULL THEN n:=octet_length(NEW.patch::text);
    ELSE SELECT document_bytes INTO n FROM oc_snapshots WHERE id=NEW.snapshot_id; END IF;
  ELSIF TG_TABLE_NAME='oc_proposals' THEN uid:=NEW.author_id; n:=coalesce(octet_length(NEW.document::text),0)+coalesce(octet_length(NEW.base_document::text),0)+octet_length(NEW.body)+octet_length(NEW.title);
  ELSIF TG_TABLE_NAME='oc_proposal_comments' THEN uid:=NEW.author_id; n:=octet_length(NEW.body);
  ELSIF TG_TABLE_NAME='oc_plugins' THEN uid:=NEW.owner_id; n:=octet_length(NEW.manifest::text); key:=NEW.id||'/'||NEW.version;
  END IF;
  -- An update (a timeline's new size, a revision forgetting its content) replaces the size.
  IF uid IS NOT NULL THEN INSERT INTO oc_storage_entries(kind,entry_id,user_id,bytes) VALUES(v_kind,key,uid,coalesce(n,0)) ON CONFLICT(kind,entry_id) DO UPDATE SET bytes=excluded.bytes; END IF;
  RETURN NEW;
END $$;
-- Versioned plugin deletions need the same compound identity as insertions: a plugin's ledger
-- key is "id/version", which oc_track_storage's delete branch (by ID alone) cannot build.
CREATE OR REPLACE FUNCTION oc_track_plugin_storage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN DELETE FROM oc_storage_entries WHERE kind='oc_plugins' AND entry_id=OLD.id||'/'||OLD.version; RETURN OLD; END IF;
  INSERT INTO oc_storage_entries(kind,entry_id,user_id,bytes) VALUES('oc_plugins',NEW.id||'/'||NEW.version,NEW.owner_id,octet_length(NEW.manifest::text)) ON CONFLICT(kind,entry_id) DO UPDATE SET bytes=excluded.bytes;
  RETURN NEW;
END $$;
-- Published suites count toward their account's storage, like published plugins.
CREATE OR REPLACE FUNCTION oc_track_suite_storage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN DELETE FROM oc_storage_entries WHERE kind='oc_plugin_suites' AND entry_id=OLD.id||'/'||OLD.version; RETURN OLD; END IF;
  INSERT INTO oc_storage_entries(kind,entry_id,user_id,bytes) VALUES('oc_plugin_suites',NEW.id||'/'||NEW.version,NEW.owner_id,octet_length(NEW.suite::text)) ON CONFLICT(kind,entry_id) DO UPDATE SET bytes=excluded.bytes;
  RETURN NEW;
END $$;
-- Attach the track functions: oc_timelines only when storage_bytes changes (saves update the
-- row often for other reasons), oc_proposals when its stored text changes. The oc_revisions
-- trigger is replaced further down so forgetting content refunds it (#136).
DROP TRIGGER IF EXISTS oc_track_storage ON oc_timelines;
CREATE TRIGGER oc_track_storage AFTER INSERT OR UPDATE OF storage_bytes OR DELETE ON oc_timelines FOR EACH ROW EXECUTE FUNCTION oc_track_storage();
DROP TRIGGER IF EXISTS oc_track_storage ON oc_revisions;
CREATE TRIGGER oc_track_storage AFTER INSERT OR DELETE ON oc_revisions FOR EACH ROW EXECUTE FUNCTION oc_track_storage();
DROP TRIGGER IF EXISTS oc_track_storage ON oc_proposals;
CREATE TRIGGER oc_track_storage AFTER INSERT OR UPDATE OF document,base_document,body,title OR DELETE ON oc_proposals FOR EACH ROW EXECUTE FUNCTION oc_track_storage();
DROP TRIGGER IF EXISTS oc_track_storage ON oc_proposal_comments;
CREATE TRIGGER oc_track_storage AFTER INSERT OR DELETE ON oc_proposal_comments FOR EACH ROW EXECUTE FUNCTION oc_track_storage();
DROP TRIGGER IF EXISTS oc_track_storage ON oc_plugins;
CREATE TRIGGER oc_track_storage AFTER INSERT OR DELETE ON oc_plugins FOR EACH ROW EXECUTE FUNCTION oc_track_plugin_storage();
DROP TRIGGER IF EXISTS oc_track_storage ON oc_plugin_suites;
CREATE TRIGGER oc_track_storage AFTER INSERT OR DELETE ON oc_plugin_suites FOR EACH ROW EXECUTE FUNCTION oc_track_suite_storage();
-- Backfill the ledger for rows stored before it existed. Each statement skips entries already
-- there, except timelines, whose size is refreshed. Revisions are charged their snapshot's
-- size (all had snapshots then); those whose account is gone are skipped, since the foreign
-- key would refuse them.
INSERT INTO oc_storage_entries SELECT 'oc_timelines',id::text,owner_id,storage_bytes FROM oc_timelines ON CONFLICT(kind,entry_id) DO UPDATE SET bytes=excluded.bytes;
INSERT INTO oc_storage_entries SELECT 'oc_revisions',r.id::text,CASE WHEN r.kind IN ('proposal','rebase') THEN r.author_id ELSE coalesce(t.owner_id,r.author_id) END,s.document_bytes FROM oc_revisions r JOIN oc_snapshots s ON s.id=r.snapshot_id LEFT JOIN oc_timelines t ON t.id=r.timeline_id WHERE (CASE WHEN r.kind IN ('proposal','rebase') THEN r.author_id ELSE coalesce(t.owner_id,r.author_id) END) IN(SELECT id FROM oc_users) ON CONFLICT(kind,entry_id) DO NOTHING;
INSERT INTO oc_storage_entries SELECT 'oc_proposals',id::text,author_id,coalesce(octet_length(document::text),0)+coalesce(octet_length(base_document::text),0)+octet_length(body)+octet_length(title) FROM oc_proposals ON CONFLICT(kind,entry_id) DO NOTHING;
INSERT INTO oc_storage_entries SELECT 'oc_proposal_comments',id::text,author_id,octet_length(body) FROM oc_proposal_comments ON CONFLICT(kind,entry_id) DO NOTHING;
INSERT INTO oc_storage_entries SELECT 'oc_plugins',id||'/'||version,owner_id,octet_length(manifest::text) FROM oc_plugins ON CONFLICT(kind,entry_id) DO NOTHING;
-- AFTER triggers charge only the committed insert/update branch of an upsert.
-- Reconcile counters from the ledger during each transactional migration: used_bytes becomes
-- each account's sum, repairing any drift, and quotas are enforced again.
UPDATE oc_users u SET used_bytes=coalesce((SELECT sum(bytes) FROM oc_storage_entries WHERE user_id=u.id),0);
UPDATE oc_site_settings SET enforce_quotas=true;

-- Stars belong to users; counts survive repeated requests and cascade deletions.
-- created_at is backfilled from updated_at for older timelines, then defaulted and required
-- (each step a no-op once done). star_count: kept by oc_star_count, so neither listings nor
-- sorting by stars count rows.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE oc_timelines SET created_at=updated_at WHERE created_at IS NULL;
ALTER TABLE oc_timelines ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE oc_timelines ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS star_count bigint NOT NULL DEFAULT 0 CHECK(star_count>=0);
-- One star per account and timeline (stars.mjs inserts with ON CONFLICT DO NOTHING, so a
-- repeated request changes nothing). Read by searchTimelines and by standing.mjs (popularity).
CREATE TABLE IF NOT EXISTS oc_timeline_stars (
  user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  timeline_id uuid NOT NULL REFERENCES oc_timelines ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,timeline_id)
);
-- A timeline's stars: popularity in standing.mjs and the cascade when a timeline is deleted
-- (the primary key serves an account's stars).
CREATE INDEX IF NOT EXISTS oc_timeline_stars_timeline ON oc_timeline_stars(timeline_id);
-- A timeline's forks: endorsements in standing.mjs and the ON DELETE SET NULL of upstream_id
-- when it is deleted. Partial: most timelines are no fork.
CREATE INDEX IF NOT EXISTS oc_timelines_upstream ON oc_timelines(upstream_id) WHERE upstream_id IS NOT NULL;
-- Trigger function: adds or removes one from the starred timeline's star_count, in the same
-- transaction as the star (the UPDATE locks the timeline's row until then).
CREATE OR REPLACE FUNCTION oc_star_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE oc_timelines SET star_count=star_count+1 WHERE id=NEW.timeline_id;
    RETURN NEW;
  ELSE
    UPDATE oc_timelines SET star_count=star_count-1 WHERE id=OLD.timeline_id;
    RETURN OLD;
  END IF;
END $$;
DROP TRIGGER IF EXISTS oc_star_count ON oc_timeline_stars;
CREATE TRIGGER oc_star_count AFTER INSERT OR DELETE ON oc_timeline_stars
FOR EACH ROW EXECUTE FUNCTION oc_star_count();

-- Detect added root moments independently from edits and deletions: each save that adds a
-- moment advances event_generation, so a viewer following the newest moments (follow in
-- src/app.ts) can tell an addition from other changes.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS event_generation bigint NOT NULL DEFAULT 0;
-- Traverse only the newest/oldest few distinct coordinates, without loading their metadata:
-- the 8 latest distinct moment times ("n/d"), newest first, or with `oldest` the 8 earliest,
-- oldest first. An in-order walk from the tree's end: the tree's height plus 8 nodes, each
-- read by key. For store.mjs recent (going to the first or last moments). Forks are handed to
-- oc_recent_times_lineage (generated below). Raises on a node the tree names but lacks.
CREATE OR REPLACE FUNCTION oc_recent_times(tid uuid, oldest boolean DEFAULT false)
RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE stack bigint[]:=ARRAY[]::bigint[]; nid bigint; n record; emitted integer:=0;
BEGIN
  -- An iterative in-order walk with an explicit stack, mirrored for the newest end.
  SELECT root INTO nid FROM oc_timelines WHERE id=tid;
  WHILE nid IS NOT NULL OR cardinality(stack)>0 LOOP
    -- Descend to the near end of the current subtree, stacking the path.
    WHILE nid IS NOT NULL LOOP
      stack:=array_append(stack,nid);
      SELECT node.left_id,node.right_id INTO n FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=nid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Broken timeline index'; END IF;
      nid:=CASE WHEN oldest THEN n.left_id ELSE n.right_id END;
    END LOOP;
    -- Pop the next node in order (read again, now for its time) and emit its time.
    nid:=stack[cardinality(stack)]; stack:=stack[1:cardinality(stack)-1];
    SELECT node.time,node.left_id,node.right_id INTO n FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=nid;
    RETURN NEXT oc_qtext(n.time); emitted:=emitted+1;
    IF emitted=8 THEN RETURN; END IF;
    -- Continue into its other subtree, which holds the next times this way.
    nid:=CASE WHEN oldest THEN n.right_id ELSE n.left_id END;
  END LOOP;
END $$;

-- Exact interval tree over standalone durations. Each row also holds its duration's full
-- definition; a NULL definition marks a legacy link row awaiting conversion by migrate.mjs.
-- One node per duration (avl.mjs INTERVAL_TREE; written by store.mjs and incremental.mjs;
-- read by the walks below, history.mjs, merge.mjs, retention.mjs). The timeline row names the
-- root (duration_root, below). first_time, last_time: the duration's own start and end;
-- min_time: its subtree's earliest start; max_time: its subtree's latest end; band: what
-- overviews draw (its ID, times and the overview projection of its metadata).
CREATE TABLE IF NOT EXISTS oc_duration_nodes (
  timeline_id uuid NOT NULL REFERENCES oc_timelines(id) ON DELETE CASCADE,
  id integer NOT NULL, left_id integer, right_id integer,
  min_time mpq NOT NULL, max_time mpq NOT NULL,
  first_time mpq NOT NULL, last_time mpq NOT NULL, band jsonb NOT NULL,
  PRIMARY KEY(timeline_id,id)
);
-- definition: the duration as the document has it ({id, start, end, metadata}; its start and
-- end may be anchored to moments), the source of saves, exports and history.
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS definition jsonb;
-- Subtree summaries for collapsing short durations: largest start, entry count and extent
-- bounds. NULL marks rows built before these columns; migrate.mjs rebuilds them.
-- max_first: the subtree's latest start; subtree_count: its durations; min_extent,
-- max_extent: the shortest and longest of them (end minus start).
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS max_first mpq;
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS subtree_count integer;
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS min_extent mpq;
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS max_extent mpq;
-- Interval trees are AVL trees ordered by (first_time, ID in "C" order) with stable IDs;
-- the timeline row names each root. Static builds numbered the root 1.
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS duration_root integer;
-- A static tree's root was node 1: name it for timelines without a root whose node 1 exists
-- (a re-run finds none).
UPDATE oc_timelines t SET duration_root=1 WHERE duration_root IS NULL
  AND EXISTS(SELECT 1 FROM oc_duration_nodes n WHERE n.timeline_id=t.id AND n.id=1);
-- Durations anchored to a moment move with it: when a save moves or deletes a moment,
-- incremental.mjs and merge.mjs find the durations whose start or end names it.
CREATE INDEX IF NOT EXISTS oc_duration_nodes_start_moment ON oc_duration_nodes(timeline_id,(definition->'start'->>'moment'));
CREATE INDEX IF NOT EXISTS oc_duration_nodes_end_moment ON oc_duration_nodes(timeline_id,(definition->'end'->>'moment'));

-- Sort keys for exact rationals, small enough for B-trees: ±((2^40 + e)·10^30 + m), where
-- e is the decimal exponent and m the leading 30 significant digits, truncated. Truncation
-- never reverses the order of two values, and unlike a float8 the key never saturates: values
-- beyond float8's range (or below it) keep distinct keys and 30 digits of relative precision.
-- Text lengths bound the exponent to within one; one exact comparison settles it.
-- 2^40 + e stays positive short of values with about a trillion digits, so keys of positive
-- values exceed 0 and order by exponent first, then digits; negative values mirror them.
-- Equal keys do not mean equal values, so every range scan rechecks rows exactly.
-- IMMUTABLE, so generated columns (first_key, below) can store it.
CREATE OR REPLACE FUNCTION oc_qkey(q mpq) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
DECLARE n mpz := abs(num(q)); d mpz := den(q); e integer; m mpz;
BEGIN
  -- Zero is key 0, between the negative and positive keys.
  IF n=0 THEN RETURN 0; END IF;
  -- e: floor(log10(n/d)), estimated from digit counts, then lowered by one when n/d < 10^e.
  e:=length(n::text)-length(d::text);
  IF e>=0 THEN
    IF n<d*('1'||repeat('0',e))::mpz THEN e:=e-1; END IF;
  ELSIF n*('1'||repeat('0',-e))::mpz<d THEN e:=e-1;
  END IF;
  -- m: n/d scaled by 10^(29-e) and truncated, which has exactly 30 digits.
  m:=CASE WHEN e<=29 THEN n*('1'||repeat('0',29-e))::mpz/d ELSE n/(d*('1'||repeat('0',e-29))::mpz) END;
  RETURN sgn(num(q))*((1099511627776+e)*1e30+m::text::numeric);
END $$;

-- Starts keyed for range scans (see oc_qkey): a range of keys holds every start in the exact
-- range, and exact mpq comparisons recheck each row. Only this small key enters the B-tree;
-- arbitrarily large mpq values stay payloads. Earlier versions keyed a float8, which
-- saturates: every start beyond ±1.8e308 shared one key and each summary scanned them all.
DROP INDEX IF EXISTS oc_duration_nodes_first_approx;
ALTER TABLE oc_duration_nodes DROP COLUMN IF EXISTS first_approx;
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS first_key numeric
  GENERATED ALWAYS AS (oc_qkey(first_time)) STORED;
-- Starts in order: oc_duration_overview's range scans, oc_event_text and document streams
-- (durations in start order, store.mjs), and retention.mjs's expiry.
CREATE INDEX IF NOT EXISTS oc_duration_nodes_first_key ON oc_duration_nodes(timeline_id,first_key);

-- Anchored-span summaries of durations shorter than the threshold that intersect [lo,hi],
-- keyed by start: a group starts at the first collapsed start and takes every collapsed
-- duration starting less than the threshold after it. Mirrors src/durations.ts
-- durationSummaries: an in-order walk of the interval tree that takes a subtree's totals
-- (count, latest end) when all of it collapses, lies in the window and joins one group, so
-- a timeline of short durations costs about the groups times the tree's height, however
-- many durations they hold. Long durations among short ones defeat those totals; a subtree
-- of at most 256 entries that mixes them is read by one range scan over its starts instead
-- of node by node. The scan's bounds are the subtree's: its nearest ancestors on either
-- side in (start, ID) order, carried down the walk, compared by ID only where a start ties.
--
-- One row per group: its first start and last end ("n/d"), how many durations it holds, and
-- for a group of one, that duration's band. Durations of threshold or longer are left out.
-- Returns nothing for a missing bound, a threshold that is not positive, or crossed bounds;
-- raises on a node the tree names but lacks. Reads only. Forks are handed to
-- oc_duration_overview_lineage and views use oc_view_duration_overview (generated below from
-- this definition, which the rewrites there match by text).
CREATE OR REPLACE FUNCTION oc_duration_overview(tid uuid, lo mpq, hi mpq, threshold mpq)
RETURNS TABLE(first_time text,last_time text,duration_count integer,band jsonb)
-- PostgreSQL cannot estimate the exact mpq filters; an ordered index scan suits them.
LANGUAGE plpgsql STABLE SET enable_bitmapscan=off AS $$
DECLARE ids integer[]; points boolean[]:=ARRAY[false]; lows integer[]:=ARRAY[NULL::integer];
  highs integer[]:=ARRAY[NULL::integer]; idx integer; nid integer; point boolean; low integer; high integer;
  n record; r record; earliest mpq; fits mpq; anchor mpq; reach mpq; finish mpq; total integer:=0;
  single jsonb; low_first mpq; low_id text; high_first mpq; high_id text;
BEGIN
  IF lo IS NULL OR hi IS NULL OR threshold IS NULL OR threshold<='0'::mpq OR lo>hi THEN RETURN; END IF;
  -- A collapsed duration that reaches the window starts after lo - threshold.
  earliest:=lo-threshold;
  -- The stack: node IDs; points marks an entry that is the node's own duration rather than
  -- its subtree; lows and highs carry each subtree's bounds, the IDs of its nearest
  -- ancestors before and after it in (start, ID) order (NULL at the root).
  SELECT CASE WHEN duration_root IS NULL THEN ARRAY[]::integer[] ELSE ARRAY[duration_root] END INTO ids FROM oc_timelines WHERE id=tid;
  ids:=coalesce(ids,ARRAY[]::integer[]);
  WHILE cardinality(ids)>0 LOOP
    -- Pop the top entry.
    idx:=cardinality(ids); nid:=ids[idx]; point:=points[idx]; low:=lows[idx]; high:=highs[idx];
    ids:=ids[1:idx-1]; points:=points[1:idx-1]; lows:=lows[1:idx-1]; highs:=highs[1:idx-1];
    SELECT d.left_id,d.right_id,d.min_time,d.max_time,d.max_first,d.subtree_count,d.min_extent,d.max_extent,d.first_time,d.last_time,d.band INTO n FROM oc_duration_nodes d WHERE d.timeline_id=tid AND d.id=nid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Broken duration index'; END IF;
    IF point THEN
      -- The node's own duration: only a short one that intersects the window collapses.
      IF n.last_time<lo OR n.first_time>hi OR n.last_time-n.first_time>=threshold THEN CONTINUE; END IF;
      -- It starts at or past the open group's reach (anchor + threshold): emit that group.
      IF anchor IS NOT NULL AND n.first_time>=reach THEN
        first_time:=oc_qtext(anchor); last_time:=oc_qtext(finish); duration_count:=total;
        band:=CASE WHEN total=1 THEN single END; RETURN NEXT; anchor:=NULL;
      END IF;
      -- Open a group at this start, or extend the open one's latest end.
      IF anchor IS NULL THEN anchor:=n.first_time; reach:=anchor+threshold; finish:=n.last_time; total:=0;
      ELSIF n.last_time>finish THEN finish:=n.last_time; END IF;
      -- band is kept for a group of exactly one duration.
      total:=total+1; single:=CASE WHEN total=1 THEN n.band END;
      CONTINUE;
    END IF;
    -- Prune a subtree that misses the window, whose collapsed durations all end before it
    -- (every start at or before earliest), or that holds no short duration.
    IF n.max_time<lo OR n.min_time>hi OR n.max_first<=earliest OR n.min_extent>=threshold THEN CONTINUE; END IF;
    -- The subtree joins the open group if it starts before the group's reach, else opens one.
    fits:=CASE WHEN anchor IS NOT NULL AND n.min_time<reach THEN reach ELSE n.min_time+threshold END;
    -- All short, inside the window and starting before fits: one group takes the subtree's
    -- totals (earliest start, latest end, count) without reading its nodes.
    IF n.max_extent<threshold AND n.min_time>=lo AND n.max_first<=hi AND n.max_first<fits THEN
      IF anchor IS NOT NULL AND n.min_time>=reach THEN
        first_time:=oc_qtext(anchor); last_time:=oc_qtext(finish); duration_count:=total;
        band:=CASE WHEN total=1 THEN single END; RETURN NEXT; anchor:=NULL;
      END IF;
      IF anchor IS NULL THEN anchor:=n.min_time; reach:=anchor+threshold; finish:=n.max_time; total:=0;
      ELSIF n.max_time>finish THEN finish:=n.max_time; END IF;
      total:=total+n.subtree_count; single:=CASE WHEN total=1 THEN n.band END;
    -- Short and long mixed in a small subtree: read its short durations by one range scan of
    -- the start index (first_key) over its starts, in start order. A duration outside the
    -- subtree can share a boundary start; the ancestor bounds exclude it, by ID where the
    -- starts tie, and are dropped when no tie is possible.
    ELSIF n.max_extent>=threshold AND n.subtree_count<=256 THEN
      low_first:=NULL; high_first:=NULL;
      IF low IS NOT NULL THEN
        SELECT d.first_time,d.band->>'id' INTO low_first,low_id FROM oc_duration_nodes d WHERE d.timeline_id=tid AND d.id=low;
        IF low_first<n.min_time THEN low_first:=NULL; END IF;
      END IF;
      IF high IS NOT NULL THEN
        SELECT d.first_time,d.band->>'id' INTO high_first,high_id FROM oc_duration_nodes d WHERE d.timeline_id=tid AND d.id=high;
        IF high_first>n.max_first THEN high_first:=NULL; END IF;
      END IF;
      -- The key range finds the candidates; exact comparisons recheck each.
      FOR r IN SELECT d.first_time AS f,d.last_time AS l,d.band AS b FROM oc_duration_nodes d WHERE d.timeline_id=tid
          AND d.first_key>=oc_qkey(n.min_time) AND d.first_key<=oc_qkey(n.max_first)
            AND d.first_time>=n.min_time AND d.first_time<=n.max_first
            AND (low_first IS NULL OR d.first_time>low_first OR (d.band->>'id') COLLATE "C">low_id COLLATE "C")
            AND (high_first IS NULL OR d.first_time<high_first OR (d.band->>'id') COLLATE "C"<high_id COLLATE "C")
            AND d.last_time>=lo AND d.first_time<=hi AND d.last_time-d.first_time<threshold
          ORDER BY d.first_key,d.first_time LOOP
        -- Group as for a single node's duration, above.
        IF anchor IS NOT NULL AND r.f>=reach THEN
          first_time:=oc_qtext(anchor); last_time:=oc_qtext(finish); duration_count:=total;
          band:=CASE WHEN total=1 THEN single END; RETURN NEXT; anchor:=NULL;
        END IF;
        IF anchor IS NULL THEN anchor:=r.f; reach:=anchor+threshold; finish:=r.l; total:=0;
        ELSIF r.l>finish THEN finish:=r.l; END IF;
        total:=total+1; single:=CASE WHEN total=1 THEN r.b END;
      END LOOP;
    ELSE
      -- Descend in order: push the right subtree (bounded by this node before it), this
      -- node's own duration, then the left subtree (bounded by this node after it).
      IF n.right_id IS NOT NULL THEN
        ids:=ids||n.right_id; points:=points||false; lows:=lows||nid; highs:=highs||high;
      END IF;
      ids:=ids||nid; points:=points||true; lows:=lows||NULL::integer; highs:=highs||NULL::integer;
      IF n.left_id IS NOT NULL THEN
        ids:=ids||n.left_id; points:=points||false; lows:=lows||low; highs:=highs||nid;
      END IF;
    END IF;
  END LOOP;
  -- Emit the last open group.
  IF anchor IS NOT NULL THEN
    first_time:=oc_qtext(anchor); last_time:=oc_qtext(finish); duration_count:=total;
    band:=CASE WHEN total=1 THEN single END; RETURN NEXT;
  END IF;
END $$;
-- A duration by its ID (band->>'id'): saves, merges, history and duration queries look one up.
CREATE INDEX IF NOT EXISTS oc_duration_nodes_duration_id ON oc_duration_nodes(timeline_id,(band->>'id'));

-- Per-timeline text search over moments and durations, rebuilt with the rational index on save.
-- The 'simple' configuration is language-neutral; queries match word prefixes.
-- One row per entity (written by store.mjs indexSearch and incremental.mjs, searched by
-- store.mjs): first_time, last_time: its time or span, to show and go to a match; title and
-- body: its text (the vector reads the first 100,000 characters of the body).
CREATE TABLE IF NOT EXISTS oc_entity_search (
  timeline_id uuid NOT NULL REFERENCES oc_timelines(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('moment','duration')),
  entity_id text NOT NULL,
  first_time mpq NOT NULL, last_time mpq NOT NULL,
  title text NOT NULL, body text NOT NULL,
  document tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', title), 'A') || setweight(to_tsvector('simple', left(body, 100000)), 'B')
  ) STORED,
  PRIMARY KEY(timeline_id,kind,entity_id)
);
-- search_version: 1 once the timeline's entity search rows exist; migrate.mjs builds them for
-- timelines still at 0 (backfillEntitySearch in store.mjs).
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS search_version integer NOT NULL DEFAULT 0;
-- Entity tags (metadata.tags of moments and durations), listed for tag separation.
ALTER TABLE oc_entity_search ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
-- The search vector is kept by a trigger rather than generated, so that index rows copied
-- from another timeline's (copyLevel in index-versions.mjs, compact in store.mjs) take the
-- vectors as they are instead of reading every entity's text again: computed on insert
-- unless given, and when the text changes. Existing vectors are kept as they are.
ALTER TABLE oc_entity_search ALTER COLUMN document DROP EXPRESSION IF EXISTS;
-- Trigger function (BEFORE INSERT OR UPDATE): computes the vector, as the generated column
-- did, when an insert gives none or an update changes the title or body.
CREATE OR REPLACE FUNCTION oc_entity_search_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP='INSERT' AND NEW.document IS NULL) OR (TG_OP='UPDATE' AND
      (NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body)) THEN
    NEW.document:=setweight(to_tsvector('simple', NEW.title), 'A')
      || setweight(to_tsvector('simple', left(NEW.body, 100000)), 'B');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS oc_entity_search_document ON oc_entity_search;
CREATE TRIGGER oc_entity_search_document BEFORE INSERT OR UPDATE ON oc_entity_search
  FOR EACH ROW EXECUTE FUNCTION oc_entity_search_document();
-- Searches find their matches through this index rather than reading all of a timeline's
-- rows, so a search for something specific costs what it finds, not the timeline's size.
-- On the text alone (the timeline is checked on the rows it finds): one with the timeline
-- first needs the btree_gin extension, which not every PostgreSQL package installs. Retired
-- versions get the same index below, for forks searching what their source has changed.
CREATE INDEX IF NOT EXISTS oc_entity_search_document ON oc_entity_search USING gin(document);

-- Derived indexes for tag separation: one saved revision filtered to entities with any of a
-- set of tags, or none of them. Built on first use and cached per revision; a save discards
-- them. Node tables mirror oc_nodes and oc_duration_nodes, keyed by the view's ID in the
-- timeline_id column so the generated functions below can share the originals' code.
-- store.mjs view builds one under an advisory lock on (timeline, revision, filter), so a
-- filter is built once; filter_key is the filter's canonical form; root, duration_root and
-- event_count are as on oc_timelines. A timeline keeps its eight most recent views, and the
-- catalogue refresh after a save deletes those of other revisions. View tables are never
-- versioned or read through.
CREATE TABLE IF NOT EXISTS oc_views (
  id uuid PRIMARY KEY,
  timeline_id uuid NOT NULL REFERENCES oc_timelines(id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  filter_key text NOT NULL,
  root bigint,
  event_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(timeline_id,revision,filter_key)
);
-- Mirrors oc_nodes; timeline_id holds the view's ID.
CREATE TABLE IF NOT EXISTS oc_view_nodes (
  timeline_id uuid NOT NULL REFERENCES oc_views ON DELETE CASCADE, id bigint NOT NULL,
  time mpq NOT NULL, first_time mpq NOT NULL, last_time mpq NOT NULL,
  left_id bigint, right_id bigint, first_id bigint NOT NULL, bucket_count bigint NOT NULL,
  event_count bigint NOT NULL, distinct_count integer NOT NULL,
  events jsonb NOT NULL, PRIMARY KEY(timeline_id,id)
);
-- The same upgrades as oc_nodes, for views older releases built; and the view's duration root.
ALTER TABLE oc_view_nodes ADD COLUMN IF NOT EXISTS moment_ids text[];
ALTER TABLE oc_view_nodes ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE oc_view_nodes ALTER COLUMN events DROP NOT NULL;
ALTER TABLE oc_views ADD COLUMN IF NOT EXISTS duration_root integer;
-- Mirrors oc_moments.
CREATE TABLE IF NOT EXISTS oc_view_moments (
  timeline_id uuid NOT NULL REFERENCES oc_views ON DELETE CASCADE, id text NOT NULL,
  time mpq NOT NULL, event jsonb NOT NULL, PRIMARY KEY(timeline_id,id)
);
-- Mirrors oc_duration_nodes, with its later columns.
CREATE TABLE IF NOT EXISTS oc_view_duration_nodes (
  timeline_id uuid NOT NULL REFERENCES oc_views ON DELETE CASCADE,
  id integer NOT NULL, left_id integer, right_id integer,
  min_time mpq NOT NULL, max_time mpq NOT NULL,
  first_time mpq NOT NULL, last_time mpq NOT NULL, band jsonb NOT NULL,
  definition jsonb, max_first mpq, subtree_count integer, min_extent mpq, max_extent mpq,
  PRIMARY KEY(timeline_id,id)
);
-- Mirrors oc_duration_nodes' height and start key (above).
ALTER TABLE oc_view_duration_nodes ADD COLUMN IF NOT EXISTS height integer;
DROP INDEX IF EXISTS oc_view_duration_nodes_first_approx;
ALTER TABLE oc_view_duration_nodes DROP COLUMN IF EXISTS first_approx;
ALTER TABLE oc_view_duration_nodes ADD COLUMN IF NOT EXISTS first_key numeric
  GENERATED ALWAYS AS (oc_qkey(first_time)) STORED;
CREATE INDEX IF NOT EXISTS oc_view_duration_nodes_first_key ON oc_view_duration_nodes(timeline_id,first_key);
-- View variants of the traversal functions, generated from the originals so the summary
-- algorithms have a single definition: only table names (and the root's table) differ.
-- Regenerated on every run from the originals as defined above, before forks' dispatch is
-- added to them below, so views never read through. Creates oc_view_overview,
-- oc_view_events and oc_view_duration_overview.
DO $$
DECLARE
  generated record;
BEGIN
  FOR generated IN SELECT * FROM (VALUES
    ('oc_overview_v2(uuid,mpq,mpq,mpq)', 'oc_overview_v2(', 'oc_view_overview('),
    ('oc_events(uuid,mpq,mpq,mpq,text,integer)', 'oc_events(', 'oc_view_events('),
    ('oc_duration_overview(uuid,mpq,mpq,mpq)', 'oc_duration_overview(', 'oc_view_duration_overview(')
  ) AS f(signature, name, view_name) LOOP
    -- The original's definition, renamed and pointed at the view tables.
    EXECUTE replace(replace(replace(replace(replace(
      pg_get_functiondef(generated.signature::regprocedure),
      generated.name, generated.view_name),
      'oc_duration_nodes', 'oc_view_duration_nodes'),
      'oc_nodes', 'oc_view_nodes'),
      'oc_moments', 'oc_view_moments'),
      'oc_timelines', 'oc_views');
  END LOOP;
END $$;

-- Undirected relationships between entities, stored once in canonical order (a < b by
-- kind and ID) and indexed from both ends. Rebuilt with the timeline's other indexes on save.
-- Written by store.mjs (whole saves) and incremental.mjs; read by store.mjs (related
-- entities), merge.mjs and history.mjs.
CREATE TABLE IF NOT EXISTS oc_relationships (
  timeline_id uuid NOT NULL REFERENCES oc_timelines(id) ON DELETE CASCADE,
  a_kind text NOT NULL CHECK(a_kind IN ('moment','duration')), a_id text NOT NULL,
  b_kind text NOT NULL CHECK(b_kind IN ('moment','duration')), b_id text NOT NULL,
  PRIMARY KEY(timeline_id,a_kind,a_id,b_kind,b_id),
  CHECK((a_kind,a_id)<>(b_kind,b_id))
);
-- Relationships by their b end; the primary key serves the a end.
CREATE INDEX IF NOT EXISTS oc_relationships_b ON oc_relationships(timeline_id,b_kind,b_id);
-- Relationship arcs as exact intervals between their endpoints' times (a duration's start),
-- in the same augmented interval tree as duration bands (incremental.mjs places an arc again
-- when an endpoint moves; store.mjs draws the arcs in a window).
CREATE TABLE IF NOT EXISTS oc_edge_nodes (
  timeline_id uuid NOT NULL REFERENCES oc_timelines(id) ON DELETE CASCADE,
  id integer NOT NULL, left_id integer, right_id integer,
  min_time mpq NOT NULL, max_time mpq NOT NULL,
  first_time mpq NOT NULL, last_time mpq NOT NULL, band jsonb NOT NULL,
  definition jsonb, max_first mpq, subtree_count integer, min_extent mpq, max_extent mpq,
  PRIMARY KEY(timeline_id,id)
);
-- AVL heights and the arc tree's root, as for durations; a static tree's root was node 1.
ALTER TABLE oc_edge_nodes ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS edge_root integer;
UPDATE oc_timelines t SET edge_root=1 WHERE edge_root IS NULL
  AND EXISTS(SELECT 1 FROM oc_edge_nodes n WHERE n.timeline_id=t.id AND n.id=1);
-- An arc by its ID (band->>'id'), for saves that place a relationship's arc again.
CREATE INDEX IF NOT EXISTS oc_edge_nodes_edge_id ON oc_edge_nodes(timeline_id,(band->>'id'));

-- Saves stored a sparse patch against the first parent instead of a whole document, with a
-- full snapshot written periodically so reading any revision replayed a bounded chain. Since
-- history is kept as rows (below), saves write neither; revisions saved as patches still read
-- back by replaying them. patch_chain and patch_bytes counted the patches since the last
-- snapshot; nothing uses them any more.
ALTER TABLE oc_revisions ALTER COLUMN snapshot_id DROP NOT NULL;
ALTER TABLE oc_revisions ADD COLUMN IF NOT EXISTS patch jsonb;
-- Size of the revision's whole document as exported JSON (an upper-bound estimate for patches).
ALTER TABLE oc_revisions ADD COLUMN IF NOT EXISTS document_bytes bigint CHECK(document_bytes>=0);
-- Which content a revision has is checked below, once revisions can also be kept as rows.
ALTER TABLE oc_revisions DROP CONSTRAINT IF EXISTS oc_revisions_content;
-- (Unused since history is kept as rows; see above.)
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS patch_chain integer NOT NULL DEFAULT 0;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS patch_bytes bigint NOT NULL DEFAULT 0;
-- Saves update the timeline row once; free space on each page keeps those updates in place
-- (HOT), so the catalogue's GIN index over the whole timeline's text is not rewritten.
ALTER TABLE oc_timelines SET (fillfactor=50);
-- Catalogue text (event_text) is refreshed after incremental saves; true until then.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS event_text_stale boolean NOT NULL DEFAULT false;
-- Catalogue text: duration then moment titles and notes (durations in start order, moments in
-- time order, each followed by its stacked entries), each part at most 4096 characters and
-- the whole at most 1 MiB. Built in the database after incremental saves (eventSearchText in
-- store.mjs builds it from a whole document). Both are read in order and the text stops once
-- full, so its cost follows the text, not the timeline (#135): durations through their start
-- index, moments a page at a time walking the moment tree (oc_events, which reads through
-- for forks).
-- Called by store.mjs's catalogue refresh after the save commits; reads only. Forks are handed
-- to oc_event_text_lineage (generated below from this definition).
-- A function earlier versions of this schema defined.
DROP FUNCTION IF EXISTS oc_text_parts(jsonb,boolean);
CREATE OR REPLACE FUNCTION oc_event_text(tid uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE parts text[]:='{}'; total bigint:=0; part text; page jsonb[]; after_time mpq; after_id text;
BEGIN
  -- Durations first, in start order (first_key, then exact start, then ID in "C" order): each
  -- one's title and then its description, when they are strings. total counts the joined
  -- length (each part and a space); past 1 MiB the text is complete.
  FOR part IN SELECT left(x.v,4096) FROM oc_duration_nodes d CROSS JOIN LATERAL (VALUES
    (1,CASE WHEN jsonb_typeof(d.definition->'metadata'->'title')='string' THEN d.definition->'metadata'->>'title' END),
    (2,CASE WHEN jsonb_typeof(d.definition->'metadata'->'description')='string' THEN d.definition->'metadata'->>'description' END)) x(o,v)
  WHERE d.timeline_id=tid AND x.v IS NOT NULL ORDER BY d.first_key,d.first_time,d.band->>'id' COLLATE "C",x.o LOOP
    parts:=parts||part; total:=total+length(part)+1;
    IF total>1048576 THEN RETURN left(array_to_string(parts,' '),1048576); END IF;
  END LOOP;
  -- Then moments in time order, 1000 at a time through the (time, ID) cursor of the moment
  -- walk: each moment's title and description, followed by those of its stacked entries (the
  -- items of its array-valued metadata fields, by field and then item order).
  LOOP
    SELECT array_agg(e ORDER BY o) INTO page FROM oc_events(tid,NULL,NULL,after_time,after_id,1000) WITH ORDINALITY p(e,o);
    EXIT WHEN page IS NULL;
    FOR part IN SELECT left(x.v,4096) FROM unnest(page) WITH ORDINALITY u(e,ord)
      CROSS JOIN LATERAL (
        SELECT 0::bigint AS n,y.o,y.v FROM (VALUES
          (1,CASE WHEN jsonb_typeof(u.e->'metadata'->'title')='string' THEN u.e->'metadata'->>'title' END),
          (2,CASE WHEN jsonb_typeof(u.e->'metadata'->'description')='string' THEN u.e->'metadata'->>'description' END)) y(o,v)
        UNION ALL
        SELECT a.ord*1000000+i.ord,y.o,y.v FROM jsonb_each(u.e->'metadata') WITH ORDINALITY a(key,value,ord)
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.value)='array' THEN a.value ELSE '[]'::jsonb END) WITH ORDINALITY i(item,ord)
        CROSS JOIN LATERAL (VALUES
          (1,CASE WHEN jsonb_typeof(i.item->'metadata'->'title')='string' THEN i.item->'metadata'->>'title' END),
          (2,CASE WHEN jsonb_typeof(i.item->'metadata'->'description')='string' THEN i.item->'metadata'->>'description' END)) y(o,v)
      ) x WHERE x.v IS NOT NULL ORDER BY u.ord,x.n,x.o LOOP
      parts:=parts||part; total:=total+length(part)+1;
      IF total>1048576 THEN RETURN left(array_to_string(parts,' '),1048576); END IF;
    END LOOP;
    -- A short page was the last; otherwise continue after its last moment.
    EXIT WHEN cardinality(page)<1000;
    after_time:=(page[cardinality(page)]->>'time')::mpq; after_id:=page[cardinality(page)]->>'id';
  END LOOP;
  RETURN array_to_string(parts,' ');
END $$;
-- Data retention (#91): a Gregorian timeline can keep only its last retention_seconds of
-- moments; the server expires older ones, and history saved before then, on a schedule.
-- retention_seconds: the period, an exact rational number of seconds as text;
-- retention_applied_at: the last run (NULL: due now; changing the period resets it);
-- retention_removed: how many entries the last run deleted, shown with the setting.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS retention_seconds text;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS retention_applied_at timestamptz;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS retention_removed bigint;
-- Due timelines, oldest run first (retention.mjs expireDue, NULLS FIRST, a hundred at a time);
-- partial: only timelines with a retention period.
CREATE INDEX IF NOT EXISTS oc_timelines_retention ON oc_timelines(retention_applied_at NULLS FIRST)
  WHERE retention_seconds IS NOT NULL;

-- Saved history as rows (history.mjs): each version of a timeline's moments, durations,
-- relationships and settings is valid from the revision number that saved it (since) until
-- the one that changed or removed it (until, null while current). Saves write only what
-- changed; revision n is the rows with since<=n<until. A timeline starts at its first
-- numbered revision from here on (history_since); earlier revisions keep their snapshots
-- and patches.
-- Versions of moments: event is the moment's JSON, time its time as an mpq. The primary key
-- reads an entity's versions; the CHECK keeps every range non-empty. None of these tables
-- refers to oc_timelines: a deleted timeline's versions stay while copies read them.
CREATE TABLE IF NOT EXISTS oc_history_moments (
  timeline_id uuid NOT NULL, id text NOT NULL, since bigint NOT NULL, until bigint,
  time mpq NOT NULL, event jsonb NOT NULL,
  PRIMARY KEY(timeline_id,id,since), CHECK(until>since)
);
-- Versions of durations: their definitions.
CREATE TABLE IF NOT EXISTS oc_history_durations (
  timeline_id uuid NOT NULL, id text NOT NULL, since bigint NOT NULL, until bigint,
  definition jsonb NOT NULL,
  PRIMARY KEY(timeline_id,id,since), CHECK(until>since)
);
-- Versions of relationships: a row is the relationship's presence over its range.
CREATE TABLE IF NOT EXISTS oc_history_relationships (
  timeline_id uuid NOT NULL, a_kind text NOT NULL, a_id text NOT NULL,
  b_kind text NOT NULL, b_id text NOT NULL, since bigint NOT NULL, until bigint,
  PRIMARY KEY(timeline_id,a_kind,a_id,b_kind,b_id,since), CHECK(until>since)
);
-- Versions of the timeline's settings: the document's fields other than its entities.
CREATE TABLE IF NOT EXISTS oc_history_settings (
  timeline_id uuid NOT NULL, since bigint NOT NULL, until bigint, settings jsonb NOT NULL,
  PRIMARY KEY(timeline_id,since), CHECK(until>since)
);
-- One current version of each entity; saves find it by ID.
CREATE UNIQUE INDEX IF NOT EXISTS oc_history_moments_current ON oc_history_moments(timeline_id,id) WHERE until IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS oc_history_durations_current ON oc_history_durations(timeline_id,id) WHERE until IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS oc_history_relationships_current ON oc_history_relationships(timeline_id,a_kind,a_id,b_kind,b_id) WHERE until IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS oc_history_settings_current ON oc_history_settings(timeline_id) WHERE until IS NULL;
-- Reading a revision scans one timeline's versions by when they started.
CREATE INDEX IF NOT EXISTS oc_history_moments_since ON oc_history_moments(timeline_id,since);
CREATE INDEX IF NOT EXISTS oc_history_durations_since ON oc_history_durations(timeline_id,since);
-- history_since: the first revision number the timeline keeps as rows; NULL while it keeps
-- none (startHistory in history.mjs sets it when migrating, store.mjs when history restarts).
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS history_since bigint;
-- A revision is a snapshot, a patch against its first parent, or kept as rows (numbered).
ALTER TABLE oc_revisions ADD COLUMN IF NOT EXISTS history_rows boolean NOT NULL DEFAULT false;
-- Bytes of the versions a revision kept as rows wrote: what it is charged.
ALTER TABLE oc_revisions ADD COLUMN IF NOT EXISTS stored_bytes bigint CHECK(stored_bytes>=0);
-- The CHECK is dropped and re-added with its current definition on every run: at most one
-- kind of content, and rows only for a numbered revision. (Its first version required
-- exactly one of snapshot and patch.)
ALTER TABLE oc_revisions DROP CONSTRAINT IF EXISTS oc_revisions_content;
-- A revision with none of them is one whose content is not kept (a timeline that keeps no
-- saved history, below): only its place in the history remains.
ALTER TABLE oc_revisions ADD CONSTRAINT oc_revisions_content
  CHECK(num_nonnulls(snapshot_id,patch)+history_rows::int<=1 AND (NOT history_rows OR number IS NOT NULL));
-- History is immutable like revisions: a version only ends, once. The trigger function lets
-- an UPDATE through only when it sets until on a current version and changes nothing else;
-- deleting versions (pruning, retention, deletion) is allowed.
CREATE OR REPLACE FUNCTION oc_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.until IS NOT NULL OR NEW.until IS NULL OR to_jsonb(NEW)-'until' IS DISTINCT FROM to_jsonb(OLD)-'until' THEN
    RAISE EXCEPTION 'Saved history is immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS oc_history_immutable ON oc_history_moments;
CREATE TRIGGER oc_history_immutable BEFORE UPDATE ON oc_history_moments FOR EACH ROW EXECUTE FUNCTION oc_history_immutable();
DROP TRIGGER IF EXISTS oc_history_immutable ON oc_history_durations;
CREATE TRIGGER oc_history_immutable BEFORE UPDATE ON oc_history_durations FOR EACH ROW EXECUTE FUNCTION oc_history_immutable();
DROP TRIGGER IF EXISTS oc_history_immutable ON oc_history_relationships;
CREATE TRIGGER oc_history_immutable BEFORE UPDATE ON oc_history_relationships FOR EACH ROW EXECUTE FUNCTION oc_history_immutable();
DROP TRIGGER IF EXISTS oc_history_immutable ON oc_history_settings;
CREATE TRIGGER oc_history_immutable BEFORE UPDATE ON oc_history_settings FOR EACH ROW EXECUTE FUNCTION oc_history_immutable();
-- Copies share history (history.mjs): a fork or duplicate reads through to the revision it
-- was copied from (its base) for every entity it has not saved itself. Overrides record,
-- per entity, the revision from which the copy keeps its own versions instead; one without
-- a version is an entity the copy removed. Neither table refers to oc_timelines: a deleted
-- timeline's kept revisions still read through to their base.
CREATE TABLE IF NOT EXISTS oc_history_bases (
  timeline_id uuid PRIMARY KEY, base_revision_id uuid NOT NULL REFERENCES oc_revisions
);
-- Whether a revision is still some copy's base (STILL_READ in store.mjs, retention.mjs).
CREATE INDEX IF NOT EXISTS oc_history_bases_revision ON oc_history_bases(base_revision_id);
-- Overrides: since is the copy's revision number from which its own versions of the entity
-- count; the copy has none when it removed the entity.
CREATE TABLE IF NOT EXISTS oc_history_moment_overrides (
  timeline_id uuid NOT NULL, id text NOT NULL, since bigint NOT NULL, PRIMARY KEY(timeline_id,id)
);
CREATE TABLE IF NOT EXISTS oc_history_duration_overrides (
  timeline_id uuid NOT NULL, id text NOT NULL, since bigint NOT NULL, PRIMARY KEY(timeline_id,id)
);
CREATE TABLE IF NOT EXISTS oc_history_relationship_overrides (
  timeline_id uuid NOT NULL, a_kind text NOT NULL, a_id text NOT NULL, b_kind text NOT NULL,
  b_id text NOT NULL, since bigint NOT NULL, PRIMARY KEY(timeline_id,a_kind,a_id,b_kind,b_id)
);
-- Bases and overrides are only ever inserted and deleted.
DROP TRIGGER IF EXISTS oc_history_immutable ON oc_history_bases;
CREATE TRIGGER oc_history_immutable BEFORE UPDATE ON oc_history_bases FOR EACH ROW EXECUTE FUNCTION oc_immutable_revision();
DROP TRIGGER IF EXISTS oc_history_immutable ON oc_history_moment_overrides;
CREATE TRIGGER oc_history_immutable BEFORE UPDATE ON oc_history_moment_overrides FOR EACH ROW EXECUTE FUNCTION oc_immutable_revision();
DROP TRIGGER IF EXISTS oc_history_immutable ON oc_history_duration_overrides;
CREATE TRIGGER oc_history_immutable BEFORE UPDATE ON oc_history_duration_overrides FOR EACH ROW EXECUTE FUNCTION oc_immutable_revision();
DROP TRIGGER IF EXISTS oc_history_immutable ON oc_history_relationship_overrides;
CREATE TRIGGER oc_history_immutable BEFORE UPDATE ON oc_history_relationship_overrides FOR EACH ROW EXECUTE FUNCTION oc_immutable_revision();
-- Comparing two revisions (differences in history.mjs) finds what a timeline saved between
-- them: versions that started or ended in between, and overrides made in between.
CREATE INDEX IF NOT EXISTS oc_history_relationships_since ON oc_history_relationships(timeline_id,since);
CREATE INDEX IF NOT EXISTS oc_history_moments_until ON oc_history_moments(timeline_id,until) WHERE until IS NOT NULL;
CREATE INDEX IF NOT EXISTS oc_history_durations_until ON oc_history_durations(timeline_id,until) WHERE until IS NOT NULL;
CREATE INDEX IF NOT EXISTS oc_history_relationships_until ON oc_history_relationships(timeline_id,until) WHERE until IS NOT NULL;
CREATE INDEX IF NOT EXISTS oc_history_moment_overrides_since ON oc_history_moment_overrides(timeline_id,since);
CREATE INDEX IF NOT EXISTS oc_history_duration_overrides_since ON oc_history_duration_overrides(timeline_id,since);
CREATE INDEX IF NOT EXISTS oc_history_relationship_overrides_since ON oc_history_relationship_overrides(timeline_id,since);
-- Pull requests keep no documents of their own: their base and source are saved revisions
-- (a submitted source is kept as rows that read through to its base). Documents stored by
-- earlier versions are copies of those revisions, read from there instead.
ALTER TABLE oc_proposals ALTER COLUMN base_document DROP NOT NULL;
ALTER TABLE oc_proposals ALTER COLUMN document DROP NOT NULL;
UPDATE oc_proposals SET base_document=NULL,document=NULL
WHERE (base_document IS NOT NULL OR document IS NOT NULL)
  AND base_revision_id IS NOT NULL AND source_revision_id IS NOT NULL;
-- A large fork or duplicate is answered at once and its index copied in the background
-- (prepare in store.mjs): until then this names the revision it copies, and the timeline
-- refuses reads and writes of its index.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS preparing_revision_id uuid REFERENCES oc_revisions;
-- Copies awaiting preparation, picked up at startup (store.mjs: preparing_revision_id IS NOT
-- NULL); partial, so it holds only those.
CREATE INDEX IF NOT EXISTS oc_timelines_preparing ON oc_timelines(id) WHERE preparing_revision_id IS NOT NULL;
-- Versioned index rows (#145, phase 1): forks will read their source's index as it was when
-- forked instead of copying it. Each timeline's index has a clock, advanced by every
-- transaction that writes it (beginIndexWrite in index-versions.mjs); each live index row
-- records the clock that wrote it (since; null for rows written before this). A fork pins
-- the clock it read its source at (index_pinned: the highest). Changing or deleting a row
-- a pin can see first copies it, with the clock that ended it (until), into the table's
-- _retired twin; rows nothing pins are changed in place, as before. Live tables keep only
-- current rows, so reading them is unchanged.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS index_clock bigint NOT NULL DEFAULT 0;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS index_pinned bigint;
-- A fork's tombstone: a row it removed from what it reads through to (#145, phase 2), kept
-- as a hidden row of its own with the same key. Added before the versioning below, so
-- retired versions keep it too.
ALTER TABLE oc_moments ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE oc_nodes ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE oc_edge_nodes ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE oc_relationships ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE oc_entity_search ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
-- For each index table, every run (re)creates: its since column, defaulting to the clock;
-- its _retired twin, with every column of the live table and until, indexed by
-- (timeline_id, until); and two trigger functions with their triggers. They read three
-- transaction-local settings beginIndexWrite (index-versions.mjs) sets: oc.clock (the clock
-- this transaction writes at), oc.timeline (the timeline it writes) and oc.pinned (that
-- timeline's highest pin, empty when unpinned). A row is retired only when it belongs to that
-- timeline and a pin can see it (written at or before the highest pin); rows of other
-- timelines, which oc_release_index deletes, never are.
DO $do$
DECLARE live text; col record; names text; olds text; retire text;
BEGIN
  FOREACH live IN ARRAY ARRAY['oc_moments','oc_nodes','oc_duration_nodes','oc_edge_nodes',
    'oc_relationships','oc_entity_search'] LOOP
    -- Added without a default (no rewrite of existing rows), then defaulted to the clock:
    -- a write outside beginIndexWrite fails rather than recording no version.
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS since bigint', live);
    EXECUTE format($f$ALTER TABLE %I ALTER COLUMN since SET DEFAULT current_setting('oc.clock')::bigint$f$, live);
    -- The twin starts with the columns it needs first; the loop below adds the others.
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (timeline_id uuid NOT NULL, until bigint NOT NULL)',
      live || '_retired');
    -- The twin has every column of the live table (generated ones stored as values).
    FOR col IN SELECT a.attname,format_type(a.atttypid,a.atttypmod) AS type FROM pg_attribute a
      WHERE a.attrelid=live::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LOOP
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I %s', live || '_retired', col.attname, col.type);
    END LOOP;
    -- oc_release_index's deletes: one timeline's versions by when they ended.
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(timeline_id,until)', live || '_retired_until', live || '_retired');
    -- Per table, so retiring a row is one static insert of its columns. Regenerated on every
    -- run, so columns added to the live table are retired too.
    SELECT string_agg(quote_ident(a.attname),',' ORDER BY a.attnum),
      string_agg('OLD.'||quote_ident(a.attname),',' ORDER BY a.attnum) INTO names,olds
    FROM pg_attribute a WHERE a.attrelid=live::regclass AND a.attnum>0 AND NOT a.attisdropped;
    -- oc.retired counts the transaction's retired rows (see transaction in store.mjs).
    retire:=format('INSERT INTO %I(%s,until) VALUES(%s,current_setting(''oc.clock'')::bigint);
      PERFORM set_config(''oc.retired'',(coalesce(nullif(current_setting(''oc.retired'',true),''''),''0'')::bigint+1)::text,true);',
      live || '_retired', names, olds);
    -- Every change records the clock that made it, retiring the version a pin can still see.
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I() RETURNS trigger LANGUAGE plpgsql AS $b$
      BEGIN
        NEW.since:=current_setting('oc.clock')::bigint;
        IF OLD.timeline_id::text=current_setting('oc.timeline',true)
          AND coalesce(OLD.since,0)<=nullif(current_setting('oc.pinned',true),'')::bigint THEN
          %s
        END IF;
        RETURN NEW;
      END $b$$f$, live || '_versioned', retire);
    -- Deleting retires the row too; the trigger's WHEN decides whether a pin can see it.
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I() RETURNS trigger LANGUAGE plpgsql AS $b$
      BEGIN %s RETURN OLD; END $b$$f$, live || '_retire', retire);
    -- BEFORE triggers, so the retired copy and the change are made by the same statement.
    EXECUTE format('DROP TRIGGER IF EXISTS oc_index_update ON %I', live);
    EXECUTE format('CREATE TRIGGER oc_index_update BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION %I()',
      live, live || '_versioned');
    EXECUTE format('DROP TRIGGER IF EXISTS oc_index_delete ON %I', live);
    -- Deleting a row only calls a function when a pin can see it.
    EXECUTE format($f$CREATE TRIGGER oc_index_delete BEFORE DELETE ON %I FOR EACH ROW
      WHEN (OLD.timeline_id::text=current_setting('oc.timeline',true)
        AND coalesce(OLD.since,0)<=nullif(current_setting('oc.pinned',true),'')::bigint)
      EXECUTE FUNCTION %I()$f$, live, live || '_retire');
  END LOOP;
END $do$;
-- Shared trigger functions of the first version of this design, replaced by the per-table
-- ones above.
DROP FUNCTION IF EXISTS oc_index_update();
DROP FUNCTION IF EXISTS oc_index_retire();
DROP FUNCTION IF EXISTS oc_index_retire_row(text,jsonb);
-- Forks read their source's index instead of copying it (#145, phase 2; index-versions.mjs).
-- A fork's index is its own rows (what it changed, hidden rows for what it removed) over its
-- source's at the clock it forked at (pinned there, so the source retires what it changes),
-- and so on through the source's own sources: index_bases names them, nearest first, and
-- index_clocks the clocks it reads each at. A full rewrite of a fork's index (replace) makes
-- it whole again, reading through to nothing.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS index_bases uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS index_clocks bigint[] NOT NULL DEFAULT '{}';
-- Timelines that read through to a given one (index_bases @> ARRAY[id] in oc_release_index);
-- partial: only forks that read through have entries.
CREATE INDEX IF NOT EXISTS oc_timelines_index_bases ON oc_timelines USING gin(index_bases)
  WHERE index_bases<>'{}';
-- For each index table, every run: drop the foreign key to oc_timelines, index the retired
-- twin as the live table is indexed, and generate <table>_at, the rows a lineage sees.
DO $do$
DECLARE live text; keys text[]; names text; eq text; levels integer:=4; k integer;
  body text; seen text; shadows text; idx record;
BEGIN
  FOREACH live IN ARRAY ARRAY['oc_moments','oc_nodes','oc_duration_nodes','oc_edge_nodes',
    'oc_relationships','oc_entity_search'] LOOP
    -- Rows outlive their timeline while forks read them (oc_release_index below).
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', live, live || '_timeline_id_fkey');
    -- The table's key: its primary key's columns after timeline_id, in order.
    SELECT array_agg(a.attname::text ORDER BY array_position(i.indkey::int2[],a.attnum)) INTO keys
    FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
    WHERE i.indrelid=live::regclass AND i.indisprimary AND a.attname<>'timeline_id';
    -- Retired versions are found as live rows are: by key at a clock, and by every index.
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(timeline_id,%s,until)', live || '_retired_key',
      live || '_retired', (SELECT string_agg(quote_ident(x),',') FROM unnest(keys) x));
    -- Each other index of the live table, copied for the twin: never unique (a twin holds
    -- several versions of a key), with the same columns, method and WHERE clause.
    FOR idx IN SELECT c.relname,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i
      JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=live::regclass AND NOT i.indisprimary LOOP
      EXECUTE regexp_replace(idx.definition, '^CREATE (UNIQUE )?INDEX \S+ ON \S+ USING ',
        format('CREATE INDEX IF NOT EXISTS %I ON %I USING ', idx.relname || '_retired', live || '_retired'));
    END LOOP;
    -- live_at(tids, clocks, from_level): the rows a timeline sees, given its levels (tids:
    -- itself, then what it reads through to, as index_bases; clocks: the clock each is read
    -- at, after a placeholder for itself): its own visible rows, then each level's rows at
    -- its clock (live, or retired then) whose key no nearer level has a version of. Levels
    -- before from_level are known to hold none of the rows asked for (see the walks below).
    -- The walks in the database use it; queries from the server write the same out for the
    -- timeline's levels (indexReader in index-versions.mjs).
    -- The body, built level by level: level 1's visible rows, then for each deeper level its
    -- live and retired rows at its clock whose key no nearer level has a version of (shadows
    -- gains one level's condition each time round). Up to `levels` (4) levels below the
    -- timeline itself, as INDEX_LEVELS in index-versions.mjs.
    SELECT string_agg('x.' || quote_ident(a.attname),',' ORDER BY a.attnum) INTO names FROM pg_attribute a
    WHERE a.attrelid=live::regclass AND a.attnum>0 AND NOT a.attisdropped;
    SELECT string_agg(format('v.%1$I=x.%1$I',x),' AND ') INTO eq FROM unnest(keys) x;
    body:=format('SELECT %s FROM %I x WHERE from_level<=1 AND x.timeline_id=tids[1] AND NOT x.hidden', names, live);
    shadows:=format('(from_level>1 OR NOT EXISTS(SELECT 1 FROM %I v WHERE v.timeline_id=tids[1] AND %s))', live, eq);
    FOR k IN 2..levels+1 LOOP
      seen:=format('cardinality(tids)>=%1$s AND from_level<=%1$s AND x.timeline_id=tids[%1$s]
        AND coalesce(x.since,0)<=clocks[%1$s]', k);
      body:=body || format(E'\n  UNION ALL SELECT %s FROM %I x WHERE %s AND NOT x.hidden AND %s',
        names, live, seen, shadows);
      body:=body || format(E'\n  UNION ALL SELECT %s FROM %I x WHERE %s AND x.until>clocks[%s]
        AND x.hidden IS NOT TRUE AND %s', names, live || '_retired', seen, k, shadows);
      seen:=format('v.timeline_id=tids[%1$s] AND %2$s AND coalesce(v.since,0)<=clocks[%1$s]', k, eq);
      shadows:=shadows || format(' AND (from_level>%s OR (NOT EXISTS(SELECT 1 FROM %I v WHERE %s)
        AND NOT EXISTS(SELECT 1 FROM %I v WHERE %s AND v.until>clocks[%s])))',
        k, live, seen, live || '_retired', seen, k);
    END LOOP;
    -- A version with another signature, replaced.
    EXECUTE format('DROP FUNCTION IF EXISTS %I(uuid,integer,integer)', live || '_at');
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I(tids uuid[], clocks bigint[], from_level integer DEFAULT 1)
      RETURNS SETOF %I LANGUAGE sql STABLE AS $b$%s$b$$f$, live || '_at', live, body);
  END LOOP;
END $do$;
-- What forks no longer read goes (#145, phase 3), when a timeline stops reading through to
-- levels `bases` at `clocks` (deleted, saved whole, compacted; a null clock: all of them).
-- Every version a level retires is one its highest pin then reads, so versions are only
-- left unread when pins go. For each level: its pins are recomputed from the lineages that
-- remain, its highest kept as index_pinned (what its saves keep from now on), and its
-- retired versions no pin falls in go; a deleted level also loses the rows no pin sees,
-- all of them once nothing reads it. A deleted timeline is released as one at no clock.
-- Callers: store.mjs (a fork's index rewritten whole, compacted, or levels it read copied
-- into its own rows), releaseIndexes in migrate.mjs, and the oc_index_release trigger. Takes
-- each level's advisory lock and its timeline row's lock until the transaction ends.
-- An earlier signature.
DROP FUNCTION IF EXISTS oc_release_index(uuid[]);
CREATE OR REPLACE FUNCTION oc_release_index(bases uuid[], clocks bigint[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE b uuid; released bigint; alive boolean; pins bigint[]; live text;
BEGIN
  -- In ID order, so releases of several levels do not deadlock. Each level once, with its
  -- lowest released clock (NULL, every clock, if any is NULL).
  FOR b,released IN SELECT x.b,CASE WHEN bool_or(x.c IS NULL) THEN NULL ELSE min(x.c) END
    FROM unnest(bases,clocks) x(b,c) WHERE x.b IS NOT NULL GROUP BY x.b ORDER BY x.b LOOP
    -- Releases of one timeline wait for each other, so each sees what the other deleted;
    -- a live one is locked too, as forking it does, so no pin is added meanwhile.
    PERFORM pg_advisory_xact_lock(hashtextextended('oc_release_index:' || b::text,0));
    PERFORM 1 FROM oc_timelines WHERE id=b FOR UPDATE;
    alive:=FOUND;
    -- The clocks the remaining lineages read this level at, ascending: its pins.
    pins:=ARRAY(SELECT DISTINCT t.index_clocks[k] FROM oc_timelines t,generate_subscripts(t.index_bases,1) k
      WHERE t.index_bases<>'{}' AND t.index_bases @> ARRAY[b] AND t.index_bases[k]=b ORDER BY 1);
    -- A live level's saves retire only what its highest remaining pin can see.
    IF alive THEN
      UPDATE oc_timelines SET index_pinned=pins[cardinality(pins)]
      WHERE id=b AND index_pinned IS DISTINCT FROM pins[cardinality(pins)];
    END IF;
    FOREACH live IN ARRAY ARRAY['oc_moments','oc_nodes','oc_duration_nodes','oc_edge_nodes',
      'oc_relationships','oc_entity_search'] LOOP
      -- Only versions the released clock saw can have lost their last reader.
      EXECUTE format('DELETE FROM %I r WHERE r.timeline_id=$1 AND ($2::bigint IS NULL
        OR (r.until>$2 AND coalesce(r.since,0)<=$2))
        AND NOT EXISTS(SELECT 1 FROM unnest($3::bigint[]) c WHERE coalesce(r.since,0)<=c AND r.until>c)',
        live || '_retired') USING b,released,pins;
      -- A deleted level: its live rows no pin sees (written after the highest pin) go; all of
      -- them when no pin remains.
      IF NOT alive THEN
        EXECUTE format('DELETE FROM %I l WHERE l.timeline_id=$1 AND coalesce(l.since,0)>coalesce($2,-1)', live)
          USING b,pins[cardinality(pins)];
      END IF;
    END LOOP;
  END LOOP;
END $$;
-- AFTER DELETE on oc_timelines: releases the deleted timeline itself at no clock, and the
-- levels it read through to at the clocks it read them.
CREATE OR REPLACE FUNCTION oc_timeline_index_release() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM oc_release_index(array_prepend(OLD.id,OLD.index_bases),array_prepend(NULL::bigint,OLD.index_clocks));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS oc_index_release ON oc_timelines;
CREATE TRIGGER oc_index_release AFTER DELETE ON oc_timelines
FOR EACH ROW EXECUTE FUNCTION oc_timeline_index_release();

-- The walks of a fork (_lineage variants, generated from the originals so each summary
-- algorithm has one definition). A node is looked up level by level, its own rows first:
-- a node a fork changed is its own and so are its ancestors (PersistentTree writes the
-- whole path), and a moment a fork changed is in a node of its own; so each step down
-- starts at the level its parent was found at, and usually finds it there with one lookup.
-- Within a level it tries the version (live or retired) its parent had first. The stack
-- keeps each entry's level above bit 56 and that choice in bit 55.
--
-- oc_rewrite: replace() that raises when `original` is absent, so a generated walk fails the
-- migration loudly when an original's text changes and a rewrite no longer applies. Replaces
-- every occurrence, comments in the original's body included, so those must not repeat the
-- code the rewrites below look for.
CREATE OR REPLACE FUNCTION oc_rewrite(source text, original text, replacement text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF strpos(source,original)=0 THEN RAISE EXCEPTION 'Cannot generate a fork walk: % not found', original; END IF;
  RETURN replace(source,original,replacement);
END $$;
-- A lookup of `cols` INTO `target` from table `tbl` (as `alias`) by ID `key`, starting at
-- level `hint` (variable `lv` ends at the level found) and with the retired version first
-- when `first_retired` (variable `retired` tells which it was).
-- Returns PL/pgSQL text: try the version asked for at the hint level, then the other one
-- there, then each deeper level, live row before retired. Level 1 (the fork itself) has only
-- live rows. FOUND is false after the text when no level has the row.
CREATE OR REPLACE FUNCTION oc_lineage_lookup(cols text, target text, tbl text, alias text, key text,
  hint text, lv text, retired text, first_retired text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
SELECT format($b$%3$s:=%4$s; %5$s:=%6$s AND %3$s>1;
    IF %5$s THEN %2$s ELSE %1$s END IF;
    IF NOT FOUND THEN LOOP
      IF %3$s>1 THEN
        IF %5$s THEN %1$s %5$s:=false; ELSE %2$s %5$s:=FOUND; END IF;
        EXIT WHEN FOUND;
      END IF;
      %3$s:=%3$s+1; %5$s:=false;
      EXIT WHEN %3$s>cardinality(tids);
      %1$s
      EXIT WHEN FOUND;
    END LOOP; END IF;$b$,
  -- In key order, so the key's index is used even before statistics count the timeline.
  format('SELECT %s INTO %s FROM %I %s WHERE %s.timeline_id=tids[%s] AND %s.id=%s AND coalesce(%s.since,0)<=clocks[%s] ORDER BY %s.timeline_id,%s.id LIMIT 1;',
    cols, target, tbl, alias, alias, lv, alias, key, alias, lv, alias, alias),
  format('SELECT %s INTO %s FROM %I %s WHERE %s.timeline_id=tids[%s] AND %s.id=%s AND coalesce(%s.since,0)<=clocks[%s] AND %s.until>clocks[%s] ORDER BY %s.timeline_id,%s.id,%s.until LIMIT 1;',
    cols, target, tbl || '_retired', alias, alias, lv, alias, key, alias, lv, alias, lv, alias, alias, alias),
  lv, hint, retired, first_retired)
$$;
DO $do$
DECLARE src text; lineage text; levels text; pack text;
BEGIN
  -- The fork's levels: itself (current rows) and what it reads through to. Level 1 is read
  -- at the largest clock, so every live row of the fork's own counts.
  lineage:='array_prepend(id,index_bases),array_prepend(9223372036854775807,index_clocks)';
  -- Variables each walk gains: its levels, the level a lookup ended at (lv), the level and
  -- version its parent was found at (hint, hint_retired), and which one it found.
  levels:='tids uuid[]; clocks bigint[]; lv integer; hint integer; found_retired boolean; hint_retired boolean; other_retired boolean; ';
  -- A stack entry carries its node's level above bit 56 and its version in bit 55; node IDs
  -- stay below 2^55, and 36028797018963967 (2^55 - 1) masks them back out.
  pack:='+(lv::bigint<<56)+(found_retired::integer::bigint<<55)';

  -- oc_overview_lineage: the root starts at level 1; each node is looked up from its parent's
  -- level and version; a singleton group's node and then its moment are looked up from the
  -- level the group's first node was found at.
  src:=pg_get_functiondef('oc_overview_v2(uuid,mpq,mpq,mpq)'::regprocedure);
  src:=oc_rewrite(src,'oc_overview_v2(','oc_overview_lineage(');
  src:=oc_rewrite(src,'DECLARE ids bigint[];','DECLARE ' || levels || 'sample_lv integer; current_lv integer; first_moment text; ids bigint[];');
  src:=oc_rewrite(src,'SELECT ARRAY[root] INTO ids FROM oc_timelines WHERE id=tid AND root IS NOT NULL;',
    'SELECT ARRAY[root+(1::bigint<<56)],' || lineage || ' INTO ids,tids,clocks FROM oc_timelines WHERE id=tid AND root IS NOT NULL;');
  src:=oc_rewrite(src,'nid:=ids[idx]; point:=points[idx];',
    'nid:=ids[idx]&36028797018963967; hint:=ids[idx]>>56; hint_retired:=(ids[idx]>>55)&1=1; point:=points[idx];');
  src:=oc_rewrite(src,'SELECT node.time,node.left_id,node.right_id,node.first_id,node.first_time,node.last_time,node.bucket_count,node.event_count,node.distinct_count INTO n FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=nid;',
    oc_lineage_lookup('node.time,node.left_id,node.right_id,node.first_id,node.first_time,node.last_time,node.bucket_count,node.event_count,node.distinct_count',
      'n','oc_nodes','node','nid','hint','lv','found_retired','hint_retired'));
  src:=oc_rewrite(src,'current_id:=CASE WHEN point THEN nid ELSE n.first_id END;',
    'current_id:=CASE WHEN point THEN nid ELSE n.first_id END; current_lv:=lv;');
  src:=oc_rewrite(src,'SELECT m.event INTO sample FROM oc_moments m WHERE m.timeline_id=tid AND m.id=(SELECT node.moment_ids[1] FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=current_id);',
    oc_lineage_lookup('node.moment_ids[1]','first_moment','oc_nodes','node','current_id','current_lv','sample_lv','other_retired','false')
    || oc_lineage_lookup('m.event','sample','oc_moments','m','first_moment','sample_lv','sample_lv','other_retired','false'));
  src:=oc_rewrite(src,'ids:=array_append(ids,n.right_id);','ids:=array_append(ids,n.right_id' || pack || ');');
  src:=oc_rewrite(src,'ids:=array_append(ids,nid);','ids:=array_append(ids,nid' || pack || ');');
  src:=oc_rewrite(src,'ids:=array_append(ids,n.left_id);','ids:=array_append(ids,n.left_id' || pack || ');');
  EXECUTE src;

  -- oc_events_lineage: nodes as above; a node's moments are looked up from its level.
  src:=pg_get_functiondef('oc_events(uuid,mpq,mpq,mpq,text,integer)'::regprocedure);
  src:=oc_rewrite(src,'oc_events(','oc_events_lineage(');
  src:=oc_rewrite(src,'DECLARE ids bigint[];','DECLARE ' || levels || 'moment_lv integer; ids bigint[];');
  src:=oc_rewrite(src,'SELECT ARRAY[root] INTO ids FROM oc_timelines WHERE id=tid AND root IS NOT NULL;',
    'SELECT ARRAY[root+(1::bigint<<56)],' || lineage || ' INTO ids,tids,clocks FROM oc_timelines WHERE id=tid AND root IS NOT NULL;');
  src:=oc_rewrite(src,'nid:=ids[idx]; point:=points[idx];',
    'nid:=ids[idx]&36028797018963967; hint:=ids[idx]>>56; hint_retired:=(ids[idx]>>55)&1=1; point:=points[idx];');
  src:=oc_rewrite(src,'SELECT node.time,node.left_id,node.right_id,node.first_time,node.last_time,node.moment_ids INTO n FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=nid;',
    oc_lineage_lookup('node.time,node.left_id,node.right_id,node.first_time,node.last_time,node.moment_ids',
      'n','oc_nodes','node','nid','hint','lv','found_retired','hint_retired'));
  src:=oc_rewrite(src,'SELECT m.event INTO e FROM oc_moments m WHERE m.timeline_id=tid AND m.id=mid;',
    oc_lineage_lookup('m.event','e','oc_moments','m','mid','lv','moment_lv','other_retired','false'));
  src:=oc_rewrite(src,'ids:=array_append(ids,n.right_id);','ids:=array_append(ids,n.right_id' || pack || ');');
  src:=oc_rewrite(src,'ids:=array_append(ids,nid);','ids:=array_append(ids,nid' || pack || ');');
  src:=oc_rewrite(src,'ids:=array_append(ids,n.left_id);','ids:=array_append(ids,n.left_id' || pack || ');');
  EXECUTE src;

  -- oc_duration_overview_lineage: the stack becomes bigint to carry levels; the ancestor
  -- bounds of a range scan are looked up from level 1.
  src:=pg_get_functiondef('oc_duration_overview(uuid,mpq,mpq,mpq)'::regprocedure);
  src:=oc_rewrite(src,'oc_duration_overview(','oc_duration_overview_lineage(');
  src:=oc_rewrite(src,'DECLARE ids integer[];','DECLARE ' || levels || 'bound_lv integer; code bigint; ids bigint[];');
  src:=oc_rewrite(src,'SELECT CASE WHEN duration_root IS NULL THEN ARRAY[]::integer[] ELSE ARRAY[duration_root] END INTO ids FROM oc_timelines WHERE id=tid;',
    'SELECT CASE WHEN duration_root IS NULL THEN ARRAY[]::bigint[] ELSE ARRAY[duration_root+(1::bigint<<56)] END,' || lineage || ' INTO ids,tids,clocks FROM oc_timelines WHERE id=tid;');
  src:=oc_rewrite(src,'ids:=coalesce(ids,ARRAY[]::integer[]);','ids:=coalesce(ids,ARRAY[]::bigint[]);');
  -- A subtree found at a level holds rows of that level and deeper ones only. One found at
  -- the deepest level is read by one range scan of that level's rows at its clock; so is a
  -- fork's own subtree when it reads through one level (with that level's rows it has no
  -- version of). Others (deeper lineages) are walked node by node.
  src:=oc_rewrite(src,'ELSIF n.max_extent>=threshold AND n.subtree_count<=256 THEN',
    'ELSIF n.max_extent>=threshold AND n.subtree_count<=256 AND (lv=cardinality(tids) OR cardinality(tids)=2) THEN');
  src:=oc_rewrite(src,E'FROM oc_duration_nodes d WHERE d.timeline_id=tid\n',
    E'FROM (SELECT x.first_key,x.first_time,x.last_time,x.band FROM oc_duration_nodes x WHERE lv=1 AND x.timeline_id=tids[1] AND NOT x.hidden\n'
    || E'          UNION ALL SELECT x.first_key,x.first_time,x.last_time,x.band FROM oc_duration_nodes x\n'
    || E'          WHERE x.timeline_id=tids[greatest(lv,2)] AND coalesce(x.since,0)<=clocks[greatest(lv,2)] AND NOT x.hidden\n'
    || E'          AND (lv>1 OR NOT EXISTS(SELECT 1 FROM oc_duration_nodes v WHERE v.timeline_id=tids[1] AND v.id=x.id))\n'
    || E'          UNION ALL SELECT x.first_key,x.first_time,x.last_time,x.band FROM oc_duration_nodes_retired x\n'
    || E'          WHERE x.timeline_id=tids[greatest(lv,2)] AND coalesce(x.since,0)<=clocks[greatest(lv,2)] AND x.until>clocks[greatest(lv,2)]\n'
    || E'          AND x.hidden IS NOT TRUE AND (lv>1 OR NOT EXISTS(SELECT 1 FROM oc_duration_nodes v WHERE v.timeline_id=tids[1] AND v.id=x.id))) d WHERE true\n');
  -- Unpack each entry; look nodes up from their parent's level and version.
  src:=oc_rewrite(src,'nid:=ids[idx];',
    'code:=ids[idx]; nid:=code&36028797018963967; hint:=code>>56; hint_retired:=(code>>55)&1=1;');
  src:=oc_rewrite(src,'SELECT d.left_id,d.right_id,d.min_time,d.max_time,d.max_first,d.subtree_count,d.min_extent,d.max_extent,d.first_time,d.last_time,d.band INTO n FROM oc_duration_nodes d WHERE d.timeline_id=tid AND d.id=nid;',
    oc_lineage_lookup('d.left_id,d.right_id,d.min_time,d.max_time,d.max_first,d.subtree_count,d.min_extent,d.max_extent,d.first_time,d.last_time,d.band',
      'n','oc_duration_nodes','d','nid','hint','lv','found_retired','hint_retired'));
  src:=oc_rewrite(src,'SELECT d.first_time,d.band->>''id'' INTO low_first,low_id FROM oc_duration_nodes d WHERE d.timeline_id=tid AND d.id=low;',
    oc_lineage_lookup('d.first_time,d.band->>''id''','low_first,low_id','oc_duration_nodes','d','low','1','bound_lv','other_retired','false'));
  src:=oc_rewrite(src,'SELECT d.first_time,d.band->>''id'' INTO high_first,high_id FROM oc_duration_nodes d WHERE d.timeline_id=tid AND d.id=high;',
    oc_lineage_lookup('d.first_time,d.band->>''id''','high_first,high_id','oc_duration_nodes','d','high','1','bound_lv','other_retired','false'));
  src:=oc_rewrite(src,'ids:=ids||n.right_id;','ids:=ids||(n.right_id' || pack || ');');
  src:=oc_rewrite(src,'ids:=ids||nid;','ids:=ids||(nid' || pack || ');');
  src:=oc_rewrite(src,'ids:=ids||n.left_id;','ids:=ids||(n.left_id' || pack || ');');
  EXECUTE src;

  -- oc_recent_times_lineage: its stack holds plain node IDs, so each lookup starts at level 1.
  src:=pg_get_functiondef('oc_recent_times(uuid,boolean)'::regprocedure);
  src:=oc_rewrite(src,'oc_recent_times(','oc_recent_times_lineage(');
  src:=oc_rewrite(src,'DECLARE stack bigint[]','DECLARE ' || levels || 'stack bigint[]');
  src:=oc_rewrite(src,'SELECT root INTO nid FROM oc_timelines WHERE id=tid;',
    'SELECT root,' || lineage || ' INTO nid,tids,clocks FROM oc_timelines WHERE id=tid;');
  src:=oc_rewrite(src,'SELECT node.left_id,node.right_id INTO n FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=nid;',
    oc_lineage_lookup('node.left_id,node.right_id','n','oc_nodes','node','nid','1','lv','found_retired','false'));
  src:=oc_rewrite(src,'SELECT node.time,node.left_id,node.right_id INTO n FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=nid;',
    oc_lineage_lookup('node.time,node.left_id,node.right_id','n','oc_nodes','node','nid','1','lv','found_retired','false'));
  EXECUTE src;

  -- oc_event_text_lineage: durations come from oc_duration_nodes_at for the fork's levels.
  src:=pg_get_functiondef('oc_event_text(uuid)'::regprocedure);
  src:=oc_rewrite(src,'oc_event_text(','oc_event_text_lineage(');
  -- Planned for the timeline's own levels: plans for any timeline can only guess at them.
  -- Its moments come from oc_events, which reads through for forks itself.
  src:=oc_rewrite(src,'LANGUAGE plpgsql','LANGUAGE plpgsql SET plan_cache_mode=force_custom_plan');
  src:=oc_rewrite(src,'DECLARE parts','DECLARE tids uuid[]; clocks bigint[]; parts');
  src:=oc_rewrite(src,E'after_id text;\nBEGIN\n',E'after_id text;\nBEGIN\n  SELECT ' || lineage || E' INTO tids,clocks FROM oc_timelines WHERE id=tid;\n');
  src:=oc_rewrite(src,'FROM oc_duration_nodes d CROSS JOIN','FROM oc_duration_nodes_at(tids,clocks) d CROSS JOIN');
  src:=oc_rewrite(src,'WHERE d.timeline_id=tid AND x.v IS NOT NULL','WHERE x.v IS NOT NULL');
  EXECUTE src;
  -- Reading through levels looks costly enough to the planner to compile its queries, which
  -- takes far longer than running them. Their plans are kept per connection: one made while a
  -- level's retired versions were few would scan them whole, and keep doing so as they grow
  -- until statistics catch up; every lookup they make has an index to use.
  FOR src IN SELECT p.oid::regprocedure::text FROM pg_proc p WHERE p.proname IN ('oc_overview_lineage',
    'oc_events_lineage','oc_duration_overview_lineage','oc_recent_times_lineage','oc_event_text_lineage') LOOP
    EXECUTE format('ALTER FUNCTION %s SET jit=off SET enable_seqscan=off', src);
  END LOOP;

  -- The originals hand forks to their variants (views, generated above, never read through):
  -- a first statement, inserted after the first line reading BEGIN, that returns the variant's
  -- result for a timeline whose index_bases is not empty.
  src:=pg_get_functiondef('oc_overview_v2(uuid,mpq,mpq,mpq)'::regprocedure);
  EXECUTE regexp_replace(src,E'\nBEGIN\n',E'\nBEGIN\n  IF EXISTS(SELECT 1 FROM oc_timelines WHERE id=tid AND index_bases<>''{}'') THEN RETURN QUERY SELECT * FROM oc_overview_lineage(tid,lo,hi,threshold); RETURN; END IF;\n');
  src:=pg_get_functiondef('oc_events(uuid,mpq,mpq,mpq,text,integer)'::regprocedure);
  EXECUTE regexp_replace(src,E'\nBEGIN\n',E'\nBEGIN\n  IF EXISTS(SELECT 1 FROM oc_timelines WHERE id=tid AND index_bases<>''{}'') THEN RETURN QUERY SELECT * FROM oc_events_lineage(tid,lo,hi,after_time,after_id,max_rows); RETURN; END IF;\n');
  src:=pg_get_functiondef('oc_duration_overview(uuid,mpq,mpq,mpq)'::regprocedure);
  EXECUTE regexp_replace(src,E'\nBEGIN\n',E'\nBEGIN\n  IF EXISTS(SELECT 1 FROM oc_timelines WHERE id=tid AND index_bases<>''{}'') THEN RETURN QUERY SELECT * FROM oc_duration_overview_lineage(tid,lo,hi,threshold); RETURN; END IF;\n');
  src:=pg_get_functiondef('oc_recent_times(uuid,boolean)'::regprocedure);
  EXECUTE regexp_replace(src,E'\nBEGIN\n',E'\nBEGIN\n  IF EXISTS(SELECT 1 FROM oc_timelines WHERE id=tid AND index_bases<>''{}'') THEN RETURN QUERY SELECT * FROM oc_recent_times_lineage(tid,oldest); RETURN; END IF;\n');
  src:=pg_get_functiondef('oc_event_text(uuid)'::regprocedure);
  EXECUTE regexp_replace(src,E'\nBEGIN\n',E'\nBEGIN\n  IF EXISTS(SELECT 1 FROM oc_timelines WHERE id=tid AND index_bases<>''{}'') THEN RETURN oc_event_text_lineage(tid); END IF;\n');
END $do$;

-- Optional saved history (#136). A timeline that does not keep saved history (keep_history
-- false) records each save's revision (author, time, parents) without its content, and is
-- charged nothing for it; its head is read from its live index. Turning it off forgets the
-- content of its past revisions, apart from those forks, copies and pull requests still
-- read: the one change a revision allows (oc_revision_forget), which also refunds what it
-- was charged.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS keep_history boolean NOT NULL DEFAULT true;
-- Trigger function replacing oc_immutable_revision on oc_revisions: an UPDATE must clear every
-- content column (snapshot_id, patch, history_rows, stored_bytes) and change nothing else.
CREATE OR REPLACE FUNCTION oc_revision_forget() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE content text[]:=ARRAY['snapshot_id','patch','history_rows','stored_bytes'];
BEGIN
  IF NEW.snapshot_id IS NULL AND NEW.patch IS NULL AND NOT NEW.history_rows AND NEW.stored_bytes IS NULL
    AND to_jsonb(NEW)-content=to_jsonb(OLD)-content THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Saved history is immutable';
END $$;
DROP TRIGGER IF EXISTS oc_revision_immutable ON oc_revisions;
CREATE TRIGGER oc_revision_immutable BEFORE UPDATE ON oc_revisions FOR EACH ROW EXECUTE FUNCTION oc_revision_forget();
-- Charges, and refunds, revisions whose content columns change too.
DROP TRIGGER IF EXISTS oc_track_storage ON oc_revisions;
CREATE TRIGGER oc_track_storage AFTER INSERT OR UPDATE OF snapshot_id,patch,history_rows,stored_bytes OR DELETE
  ON oc_revisions FOR EACH ROW EXECUTE FUNCTION oc_track_storage();

-- Maintenance of the large tables (#135). Autovacuum's defaults wait for 20% of a table to
-- change, or 20% more rows (10% changes for statistics): at hundreds of millions of rows
-- that is far too late for vacuums to stay short and for the planner's statistics to hold.
-- About 1-2% instead keeps each run small; vacuum skips the pages nothing changed, so
-- running more often costs small installations next to nothing. Each is set only on a table
-- without a value of its own, so an administrator's tuning stays, and setting none takes no
-- lock (autovacuum's own runs conflict with it).
DO $do$
DECLARE big text; current text[]; wanted text; missing text[];
BEGIN
  FOREACH big IN ARRAY ARRAY['oc_moments','oc_nodes','oc_duration_nodes','oc_edge_nodes',
    'oc_relationships','oc_entity_search','oc_moments_retired','oc_nodes_retired',
    'oc_duration_nodes_retired','oc_edge_nodes_retired','oc_relationships_retired',
    'oc_entity_search_retired','oc_history_moments','oc_history_durations',
    'oc_history_relationships','oc_history_moment_overrides','oc_history_duration_overrides',
    'oc_history_relationship_overrides'] LOOP
    SELECT coalesce(reloptions,'{}') INTO current FROM pg_class WHERE oid=big::regclass;
    missing:='{}';
    FOREACH wanted IN ARRAY ARRAY['autovacuum_vacuum_scale_factor=0.02',
      'autovacuum_vacuum_insert_scale_factor=0.02','autovacuum_analyze_scale_factor=0.01'] LOOP
      IF NOT EXISTS(SELECT 1 FROM unnest(current) o WHERE split_part(o,'=',1)=split_part(wanted,'=',1)) THEN
        missing:=missing||wanted;
      END IF;
    END LOOP;
    IF cardinality(missing)>0 THEN
      EXECUTE format('ALTER TABLE %I SET (%s)',big,array_to_string(missing,','));
    END IF;
  END LOOP;
END $do$;
-- Reports and moderation decisions (#115; server/moderation.mjs). A case is one reported
-- thing (a timeline, comment, library plugin or suite, or account) and the reports about it;
-- reports of a moment or duration belong to its timeline's case and say which. At most one
-- case per thing is open or restricted (oc_moderation_cases_current); a decision closes an
-- open case, and a restriction stays in force until lifted. (A labelled case, below, is in
-- force but settled: a new report opens another case.) Targets are named as text (a timeline
-- or account UUID, a comment's number, a plugin or suite id), so a case outlives what it
-- names, as a record of what was decided.
CREATE TABLE IF NOT EXISTS oc_moderation_cases (
  id uuid PRIMARY KEY,
  target_kind text NOT NULL CHECK(target_kind IN ('timeline','comment','plugin','suite','user')),
  target_id text NOT NULL,
  -- The account answerable for the target, told of decisions and able to appeal them.
  owner_id uuid REFERENCES oc_users ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','dismissed','restricted','lifted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The statement of reasons given to the owner, and who decided.
  reason text CHECK(char_length(reason)<=2000),
  decided_by uuid REFERENCES oc_users ON DELETE SET NULL,
  decided_at timestamptz,
  -- A restricted timeline's visibility before, restored when the restriction is lifted.
  previous_visibility text,
  -- The owner's one request for review, and its outcome.
  appeal text CHECK(char_length(appeal)<=2000),
  appealed_at timestamptz,
  appeal_outcome text CHECK(appeal_outcome IN ('upheld','lifted')),
  appeal_decided_at timestamptz
);
-- The case in progress for a target, which new reports join; the unique index refuses a
-- second (moderation.mjs serializes reports of one target with an advisory lock).
CREATE UNIQUE INDEX IF NOT EXISTS oc_moderation_cases_current ON oc_moderation_cases(target_kind,target_id)
  WHERE status IN ('open','restricted');
-- Decisions on an owner's things, latest first (moderation.mjs mine).
CREATE INDEX IF NOT EXISTS oc_moderation_cases_owner ON oc_moderation_cases(owner_id,decided_at);
-- One report: its category, details, reporter and, within a timeline, the entity reported.
CREATE TABLE IF NOT EXISTS oc_reports (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES oc_moderation_cases ON DELETE CASCADE,
  category text NOT NULL CHECK(category IN ('child_abuse','illegal','sexual','violence',
    'self_harm','harassment','spam','copyright','other')),
  details text NOT NULL DEFAULT '' CHECK(char_length(details)<=2000),
  -- Within a timeline, the moment or duration reported.
  entity_kind text CHECK(entity_kind IN ('moment','duration')),
  entity_id text CHECK(entity_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  -- Null for a reader who was not signed in.
  reporter_id uuid REFERENCES oc_users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((entity_kind IS NULL)=(entity_id IS NULL))
);
-- A case's reports in order, and counting them, in the moderation queue.
CREATE INDEX IF NOT EXISTS oc_reports_case ON oc_reports(case_id,created_at);
-- A signed-in reader reports a thing once per case; reporting again replaces their report.
CREATE UNIQUE INDEX IF NOT EXISTS oc_reports_reporter ON oc_reports(case_id,reporter_id,coalesce(entity_kind,''),coalesce(entity_id,''))
  WHERE reporter_id IS NOT NULL;
-- Account standing and timeline popularity (#103; server/standing.mjs), recomputed from
-- stars, forks, account age and confirmation, and moderation. Kept apart from the accounts
-- and timelines they rank, so recomputing them never rewrites (or notifies about) those rows.
-- An administrator's override: 'trusted' accounts have full standing, 'untrusted' none.
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS trust text CHECK(trust IN ('trusted','untrusted'));
-- Written by standing.mjs (on stars, and by a sweep every quarter hour); read by
-- searchTimelines to rank and to choose what browsing lists.
CREATE TABLE IF NOT EXISTS oc_account_standing (
  user_id uuid PRIMARY KEY REFERENCES oc_users ON DELETE CASCADE,
  -- 0 for an account not (yet) established; up to 1.
  standing real NOT NULL CHECK(standing>=0 AND standing<=1),
  -- Endorsing accounts that starred or publicly forked its public timelines.
  endorsers integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Likewise per timeline.
CREATE TABLE IF NOT EXISTS oc_timeline_popularity (
  timeline_id uuid PRIMARY KEY REFERENCES oc_timelines ON DELETE CASCADE,
  -- The standing of the accounts that starred or publicly forked it; trending, of those that
  -- did within the last 30 days.
  popularity real NOT NULL DEFAULT 0,
  trending real NOT NULL DEFAULT 0
);
-- Sensitive-content labels (#115; CONTENT_LABELS in src/core.ts): what its owner marks a
-- timeline as containing, and what moderators add, which its owner cannot remove. Readers
-- are warned before it opens and its images stay blurred until they choose to see them.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS content_labels text[] NOT NULL DEFAULT '{}';
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS moderator_labels text[] NOT NULL DEFAULT '{}';
-- Only labels CONTENT_LABELS knows; dropped and re-added so the list can change.
ALTER TABLE oc_timelines DROP CONSTRAINT IF EXISTS oc_timelines_content_labels;
ALTER TABLE oc_timelines ADD CONSTRAINT oc_timelines_content_labels CHECK(
  content_labels <@ ARRAY['nudity','violence','disturbing']
  AND moderator_labels <@ ARRAY['nudity','violence','disturbing']);
-- A report may be settled by labelling what was reported: the labels moderators added.
ALTER TABLE oc_moderation_cases ADD COLUMN IF NOT EXISTS labels text[];
-- 'labelled' (settled by labelling) joins the statuses; dropped and re-added with the list.
ALTER TABLE oc_moderation_cases DROP CONSTRAINT IF EXISTS oc_moderation_cases_status_check;
ALTER TABLE oc_moderation_cases ADD CONSTRAINT oc_moderation_cases_status_check
  CHECK(status IN ('open','dismissed','restricted','lifted','labelled'));
-- Accounts are for people 13 and older (#115): the year of birth given at sign-up (null for
-- accounts made before it was asked, under terms requiring 18). Accounts that may be under 18
-- see labelled content behind its warning, always; adults may choose to see it without.
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS birth_year smallint CHECK(birth_year BETWEEN 1900 AND 2200);
ALTER TABLE oc_registrations ADD COLUMN IF NOT EXISTS birth_year smallint CHECK(birth_year BETWEEN 1900 AND 2200);
-- show_sensitive: an adult's choice to see labelled content without its warning.
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS show_sensitive boolean NOT NULL DEFAULT false;
-- A browser refused an account for its age (#166): asked again within a day, it is refused
-- again, so a child cannot simply go back and give another year (the FTC's guidance on
-- neutral age screens). Keyed by a hash of the browser's sign-in nonce.
CREATE TABLE IF NOT EXISTS oc_age_refusals (
  browser_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
-- Timeline addresses (#148; src/addresses.ts): `/<owner>/<slug>`, unique among its owner's
-- timelines. Without one, a timeline is at `/<owner>/<id>`.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS slug text;
-- Lower-case letters, digits, _ and -, starting with a letter or digit, and never shaped like
-- a UUID, so /<owner>/<id> stays unambiguous; dropped and re-added so it can change.
ALTER TABLE oc_timelines DROP CONSTRAINT IF EXISTS oc_timelines_slug;
ALTER TABLE oc_timelines ADD CONSTRAINT oc_timelines_slug CHECK(
  slug ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  AND slug !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$');
-- One slug per owner, and finding a timeline by owner and slug (store.mjs); partial: most
-- timelines have none.
CREATE UNIQUE INDEX IF NOT EXISTS oc_timelines_owner_slug ON oc_timelines(owner_id,slug)
  WHERE slug IS NOT NULL;
-- Slugs a timeline had before: their addresses lead to it until another of its owner's
-- timelines takes them.
CREATE TABLE IF NOT EXISTS oc_timeline_former_slugs (
  owner_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  slug text NOT NULL,
  timeline_id uuid NOT NULL REFERENCES oc_timelines ON DELETE CASCADE,
  PRIMARY KEY(owner_id,slug)
);
-- A timeline's former slugs, found when it is deleted (the cascade).
CREATE INDEX IF NOT EXISTS oc_timeline_former_slugs_timeline ON oc_timeline_former_slugs(timeline_id);
