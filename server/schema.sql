-- Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
CREATE EXTENSION IF NOT EXISTS pgmp;
CREATE TABLE IF NOT EXISTS oc_users (
  id uuid PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oc_sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  csrf text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oc_sessions_expiry ON oc_sessions(expires_at);
ALTER TABLE oc_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE oc_sessions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'web' CHECK(kind IN ('web','desktop'));
ALTER TABLE oc_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE oc_sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS oc_sessions_idle ON oc_sessions(last_seen_at);
CREATE TABLE IF NOT EXISTS oc_identities (
  provider text NOT NULL CHECK(provider IN ('google','github','facebook')), subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE, PRIMARY KEY(provider,subject),
  UNIQUE(user_id,provider)
);
CREATE TABLE IF NOT EXISTS oc_oauth_flows (
  state_hash text PRIMARY KEY, browser_hash text NOT NULL, provider text NOT NULL,
  verifier text NOT NULL, nonce text NOT NULL, return_to text NOT NULL,
  link_user uuid REFERENCES oc_users ON DELETE CASCADE, link_session text,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oc_oauth_expiry ON oc_oauth_flows(expires_at);
CREATE TABLE IF NOT EXISTS oc_device_logins (
  device_hash text PRIMARY KEY, user_code text UNIQUE NOT NULL,
  user_id uuid REFERENCES oc_users ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, last_poll_at timestamptz
);
CREATE INDEX IF NOT EXISTS oc_device_expiry ON oc_device_logins(expires_at);
CREATE TABLE IF NOT EXISTS oc_auth_attempts (
  key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oc_attempts_expiry ON oc_auth_attempts(expires_at);
-- Spent human-verification answers (hashed salts), kept until their challenge expires.
CREATE TABLE IF NOT EXISTS oc_challenge_uses (
  id text PRIMARY KEY, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oc_challenge_uses_expiry ON oc_challenge_uses(expires_at);
CREATE TABLE IF NOT EXISTS oc_timelines (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES oc_users,
  title text NOT NULL, description text NOT NULL DEFAULT '', visibility text NOT NULL DEFAULT 'private'
    CHECK(visibility IN ('private','public')),
  revision bigint NOT NULL DEFAULT 1, root bigint, event_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oc_timelines_owner ON oc_timelines(owner_id);
-- Idempotent upgrade for existing installations; NULL preserves older documents.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS presentation jsonb;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS plugins jsonb;
CREATE TABLE IF NOT EXISTS oc_members (
  timeline_id uuid NOT NULL REFERENCES oc_timelines ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('viewer','editor')), PRIMARY KEY(timeline_id,user_id)
);
-- Only small IDs are B-tree keys. Arbitrarily large mpq values remain payloads.
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
CREATE TABLE IF NOT EXISTS oc_moments (
  timeline_id uuid NOT NULL REFERENCES oc_timelines ON DELETE CASCADE, id text NOT NULL,
  time mpq NOT NULL, event jsonb NOT NULL, PRIMARY KEY(timeline_id,id)
);
ALTER TABLE oc_nodes ADD COLUMN IF NOT EXISTS moment_ids text[];
ALTER TABLE oc_nodes ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE oc_nodes ALTER COLUMN events DROP NOT NULL;
-- Older installations kept whole moments inside nodes; move them out once.
INSERT INTO oc_moments(timeline_id,id,time,event)
SELECT n.timeline_id,e->>'id',n.time,e FROM oc_nodes n CROSS JOIN LATERAL jsonb_array_elements(n.events) e
WHERE n.events IS NOT NULL ON CONFLICT DO NOTHING;
UPDATE oc_nodes SET moment_ids=ARRAY(SELECT x.e->>'id' FROM jsonb_array_elements(events) WITH ORDINALITY x(e,o) ORDER BY x.o),
  events=NULL WHERE events IS NOT NULL;
-- 2: AVL trees with heights and stable IDs; migrate.mjs rebuilds older indexes.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS index_version integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION oc_qtext(q mpq) RETURNS text LANGUAGE sql IMMUTABLE STRICT
AS $$ SELECT num(q)::text || '/' || den(q)::text $$;

-- In-order traversal consumes a cached subtree whenever it fits the current span group.
CREATE OR REPLACE FUNCTION oc_overview_v2(tid uuid, lo mpq, hi mpq, threshold mpq)
RETURNS TABLE(first_time text,last_time text,event_count text,distinct_count integer,title text,event_id text,visited_nodes integer,metadata jsonb)
LANGUAGE plpgsql AS $$
DECLARE ids bigint[]; points boolean[] := ARRAY[false]; idx integer; nid bigint; point boolean;
  n record; a mpq; b mpq; weight bigint; distinct_n integer; whole boolean;
  current_a mpq; current_b mpq; current_weight bigint; current_distinct integer; current_id bigint; visits integer:=0;
  sample jsonb;
BEGIN
  IF lo IS NULL OR hi IS NULL OR threshold IS NULL OR threshold<'0'::mpq THEN
    RAISE EXCEPTION 'Overview needs finite bounds and a nonnegative threshold';
  END IF;
  IF lo>hi THEN RETURN; END IF;
  SELECT ARRAY[root] INTO ids FROM oc_timelines WHERE id=tid AND root IS NOT NULL;
  WHILE cardinality(ids)>0 LOOP
    idx:=cardinality(ids); nid:=ids[idx]; point:=points[idx]; ids:=ids[1:idx-1]; points:=points[1:idx-1];
    SELECT node.time,node.left_id,node.right_id,node.first_id,node.first_time,node.last_time,node.bucket_count,node.event_count,node.distinct_count INTO n FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=nid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Broken timeline index'; END IF;
    IF NOT point THEN visits:=visits+1; END IF;
    IF n.last_time<lo OR n.first_time>hi THEN CONTINUE; END IF;
    IF point THEN
      IF n.time<lo OR n.time>hi THEN CONTINUE; END IF;
      a:=n.time; b:=n.time; weight:=n.bucket_count; distinct_n:=1; whole:=true;
    ELSE
      a:=n.first_time; b:=n.last_time; weight:=n.event_count; distinct_n:=n.distinct_count;
      whole:=a>=lo AND b<=hi;
    END IF;
    IF current_a IS NOT NULL AND a-current_a>=threshold THEN
      first_time:=oc_qtext(current_a); last_time:=oc_qtext(current_b); event_count:=current_weight::text;
      distinct_count:=current_distinct; visited_nodes:=visits; title:=NULL; event_id:=NULL; metadata:=NULL;
      IF current_weight=1 THEN
        SELECT m.event INTO sample FROM oc_moments m WHERE m.timeline_id=tid AND m.id=(SELECT node.moment_ids[1] FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=current_id);
        title:=sample->'metadata'->>'title'; event_id:=sample->>'id'; metadata:=sample->'metadata';
      END IF;
      RETURN NEXT; current_a:=NULL;
    END IF;
    IF whole AND (point OR distinct_n=1 OR b-coalesce(current_a,a)<threshold) THEN
      IF current_a IS NULL THEN current_a:=a; current_id:=CASE WHEN point THEN nid ELSE n.first_id END; current_weight:=0; current_distinct:=0; END IF;
      current_b:=b; current_weight:=current_weight+weight; current_distinct:=current_distinct+distinct_n;
    ELSE
      IF n.right_id IS NOT NULL THEN ids:=array_append(ids,n.right_id); points:=array_append(points,false); END IF;
      ids:=array_append(ids,nid); points:=array_append(points,true);
      IF n.left_id IS NOT NULL THEN ids:=array_append(ids,n.left_id); points:=array_append(points,false); END IF;
    END IF;
  END LOOP;
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

-- Keep the original result shape for existing callers and conformance tests.
CREATE OR REPLACE FUNCTION oc_overview(tid uuid, lo mpq, hi mpq, threshold mpq)
RETURNS TABLE(first_time text,last_time text,event_count text,distinct_count integer,title text,event_id text,visited_nodes integer)
LANGUAGE sql AS $$ SELECT g.first_time,g.last_time,g.event_count,g.distinct_count,g.title,g.event_id,g.visited_nodes FROM oc_overview_v2(tid,lo,hi,threshold) g $$;

CREATE OR REPLACE FUNCTION oc_events(tid uuid,lo mpq,hi mpq,after_time mpq,after_id text,max_rows integer)
RETURNS SETOF jsonb LANGUAGE plpgsql AS $$
DECLARE ids bigint[]; points boolean[]:=ARRAY[false]; idx integer; nid bigint; point boolean;
  n record; e jsonb; mid text; emitted integer:=0;
BEGIN
  IF max_rows<1 OR max_rows>200001 THEN RAISE EXCEPTION 'Invalid event page size'; END IF;
  IF lo IS NOT NULL AND hi IS NOT NULL AND lo>hi THEN RETURN; END IF;
  SELECT ARRAY[root] INTO ids FROM oc_timelines WHERE id=tid AND root IS NOT NULL;
  WHILE cardinality(ids)>0 LOOP
    idx:=cardinality(ids); nid:=ids[idx]; point:=points[idx]; ids:=ids[1:idx-1]; points:=points[1:idx-1];
    SELECT node.time,node.left_id,node.right_id,node.first_time,node.last_time,node.moment_ids INTO n FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=nid;
    IF (lo IS NOT NULL AND n.last_time<lo) OR (hi IS NOT NULL AND n.first_time>hi)
      OR (after_time IS NOT NULL AND n.last_time<after_time) THEN CONTINUE; END IF;
    IF point THEN
      IF (lo IS NOT NULL AND n.time<lo) OR (hi IS NOT NULL AND n.time>hi) OR (after_time IS NOT NULL AND n.time<after_time) THEN CONTINUE; END IF;
      -- One primary-key lookup per moment, in the node's ID order.
      FOR mid IN SELECT unnest(n.moment_ids) LOOP
        SELECT m.event INTO e FROM oc_moments m WHERE m.timeline_id=tid AND m.id=mid;
        IF after_time IS NOT NULL AND n.time=after_time AND (e->>'id') COLLATE "C"<=after_id COLLATE "C" THEN CONTINUE; END IF;
        RETURN NEXT e; emitted:=emitted+1; IF emitted>=max_rows THEN RETURN; END IF;
      END LOOP;
    ELSE
      IF n.right_id IS NOT NULL THEN ids:=array_append(ids,n.right_id); points:=array_append(points,false); END IF;
      ids:=array_append(ids,nid); points:=array_append(points,true);
      IF n.left_id IS NOT NULL THEN ids:=array_append(ids,n.left_id); points:=array_append(points,false); END IF;
    END IF;
  END LOOP;
END $$;

-- Community definitions are immutable, owner-namespaced versions. Timelines retain snapshots.
CREATE TABLE IF NOT EXISTS oc_plugins (
  id text NOT NULL, version bigint NOT NULL CHECK(version>0),
  owner_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  manifest jsonb NOT NULL, published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(id,version), CHECK(octet_length(manifest::text)<=32768)
);
CREATE INDEX IF NOT EXISTS oc_plugins_owner ON oc_plugins(owner_id);
-- Plugin suites (#78) accounts publish: packages of plugin definitions, versioned like plugins.
CREATE TABLE IF NOT EXISTS oc_plugin_suites (
  id text NOT NULL, version bigint NOT NULL CHECK(version>0),
  owner_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  suite jsonb NOT NULL, published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(id,version), CHECK(octet_length(suite::text)<=262144)
);
CREATE INDEX IF NOT EXISTS oc_plugin_suites_owner ON oc_plugin_suites(owner_id);

ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS assets jsonb;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS event_text text NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION oc_tag_text(text[]) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT array_to_string($1,' ') $$;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS search_document tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english',title),'A') ||
  setweight(to_tsvector('english',coalesce(oc_tag_text(tags),'')),'A') ||
  setweight(to_tsvector('english',description),'B') ||
  setweight(to_tsvector('english',event_text),'C')
) STORED;
CREATE INDEX IF NOT EXISTS oc_timelines_search ON oc_timelines USING gin(search_document);
CREATE INDEX IF NOT EXISTS oc_timelines_tags ON oc_timelines USING gin(tags);
CREATE INDEX IF NOT EXISTS oc_timelines_public ON oc_timelines(updated_at DESC) WHERE visibility='public';
ALTER TABLE oc_members DROP CONSTRAINT IF EXISTS oc_members_role_check;
UPDATE oc_members SET role='writer' WHERE role='editor';
ALTER TABLE oc_members ADD CONSTRAINT oc_members_role_check CHECK(role IN ('viewer','contributor','writer'));
CREATE TABLE IF NOT EXISTS oc_proposals (
  id uuid PRIMARY KEY, timeline_id uuid NOT NULL REFERENCES oc_timelines ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES oc_users, title text NOT NULL, body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','merged','rejected','closed')),
  base_revision bigint NOT NULL, revision bigint NOT NULL DEFAULT 1,
  base_document jsonb NOT NULL, document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES oc_users, merged_revision bigint
);
CREATE INDEX IF NOT EXISTS oc_proposals_timeline ON oc_proposals(timeline_id,created_at DESC);
CREATE TABLE IF NOT EXISTS oc_proposal_comments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES oc_proposals ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES oc_users, body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oc_proposal_comments_page ON oc_proposal_comments(proposal_id,id);

-- Existing timelines become searchable without requiring their owner to resave them.
-- (At most the first 20,000 moments read: it runs on every upgrade for a timeline whose text
-- stays empty, and saves rebuild the text properly.)
UPDATE oc_timelines t SET event_text=coalesce((
  SELECT left(string_agg(left(coalesce(m.event->'metadata'->>'title','') || ' ' || coalesce(m.event->'metadata'->>'description',''),4096),' '),1048576)
  FROM (SELECT event FROM oc_moments WHERE timeline_id=t.id LIMIT 20000) m
),'') WHERE t.event_text='' AND EXISTS (SELECT 1 FROM oc_moments m WHERE m.timeline_id=t.id);

-- Saved documents and their ancestry are separate from the current rational index.
CREATE TABLE IF NOT EXISTS oc_snapshots (
  id uuid PRIMARY KEY, document jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS oc_revisions (
  id uuid PRIMARY KEY, timeline_id uuid NOT NULL, number bigint,
  snapshot_id uuid NOT NULL REFERENCES oc_snapshots,
  author_id uuid, kind text NOT NULL CHECK(kind IN ('baseline','save','fork','duplicate','sync','merge','proposal','rebase')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(timeline_id,number)
);
CREATE TABLE IF NOT EXISTS oc_revision_parents (
  revision_id uuid NOT NULL REFERENCES oc_revisions, parent_id uuid NOT NULL REFERENCES oc_revisions,
  position integer NOT NULL CHECK(position IN (0,1)), PRIMARY KEY(revision_id,position),
  UNIQUE(revision_id,parent_id), CHECK(revision_id<>parent_id)
);
CREATE INDEX IF NOT EXISTS oc_revision_parent_lookup ON oc_revision_parents(parent_id);
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS head_revision_id uuid REFERENCES oc_revisions;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS upstream_id uuid REFERENCES oc_timelines ON DELETE SET NULL;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS fork_base_revision_id uuid REFERENCES oc_revisions;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS allow_private_forks boolean NOT NULL DEFAULT false;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS publication_restricted boolean NOT NULL DEFAULT false;
ALTER TABLE oc_proposals ADD COLUMN IF NOT EXISTS base_revision_id uuid REFERENCES oc_revisions;
ALTER TABLE oc_proposals ADD COLUMN IF NOT EXISTS source_timeline_id uuid REFERENCES oc_timelines ON DELETE SET NULL;
ALTER TABLE oc_proposals ADD COLUMN IF NOT EXISTS source_revision_id uuid REFERENCES oc_revisions;
ALTER TABLE oc_proposals ADD COLUMN IF NOT EXISTS merged_revision_id uuid REFERENCES oc_revisions;
ALTER TABLE oc_proposals ADD COLUMN IF NOT EXISTS from_fork boolean NOT NULL DEFAULT false;

-- Recover the current saved state of older installations, without inventing lost history.
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

CREATE OR REPLACE FUNCTION oc_immutable_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Saved history is immutable'; END $$;
DROP TRIGGER IF EXISTS oc_revision_immutable ON oc_revisions;
CREATE TRIGGER oc_revision_immutable BEFORE UPDATE ON oc_revisions FOR EACH ROW EXECUTE FUNCTION oc_immutable_revision();
DROP TRIGGER IF EXISTS oc_snapshot_immutable ON oc_snapshots;
CREATE TRIGGER oc_snapshot_immutable BEFORE UPDATE ON oc_snapshots FOR EACH ROW EXECUTE FUNCTION oc_immutable_revision();
DROP TRIGGER IF EXISTS oc_parent_immutable ON oc_revision_parents;
CREATE TRIGGER oc_parent_immutable BEFORE UPDATE ON oc_revision_parents FOR EACH ROW EXECUTE FUNCTION oc_immutable_revision();

-- Verified contact, bounded primary-authentication challenges and application-level MFA.
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS oc_users_email ON oc_users(lower(email)) WHERE email IS NOT NULL;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS mfa_secret text;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS mfa_last_step bigint NOT NULL DEFAULT -1;
ALTER TABLE oc_sessions ADD COLUMN IF NOT EXISTS mfa_verified boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS oc_registrations (
  token_hash text PRIMARY KEY, id uuid NOT NULL, username text NOT NULL, email text NOT NULL,
  password_hash text NOT NULL, browser_hash text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oc_registrations_expiry ON oc_registrations(expires_at);
CREATE TABLE IF NOT EXISTS oc_auth_challenges (
  token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  browser_hash text NOT NULL,purpose text NOT NULL CHECK(purpose IN ('mfa','email')),
  kind text NOT NULL CHECK(kind IN ('web','desktop')),return_to text NOT NULL DEFAULT '/',
  attempts integer NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oc_auth_challenges_expiry ON oc_auth_challenges(expires_at);
CREATE TABLE IF NOT EXISTS oc_email_tokens (
  token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  purpose text NOT NULL CHECK(purpose IN ('verify','reset','change')),email text NOT NULL,
  browser_hash text,old_email text,expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oc_email_tokens_expiry ON oc_email_tokens(expires_at);
CREATE TABLE IF NOT EXISTS oc_mfa_setups (
  user_id uuid PRIMARY KEY REFERENCES oc_users ON DELETE CASCADE,session_hash text NOT NULL,
  secret text NOT NULL,expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS oc_recovery_codes (
  user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,code_hash text NOT NULL,
  PRIMARY KEY(user_id,code_hash)
);
CREATE TABLE IF NOT EXISTS oc_mail_outbox (
  id uuid PRIMARY KEY,payload text NOT NULL,attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oc_mail_outbox_pending ON oc_mail_outbox(next_attempt_at);

ALTER TABLE oc_device_logins ADD COLUMN IF NOT EXISTS mfa_verified boolean NOT NULL DEFAULT false;

-- Transactional, cross-process live invalidation. No timeline contents are broadcast.
CREATE OR REPLACE FUNCTION oc_notify_timeline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('oc_timeline_changes', COALESCE(NEW.id,OLD.id)::text);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS oc_timelines_live ON oc_timelines;
CREATE TRIGGER oc_timelines_live AFTER INSERT OR UPDATE OR DELETE ON oc_timelines
FOR EACH ROW EXECUTE FUNCTION oc_notify_timeline();
CREATE OR REPLACE FUNCTION oc_notify_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('oc_timeline_changes', COALESCE(NEW.timeline_id,OLD.timeline_id)::text);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS oc_members_live ON oc_members;
CREATE TRIGGER oc_members_live AFTER INSERT OR UPDATE OR DELETE ON oc_members
FOR EACH ROW EXECUTE FUNCTION oc_notify_membership();

-- Operator seed enrichments run once, preserving later deliberate plugin removals.
CREATE TABLE IF NOT EXISTS oc_seed_updates (
  timeline_id uuid NOT NULL REFERENCES oc_timelines ON DELETE CASCADE,
  update_key text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(timeline_id, update_key)
);

-- Size admission for complete browser copies, measured before serving a document.
ALTER TABLE oc_snapshots ADD COLUMN IF NOT EXISTS document_bytes bigint CHECK(document_bytes>=0);
-- One-time operator migration: JSONB text size is a conservative upper bound on
-- compact exported JSON. Requests never perform this measurement themselves.
-- This metadata-only backfill runs under the migration transaction/table lock;
-- restore the snapshot guard before commit. The saved documents remain unchanged.
ALTER TABLE oc_snapshots DISABLE TRIGGER oc_snapshot_immutable;
UPDATE oc_snapshots SET document_bytes=octet_length(document::text) WHERE document_bytes IS NULL;
ALTER TABLE oc_snapshots ENABLE TRIGGER oc_snapshot_immutable;

-- Saved comparisons are live references, not materialized event indexes.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS comparison jsonb;

-- Installation administration, account profiles and scoped automation credentials.
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS is_disabled boolean NOT NULL DEFAULT false;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS avatar_url text NOT NULL DEFAULT '';
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS quota_bypass boolean NOT NULL DEFAULT false;
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS quota_bytes bigint CHECK(quota_bytes>=0);
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS used_bytes bigint NOT NULL DEFAULT 0 CHECK(used_bytes>=0);
CREATE TABLE IF NOT EXISTS oc_site_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  default_quota_bytes bigint NOT NULL DEFAULT 104857600 CHECK(default_quota_bytes>=0),
  initialized boolean NOT NULL DEFAULT false, bootstrap_admin_id uuid REFERENCES oc_users,
  enforce_quotas boolean NOT NULL DEFAULT false
);
INSERT INTO oc_site_settings(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS oc_api_keys (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  name text NOT NULL, prefix text NOT NULL, token_hash text UNIQUE NOT NULL,
  scopes text[] NOT NULL CHECK(scopes<@ARRAY['timelines:read','timelines:write']::text[] AND cardinality(scopes)>0),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  last_used_at timestamptz, revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS oc_api_keys_user ON oc_api_keys(user_id);
CREATE TABLE IF NOT EXISTS oc_admin_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid NOT NULL,
  action text NOT NULL, target_id text, changes jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oc_storage_entries (
  kind text NOT NULL, entry_id text NOT NULL, user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  bytes bigint NOT NULL CHECK(bytes>=0), PRIMARY KEY(kind,entry_id)
);
ALTER TABLE oc_storage_entries DROP CONSTRAINT IF EXISTS oc_storage_entries_user_id_fkey;
ALTER TABLE oc_storage_entries ADD CONSTRAINT oc_storage_entries_user_id_fkey FOREIGN KEY(user_id) REFERENCES oc_users ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS oc_storage_user ON oc_storage_entries(user_id);
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS storage_bytes bigint NOT NULL DEFAULT 0;
UPDATE oc_timelines t SET storage_bytes=s.document_bytes FROM oc_revisions r JOIN oc_snapshots s ON s.id=r.snapshot_id WHERE t.head_revision_id=r.id AND t.storage_bytes=0;
-- Existing data is counted without deleting it when the new default is smaller.
UPDATE oc_site_settings SET enforce_quotas=false;
CREATE OR REPLACE FUNCTION oc_storage_charge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE delta bigint; uid uuid; u record; settings record;
BEGIN
  uid:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  IF TG_OP='UPDATE' AND NEW.user_id<>OLD.user_id THEN RAISE EXCEPTION 'Storage entries cannot change owner'; END IF;
  delta:=CASE WHEN TG_OP='DELETE' THEN -OLD.bytes WHEN TG_OP='INSERT' THEN NEW.bytes ELSE NEW.bytes-OLD.bytes END;
  UPDATE oc_users SET used_bytes=greatest(0,used_bytes+delta) WHERE id=uid RETURNING * INTO u;
  SELECT * INTO settings FROM oc_site_settings WHERE singleton;
  IF delta>0 AND settings.enforce_quotas AND NOT u.quota_bypass AND NOT u.is_admin AND u.used_bytes>coalesce(u.quota_bytes,settings.default_quota_bytes) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='Account storage limit exceeded. Delete data or ask the administrator for a larger quota.';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS oc_storage_charge ON oc_storage_entries;
CREATE TRIGGER oc_storage_charge AFTER INSERT OR UPDATE OR DELETE ON oc_storage_entries FOR EACH ROW EXECUTE FUNCTION oc_storage_charge();
CREATE OR REPLACE FUNCTION oc_track_storage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid uuid; n bigint; key text; v_kind text:=TG_TABLE_NAME;
BEGIN
  key:=CASE WHEN TG_OP='DELETE' THEN OLD.id::text ELSE NEW.id::text END;
  IF TG_OP='DELETE' THEN DELETE FROM oc_storage_entries WHERE entry_id=key AND oc_storage_entries.kind=v_kind; RETURN OLD; END IF;
  IF TG_TABLE_NAME='oc_timelines' THEN uid:=NEW.owner_id; n:=NEW.storage_bytes;
  ELSIF TG_TABLE_NAME='oc_revisions' THEN
    SELECT owner_id INTO uid FROM oc_timelines WHERE id=NEW.timeline_id;
    uid:=CASE WHEN NEW.kind IN ('proposal','rebase') THEN NEW.author_id ELSE coalesce(uid,NEW.author_id) END;
    IF NEW.history_rows THEN n:=NEW.stored_bytes;
    ELSIF NEW.snapshot_id IS NULL THEN n:=octet_length(NEW.patch::text);
    ELSE SELECT document_bytes INTO n FROM oc_snapshots WHERE id=NEW.snapshot_id; END IF;
  ELSIF TG_TABLE_NAME='oc_proposals' THEN uid:=NEW.author_id; n:=coalesce(octet_length(NEW.document::text),0)+coalesce(octet_length(NEW.base_document::text),0)+octet_length(NEW.body)+octet_length(NEW.title);
  ELSIF TG_TABLE_NAME='oc_proposal_comments' THEN uid:=NEW.author_id; n:=octet_length(NEW.body);
  ELSIF TG_TABLE_NAME='oc_plugins' THEN uid:=NEW.owner_id; n:=octet_length(NEW.manifest::text); key:=NEW.id||'/'||NEW.version;
  END IF;
  IF uid IS NOT NULL THEN INSERT INTO oc_storage_entries(kind,entry_id,user_id,bytes) VALUES(v_kind,key,uid,coalesce(n,0)) ON CONFLICT(kind,entry_id) DO UPDATE SET bytes=excluded.bytes; END IF;
  RETURN NEW;
END $$;
-- Versioned plugin deletions need the same compound identity as insertions.
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
INSERT INTO oc_storage_entries SELECT 'oc_timelines',id::text,owner_id,storage_bytes FROM oc_timelines ON CONFLICT(kind,entry_id) DO UPDATE SET bytes=excluded.bytes;
INSERT INTO oc_storage_entries SELECT 'oc_revisions',r.id::text,CASE WHEN r.kind IN ('proposal','rebase') THEN r.author_id ELSE coalesce(t.owner_id,r.author_id) END,s.document_bytes FROM oc_revisions r JOIN oc_snapshots s ON s.id=r.snapshot_id LEFT JOIN oc_timelines t ON t.id=r.timeline_id WHERE (CASE WHEN r.kind IN ('proposal','rebase') THEN r.author_id ELSE coalesce(t.owner_id,r.author_id) END) IN(SELECT id FROM oc_users) ON CONFLICT(kind,entry_id) DO NOTHING;
INSERT INTO oc_storage_entries SELECT 'oc_proposals',id::text,author_id,coalesce(octet_length(document::text),0)+coalesce(octet_length(base_document::text),0)+octet_length(body)+octet_length(title) FROM oc_proposals ON CONFLICT(kind,entry_id) DO NOTHING;
INSERT INTO oc_storage_entries SELECT 'oc_proposal_comments',id::text,author_id,octet_length(body) FROM oc_proposal_comments ON CONFLICT(kind,entry_id) DO NOTHING;
INSERT INTO oc_storage_entries SELECT 'oc_plugins',id||'/'||version,owner_id,octet_length(manifest::text) FROM oc_plugins ON CONFLICT(kind,entry_id) DO NOTHING;
-- AFTER triggers charge only the committed insert/update branch of an upsert.
-- Reconcile counters from the ledger during each transactional migration.
UPDATE oc_users u SET used_bytes=coalesce((SELECT sum(bytes) FROM oc_storage_entries WHERE user_id=u.id),0);
UPDATE oc_site_settings SET enforce_quotas=true;

-- Stars belong to users; counts survive repeated requests and cascade deletions.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE oc_timelines SET created_at=updated_at WHERE created_at IS NULL;
ALTER TABLE oc_timelines ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE oc_timelines ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS star_count bigint NOT NULL DEFAULT 0 CHECK(star_count>=0);
CREATE TABLE IF NOT EXISTS oc_timeline_stars (
  user_id uuid NOT NULL REFERENCES oc_users ON DELETE CASCADE,
  timeline_id uuid NOT NULL REFERENCES oc_timelines ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,timeline_id)
);
CREATE INDEX IF NOT EXISTS oc_timeline_stars_timeline ON oc_timeline_stars(timeline_id);
CREATE INDEX IF NOT EXISTS oc_timelines_upstream ON oc_timelines(upstream_id) WHERE upstream_id IS NOT NULL;
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

-- Detect added root moments independently from edits and deletions.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS event_generation bigint NOT NULL DEFAULT 0;
-- Traverse only the newest/oldest few distinct coordinates, without loading their metadata.
CREATE OR REPLACE FUNCTION oc_recent_times(tid uuid, oldest boolean DEFAULT false)
RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE stack bigint[]:=ARRAY[]::bigint[]; nid bigint; n record; emitted integer:=0;
BEGIN
  SELECT root INTO nid FROM oc_timelines WHERE id=tid;
  WHILE nid IS NOT NULL OR cardinality(stack)>0 LOOP
    WHILE nid IS NOT NULL LOOP
      stack:=array_append(stack,nid);
      SELECT node.left_id,node.right_id INTO n FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=nid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Broken timeline index'; END IF;
      nid:=CASE WHEN oldest THEN n.left_id ELSE n.right_id END;
    END LOOP;
    nid:=stack[cardinality(stack)]; stack:=stack[1:cardinality(stack)-1];
    SELECT node.time,node.left_id,node.right_id INTO n FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=nid;
    RETURN NEXT oc_qtext(n.time); emitted:=emitted+1;
    IF emitted=8 THEN RETURN; END IF;
    nid:=CASE WHEN oldest THEN n.right_id ELSE n.left_id END;
  END LOOP;
END $$;

-- Exact interval tree over standalone durations. Each row also holds its duration's full
-- definition; a NULL definition marks a legacy link row awaiting conversion by migrate.mjs.
CREATE TABLE IF NOT EXISTS oc_duration_nodes (
  timeline_id uuid NOT NULL REFERENCES oc_timelines(id) ON DELETE CASCADE,
  id integer NOT NULL, left_id integer, right_id integer,
  min_time mpq NOT NULL, max_time mpq NOT NULL,
  first_time mpq NOT NULL, last_time mpq NOT NULL, band jsonb NOT NULL,
  PRIMARY KEY(timeline_id,id)
);
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS definition jsonb;
-- Subtree summaries for collapsing short durations: largest start, entry count and extent
-- bounds. NULL marks rows built before these columns; migrate.mjs rebuilds them.
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS max_first mpq;
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS subtree_count integer;
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS min_extent mpq;
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS max_extent mpq;
-- Interval trees are AVL trees ordered by (first_time, ID in "C" order) with stable IDs;
-- the timeline row names each root. Static builds numbered the root 1.
ALTER TABLE oc_duration_nodes ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS duration_root integer;
UPDATE oc_timelines t SET duration_root=1 WHERE duration_root IS NULL
  AND EXISTS(SELECT 1 FROM oc_duration_nodes n WHERE n.timeline_id=t.id AND n.id=1);
-- Durations anchored to a moment move with it.
CREATE INDEX IF NOT EXISTS oc_duration_nodes_start_moment ON oc_duration_nodes(timeline_id,(definition->'start'->>'moment'));
CREATE INDEX IF NOT EXISTS oc_duration_nodes_end_moment ON oc_duration_nodes(timeline_id,(definition->'end'->>'moment'));

-- Sort keys for exact rationals, small enough for B-trees: ±((2^40 + e)·10^30 + m), where
-- e is the decimal exponent and m the leading 30 significant digits, truncated. Truncation
-- never reverses the order of two values, and unlike a float8 the key never saturates: values
-- beyond float8's range (or below it) keep distinct keys and 30 digits of relative precision.
-- Text lengths bound the exponent to within one; one exact comparison settles it.
CREATE OR REPLACE FUNCTION oc_qkey(q mpq) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
DECLARE n mpz := abs(num(q)); d mpz := den(q); e integer; m mpz;
BEGIN
  IF n=0 THEN RETURN 0; END IF;
  e:=length(n::text)-length(d::text);
  IF e>=0 THEN
    IF n<d*('1'||repeat('0',e))::mpz THEN e:=e-1; END IF;
  ELSIF n*('1'||repeat('0',-e))::mpz<d THEN e:=e-1;
  END IF;
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
  SELECT CASE WHEN duration_root IS NULL THEN ARRAY[]::integer[] ELSE ARRAY[duration_root] END INTO ids FROM oc_timelines WHERE id=tid;
  ids:=coalesce(ids,ARRAY[]::integer[]);
  WHILE cardinality(ids)>0 LOOP
    idx:=cardinality(ids); nid:=ids[idx]; point:=points[idx]; low:=lows[idx]; high:=highs[idx];
    ids:=ids[1:idx-1]; points:=points[1:idx-1]; lows:=lows[1:idx-1]; highs:=highs[1:idx-1];
    SELECT d.left_id,d.right_id,d.min_time,d.max_time,d.max_first,d.subtree_count,d.min_extent,d.max_extent,d.first_time,d.last_time,d.band INTO n FROM oc_duration_nodes d WHERE d.timeline_id=tid AND d.id=nid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Broken duration index'; END IF;
    IF point THEN
      IF n.last_time<lo OR n.first_time>hi OR n.last_time-n.first_time>=threshold THEN CONTINUE; END IF;
      IF anchor IS NOT NULL AND n.first_time>=reach THEN
        first_time:=oc_qtext(anchor); last_time:=oc_qtext(finish); duration_count:=total;
        band:=CASE WHEN total=1 THEN single END; RETURN NEXT; anchor:=NULL;
      END IF;
      IF anchor IS NULL THEN anchor:=n.first_time; reach:=anchor+threshold; finish:=n.last_time; total:=0;
      ELSIF n.last_time>finish THEN finish:=n.last_time; END IF;
      total:=total+1; single:=CASE WHEN total=1 THEN n.band END;
      CONTINUE;
    END IF;
    IF n.max_time<lo OR n.min_time>hi OR n.max_first<=earliest OR n.min_extent>=threshold THEN CONTINUE; END IF;
    -- The subtree joins the open group if it starts before the group's reach, else opens one.
    fits:=CASE WHEN anchor IS NOT NULL AND n.min_time<reach THEN reach ELSE n.min_time+threshold END;
    IF n.max_extent<threshold AND n.min_time>=lo AND n.max_first<=hi AND n.max_first<fits THEN
      IF anchor IS NOT NULL AND n.min_time>=reach THEN
        first_time:=oc_qtext(anchor); last_time:=oc_qtext(finish); duration_count:=total;
        band:=CASE WHEN total=1 THEN single END; RETURN NEXT; anchor:=NULL;
      END IF;
      IF anchor IS NULL THEN anchor:=n.min_time; reach:=anchor+threshold; finish:=n.max_time; total:=0;
      ELSIF n.max_time>finish THEN finish:=n.max_time; END IF;
      total:=total+n.subtree_count; single:=CASE WHEN total=1 THEN n.band END;
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
      FOR r IN SELECT d.first_time AS f,d.last_time AS l,d.band AS b FROM oc_duration_nodes d WHERE d.timeline_id=tid
          AND d.first_key>=oc_qkey(n.min_time) AND d.first_key<=oc_qkey(n.max_first)
            AND d.first_time>=n.min_time AND d.first_time<=n.max_first
            AND (low_first IS NULL OR d.first_time>low_first OR (d.band->>'id') COLLATE "C">low_id COLLATE "C")
            AND (high_first IS NULL OR d.first_time<high_first OR (d.band->>'id') COLLATE "C"<high_id COLLATE "C")
            AND d.last_time>=lo AND d.first_time<=hi AND d.last_time-d.first_time<threshold
          ORDER BY d.first_key,d.first_time LOOP
        IF anchor IS NOT NULL AND r.f>=reach THEN
          first_time:=oc_qtext(anchor); last_time:=oc_qtext(finish); duration_count:=total;
          band:=CASE WHEN total=1 THEN single END; RETURN NEXT; anchor:=NULL;
        END IF;
        IF anchor IS NULL THEN anchor:=r.f; reach:=anchor+threshold; finish:=r.l; total:=0;
        ELSIF r.l>finish THEN finish:=r.l; END IF;
        total:=total+1; single:=CASE WHEN total=1 THEN r.b END;
      END LOOP;
    ELSE
      IF n.right_id IS NOT NULL THEN
        ids:=ids||n.right_id; points:=points||false; lows:=lows||nid; highs:=highs||high;
      END IF;
      ids:=ids||nid; points:=points||true; lows:=lows||NULL::integer; highs:=highs||NULL::integer;
      IF n.left_id IS NOT NULL THEN
        ids:=ids||n.left_id; points:=points||false; lows:=lows||low; highs:=highs||nid;
      END IF;
    END IF;
  END LOOP;
  IF anchor IS NOT NULL THEN
    first_time:=oc_qtext(anchor); last_time:=oc_qtext(finish); duration_count:=total;
    band:=CASE WHEN total=1 THEN single END; RETURN NEXT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS oc_duration_nodes_duration_id ON oc_duration_nodes(timeline_id,(band->>'id'));

-- Per-timeline text search over moments and durations, rebuilt with the rational index on save.
-- The 'simple' configuration is language-neutral; queries match word prefixes.
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
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS search_version integer NOT NULL DEFAULT 0;
-- Entity tags (metadata.tags of moments and durations), listed for tag separation.
ALTER TABLE oc_entity_search ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
-- The search vector is kept by a trigger rather than generated, so that a timeline's index
-- copied for a fork or duplicate (copyIndex in store.mjs) takes the vectors as they are
-- instead of reading every entity's text again: computed on insert unless given, and when
-- the text changes. Existing vectors are kept as they are.
ALTER TABLE oc_entity_search ALTER COLUMN document DROP EXPRESSION IF EXISTS;
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
CREATE TABLE IF NOT EXISTS oc_view_nodes (
  timeline_id uuid NOT NULL REFERENCES oc_views ON DELETE CASCADE, id bigint NOT NULL,
  time mpq NOT NULL, first_time mpq NOT NULL, last_time mpq NOT NULL,
  left_id bigint, right_id bigint, first_id bigint NOT NULL, bucket_count bigint NOT NULL,
  event_count bigint NOT NULL, distinct_count integer NOT NULL,
  events jsonb NOT NULL, PRIMARY KEY(timeline_id,id)
);
ALTER TABLE oc_view_nodes ADD COLUMN IF NOT EXISTS moment_ids text[];
ALTER TABLE oc_view_nodes ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE oc_view_nodes ALTER COLUMN events DROP NOT NULL;
ALTER TABLE oc_views ADD COLUMN IF NOT EXISTS duration_root integer;
CREATE TABLE IF NOT EXISTS oc_view_moments (
  timeline_id uuid NOT NULL REFERENCES oc_views ON DELETE CASCADE, id text NOT NULL,
  time mpq NOT NULL, event jsonb NOT NULL, PRIMARY KEY(timeline_id,id)
);
CREATE TABLE IF NOT EXISTS oc_view_duration_nodes (
  timeline_id uuid NOT NULL REFERENCES oc_views ON DELETE CASCADE,
  id integer NOT NULL, left_id integer, right_id integer,
  min_time mpq NOT NULL, max_time mpq NOT NULL,
  first_time mpq NOT NULL, last_time mpq NOT NULL, band jsonb NOT NULL,
  definition jsonb, max_first mpq, subtree_count integer, min_extent mpq, max_extent mpq,
  PRIMARY KEY(timeline_id,id)
);
ALTER TABLE oc_view_duration_nodes ADD COLUMN IF NOT EXISTS height integer;
DROP INDEX IF EXISTS oc_view_duration_nodes_first_approx;
ALTER TABLE oc_view_duration_nodes DROP COLUMN IF EXISTS first_approx;
ALTER TABLE oc_view_duration_nodes ADD COLUMN IF NOT EXISTS first_key numeric
  GENERATED ALWAYS AS (oc_qkey(first_time)) STORED;
CREATE INDEX IF NOT EXISTS oc_view_duration_nodes_first_key ON oc_view_duration_nodes(timeline_id,first_key);
-- View variants of the traversal functions, generated from the originals so the summary
-- algorithms have a single definition: only table names (and the root's table) differ.
DO $$
DECLARE
  generated record;
BEGIN
  FOR generated IN SELECT * FROM (VALUES
    ('oc_overview_v2(uuid,mpq,mpq,mpq)', 'oc_overview_v2(', 'oc_view_overview('),
    ('oc_events(uuid,mpq,mpq,mpq,text,integer)', 'oc_events(', 'oc_view_events('),
    ('oc_duration_overview(uuid,mpq,mpq,mpq)', 'oc_duration_overview(', 'oc_view_duration_overview(')
  ) AS f(signature, name, view_name) LOOP
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
CREATE TABLE IF NOT EXISTS oc_relationships (
  timeline_id uuid NOT NULL REFERENCES oc_timelines(id) ON DELETE CASCADE,
  a_kind text NOT NULL CHECK(a_kind IN ('moment','duration')), a_id text NOT NULL,
  b_kind text NOT NULL CHECK(b_kind IN ('moment','duration')), b_id text NOT NULL,
  PRIMARY KEY(timeline_id,a_kind,a_id,b_kind,b_id),
  CHECK((a_kind,a_id)<>(b_kind,b_id))
);
CREATE INDEX IF NOT EXISTS oc_relationships_b ON oc_relationships(timeline_id,b_kind,b_id);
-- Relationship arcs as exact intervals between their endpoints' times (a duration's start),
-- in the same augmented interval tree as duration bands.
CREATE TABLE IF NOT EXISTS oc_edge_nodes (
  timeline_id uuid NOT NULL REFERENCES oc_timelines(id) ON DELETE CASCADE,
  id integer NOT NULL, left_id integer, right_id integer,
  min_time mpq NOT NULL, max_time mpq NOT NULL,
  first_time mpq NOT NULL, last_time mpq NOT NULL, band jsonb NOT NULL,
  definition jsonb, max_first mpq, subtree_count integer, min_extent mpq, max_extent mpq,
  PRIMARY KEY(timeline_id,id)
);
ALTER TABLE oc_edge_nodes ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS edge_root integer;
UPDATE oc_timelines t SET edge_root=1 WHERE edge_root IS NULL
  AND EXISTS(SELECT 1 FROM oc_edge_nodes n WHERE n.timeline_id=t.id AND n.id=1);
CREATE INDEX IF NOT EXISTS oc_edge_nodes_edge_id ON oc_edge_nodes(timeline_id,(band->>'id'));

-- Saves store their sparse patch against the first parent instead of a whole document; a
-- full snapshot is written periodically so reading any revision replays a bounded chain.
ALTER TABLE oc_revisions ALTER COLUMN snapshot_id DROP NOT NULL;
ALTER TABLE oc_revisions ADD COLUMN IF NOT EXISTS patch jsonb;
-- Size of the revision's whole document as exported JSON (an upper-bound estimate for patches).
ALTER TABLE oc_revisions ADD COLUMN IF NOT EXISTS document_bytes bigint CHECK(document_bytes>=0);
-- Which content a revision has is checked below, once revisions can also be kept as rows.
ALTER TABLE oc_revisions DROP CONSTRAINT IF EXISTS oc_revisions_content;
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
DROP FUNCTION IF EXISTS oc_text_parts(jsonb,boolean);
CREATE OR REPLACE FUNCTION oc_event_text(tid uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE parts text[]:='{}'; total bigint:=0; part text; page jsonb[]; after_time mpq; after_id text;
BEGIN
  FOR part IN SELECT left(x.v,4096) FROM oc_duration_nodes d CROSS JOIN LATERAL (VALUES
    (1,CASE WHEN jsonb_typeof(d.definition->'metadata'->'title')='string' THEN d.definition->'metadata'->>'title' END),
    (2,CASE WHEN jsonb_typeof(d.definition->'metadata'->'description')='string' THEN d.definition->'metadata'->>'description' END)) x(o,v)
  WHERE d.timeline_id=tid AND x.v IS NOT NULL ORDER BY d.first_key,d.first_time,d.band->>'id' COLLATE "C",x.o LOOP
    parts:=parts||part; total:=total+length(part)+1;
    IF total>1048576 THEN RETURN left(array_to_string(parts,' '),1048576); END IF;
  END LOOP;
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
    EXIT WHEN cardinality(page)<1000;
    after_time:=(page[cardinality(page)]->>'time')::mpq; after_id:=page[cardinality(page)]->>'id';
  END LOOP;
  RETURN array_to_string(parts,' ');
END $$;
-- Data retention (#91): a Gregorian timeline can keep only its last retention_seconds of
-- moments; the server expires older ones, and history saved before then, on a schedule.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS retention_seconds text;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS retention_applied_at timestamptz;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS retention_removed bigint;
CREATE INDEX IF NOT EXISTS oc_timelines_retention ON oc_timelines(retention_applied_at NULLS FIRST)
  WHERE retention_seconds IS NOT NULL;

-- Saved history as rows (history.mjs): each version of a timeline's moments, durations,
-- relationships and settings is valid from the revision number that saved it (since) until
-- the one that changed or removed it (until, null while current). Saves write only what
-- changed; revision n is the rows with since<=n<until. A timeline starts at its first
-- numbered revision from here on (history_since); earlier revisions keep their snapshots
-- and patches.
CREATE TABLE IF NOT EXISTS oc_history_moments (
  timeline_id uuid NOT NULL, id text NOT NULL, since bigint NOT NULL, until bigint,
  time mpq NOT NULL, event jsonb NOT NULL,
  PRIMARY KEY(timeline_id,id,since), CHECK(until>since)
);
CREATE TABLE IF NOT EXISTS oc_history_durations (
  timeline_id uuid NOT NULL, id text NOT NULL, since bigint NOT NULL, until bigint,
  definition jsonb NOT NULL,
  PRIMARY KEY(timeline_id,id,since), CHECK(until>since)
);
CREATE TABLE IF NOT EXISTS oc_history_relationships (
  timeline_id uuid NOT NULL, a_kind text NOT NULL, a_id text NOT NULL,
  b_kind text NOT NULL, b_id text NOT NULL, since bigint NOT NULL, until bigint,
  PRIMARY KEY(timeline_id,a_kind,a_id,b_kind,b_id,since), CHECK(until>since)
);
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
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS history_since bigint;
-- A revision is a snapshot, a patch against its first parent, or kept as rows (numbered).
ALTER TABLE oc_revisions ADD COLUMN IF NOT EXISTS history_rows boolean NOT NULL DEFAULT false;
-- Bytes of the versions a revision kept as rows wrote: what it is charged.
ALTER TABLE oc_revisions ADD COLUMN IF NOT EXISTS stored_bytes bigint CHECK(stored_bytes>=0);
ALTER TABLE oc_revisions DROP CONSTRAINT IF EXISTS oc_revisions_content;
-- A revision with none of them is one whose content is not kept (a timeline that keeps no
-- saved history, below): only its place in the history remains.
ALTER TABLE oc_revisions ADD CONSTRAINT oc_revisions_content
  CHECK(num_nonnulls(snapshot_id,patch)+history_rows::int<=1 AND (NOT history_rows OR number IS NOT NULL));
-- History is immutable like revisions: a version only ends, once.
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
CREATE INDEX IF NOT EXISTS oc_history_bases_revision ON oc_history_bases(base_revision_id);
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
DO $do$
DECLARE live text; col record; names text; olds text; retire text;
BEGIN
  FOREACH live IN ARRAY ARRAY['oc_moments','oc_nodes','oc_duration_nodes','oc_edge_nodes',
    'oc_relationships','oc_entity_search'] LOOP
    -- Added without a default (no rewrite of existing rows), then defaulted to the clock:
    -- a write outside beginIndexWrite fails rather than recording no version.
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS since bigint', live);
    EXECUTE format($f$ALTER TABLE %I ALTER COLUMN since SET DEFAULT current_setting('oc.clock')::bigint$f$, live);
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (timeline_id uuid NOT NULL, until bigint NOT NULL)',
      live || '_retired');
    -- The twin has every column of the live table (generated ones stored as values).
    FOR col IN SELECT a.attname,format_type(a.atttypid,a.atttypmod) AS type FROM pg_attribute a
      WHERE a.attrelid=live::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LOOP
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I %s', live || '_retired', col.attname, col.type);
    END LOOP;
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
    EXECUTE format($f$CREATE OR REPLACE FUNCTION %I() RETURNS trigger LANGUAGE plpgsql AS $b$
      BEGIN %s RETURN OLD; END $b$$f$, live || '_retire', retire);
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
CREATE INDEX IF NOT EXISTS oc_timelines_index_bases ON oc_timelines USING gin(index_bases)
  WHERE index_bases<>'{}';
DO $do$
DECLARE live text; keys text[]; names text; eq text; levels integer:=4; k integer;
  body text; seen text; shadows text; idx record;
BEGIN
  FOREACH live IN ARRAY ARRAY['oc_moments','oc_nodes','oc_duration_nodes','oc_edge_nodes',
    'oc_relationships','oc_entity_search'] LOOP
    -- Rows outlive their timeline while forks read them (oc_release_index below).
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', live, live || '_timeline_id_fkey');
    SELECT array_agg(a.attname::text ORDER BY array_position(i.indkey::int2[],a.attnum)) INTO keys
    FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
    WHERE i.indrelid=live::regclass AND i.indisprimary AND a.attname<>'timeline_id';
    -- Retired versions are found as live rows are: by key at a clock, and by every index.
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(timeline_id,%s,until)', live || '_retired_key',
      live || '_retired', (SELECT string_agg(quote_ident(x),',') FROM unnest(keys) x));
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
DROP FUNCTION IF EXISTS oc_release_index(uuid[]);
CREATE OR REPLACE FUNCTION oc_release_index(bases uuid[], clocks bigint[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE b uuid; released bigint; alive boolean; pins bigint[]; live text;
BEGIN
  -- In ID order, so releases of several levels do not deadlock.
  FOR b,released IN SELECT x.b,CASE WHEN bool_or(x.c IS NULL) THEN NULL ELSE min(x.c) END
    FROM unnest(bases,clocks) x(b,c) WHERE x.b IS NOT NULL GROUP BY x.b ORDER BY x.b LOOP
    -- Releases of one timeline wait for each other, so each sees what the other deleted;
    -- a live one is locked too, as forking it does, so no pin is added meanwhile.
    PERFORM pg_advisory_xact_lock(hashtextextended('oc_release_index:' || b::text,0));
    PERFORM 1 FROM oc_timelines WHERE id=b FOR UPDATE;
    alive:=FOUND;
    pins:=ARRAY(SELECT DISTINCT t.index_clocks[k] FROM oc_timelines t,generate_subscripts(t.index_bases,1) k
      WHERE t.index_bases<>'{}' AND t.index_bases @> ARRAY[b] AND t.index_bases[k]=b ORDER BY 1);
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
      IF NOT alive THEN
        EXECUTE format('DELETE FROM %I l WHERE l.timeline_id=$1 AND coalesce(l.since,0)>coalesce($2,-1)', live)
          USING b,pins[cardinality(pins)];
      END IF;
    END LOOP;
  END LOOP;
END $$;
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
CREATE OR REPLACE FUNCTION oc_rewrite(source text, original text, replacement text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF strpos(source,original)=0 THEN RAISE EXCEPTION 'Cannot generate a fork walk: % not found', original; END IF;
  RETURN replace(source,original,replacement);
END $$;
-- A lookup of `cols` INTO `target` from table `tbl` (as `alias`) by ID `key`, starting at
-- level `hint` (variable `lv` ends at the level found) and with the retired version first
-- when `first_retired` (variable `retired` tells which it was).
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
  -- The fork's levels: itself (current rows) and what it reads through to.
  lineage:='array_prepend(id,index_bases),array_prepend(9223372036854775807,index_clocks)';
  levels:='tids uuid[]; clocks bigint[]; lv integer; hint integer; found_retired boolean; hint_retired boolean; other_retired boolean; ';
  pack:='+(lv::bigint<<56)+(found_retired::integer::bigint<<55)';

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

  -- The originals hand forks to their variants (views, generated above, never read through).
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
-- case per thing is open or in force; a decision closes an open case, and a restriction stays
-- in force until lifted. Targets are named as text (a timeline or account UUID, a comment's
-- number, a plugin or suite id), so a case outlives what it names, as a record of what was
-- decided.
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
CREATE UNIQUE INDEX IF NOT EXISTS oc_moderation_cases_current ON oc_moderation_cases(target_kind,target_id)
  WHERE status IN ('open','restricted');
CREATE INDEX IF NOT EXISTS oc_moderation_cases_owner ON oc_moderation_cases(owner_id,decided_at);
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
CREATE INDEX IF NOT EXISTS oc_reports_case ON oc_reports(case_id,created_at);
-- A signed-in reader reports a thing once per case; reporting again replaces their report.
CREATE UNIQUE INDEX IF NOT EXISTS oc_reports_reporter ON oc_reports(case_id,reporter_id,coalesce(entity_kind,''),coalesce(entity_id,''))
  WHERE reporter_id IS NOT NULL;
-- Account standing and timeline popularity (#103; server/standing.mjs), recomputed from
-- stars, forks, account age and confirmation, and moderation. Kept apart from the accounts
-- and timelines they rank, so recomputing them never rewrites (or notifies about) those rows.
-- An administrator's override: 'trusted' accounts have full standing, 'untrusted' none.
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS trust text CHECK(trust IN ('trusted','untrusted'));
CREATE TABLE IF NOT EXISTS oc_account_standing (
  user_id uuid PRIMARY KEY REFERENCES oc_users ON DELETE CASCADE,
  -- 0 for an account not (yet) established; up to 1.
  standing real NOT NULL CHECK(standing>=0 AND standing<=1),
  -- Endorsing accounts that starred or publicly forked its public timelines.
  endorsers integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
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
ALTER TABLE oc_timelines DROP CONSTRAINT IF EXISTS oc_timelines_content_labels;
ALTER TABLE oc_timelines ADD CONSTRAINT oc_timelines_content_labels CHECK(
  content_labels <@ ARRAY['nudity','violence','disturbing']
  AND moderator_labels <@ ARRAY['nudity','violence','disturbing']);
-- A report may be settled by labelling what was reported: the labels moderators added.
ALTER TABLE oc_moderation_cases ADD COLUMN IF NOT EXISTS labels text[];
ALTER TABLE oc_moderation_cases DROP CONSTRAINT IF EXISTS oc_moderation_cases_status_check;
ALTER TABLE oc_moderation_cases ADD CONSTRAINT oc_moderation_cases_status_check
  CHECK(status IN ('open','dismissed','restricted','lifted','labelled'));
-- Accounts are for people 13 and older (#115): the year of birth given at sign-up (null for
-- accounts made before it was asked, under terms requiring 18). Accounts that may be under 18
-- see labelled content behind its warning, always; adults may choose to see it without.
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS birth_year smallint CHECK(birth_year BETWEEN 1900 AND 2200);
ALTER TABLE oc_registrations ADD COLUMN IF NOT EXISTS birth_year smallint CHECK(birth_year BETWEEN 1900 AND 2200);
ALTER TABLE oc_users ADD COLUMN IF NOT EXISTS show_sensitive boolean NOT NULL DEFAULT false;
