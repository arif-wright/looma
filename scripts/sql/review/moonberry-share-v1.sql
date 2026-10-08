-- REVIEW PAYLOAD ONLY. Do not execute without explicit live approval.
-- Migration name: moonberry_share_v1. The supported apply_migration tool assigns
-- the actual migration-history version; no generated version is claimed here.
-- Exact product SQL body SHA-256: 84732dbc9f0bbd328f400d6c6d5a3f1786df7fb69ef0b9330c7890bfd7aa621f.
-- All feature DDL, grants and validations are one atomic DO statement.
-- The migration runner owns its transaction/history; no nested BEGIN/COMMIT.
-- SET LOCAL must persist into the DO or its first guard aborts before DDL.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '5s';
SET LOCAL transaction_timeout = '60s';
SET LOCAL search_path = '';
DO $rollout$
DECLARE
  before_catalog jsonb;
  after_catalog jsonb;
  before_config jsonb;
  after_config jsonb;
  role_name text;
  table_name text;
  col_name text;
  privilege_name text;
  fn oid;
  constraint_definition text;
BEGIN
  IF current_setting('lock_timeout')::interval <> interval '5 seconds' OR
     current_setting('statement_timeout')::interval <> interval '30 seconds' OR
     current_setting('idle_in_transaction_session_timeout')::interval <> interval '5 seconds' OR
     current_setting('transaction_timeout')::interval <> interval '60 seconds' OR
     current_setting('search_path') <> '""' THEN
    RAISE EXCEPTION 'moonberry_runner_lost_transaction_local_safety_settings';
  END IF;
  IF NOT pg_catalog.has_schema_privilege('authenticated','public','USAGE') THEN
    RAISE EXCEPTION 'moonberry_authenticated_public_schema_usage_missing';
  END IF;
  IF current_user <> 'postgres' OR current_setting('server_version_num')::int < 170000
      OR current_setting('server_version_num')::int >= 180000 THEN
    RAISE EXCEPTION 'moonberry_reviewed_owner_or_postgresql17_drift';
  END IF;
  IF to_regnamespace('item_use_internal') IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('share_moonberry','read_moonberry_share_moments','validate_moonberry_depleted_stack'))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.user_items'::regclass
      AND tgname='user_items_validate_depleted_stack') THEN
    RAISE EXCEPTION 'moonberry_feature_name_exists_stop_do_not_reapply';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog',
        'companions','companion_journal_entries','world_events')
      AND c.relkind='r' AND c.relowner='postgres'::regrole AND c.relrowsecurity AND NOT c.relforcerowsecurity) <> 6 THEN
    RAISE EXCEPTION 'moonberry_target_table_owner_or_rls_drift';
  END IF;
  SELECT pg_catalog.pg_get_constraintdef(oid,true) INTO constraint_definition
    FROM pg_catalog.pg_constraint WHERE conrelid='public.user_items'::regclass
      AND conname='user_items_quantity_check' AND contype='c' AND convalidated;
  IF constraint_definition IS DISTINCT FROM 'CHECK (quantity > 0)' THEN
    RAISE EXCEPTION 'moonberry_quantity_constraint_drift';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d
      ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.user_preferences'::regclass AND a.atttypid='boolean'::regtype
      AND pg_catalog.pg_get_expr(d.adbin,d.adrelid)='true'
      AND ((a.attname='consent_memory' AND NOT a.attnotnull)
        OR (a.attname='consent_reactions' AND a.attnotnull))) <> 2 THEN
    RAISE EXCEPTION 'moonberry_consent_shape_drift';
  END IF;
  -- No global creator defaults were present on the reviewed baseline. A global
  -- default can reach a newly created private schema; abort instead of fixing it.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl
      WHERE defaclrole='postgres'::regrole AND defaclnamespace=0) THEN
    RAISE EXCEPTION 'moonberry_unreviewed_global_creator_defaults';
  END IF;
  -- Public-schema function defaults may grant only these reviewed principals.
  -- PUBLIC's built-in EXECUTE and anon/service grants are explicitly removed
  -- from the two RPCs by the unchanged body. Helper defaults are not hardened here.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl d
      CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) x
      WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace
      AND d.defaclobjtype='f' AND (x.grantee NOT IN
        (0,'postgres'::regrole,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)
        OR x.privilege_type<>'EXECUTE' OR x.is_grantable)) THEN
    RAISE EXCEPTION 'moonberry_unreviewed_public_function_default_access';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members
      WHERE member IN ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole)) THEN
    RAISE EXCEPTION 'moonberry_client_role_membership_drift';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole) THEN
      RAISE EXCEPTION 'moonberry_client_role_authority_drift';
    END IF;
    IF pg_catalog.has_schema_privilege(role_name,'public','CREATE') OR
      pg_catalog.has_table_privilege(role_name,'public.user_preferences','INSERT') OR
      pg_catalog.has_table_privilege(role_name,'public.user_preferences','UPDATE') THEN
      RAISE EXCEPTION 'moonberry_client_schema_or_broad_preference_authority_drift';
    END IF;
    FOREACH col_name IN ARRAY ARRAY['moderation_status','moderation_until','role'] LOOP
      FOREACH privilege_name IN ARRAY ARRAY['INSERT','UPDATE'] LOOP
        IF pg_catalog.has_column_privilege(role_name,'public.user_preferences',col_name,privilege_name) THEN
          RAISE EXCEPTION 'moonberry_protected_preference_acl_drift';
        END IF;
      END LOOP;
    END LOOP;
    FOREACH table_name IN ARRAY ARRAY['user_preferences','user_items','item_catalog',
        'companions','companion_journal_entries','world_events'] LOOP
      IF pg_catalog.has_table_privilege(role_name,'public.'||table_name,'TRUNCATE') OR
        pg_catalog.has_table_privilege(role_name,'public.'||table_name,'TRIGGER') THEN
        RAISE EXCEPTION 'moonberry_security_table_acl_drift';
      END IF;
    END LOOP;
  END LOOP;
  -- Narrow non-player configuration only. No inventory, user, Journal or auth rows.
  IF (SELECT count(*) FROM public.item_catalog WHERE item_key='world-moonberry'
      AND kind='consumable' AND capabilities @> ARRAY['consumable','giftable']::text[]
      AND NOT ('placeable'=ANY(capabilities))) <> 1 OR
    (SELECT count(*) FROM public.item_catalog WHERE item_key='world-moonberry') <> 1 OR
    (SELECT count(*) FROM public.world_maps WHERE id='wilds-exploration' AND version=1 AND is_active) <> 1 OR
    (SELECT count(*) FROM public.world_gather_nodes n JOIN public.item_catalog i ON i.id=n.reward_item_id
      WHERE n.map_id='wilds-exploration' AND n.node_key='moonberry-bush' AND n.map_version=1 AND n.is_active
      AND n.x=800 AND n.y=120 AND n.interaction_radius=58 AND i.item_key='world-moonberry'
      AND n.reward_quantity=1 AND n.cooldown_seconds=300 AND n.max_owned_quantity=20) <> 1 OR
    (SELECT count(*) FROM public.world_landmarks WHERE map_id='wilds-exploration'
      AND landmark_key='moonberry-grove' AND map_version=1 AND is_active
      AND x=800 AND y=120 AND discovery_radius=72) <> 1 THEN
    RAISE EXCEPTION 'moonberry_nonplayer_configuration_drift';
  END IF;
  -- Recheck complete captured metadata/configuration around the exact product body.
  EXECUTE $capture$SELECT to_jsonb(c) || jsonb_build_object('existing_public_functions',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (
 SELECT p.oid,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
 p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_catalog.pg_get_functiondef(p.oid) AS definition
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind IN ('f','p')
 AND p.proname NOT IN ('share_moonberry','read_moonberry_share_moments','validate_moonberry_depleted_stack')
 ORDER BY p.oid) q)) AS preserved FROM (SELECT jsonb_build_object('migration_role',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT current_user AS migration_role) q),'tables',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT c.relname,pg_catalog.pg_get_userbyid(c.relowner) AS owner,c.relacl,
       c.relrowsecurity,c.relforcerowsecurity
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY c.relname) q),'preference_columns',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT a.attname,a.attacl,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
       pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expression
FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE a.attrelid='public.user_preferences'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) q),'policies',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename IN
 ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY tablename,policyname) q),'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT c.relname,t.tgname,t.tgenabled,pg_catalog.pg_get_triggerdef(t.oid,true) AS definition
FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') AND NOT t.tgisinternal AND NOT (c.relname='user_items' AND t.tgname='user_items_validate_depleted_stack')
ORDER BY c.relname,t.tgname) q),'target_acl_restore_text_do_not_execute',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (WITH original AS (
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
FROM original ORDER BY relname,column_name,grantee,privilege_type) q),'effective_preference_columns',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT r.rolname,a.attname,p.privilege,
 pg_catalog.has_column_privilege(r.oid,a.attrelid,a.attnum,p.privilege) AS allowed
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_attribute a
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
WHERE r.rolname IN ('anon','authenticated','service_role')
 AND a.attrelid='public.user_preferences'::regclass AND a.attnum>0 AND NOT a.attisdropped
ORDER BY r.rolname,a.attnum,p.privilege) q),'all_columns',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT c.relname,a.attnum,a.attname,a.attacl,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,a.attgenerated,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expression FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY c.relname,a.attnum) q),'effective_tables',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT r.rolname,c.relname,p.privilege,pg_catalog.has_table_privilege(r.oid,c.oid,p.privilege) AS allowed FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('MAINTAIN'),('TRUNCATE'),('TRIGGER')) p(privilege) WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY r.rolname,c.relname,p.privilege) q),'all_acl',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT c.relname,NULL::name AS column_name,x.grantee,x.grantor,x.privilege_type,x.is_grantable FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x WHERE n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') UNION ALL SELECT c.relname,a.attname,x.grantee,x.grantor,x.privilege_type,x.is_grantable FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x WHERE n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY relname,column_name,grantee,grantor,privilege_type) q),'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT c.relname,con.conname,con.contype,pg_catalog.pg_get_constraintdef(con.oid,true) AS definition FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid=con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') AND NOT (c.relname='user_items' AND con.conname='user_items_quantity_check') ORDER BY c.relname,con.conname) q),'roles',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role','postgres') ORDER BY rolname) q),'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT pg_catalog.pg_get_userbyid(roleid) AS role,pg_catalog.pg_get_userbyid(member) AS member,pg_catalog.pg_get_userbyid(grantor) AS grantor,admin_option,inherit_option,set_option FROM pg_catalog.pg_auth_members WHERE member IN ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole) ORDER BY role,member,grantor) q),'default_acl',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT defaclrole,defaclnamespace,defaclobjtype,defaclacl FROM pg_catalog.pg_default_acl ORDER BY defaclrole,defaclnamespace,defaclobjtype) q),'version',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT current_setting('server_version_num') AS server_version_num,current_user,session_user) q),'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT n.nspname,c.relname,i.indisunique,i.indisprimary,pg_catalog.pg_get_indexdef(i.indexrelid) AS definition FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY c.relname,i.indexrelid) q)) AS capture) base(c)$capture$ INTO before_catalog;
  EXECUTE $configuration$SELECT jsonb_build_object(
 'catalog', (SELECT jsonb_agg(jsonb_build_object('item_key',item_key,'kind',kind,'capabilities',capabilities)) FROM public.item_catalog WHERE item_key='world-moonberry'),
 'node', (SELECT jsonb_agg(jsonb_build_object('map_id',n.map_id,'node_key',n.node_key,'map_version',n.map_version,'x',n.x,'y',n.y,'interaction_radius',n.interaction_radius,'reward_item_key',i.item_key,'reward_quantity',n.reward_quantity,'cooldown_seconds',n.cooldown_seconds,'max_owned_quantity',n.max_owned_quantity,'is_active',n.is_active)) FROM public.world_gather_nodes n JOIN public.item_catalog i ON i.id=n.reward_item_id WHERE n.map_id='wilds-exploration' AND n.node_key='moonberry-bush'),
 'map', (SELECT jsonb_agg(jsonb_build_object('id',id,'version',version,'is_active',is_active)) FROM public.world_maps WHERE id='wilds-exploration'),
 'landmark', (SELECT jsonb_agg(jsonb_build_object('map_id',map_id,'landmark_key',landmark_key,'map_version',map_version,'x',x,'y',y,'discovery_radius',discovery_radius,'is_active',is_active)) FROM public.world_landmarks WHERE map_id='wilds-exploration' AND landmark_key='moonberry-grove')
) AS public_configuration$configuration$ INTO before_config;

  EXECUTE $moonberry_candidate$-- LOCAL CANDIDATE ONLY. Not a generated migration or authorization to apply live.
