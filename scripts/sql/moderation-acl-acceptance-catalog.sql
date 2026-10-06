-- READ ONLY: intended after separately approved execution. Before execution,
-- the first two reports should show allowed=true and expected=false.
-- Every row's allowed value must equal expected after hardening.
SELECT r.rolname,a.attname,p.privilege,
 pg_catalog.has_column_privilege(r.oid,a.attrelid,a.attnum,p.privilege) AS allowed,
 (r.rolname='service_role') AS expected
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_attribute a
CROSS JOIN (VALUES ('INSERT'),('UPDATE')) p(privilege)
WHERE r.rolname IN ('anon','authenticated','service_role')
 AND a.attrelid='public.user_preferences'::regclass
 AND a.attname IN ('moderation_status','moderation_until') ORDER BY r.rolname,a.attname,p.privilege;
SELECT r.rolname,c.relname,p.privilege,
 pg_catalog.has_table_privilege(r.oid,c.oid,p.privilege) AS allowed,
 (r.rolname='service_role') AS expected
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (VALUES ('TRUNCATE'),('TRIGGER')) p(privilege)
WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname='public'
 AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events')
ORDER BY r.rolname,c.relname,p.privilege;
-- Ordinary preference authority remains as before; protected role remains denied.
SELECT a.attname,p.privilege,
 pg_catalog.has_column_privilege('authenticated',a.attrelid,a.attnum,p.privilege) AS allowed,
 (a.attname<>'role') AS expected
FROM pg_catalog.pg_attribute a CROSS JOIN (VALUES ('INSERT'),('UPDATE')) p(privilege)
WHERE a.attrelid='public.user_preferences'::regclass
 AND a.attname IN ('user_id','start_on','portable_state','consent_memory','consent_reactions','role')
ORDER BY a.attname,p.privilege;
-- The remaining table/column ACLs, RLS policies, triggers and column defaults must
-- match moderation-acl-capture-before.sql, except exactly the approved 32 revoked grant entries.
-- Rerun that read-only capture and compare, without executing rollback strings.
