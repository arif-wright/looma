-- One deterministic JSON snapshot. This query itself makes no changes.
WITH targets AS (
  SELECT c.* FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('user_preferences','user_items',
    'item_catalog','companions','companion_journal_entries','world_events')
), acl AS (
  SELECT c.relname AS relation, NULL::text AS column_name,
    CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END AS grantee,
    pg_catalog.pg_get_userbyid(x.grantor) AS grantor,x.privilege_type AS privilege,x.is_grantable
  FROM targets c CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x
  UNION ALL
  SELECT c.relname,a.attname,
    CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(x.grantee) END,
    pg_catalog.pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable
  FROM targets c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
), column_effective AS (
  SELECT r.rolname AS role,a.attname AS column_name,p.privilege,
    pg_catalog.has_column_privilege(r.oid,a.attrelid,a.attnum,p.privilege) AS allowed
  FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_attribute a
  CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
  WHERE r.rolname IN ('anon','authenticated','service_role')
    AND a.attrelid='public.user_preferences'::regclass AND a.attnum>0 AND NOT a.attisdropped
), table_effective AS (
  SELECT r.rolname AS role,c.relname AS relation,p.privilege,
    pg_catalog.has_table_privilege(r.oid,c.oid,p.privilege) AS allowed
  FROM pg_catalog.pg_roles r CROSS JOIN targets c
  CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('MAINTAIN'),('TRUNCATE'),('TRIGGER')) p(privilege)
  WHERE r.rolname IN ('anon','authenticated','service_role')
), catalog AS (
  SELECT c.relname,pg_catalog.pg_get_userbyid(c.relowner) AS owner,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
    c.relpersistence,c.reloptions,
    (SELECT jsonb_agg(to_jsonb(q) ORDER BY q.attnum) FROM (
      SELECT a.attnum,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,
        a.attnotnull,a.attidentity,a.attgenerated,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expression
      FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    ) q) AS columns,
    (SELECT jsonb_agg(to_jsonb(q) ORDER BY q.policyname) FROM (
      SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_catalog.pg_policies
      WHERE schemaname='public' AND tablename=c.relname
    ) q) AS policies,
    (SELECT jsonb_agg(to_jsonb(q) ORDER BY q.tgname) FROM (
      SELECT t.tgname,t.tgenabled,pg_catalog.pg_get_triggerdef(t.oid,true) AS definition
      FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal
    ) q) AS triggers,
    (SELECT jsonb_agg(to_jsonb(q) ORDER BY q.conname) FROM (
      SELECT k.conname,pg_catalog.pg_get_constraintdef(k.oid,true) AS definition
      FROM pg_catalog.pg_constraint k WHERE k.conrelid=c.oid
    ) q) AS constraints
  FROM targets c
)
SELECT jsonb_build_object(
 'acl',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY relation,column_name,grantee,grantor,privilege),'[]') FROM acl a),
 'column_effective',(SELECT jsonb_agg(to_jsonb(e) ORDER BY role,column_name,privilege) FROM column_effective e),
 'table_effective',(SELECT jsonb_agg(to_jsonb(e) ORDER BY role,relation,privilege) FROM table_effective e),
 'catalog',(SELECT jsonb_agg(to_jsonb(c) ORDER BY relname) FROM catalog c),
 'roles',(SELECT jsonb_agg(to_jsonb(q) ORDER BY rolname) FROM (
    SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls
    FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role')
  ) q),
 'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY role,member,grantor),'[]') FROM (
    SELECT pg_catalog.pg_get_userbyid(roleid) AS role,pg_catalog.pg_get_userbyid(member) AS member,
      pg_catalog.pg_get_userbyid(grantor) AS grantor,admin_option,inherit_option,set_option
    FROM pg_catalog.pg_auth_members WHERE member IN ('anon'::regrole,'authenticated'::regrole)
  ) q),
 'rows',jsonb_build_object(
    'user_preferences',(SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id) FROM public.user_preferences t),
    'user_items',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.user_items t),
    'item_catalog',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.item_catalog t),
    'companions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.companions t),
    'companion_journal_entries',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.companion_journal_entries t),
    'world_events',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.world_events t)
  )
);