-- Requires the existing unified items, Journal, Moonberry gather, and consent schema.
-- Missing consent columns intentionally fail rollout preflight instead of opting in.
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='user_preferences' and column_name='consent_memory' and data_type='boolean')
    or not exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='user_preferences' and column_name='consent_reactions' and data_type='boolean') then
    raise exception 'moonberry_use_requires_verified_consent_schema';
  end if;
end $$;

alter table public.user_items drop constraint user_items_quantity_check;
alter table public.user_items add constraint user_items_quantity_check check (quantity >= 0);

create function public.validate_moonberry_depleted_stack()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.quantity = 0 and not exists (
    select 1 from public.item_catalog i where i.id=new.item_id and i.item_key='world-moonberry'
      and i.kind='consumable' and i.capabilities @> array['consumable','giftable']::text[]
      and not ('placeable'=any(i.capabilities))
  ) then raise exception 'only_moonberry_may_be_depleted' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger user_items_validate_depleted_stack
before insert or update of quantity,item_id on public.user_items
for each row execute function public.validate_moonberry_depleted_stack();

create schema item_use_internal;
revoke all on schema item_use_internal from public,anon,authenticated;
create table item_use_internal.moonberry_receipts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  -- Identity snapshots retain deduplication even after a target is removed.
  user_item_id uuid not null,
  companion_id uuid not null,
  event_id uuid not null unique default gen_random_uuid(),
  status text not null check (status in ('shared','empty')),
  quantity_after integer not null check (quantity_after >= 0),
  created_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,request_id)
);
alter table item_use_internal.moonberry_receipts enable row level security;
revoke all on item_use_internal.moonberry_receipts from public,anon,authenticated;

