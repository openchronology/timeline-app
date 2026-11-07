#!/bin/sh
# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Compose's one-shot database-setup service (docs/docker.md), run before every migration as
# the database's bootstrap superuser: creates pgmp, which only a superuser may, and the
# application's role, openchronology_app, which logs in with APP_DATABASE_PASSWORD, is not a
# superuser, and owns the database and everything in it. The migrations, the app and the mail
# worker connect as that role, as every other package's server does. A database from before
# the role existed has its tables, functions and types handed over to it. Safe to run again.
set -eu
: "${APP_DATABASE_PASSWORD:?Set APP_DATABASE_PASSWORD in .env}"
psql -X -q -v ON_ERROR_STOP=1 -v app_password="$APP_DATABASE_PASSWORD" <<'SQL'
SET client_min_messages = warning;
SELECT 'CREATE ROLE openchronology_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openchronology_app') \gexec
ALTER ROLE openchronology_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
  NOBYPASSRLS PASSWORD :'app_password';
CREATE EXTENSION IF NOT EXISTS pgmp;
SELECT format('ALTER DATABASE %I OWNER TO openchronology_app', current_database()) \gexec
-- What the superuser made in public before (the app once connected as it), except pgmp's own.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT format('ALTER %s %s OWNER TO openchronology_app',
      CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'S' THEN 'SEQUENCE' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,
      c.oid::regclass) AS command
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relowner = current_user::regrole
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
        AND d.objid = c.oid AND d.deptype IN ('e', 'a', 'i'))
    UNION ALL
    SELECT format('ALTER ROUTINE %s OWNER TO openchronology_app', p.oid::regprocedure)
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proowner = current_user::regrole
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass
        AND d.objid = p.oid AND d.deptype = 'e')
    UNION ALL
    SELECT format('ALTER %s %s OWNER TO openchronology_app',
      CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, t.oid::regtype)
    FROM pg_type t
    WHERE t.typnamespace = 'public'::regnamespace
      AND t.typowner = current_user::regrole
      AND (t.typtype IN ('e', 'd', 'r')
        OR (t.typtype = 'c' AND (SELECT relkind FROM pg_class WHERE oid = t.typrelid) = 'c'))
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass
        AND d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE item.command;
  END LOOP;
END
$$;
SQL
