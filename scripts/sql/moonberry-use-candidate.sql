-- LOCAL CANDIDATE ONLY. Not a generated migration or authorization to apply live.
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
