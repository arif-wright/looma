-- READ ONLY: capture immediately before separately approved execution.
-- Save results securely; never execute generated rollback text automatically.
SELECT current_user AS migration_role;
SELECT c.relname,pg_catalog.pg_get_userbyid(c.relowner) AS owner,c.relacl,
       c.relrowsecurity,c.relforcerowsecurity
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY c.relname;
SELECT a.attname,a.attacl,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
       pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expression
FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE a.attrelid='public.user_preferences'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename IN
 ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY tablename,policyname;
SELECT c.relname,t.tgname,t.tgenabled,pg_catalog.pg_get_triggerdef(t.oid,true) AS definition
FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') AND NOT t.tgisinternal
ORDER BY c.relname,t.tgname;
-- Exact original targeted ACLs and suggested restoration statements.
-- Restoring these grants reopens the security issue and requires new approval.
WITH original AS (
 SELECT c.relname,a.attname AS column_name,x.grantee,x.grantor,x.privilege_type,x.is_grantable
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
 CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
 WHERE n.nspname='public' AND c.relname='user_preferences'
  AND a.attname IN ('moderation_status','moderation_until')
  AND x.grantee IN ('anon'::regrole,'authenticated'::regrole) AND x.privilege_type IN ('INSERT','UPDATE')
 UNION ALL
 SELECT c.relname,NULL::name,x.grantee,x.grantor,x.privilege_type,x.is_grantable
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x
 WHERE n.nspname='public' AND c.relname IN
  ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events')
  AND x.grantee IN ('anon'::regrole,'authenticated'::regrole) AND x.privilege_type IN ('TRUNCATE','TRIGGER')
)
SELECT relname,column_name,pg_catalog.pg_get_userbyid(grantee) AS grantee,
 pg_catalog.pg_get_userbyid(grantor) AS grantor,privilege_type,is_grantable,
 format('GRANT %s%s ON TABLE public.%I TO %I%s;',privilege_type,
  CASE WHEN column_name IS NULL THEN '' ELSE format(' (%I)',column_name) END,relname,
  pg_catalog.pg_get_userbyid(grantee),CASE WHEN is_grantable THEN ' WITH GRANT OPTION' ELSE '' END) AS proposed_rollback_sql
FROM original ORDER BY relname,column_name,grantee,privilege_type;
-- Save effective privileges too: direct ACL text alone misses inherited/PUBLIC rights.
SELECT r.rolname,a.attname,p.privilege,
 pg_catalog.has_column_privilege(r.oid,a.attrelid,a.attnum,p.privilege) AS allowed
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_attribute a
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
WHERE r.rolname IN ('anon','authenticated','service_role')
 AND a.attrelid='public.user_preferences'::regclass AND a.attnum>0 AND NOT a.attisdropped
ORDER BY r.rolname,a.attnum,p.privilege;
