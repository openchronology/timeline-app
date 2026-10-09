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
    SELECT node.time,node.left_id,node.right_id,node.first_id,node.first_time,node.last_time,node.bucket_count,node.event_count,node.distinct_count INTO n
      FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=nid;
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
        SELECT m.event INTO sample FROM oc_moments m WHERE m.timeline_id=tid
          AND m.id=(SELECT node.moment_ids[1] FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=current_id);
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
      SELECT m.event INTO sample FROM oc_moments m WHERE m.timeline_id=tid
        AND m.id=(SELECT node.moment_ids[1] FROM oc_nodes node WHERE node.timeline_id=tid AND node.id=current_id);
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
    SELECT time,left_id,right_id,first_time,last_time,moment_ids INTO n FROM oc_nodes WHERE timeline_id=tid AND id=nid;
    IF (lo IS NOT NULL AND n.last_time<lo) OR (hi IS NOT NULL AND n.first_time>hi)
      OR (after_time IS NOT NULL AND n.last_time<after_time) THEN CONTINUE; END IF;
    IF point THEN
      IF (lo IS NOT NULL AND n.time<lo) OR (hi IS NOT NULL AND n.time>hi) OR (after_time IS NOT NULL AND n.time<after_time) THEN CONTINUE; END IF;
      -- One primary-key lookup per moment, in the node's ID order.
      FOR mid IN SELECT unnest(n.moment_ids) LOOP
        SELECT event INTO e FROM oc_moments WHERE timeline_id=tid AND id=mid;
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
UPDATE oc_timelines t SET event_text=coalesce((
  SELECT left(string_agg(left(coalesce(m.event->'metadata'->>'title','') || ' ' || coalesce(m.event->'metadata'->>'description',''),4096),' '),1048576)
  FROM oc_moments m WHERE m.timeline_id=t.id
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
    IF NEW.snapshot_id IS NULL THEN n:=octet_length(NEW.patch::text);
    ELSE SELECT document_bytes INTO n FROM oc_snapshots WHERE id=NEW.snapshot_id; END IF;
  ELSIF TG_TABLE_NAME='oc_proposals' THEN uid:=NEW.author_id; n:=octet_length(NEW.document::text)+octet_length(NEW.base_document::text)+octet_length(NEW.body)+octet_length(NEW.title);
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
INSERT INTO oc_storage_entries SELECT 'oc_timelines',id::text,owner_id,storage_bytes FROM oc_timelines ON CONFLICT(kind,entry_id) DO UPDATE SET bytes=excluded.bytes;
INSERT INTO oc_storage_entries SELECT 'oc_revisions',r.id::text,CASE WHEN r.kind IN ('proposal','rebase') THEN r.author_id ELSE coalesce(t.owner_id,r.author_id) END,s.document_bytes FROM oc_revisions r JOIN oc_snapshots s ON s.id=r.snapshot_id LEFT JOIN oc_timelines t ON t.id=r.timeline_id WHERE (CASE WHEN r.kind IN ('proposal','rebase') THEN r.author_id ELSE coalesce(t.owner_id,r.author_id) END) IN(SELECT id FROM oc_users) ON CONFLICT(kind,entry_id) DO NOTHING;
INSERT INTO oc_storage_entries SELECT 'oc_proposals',id::text,author_id,octet_length(document::text)+octet_length(base_document::text)+octet_length(body)+octet_length(title) FROM oc_proposals ON CONFLICT(kind,entry_id) DO NOTHING;
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
      SELECT left_id,right_id INTO n FROM oc_nodes WHERE timeline_id=tid AND id=nid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Broken timeline index'; END IF;
      nid:=CASE WHEN oldest THEN n.left_id ELSE n.right_id END;
    END LOOP;
    nid:=stack[cardinality(stack)]; stack:=stack[1:cardinality(stack)-1];
    SELECT time,left_id,right_id INTO n FROM oc_nodes WHERE timeline_id=tid AND id=nid;
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

-- Anchored-span summaries of durations shorter than the threshold that intersect [lo,hi],
-- keyed by start. Mirrors src/durations.ts durationSummaries: subtrees made only of
-- collapsed, in-window durations are consumed whole when their starts fit the open group.
CREATE OR REPLACE FUNCTION oc_duration_overview(tid uuid, lo mpq, hi mpq, threshold mpq)
RETURNS TABLE(first_time text,last_time text,duration_count integer,band jsonb)
LANGUAGE plpgsql AS $$
DECLARE ids integer[]; points boolean[] := ARRAY[false]; idx integer; nid integer; point boolean;
  n record; anchor mpq; finish mpq; total integer := 0; single jsonb; base mpq;
BEGIN
  IF lo IS NULL OR hi IS NULL OR threshold IS NULL OR threshold<='0'::mpq OR lo>hi THEN RETURN; END IF;
  SELECT CASE WHEN duration_root IS NULL THEN ARRAY[]::integer[] ELSE ARRAY[duration_root] END INTO ids
    FROM oc_timelines WHERE id=tid;
  ids := coalesce(ids,ARRAY[]::integer[]);
  WHILE cardinality(ids)>0 LOOP
    idx:=cardinality(ids); nid:=ids[idx]; point:=points[idx]; ids:=ids[1:idx-1]; points:=points[1:idx-1];
    SELECT d.* INTO n FROM oc_duration_nodes d WHERE d.timeline_id=tid AND d.id=nid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Broken duration index'; END IF;
    IF point THEN
      IF n.last_time<lo OR n.first_time>hi OR n.last_time-n.first_time>=threshold THEN CONTINUE; END IF;
      IF anchor IS NOT NULL AND n.first_time-anchor>=threshold THEN
        first_time:=oc_qtext(anchor); last_time:=oc_qtext(finish); duration_count:=total;
        band:=CASE WHEN total=1 THEN single END; RETURN NEXT; anchor:=NULL;
      END IF;
      IF anchor IS NULL THEN anchor:=n.first_time; finish:=n.last_time; total:=0; END IF;
      IF n.last_time>finish THEN finish:=n.last_time; END IF;
      total:=total+1; single:=CASE WHEN total=1 THEN n.band END;
      CONTINUE;
    END IF;
    IF n.max_time<lo OR n.min_time>hi THEN CONTINUE; END IF;
    -- A collapsed duration reaching the window starts after lo - threshold.
    IF n.max_first<=lo-threshold THEN CONTINUE; END IF;
    -- No collapsed duration below. NULL summaries (pre-migration rows) fall through and descend.
    IF n.min_extent>=threshold THEN CONTINUE; END IF;
    base:=CASE WHEN anchor IS NOT NULL AND n.min_time-anchor<threshold THEN anchor ELSE n.min_time END;
    IF n.max_extent<threshold AND n.min_time>=lo AND n.max_first<=hi AND n.max_first-base<threshold THEN
      IF anchor IS NOT NULL AND n.min_time-anchor>=threshold THEN
        first_time:=oc_qtext(anchor); last_time:=oc_qtext(finish); duration_count:=total;
        band:=CASE WHEN total=1 THEN single END; RETURN NEXT; anchor:=NULL;
      END IF;
      IF anchor IS NULL THEN anchor:=n.min_time; finish:=n.max_time; total:=0; END IF;
      IF n.max_time>finish THEN finish:=n.max_time; END IF;
      total:=total+n.subtree_count; single:=CASE WHEN total=1 THEN n.band END;
    ELSE
      IF n.right_id IS NOT NULL THEN ids:=array_append(ids,n.right_id); points:=array_append(points,false); END IF;
      ids:=array_append(ids,nid); points:=array_append(points,true);
      IF n.left_id IS NOT NULL THEN ids:=array_append(ids,n.left_id); points:=array_append(points,false); END IF;
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
ALTER TABLE oc_revisions DROP CONSTRAINT IF EXISTS oc_revisions_content;
ALTER TABLE oc_revisions ADD CONSTRAINT oc_revisions_content CHECK((snapshot_id IS NULL)<>(patch IS NULL));
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS patch_chain integer NOT NULL DEFAULT 0;
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS patch_bytes bigint NOT NULL DEFAULT 0;
-- Saves update the timeline row once; free space on each page keeps those updates in place
-- (HOT), so the catalogue's GIN index over the whole timeline's text is not rewritten.
ALTER TABLE oc_timelines SET (fillfactor=50);
-- Catalogue text (event_text) is refreshed after incremental saves; true until then.
ALTER TABLE oc_timelines ADD COLUMN IF NOT EXISTS event_text_stale boolean NOT NULL DEFAULT false;
-- Catalogue text: duration then moment titles and notes (moments in time order, each followed
-- by its stacked entries), each part at most 4096 characters and the whole at most 1 MiB.
-- Built in the database after incremental saves; mirrors eventSearchText in store.mjs.
-- Moments are read in chunks, stopping once the text is full.
DROP FUNCTION IF EXISTS oc_text_parts(jsonb,boolean);
CREATE OR REPLACE FUNCTION oc_event_text(tid uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE ids text[]; chunk text; result text;
BEGIN
  SELECT string_agg(left(x.v,4096),' ' ORDER BY d.band->>'id' COLLATE "C",x.o) INTO result
  FROM oc_duration_nodes d CROSS JOIN LATERAL (VALUES
    (1,CASE WHEN jsonb_typeof(d.definition->'metadata'->'title')='string' THEN d.definition->'metadata'->>'title' END),
    (2,CASE WHEN jsonb_typeof(d.definition->'metadata'->'description')='string' THEN d.definition->'metadata'->>'description' END)) x(o,v)
  WHERE d.timeline_id=tid AND x.v IS NOT NULL;
  SELECT array_agg(id ORDER BY time,id COLLATE "C") INTO ids FROM oc_moments WHERE timeline_id=tid;
  FOR i IN 1..coalesce(cardinality(ids),0) BY 1000 LOOP
    EXIT WHEN length(coalesce(result,''))>=1048576;
    SELECT string_agg(left(x.v,4096),' ' ORDER BY u.ord,x.n,x.o) INTO chunk
    FROM unnest(ids[i:i+999]) WITH ORDINALITY u(id,ord)
    CROSS JOIN LATERAL (SELECT event->'metadata' AS meta FROM oc_moments WHERE timeline_id=tid AND id=u.id) m
    CROSS JOIN LATERAL (
      SELECT 0::bigint AS n,y.o,y.v FROM (VALUES
        (1,CASE WHEN jsonb_typeof(m.meta->'title')='string' THEN m.meta->>'title' END),
        (2,CASE WHEN jsonb_typeof(m.meta->'description')='string' THEN m.meta->>'description' END)) y(o,v)
      UNION ALL
      SELECT a.ord*1000000+e.ord,y.o,y.v FROM jsonb_each(m.meta) WITH ORDINALITY a(key,value,ord)
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.value)='array' THEN a.value ELSE '[]'::jsonb END) WITH ORDINALITY e(item,ord)
      CROSS JOIN LATERAL (VALUES
        (1,CASE WHEN jsonb_typeof(e.item->'metadata'->'title')='string' THEN e.item->'metadata'->>'title' END),
        (2,CASE WHEN jsonb_typeof(e.item->'metadata'->'description')='string' THEN e.item->'metadata'->>'description' END)) y(o,v)
    ) x WHERE x.v IS NOT NULL;
    result:=concat_ws(' ',result,chunk);
  END LOOP;
  RETURN left(coalesce(result,''),1048576);
END $$;