create function public.share_moonberry(p_user_item_id uuid,p_companion_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  caller uuid := auth.uid();
  owned public.user_items%rowtype;
  comp public.companions%rowtype;
  receipt item_use_internal.moonberry_receipts%rowtype;
  memory_enabled boolean := false;
  reactions_enabled boolean := false;
  result jsonb;
begin
  if caller is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_user_item_id is null or p_companion_id is null or p_request_id is null then
    return jsonb_build_object('error','invalid_request');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'moonberry-use:' || caller::text || ':' || p_request_id::text,0));
  -- Exact same namespace as fn_world_gather_moonberry; acquire before row locks.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    caller::text || ':wilds-exploration:moonberry-bush',0));

  select * into receipt from item_use_internal.moonberry_receipts r
    where r.owner_id=caller and r.request_id=p_request_id;
  if found then
    if receipt.user_item_id<>p_user_item_id or receipt.companion_id<>p_companion_id then
      return jsonb_build_object('error','request_target_mismatch');
    end if;
    -- No past reaction, Journal body, memory ID, or fresh memory writes on replay.
    return jsonb_build_object('ok',receipt.status='shared','status',receipt.status,
      'requestId',receipt.request_id,'userItemId',receipt.user_item_id,
      'companionId',receipt.companion_id,'quantityAfter',receipt.quantity_after,'replayed',true);
  end if;

  -- Companion first, then item, consistent with existing direct-care lock order.
  select * into comp from public.companions c
    where c.id=p_companion_id and c.owner_id=caller for no key update;
  if not found then return jsonb_build_object('error','companion_required'); end if;
  select u.* into owned from public.user_items u
    where u.id=p_user_item_id and u.owner_id=caller for no key update;
  if not found then return jsonb_build_object('error','item_required'); end if;
  if owned.source_type<>'world' or owned.source_key is distinct from 'moonberry-bush'
    or not exists (select 1 from public.item_catalog i where i.id=owned.item_id
      and i.item_key='world-moonberry' and i.kind='consumable'
      and i.capabilities @> array['consumable','giftable']::text[]
      and not ('placeable'=any(i.capabilities))) then
    return jsonb_build_object('error','item_not_supported');
  end if;
  if owned.quantity=0 then
    insert into item_use_internal.moonberry_receipts(owner_id,request_id,user_item_id,companion_id,status,quantity_after)
      values(caller,p_request_id,owned.id,comp.id,'empty',0) returning * into receipt;
    return jsonb_build_object('ok',false,'status','empty','requestId',p_request_id,
      'userItemId',owned.id,'companionId',comp.id,'quantityAfter',0,'replayed',false);
  end if;

  -- Existing preference updates wait until this transaction completes, or vice versa.
  -- No row means no stored memory, including concurrent first-time opt-out inserts.
  select p.consent_memory is true,p.consent_reactions is true into memory_enabled,reactions_enabled
    from public.user_preferences p where p.user_id=caller for share;
  update public.user_items set quantity=quantity-1 where id=owned.id and owner_id=caller
    returning quantity into owned.quantity;
  insert into item_use_internal.moonberry_receipts(owner_id,request_id,user_item_id,companion_id,status,quantity_after)
    values(caller,p_request_id,owned.id,comp.id,'shared',owned.quantity) returning * into receipt;
  if memory_enabled is true then
    insert into public.companion_journal_entries(owner_id,companion_id,source_type,source_id,title,body,meta_json,created_at)
      values(caller,comp.id,'system',receipt.event_id,'A Moonberry for ' || comp.name,
        'You shared one Moonberry with ' || comp.name || '.',
        jsonb_build_object('category','item_use','action','share_moonberry','itemKey','world-moonberry',
          'userItemId',owned.id,'quantity',1,'ruleVersion','moonberry-share-v1'),receipt.created_at);
  end if;
  result := jsonb_build_object('ok',true,'status','shared','requestId',p_request_id,
    'userItemId',owned.id,'companionId',comp.id,'quantityAfter',owned.quantity,'replayed',false);
  if reactions_enabled is true then
    result := result || jsonb_build_object('reaction',comp.name || ' receives it gently.');
  end if;
  return result;
