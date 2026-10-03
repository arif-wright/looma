-- Requires preserve_sanctuary_item_history. No table grants or RLS changes.
-- LOCAL REVIEW REQUIRED: narrowly scoped definer RPC + private receipt storage.
-- No live application is authorized by preparing this migration.
create schema sanctuary_internal;
revoke all on schema sanctuary_internal from public, anon, authenticated;
create table sanctuary_internal.rest_receipts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  companion_id uuid not null references public.companions(id) on delete cascade,
  interaction_id uuid not null references public.sanctuary_interactions(id) on delete cascade,
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot)='object'),
  created_at timestamptz not null default now(),
  primary key(owner_id, request_id)
);
alter table sanctuary_internal.rest_receipts enable row level security;
revoke all on sanctuary_internal.rest_receipts from public, anon, authenticated;

create function public.perform_sanctuary_shared_rest(p_companion_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  comp public.companions%rowtype;
  placed public.sanctuary_placements%rowtype;
  rest public.sanctuary_interactions%rowtype;
  receipt sanctuary_internal.rest_receipts%rowtype;
  memory public.companion_journal_entries%rowtype;
  latest timestamptz;
  occurred_at timestamptz;
  before_affection integer;
  before_trust integer;
  before_energy integer;
  after_affection integer;
  after_trust integer;
  after_energy integer;
  next_mood text;
  reaction text;
  companion_name text;
  result jsonb;
begin
  if caller is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_request_id is null or p_companion_id is null then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  -- Bind concurrent reuse of one UUID to exactly one owned companion.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sanctuary-rest:' || caller::text || ':' || p_request_id::text,0));
  -- NO KEY UPDATE serializes rest writes without conflicting with placement FK key-share locks.
  -- Every request for this companion, including different request UUIDs, waits
  -- here. The cooldown is read only after the prior transaction has committed.
  select * into comp from public.companions c
    where c.id=p_companion_id and c.owner_id=caller for no key update;
  if not found then return jsonb_build_object('error', 'companion_required'); end if;
  occurred_at := clock_timestamp();

  select * into receipt from sanctuary_internal.rest_receipts r
    where r.owner_id=caller and r.request_id=p_request_id;
  if found then
    if receipt.companion_id <> p_companion_id then return jsonb_build_object('error', 'request_companion_mismatch'); end if;
    -- The private receipt is immutable to callers. Never reconstruct an outcome
    -- from caller-writable Journal/interaction fields on replay.
    return receipt.result_snapshot || jsonb_build_object('replayed', true);
  end if;

  select max(i.created_at) into latest from public.sanctuary_interactions i
    where i.owner_id=caller and i.companion_id=p_companion_id and i.action='shared_rest';
  if latest is not null and occurred_at < latest + interval '4 hours' then
    return jsonb_build_object('error','rest_cooldown','message',comp.name || ' is still carrying the quiet from your last rest.',
      'retryAfter',ceil(extract(epoch from latest + interval '4 hours' - occurred_at)),
      'nextAvailableAt',latest + interval '4 hours');
  end if;

  -- Shared lock keeps the chosen seat stable through snapshot + memory writes.
  select p.* into placed from public.sanctuary_placements p
    join public.item_catalog i on i.id=p.item_id
    where p.owner_id=caller and i.item_key='care-moss-seat' and 'interactive'=any(i.capabilities)
    order by p.placed_at, p.id limit 1 for share of p;
  if not found then return jsonb_build_object('error','moss_seat_must_be_placed'); end if;

  -- Persisted stats are authoritative. Time away never subtracts relationship.
  before_affection := greatest(0,least(100,coalesce(comp.affection,0)));
  before_trust := greatest(0,least(100,coalesce(comp.trust,0)));
  before_energy := greatest(0,least(100,coalesce(comp.energy,0)));
  after_affection := least(100,before_affection+2);
  after_trust := least(100,before_trust+3);
  after_energy := least(100,before_energy+35);
  next_mood := case when after_energy <= 5 then 'low_energy' when after_energy < 20 then 'tired'
    when after_affection > 70 and after_trust > 60 then 'happy'
    when after_affection < 30 and after_trust < 30 then 'stressed' else 'neutral' end;
  companion_name := coalesce(nullif(btrim(comp.name),''),'Your companion');
  reaction := case when before_energy <= 20 then companion_name || ' curls into the Moss Seat beside you. After a quiet while, their breathing steadies and ' || (after_energy-before_energy)::text || ' spark returns.'
    when before_energy <= 55 then companion_name || ' settles into the Moss Seat with you. The sanctuary grows still, and ' || (after_energy-before_energy)::text || ' spark returns.'
    else companion_name || ' rests beside you on the Moss Seat. Nothing was urgent; the quiet itself became the memory.' end;

  update public.companions set affection=after_affection,trust=after_trust,energy=after_energy,mood=next_mood,state='resting'
    where id=p_companion_id and owner_id=caller returning * into comp;
  if not found then raise exception 'rest_companion_update_failed'; end if;
  -- Touch only rest-related fields; preserve care timestamps, streak, and bond.
  insert into public.companion_stats(companion_id,last_passive_tick,last_meaningful_interaction_at)
    values(p_companion_id,occurred_at,occurred_at)
    on conflict(companion_id) do update set last_passive_tick=excluded.last_passive_tick,
      last_meaningful_interaction_at=excluded.last_meaningful_interaction_at;

  result := jsonb_build_object('ok',true,'action','shared_rest','reaction',reaction,'restoredEnergy',after_energy-before_energy,
    'nextAvailableAt',occurred_at+interval '4 hours','companion',jsonb_build_object(
      'id',comp.id,'name',comp.name,'affection',comp.affection,'trust',comp.trust,'energy',comp.energy,
      'mood',comp.mood,'state',comp.state,'updated_at',comp.updated_at));
  insert into public.sanctuary_interactions(owner_id,companion_id,placement_id,item_id,action,response_text,
      energy_before,energy_after,created_at)
    values(caller,p_companion_id,placed.id,placed.item_id,'shared_rest',reaction,before_energy,after_energy,occurred_at)
    returning * into rest;
  -- The existing snapshot trigger resolves provenance, never caller input.
  insert into public.companion_care_events(owner_id,companion_id,action,affection_delta,trust_delta,energy_delta,note,created_at)
    values(caller,p_companion_id,'sanctuary_rest',after_affection-before_affection,after_trust-before_trust,after_energy-before_energy,reaction,occurred_at);
  insert into public.companion_journal_entries(owner_id,companion_id,source_type,source_id,title,body,meta_json,created_at)
    values(caller,p_companion_id,'system',rest.id,'A quiet rest with ' || comp.name,reaction,
      jsonb_build_object('category','sanctuary','interactionType','shared_rest','action','shared_rest','itemKey','care-moss-seat',
        'userItemId',rest.user_item_id,'placementId',rest.placement_snapshot_id,'slot',rest.slot_key_snapshot,
        'acquisition',rest.acquisition_snapshot,'energyBefore',before_energy,'energyAfter',after_energy),occurred_at)
    returning * into memory;
  result := result || jsonb_build_object('replayed',false,'memory',jsonb_build_object(
    'id',memory.id,'companion_id',memory.companion_id,'title',memory.title,'body',memory.body,'created_at',memory.created_at));
  insert into sanctuary_internal.rest_receipts(owner_id,request_id,companion_id,interaction_id,result_snapshot)
    values(caller,p_request_id,p_companion_id,rest.id,result);
  return result;
end;
$$;
-- The definer must be a trusted migration owner. Every accessed gameplay row
-- is explicitly bound to auth.uid(); this endpoint accepts no owner, stats,
-- placement, response, or provenance inputs. No table access is granted.
revoke all on function public.perform_sanctuary_shared_rest(uuid,uuid) from public, anon;
grant execute on function public.perform_sanctuary_shared_rest(uuid,uuid) to authenticated;
