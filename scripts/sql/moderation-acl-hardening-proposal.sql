-- REVIEW PROPOSAL ONLY. NOT APPROVED FOR LIVE APPLICATION.
-- Independently reviewed security change; not a feature migration.
-- Expected owner/grantor: postgres.
-- Requires approval for the exact revocations below, and reviewed/tested
-- pure-on-read moderation expiry code before rollout. No persistent schema,
-- data, defaults, RLS, service-role grants, or ordinary client DML changes.
-- Run moderation-acl-capture-before.sql and save results before approved execution.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $hardening$
DECLARE
  targets text[] := ARRAY['user_preferences','user_items','item_catalog',
    'companions','companion_journal_entries','world_events'];
  protected_columns text[] := ARRAY['moderation_status','moderation_until'];
  client_roles text[] := ARRAY['anon','authenticated'];
  preserved_before jsonb;
  preserved_after jsonb;
  effective_before jsonb;
  effective_after jsonb;
  table_effective_before jsonb;
  table_effective_after jsonb;
  target_count integer;
  role_name text;
  table_name text;
  col_name text;
  privilege_name text;
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'hardening_requires_reviewed_postgresql17_or_newer';
  END IF;
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'hardening_requires_reviewed_postgres_owner';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY(targets)
      AND c.relkind='r' AND c.relowner='postgres'::regrole AND c.relrowsecurity) <> 6 THEN
    RAISE EXCEPTION 'hardening_table_owner_or_rls_drift';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_attribute a
      WHERE a.attrelid='public.user_preferences'::regclass AND a.attnum>0 AND NOT a.attisdropped
      AND a.attname=ANY(protected_columns)) <> 2 THEN
    RAISE EXCEPTION 'hardening_moderation_column_drift';
  END IF;
  FOREACH role_name IN ARRAY client_roles LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name AND NOT rolsuper
        AND NOT rolbypassrls AND NOT rolcreaterole) THEN
      RAISE EXCEPTION 'hardening_client_role_drift: %', role_name;
    END IF;
    -- Column REVOKE cannot override table-wide INSERT/UPDATE. Never remove
    -- those table grants here, because that could also erase ordinary column grants.
    IF pg_catalog.has_table_privilege(role_name,'public.user_preferences','INSERT')
       OR pg_catalog.has_table_privilege(role_name,'public.user_preferences','UPDATE') THEN
      RAISE EXCEPTION 'hardening_broad_preference_grant_requires_separate_review: %',role_name;
    END IF;
  END LOOP;
  -- Reviewed client roles have no granted memberships. Refuse new inherited or
  -- SET ROLE routes instead of silently expanding this revocation's scope.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members
      WHERE member IN ('anon'::regrole,'authenticated'::regrole)) THEN
    RAISE EXCEPTION 'hardening_client_membership_drift';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
    WHERE a.attrelid='public.user_preferences'::regclass AND a.attname=ANY(protected_columns)
      AND x.privilege_type IN ('INSERT','UPDATE')
      AND (x.grantee=0 OR (x.grantee IN ('anon'::regrole,'authenticated'::regrole)
        AND (x.grantor<>'postgres'::regrole OR x.is_grantable)))
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x
    WHERE n.nspname='public' AND c.relname=ANY(targets) AND x.privilege_type IN ('TRUNCATE','TRIGGER')
      AND (x.grantee=0 OR (x.grantee IN ('anon'::regrole,'authenticated'::regrole)
        AND (x.grantor<>'postgres'::regrole OR x.is_grantable)))
  ) THEN
    RAISE EXCEPTION 'hardening_alternate_grant_source_or_option_drift';
  END IF;
  -- Exact expected grants are direct, non-grantable, from postgres. Drift aborts.
  SELECT count(*) INTO target_count
  FROM pg_catalog.pg_attribute a
  CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
  WHERE a.attrelid='public.user_preferences'::regclass AND a.attname=ANY(protected_columns)
    AND x.grantee IN ('anon'::regrole,'authenticated'::regrole)
    AND x.grantor='postgres'::regrole AND NOT x.is_grantable
    AND x.privilege_type IN ('INSERT','UPDATE');
  IF target_count <> 8 THEN RAISE EXCEPTION 'hardening_column_acl_drift'; END IF;
  SELECT count(*) INTO target_count
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x
  WHERE n.nspname='public' AND c.relname=ANY(targets)
    AND x.grantee IN ('anon'::regrole,'authenticated'::regrole)
    AND x.grantor='postgres'::regrole AND NOT x.is_grantable
    AND x.privilege_type IN ('TRUNCATE','TRIGGER');
  IF target_count <> 24 THEN RAISE EXCEPTION 'hardening_table_acl_drift'; END IF;

  -- Snapshot every non-target explicit ACL on these exact tables/columns.
  SELECT jsonb_agg(to_jsonb(q) ORDER BY q.relname,q.attnum,q.grantee,q.grantor,q.privilege_type)
  INTO preserved_before FROM (
    SELECT c.relname,0::int AS attnum,x.grantee,x.grantor,x.privilege_type,x.is_grantable
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x
    WHERE n.nspname='public' AND c.relname=ANY(targets)
      AND NOT (x.grantee IN ('anon'::regrole,'authenticated'::regrole) AND x.privilege_type IN ('TRUNCATE','TRIGGER'))
    UNION ALL
    SELECT c.relname,a.attnum::int,x.grantee,x.grantor,x.privilege_type,x.is_grantable
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
    WHERE n.nspname='public' AND c.relname=ANY(targets)
      AND NOT (c.relname='user_preferences' AND a.attname=ANY(protected_columns)
        AND x.grantee IN ('anon'::regrole,'authenticated'::regrole) AND x.privilege_type IN ('INSERT','UPDATE'))
  ) q;
  -- Preserve all ordinary preference effective column privileges, including
  -- user_id, consent flags, and already-denied role writes. Preserve service authority.
  SELECT jsonb_agg(to_jsonb(q) ORDER BY q.rolname,q.attname,q.privilege)
  INTO effective_before FROM (
    SELECT r.rolname,a.attname,p.privilege,
      pg_catalog.has_column_privilege(r.oid,a.attrelid,a.attnum,p.privilege) AS allowed
    FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_attribute a
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
    WHERE r.rolname IN ('anon','authenticated','service_role')
      AND a.attrelid='public.user_preferences'::regclass AND a.attnum>0 AND NOT a.attisdropped
      AND NOT (r.rolname=ANY(client_roles) AND a.attname=ANY(protected_columns) AND p.privilege IN ('INSERT','UPDATE'))
  ) q;

  SELECT jsonb_agg(to_jsonb(q) ORDER BY q.rolname,q.relname,q.privilege)
  INTO table_effective_before FROM (
    SELECT r.rolname,c.relname,p.privilege,
      pg_catalog.has_table_privilege(r.oid,c.oid,p.privilege) AS allowed
    FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('MAINTAIN'),('TRUNCATE'),('TRIGGER')) p(privilege)
    WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname='public' AND c.relname=ANY(targets)
      AND NOT (r.rolname=ANY(client_roles) AND p.privilege IN ('TRUNCATE','TRIGGER'))
  ) q;

  -- The only changes proposed. RESTRICT prevents unreviewed cascading revokes.
  REVOKE INSERT (moderation_status,moderation_until), UPDATE (moderation_status,moderation_until)
    ON TABLE public.user_preferences FROM anon,authenticated RESTRICT;
  REVOKE TRUNCATE,TRIGGER ON TABLE public.user_preferences,public.user_items,public.item_catalog,
    public.companions,public.companion_journal_entries,public.world_events FROM anon,authenticated RESTRICT;

  FOREACH role_name IN ARRAY client_roles LOOP
    FOREACH col_name IN ARRAY protected_columns LOOP
      FOREACH privilege_name IN ARRAY ARRAY['INSERT','UPDATE'] LOOP
        IF pg_catalog.has_column_privilege(role_name,'public.user_preferences',col_name,privilege_name) THEN
          RAISE EXCEPTION 'hardening_column_still_effectively_allowed: %,%,%',role_name,col_name,privilege_name;
        END IF;
      END LOOP;
    END LOOP;
    FOREACH table_name IN ARRAY targets LOOP
      FOREACH privilege_name IN ARRAY ARRAY['TRUNCATE','TRIGGER'] LOOP
        IF pg_catalog.has_table_privilege(role_name,format('public.%I',table_name),privilege_name) THEN
          RAISE EXCEPTION 'hardening_table_still_effectively_allowed: %,%,%',role_name,table_name,privilege_name;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  FOREACH col_name IN ARRAY protected_columns LOOP
    IF NOT pg_catalog.has_column_privilege('service_role','public.user_preferences',col_name,'INSERT')
       OR NOT pg_catalog.has_column_privilege('service_role','public.user_preferences',col_name,'UPDATE') THEN
      RAISE EXCEPTION 'hardening_service_moderation_authority_changed';
    END IF;
  END LOOP;
  SELECT jsonb_agg(to_jsonb(q) ORDER BY q.relname,q.attnum,q.grantee,q.grantor,q.privilege_type)
  INTO preserved_after FROM (
    SELECT c.relname,0::int AS attnum,x.grantee,x.grantor,x.privilege_type,x.is_grantable
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x
    WHERE n.nspname='public' AND c.relname=ANY(targets)
      AND NOT (x.grantee IN ('anon'::regrole,'authenticated'::regrole) AND x.privilege_type IN ('TRUNCATE','TRIGGER'))
    UNION ALL
    SELECT c.relname,a.attnum::int,x.grantee,x.grantor,x.privilege_type,x.is_grantable
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x
    WHERE n.nspname='public' AND c.relname=ANY(targets)
      AND NOT (c.relname='user_preferences' AND a.attname=ANY(protected_columns)
        AND x.grantee IN ('anon'::regrole,'authenticated'::regrole) AND x.privilege_type IN ('INSERT','UPDATE'))
  ) q;
  SELECT jsonb_agg(to_jsonb(q) ORDER BY q.rolname,q.attname,q.privilege)
  INTO effective_after FROM (
    SELECT r.rolname,a.attname,p.privilege,
      pg_catalog.has_column_privilege(r.oid,a.attrelid,a.attnum,p.privilege) AS allowed
    FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_attribute a
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
    WHERE r.rolname IN ('anon','authenticated','service_role')
      AND a.attrelid='public.user_preferences'::regclass AND a.attnum>0 AND NOT a.attisdropped
      AND NOT (r.rolname=ANY(client_roles) AND a.attname=ANY(protected_columns) AND p.privilege IN ('INSERT','UPDATE'))
  ) q;
  SELECT jsonb_agg(to_jsonb(q) ORDER BY q.rolname,q.relname,q.privilege)
  INTO table_effective_after FROM (
    SELECT r.rolname,c.relname,p.privilege,
      pg_catalog.has_table_privilege(r.oid,c.oid,p.privilege) AS allowed
    FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('MAINTAIN'),('TRUNCATE'),('TRIGGER')) p(privilege)
    WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname='public' AND c.relname=ANY(targets)
      AND NOT (r.rolname=ANY(client_roles) AND p.privilege IN ('TRUNCATE','TRIGGER'))
  ) q;
  IF preserved_before IS DISTINCT FROM preserved_after OR effective_before IS DISTINCT FROM effective_after
      OR table_effective_before IS DISTINCT FROM table_effective_after THEN
    RAISE EXCEPTION 'hardening_unapproved_acl_side_effect';
  END IF;
END;
$hardening$;
COMMIT;