end;
$$;
revoke all on function public.share_moonberry(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.share_moonberry(uuid,uuid,uuid) to authenticated;

-- Read-only history evidence. Journal prose is editable; only this receipt join
-- establishes that this exact acquisition was shared with this exact recipient.
-- Ordinary archive-window filtering still happens in the existing story loader.
create function public.read_moonberry_share_moments(p_user_item_id uuid)
returns setof public.companion_journal_entries
language sql stable security definer set search_path='' as $$
  select j.* from item_use_internal.moonberry_receipts r
  join public.user_items u on u.id=r.user_item_id and u.owner_id=r.owner_id
  join public.companions c on c.id=r.companion_id and c.owner_id=r.owner_id
  join public.user_preferences p on p.user_id=r.owner_id and p.consent_memory is true
  join public.companion_journal_entries j on j.owner_id=r.owner_id and j.companion_id=r.companion_id
    and j.source_type='system' and j.source_id=r.event_id
  where r.owner_id=auth.uid() and r.user_item_id=p_user_item_id and r.status='shared'
    and j.meta_json @> jsonb_build_object('category','item_use','action','share_moonberry',
      'itemKey','world-moonberry','userItemId',r.user_item_id,'quantity',1,'ruleVersion','moonberry-share-v1')
  order by j.created_at desc,j.id desc limit 6;
$$;
revoke all on function public.read_moonberry_share_moments(uuid) from public,anon,service_role;
grant execute on function public.read_moonberry_share_moments(uuid) to authenticated;
$moonberry_candidate$;

  EXECUTE $capture$SELECT to_jsonb(c) || jsonb_build_object('existing_public_functions',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (
 SELECT p.oid,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
 p.proowner,p.proacl,p.prosecdef,p.proconfig,pg_catalog.pg_get_functiondef(p.oid) AS definition
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind IN ('f','p')
 AND p.proname NOT IN ('share_moonberry','read_moonberry_share_moments','validate_moonberry_depleted_stack')
 ORDER BY p.oid) q)) AS preserved FROM (SELECT jsonb_build_object('migration_role',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT current_user AS migration_role) q),'tables',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT c.relname,pg_catalog.pg_get_userbyid(c.relowner) AS owner,c.relacl,
       c.relrowsecurity,c.relforcerowsecurity
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY c.relname) q),'preference_columns',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT a.attname,a.attacl,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
       pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expression
FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE a.attrelid='public.user_preferences'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) q),'policies',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename IN
 ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY tablename,policyname) q),'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT c.relname,t.tgname,t.tgenabled,pg_catalog.pg_get_triggerdef(t.oid,true) AS definition
FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') AND NOT t.tgisinternal AND NOT (c.relname='user_items' AND t.tgname='user_items_validate_depleted_stack')
ORDER BY c.relname,t.tgname) q),'target_acl_restore_text_do_not_execute',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (WITH original AS (
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
FROM original ORDER BY relname,column_name,grantee,privilege_type) q),'effective_preference_columns',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT r.rolname,a.attname,p.privilege,
 pg_catalog.has_column_privilege(r.oid,a.attrelid,a.attnum,p.privilege) AS allowed
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_attribute a
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
WHERE r.rolname IN ('anon','authenticated','service_role')
 AND a.attrelid='public.user_preferences'::regclass AND a.attnum>0 AND NOT a.attisdropped
ORDER BY r.rolname,a.attnum,p.privilege) q),'all_columns',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT c.relname,a.attnum,a.attname,a.attacl,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,a.attgenerated,pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expression FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY c.relname,a.attnum) q),'effective_tables',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT r.rolname,c.relname,p.privilege,pg_catalog.has_table_privilege(r.oid,c.oid,p.privilege) AS allowed FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('MAINTAIN'),('TRUNCATE'),('TRIGGER')) p(privilege) WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY r.rolname,c.relname,p.privilege) q),'all_acl',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT c.relname,NULL::name AS column_name,x.grantee,x.grantor,x.privilege_type,x.is_grantable FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) x WHERE n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') UNION ALL SELECT c.relname,a.attname,x.grantee,x.grantor,x.privilege_type,x.is_grantable FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) x WHERE n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY relname,column_name,grantee,grantor,privilege_type) q),'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT c.relname,con.conname,con.contype,pg_catalog.pg_get_constraintdef(con.oid,true) AS definition FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid=con.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') AND NOT (c.relname='user_items' AND con.conname='user_items_quantity_check') ORDER BY c.relname,con.conname) q),'roles',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconfig FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role','postgres') ORDER BY rolname) q),'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT pg_catalog.pg_get_userbyid(roleid) AS role,pg_catalog.pg_get_userbyid(member) AS member,pg_catalog.pg_get_userbyid(grantor) AS grantor,admin_option,inherit_option,set_option FROM pg_catalog.pg_auth_members WHERE member IN ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole) ORDER BY role,member,grantor) q),'default_acl',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT defaclrole,defaclnamespace,defaclobjtype,defaclacl FROM pg_catalog.pg_default_acl ORDER BY defaclrole,defaclnamespace,defaclobjtype) q),'version',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT current_setting('server_version_num') AS server_version_num,current_user,session_user) q),'indexes',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (SELECT n.nspname,c.relname,i.indisunique,i.indisprimary,pg_catalog.pg_get_indexdef(i.indexrelid) AS definition FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('user_preferences','user_items','item_catalog','companions','companion_journal_entries','world_events') ORDER BY c.relname,i.indexrelid) q)) AS capture) base(c)$capture$ INTO after_catalog;
  EXECUTE $configuration$SELECT jsonb_build_object(
 'catalog', (SELECT jsonb_agg(jsonb_build_object('item_key',item_key,'kind',kind,'capabilities',capabilities)) FROM public.item_catalog WHERE item_key='world-moonberry'),
 'node', (SELECT jsonb_agg(jsonb_build_object('map_id',n.map_id,'node_key',n.node_key,'map_version',n.map_version,'x',n.x,'y',n.y,'interaction_radius',n.interaction_radius,'reward_item_key',i.item_key,'reward_quantity',n.reward_quantity,'cooldown_seconds',n.cooldown_seconds,'max_owned_quantity',n.max_owned_quantity,'is_active',n.is_active)) FROM public.world_gather_nodes n JOIN public.item_catalog i ON i.id=n.reward_item_id WHERE n.map_id='wilds-exploration' AND n.node_key='moonberry-bush'),
 'map', (SELECT jsonb_agg(jsonb_build_object('id',id,'version',version,'is_active',is_active)) FROM public.world_maps WHERE id='wilds-exploration'),
 'landmark', (SELECT jsonb_agg(jsonb_build_object('map_id',map_id,'landmark_key',landmark_key,'map_version',map_version,'x',x,'y',y,'discovery_radius',discovery_radius,'is_active',is_active)) FROM public.world_landmarks WHERE map_id='wilds-exploration' AND landmark_key='moonberry-grove')
) AS public_configuration$configuration$ INTO after_config;
  IF before_catalog IS DISTINCT FROM after_catalog OR before_config IS DISTINCT FROM after_config THEN
    RAISE EXCEPTION 'moonberry_unapproved_existing_catalog_or_configuration_change';
  END IF;
  SELECT pg_catalog.pg_get_constraintdef(oid,true) INTO constraint_definition
    FROM pg_catalog.pg_constraint WHERE conrelid='public.user_items'::regclass
      AND conname='user_items_quantity_check' AND contype='c' AND convalidated;
  IF constraint_definition IS DISTINCT FROM 'CHECK (quantity >= 0)' THEN
    RAISE EXCEPTION 'moonberry_quantity_postcondition_failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace
      WHERE nspname='item_use_internal' AND nspowner='postgres'::regrole)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid='item_use_internal.moonberry_receipts'::regclass
      AND relowner='postgres'::regrole AND relkind='r' AND relrowsecurity AND NOT relforcerowsecurity)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='item_use_internal.moonberry_receipts'::regclass) THEN
    RAISE EXCEPTION 'moonberry_receipts_owner_rls_or_policy_postcondition_failed';
  END IF;
  -- No unexpected explicit access survives on the private namespace/table.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) x
      WHERE n.nspname='item_use_internal' AND x.grantee<>'postgres'::regrole)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) x
      WHERE c.oid='item_use_internal.moonberry_receipts'::regclass AND x.grantee<>'postgres'::regrole) THEN
    RAISE EXCEPTION 'moonberry_private_object_acl_postcondition_failed';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF pg_catalog.has_schema_privilege(role_name,'item_use_internal','USAGE') OR
      pg_catalog.has_schema_privilege(role_name,'item_use_internal','CREATE') THEN
      RAISE EXCEPTION 'moonberry_private_schema_effective_access';
    END IF;
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      IF pg_catalog.has_table_privilege(role_name,'item_use_internal.moonberry_receipts',privilege_name) THEN
        RAISE EXCEPTION 'moonberry_private_table_effective_access';
      END IF;
    END LOOP;
  END LOOP;
  FOREACH fn IN ARRAY ARRAY['public.share_moonberry(uuid,uuid,uuid)'::regprocedure::oid,
      'public.read_moonberry_share_moments(uuid)'::regprocedure::oid] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid=fn AND proowner='postgres'::regrole
        AND prosecdef AND proconfig=ARRAY['search_path=""']) OR
      NOT pg_catalog.has_function_privilege('authenticated',fn,'EXECUTE') OR
      pg_catalog.has_function_privilege('anon',fn,'EXECUTE') OR
      pg_catalog.has_function_privilege('service_role',fn,'EXECUTE') OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
        CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) x
        WHERE p.oid=fn AND (x.grantee NOT IN ('postgres'::regrole,'authenticated'::regrole)
          OR x.privilege_type<>'EXECUTE' OR x.is_grantable)) THEN
      RAISE EXCEPTION 'moonberry_rpc_owner_search_path_or_execute_postcondition_failed';
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc
      WHERE oid='public.validate_moonberry_depleted_stack()'::regprocedure
      AND proowner='postgres'::regrole AND NOT prosecdef AND prorettype='trigger'::regtype
      AND proconfig=ARRAY['search_path=""']) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.user_items'::regclass
      AND tgname='user_items_validate_depleted_stack' AND tgenabled='O' AND NOT tgisinternal
      AND tgtype=23 AND tgfoid='public.validate_moonberry_depleted_stack()'::regprocedure
      AND cardinality(tgattr::smallint[])=2
      AND tgattr::smallint[] @> ARRAY[
        (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid='public.user_items'::regclass AND attname='quantity'),
        (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid='public.user_items'::regclass AND attname='item_id')]) THEN
    RAISE EXCEPTION 'moonberry_depletion_trigger_postcondition_failed';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid='public.validate_moonberry_depleted_stack()'::regprocedure) IS DISTINCT FROM '9a8eaff8faf1e50244d265b3b60d63ed' THEN RAISE EXCEPTION 'moonberry_function_body_changed'; END IF;
  IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid='public.share_moonberry(uuid,uuid,uuid)'::regprocedure) IS DISTINCT FROM '0352763cf2cb4960e725a55066dcf474' THEN RAISE EXCEPTION 'moonberry_function_body_changed'; END IF;
  IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc WHERE oid='public.read_moonberry_share_moments(uuid)'::regprocedure) IS DISTINCT FROM '7c1adbc6b9518e0f29136cc3daa77e7f' THEN RAISE EXCEPTION 'moonberry_function_body_changed'; END IF;
END;
$rollout$;
