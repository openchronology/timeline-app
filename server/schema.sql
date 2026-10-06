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
        SELECT events->0 INTO sample FROM oc_nodes WHERE timeline_id=tid AND id=current_id;
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
      SELECT events->0 INTO sample FROM oc_nodes WHERE timeline_id=tid AND id=current_id;
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
  n record; e jsonb; emitted integer:=0;
BEGIN
  IF max_rows<1 OR max_rows>200001 THEN RAISE EXCEPTION 'Invalid event page size'; END IF;
  IF lo IS NOT NULL AND hi IS NOT NULL AND lo>hi THEN RETURN; END IF;
  SELECT ARRAY[root] INTO ids FROM oc_timelines WHERE id=tid AND root IS NOT NULL;
  WHILE cardinality(ids)>0 LOOP
    idx:=cardinality(ids); nid:=ids[idx]; point:=points[idx]; ids:=ids[1:idx-1]; points:=points[1:idx-1];
    SELECT time,left_id,right_id,first_time,last_time INTO n FROM oc_nodes WHERE timeline_id=tid AND id=nid;
    IF (lo IS NOT NULL AND n.last_time<lo) OR (hi IS NOT NULL AND n.first_time>hi)
      OR (after_time IS NOT NULL AND n.last_time<after_time) THEN CONTINUE; END IF;
    IF point THEN
      IF (lo IS NOT NULL AND n.time<lo) OR (hi IS NOT NULL AND n.time>hi) OR (after_time IS NOT NULL AND n.time<after_time) THEN CONTINUE; END IF;
      FOR e IN SELECT value FROM oc_nodes,LATERAL jsonb_array_elements(events) WHERE timeline_id=tid AND id=nid LOOP
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
