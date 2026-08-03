-- The Wilds Stage 6: one per-player, idempotent Moonberry gathering loop.
-- Inventory ownership remains exclusively in public.user_items.

create table if not exists public.world_gather_nodes (
  id uuid primary key default gen_random_uuid(),
  map_id text not null references public.world_maps(id) on delete cascade,
  node_key text not null,
  map_version integer not null check (map_version > 0),
  x numeric(10,3) not null,
  y numeric(10,3) not null,
  interaction_radius numeric(10,3) not null check (interaction_radius between 8 and 128),
  reward_item_id uuid not null references public.item_catalog(id) on delete restrict,
  reward_quantity integer not null default 1 check (reward_quantity between 1 and 5),
  cooldown_seconds integer not null default 300 check (cooldown_seconds between 30 and 86400),
  max_owned_quantity integer not null default 20 check (max_owned_quantity between 1 and 999),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_gather_nodes_key_format check (node_key ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  unique (map_id, node_key)
);

create index if not exists world_gather_nodes_active_map_idx
  on public.world_gather_nodes(map_id, map_version, is_active);

create table if not exists public.world_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  companion_id uuid references public.companions(id) on delete set null,
  node_id uuid not null references public.world_gather_nodes(id) on delete restrict,
  event_type text not null check (event_type = 'moonberry_gather'),
  idempotency_key text not null,
  status text not null check (status in ('succeeded', 'cooldown', 'inventory_full')),
  result_json jsonb not null default '{}'::jsonb check (jsonb_typeof(result_json) = 'object'),
  occurred_at timestamptz not null default now(),
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint world_events_idempotency_format check (length(btrim(idempotency_key)) between 16 and 128),
  unique (user_id, event_type, idempotency_key)
);

create index if not exists world_events_user_created_idx
  on public.world_events(user_id, created_at desc);
create index if not exists world_events_cooldown_idx
  on public.world_events(user_id, node_id, processed_at desc)
  where status = 'succeeded';

drop trigger if exists trg_world_gather_nodes_updated_at on public.world_gather_nodes;
create trigger trg_world_gather_nodes_updated_at before update on public.world_gather_nodes
for each row execute function public.set_world_updated_at();

alter table public.world_gather_nodes enable row level security;
alter table public.world_events enable row level security;

drop policy if exists world_events_owner_select on public.world_events;
create policy world_events_owner_select on public.world_events
for select to authenticated using (user_id = auth.uid());

revoke all on public.world_gather_nodes from anon, authenticated;
revoke insert, update, delete on public.world_events from anon, authenticated;
grant select on public.world_events to authenticated;

insert into public.item_catalog(item_key, title, description, kind, tone, visual_key, capabilities)
values (
  'world-moonberry',
  'Moonberry',
  'A softly glowing berry gathered with a companion in Whispering Grove.',
  'consumable',
  'wonder',
  'moonberry',
  '{consumable,giftable}'
)
on conflict (item_key) do update set
  title = excluded.title,
  description = excluded.description,
  kind = excluded.kind,
  tone = excluded.tone,
  visual_key = excluded.visual_key,
  capabilities = excluded.capabilities;

update public.world_maps
set display_name = 'Whispering Grove'
where id = 'wilds-exploration';

insert into public.world_landmarks(map_id, landmark_key, display_name, map_version, x, y, discovery_radius, is_active)
values ('wilds-exploration', 'moonberry-grove', 'Moonberry Grove', 1, 800, 120, 72, true)
on conflict (map_id, landmark_key) do update set
  display_name = excluded.display_name,
  map_version = excluded.map_version,
  x = excluded.x,
  y = excluded.y,
  discovery_radius = excluded.discovery_radius,
  is_active = excluded.is_active;

insert into public.world_gather_nodes(
  map_id, node_key, map_version, x, y, interaction_radius,
  reward_item_id, reward_quantity, cooldown_seconds, max_owned_quantity, is_active
)
select 'wilds-exploration', 'moonberry-bush', 1, 800, 120, 58,
       item.id, 1, 300, 20, true
from public.item_catalog item where item.item_key = 'world-moonberry'
on conflict (map_id, node_key) do update set
  map_version = excluded.map_version,
  x = excluded.x,
  y = excluded.y,
  interaction_radius = excluded.interaction_radius,
  reward_item_id = excluded.reward_item_id,
  reward_quantity = excluded.reward_quantity,
  cooldown_seconds = excluded.cooldown_seconds,
  max_owned_quantity = excluded.max_owned_quantity,
  is_active = excluded.is_active;

create or replace function public.fn_world_gather_moonberry(
  p_user uuid,
  p_map_id text,
  p_map_version integer,
  p_node_key text,
  p_x numeric,
  p_y numeric,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.world_events%rowtype;
  v_node public.world_gather_nodes%rowtype;
  v_item public.item_catalog%rowtype;
  v_companion public.companions%rowtype;
  v_archetype text := 'companion';
  v_owned integer := 0;
  v_last_gather timestamptz;
  v_cooldown_until timestamptz;
  v_event_id uuid;
  v_owned_row_id uuid;
  v_reaction text;
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'world_service_only' using errcode = '42501';
  end if;
  if p_user is null then raise exception 'user_required'; end if;
  if p_map_id is null or p_map_id !~ '^[a-z0-9][a-z0-9-]{1,47}$' then raise exception 'invalid_map'; end if;
  if p_node_key is null or p_node_key !~ '^[a-z0-9][a-z0-9-]{1,47}$' then raise exception 'invalid_node'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 16 and 128 then
    raise exception 'invalid_idempotency_key';
  end if;
  if p_x is null or p_y is null then raise exception 'invalid_coordinates'; end if;

  -- Serializes all attempts for this account/node across rooms and instances.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_map_id || ':' || p_node_key, 0));

  select * into v_existing from public.world_events
  where user_id = p_user and event_type = 'moonberry_gather'
    and idempotency_key = btrim(p_idempotency_key);
  if found then return v_existing.result_json || jsonb_build_object('replayed', true); end if;

  select n.* into v_node
  from public.world_gather_nodes n
  join public.world_maps m on m.id = n.map_id
  where n.map_id = p_map_id and n.node_key = p_node_key
    and n.map_version = p_map_version and n.is_active = true
    and m.version = p_map_version and m.is_active = true;
  if not found then raise exception 'invalid_or_obsolete_node'; end if;
  if sqrt(power(p_x - v_node.x, 2) + power(p_y - v_node.y, 2)) > v_node.interaction_radius then
    raise exception 'node_out_of_range';
  end if;
  if not exists (
    select 1 from public.world_landmark_discoveries d
    join public.world_landmarks l on l.id = d.landmark_id
    where d.user_id = p_user and l.map_id = p_map_id
      and l.landmark_key = 'moonberry-grove' and l.map_version = p_map_version
  ) then raise exception 'landmark_not_discovered'; end if;

  select * into v_item from public.item_catalog where id = v_node.reward_item_id;
  if not found or v_item.item_key <> 'world-moonberry' then raise exception 'unauthorized_reward_configuration'; end if;

  select max(processed_at) into v_last_gather from public.world_events
  where user_id = p_user and node_id = v_node.id and status = 'succeeded';
  v_cooldown_until := v_last_gather + make_interval(secs => v_node.cooldown_seconds);
  if v_last_gather is not null and v_cooldown_until > now() then
    v_result := jsonb_build_object(
      'status', 'cooldown', 'itemKey', v_item.item_key, 'itemTitle', v_item.title,
      'quantity', 0, 'cooldownUntil', v_cooldown_until, 'reaction', null
    );
    insert into public.world_events(user_id, node_id, event_type, idempotency_key, status, result_json)
    values (p_user, v_node.id, 'moonberry_gather', btrim(p_idempotency_key), 'cooldown', v_result);
    return v_result || jsonb_build_object('replayed', false);
  end if;

  select coalesce(sum(quantity), 0)::integer into v_owned
  from public.user_items where owner_id = p_user and item_id = v_node.reward_item_id;
  if v_owned + v_node.reward_quantity > v_node.max_owned_quantity then
    v_result := jsonb_build_object(
      'status', 'inventory_full', 'itemKey', v_item.item_key, 'itemTitle', v_item.title,
      'quantity', 0, 'cooldownUntil', null, 'reaction', null
    );
    insert into public.world_events(user_id, node_id, event_type, idempotency_key, status, result_json)
    values (p_user, v_node.id, 'moonberry_gather', btrim(p_idempotency_key), 'inventory_full', v_result);
    return v_result || jsonb_build_object('replayed', false);
  end if;

  select c.* into v_companion from public.companions c
  where c.owner_id = p_user and c.is_active = true
  order by c.updated_at desc, c.id limit 1;
  if v_companion.id is not null then
    select coalesce(pt.primary_archetype, pt.archetype, 'companion') into v_archetype
    from public.player_traits pt where pt.user_id = p_user;
    v_archetype := coalesce(v_archetype, 'companion');
    v_reaction := case lower(v_archetype)
      when 'muse' then format('%s watches the moonlight gather on the berry and hums a tiny new melody.', v_companion.name)
      when 'guardian' then format('%s carefully checks the leaves, then gives you an approving nod.', v_companion.name)
      when 'spark' then format('%s brightens at once: “A pocket-sized moon!”', v_companion.name)
      when 'root' then format('%s rests beside the grove and notices how patiently it has grown.', v_companion.name)
      when 'echo' then format('%s listens to the grove and softly echoes its nighttime hush.', v_companion.name)
      else format('%s stays close while you gather the softly glowing berry.', v_companion.name)
    end;
  end if;

  v_event_id := gen_random_uuid();
  select id into v_owned_row_id from public.user_items
  where owner_id = p_user and item_id = v_node.reward_item_id
    and companion_id is not distinct from v_companion.id
    and source_type = 'world' and source_key = v_node.node_key
  order by acquired_at asc limit 1;
  if v_owned_row_id is null then
    insert into public.user_items(
      owner_id, companion_id, item_id, quantity, source_type, source_key, provenance_json
    ) values (
      p_user, v_companion.id, v_node.reward_item_id, v_node.reward_quantity, 'world', v_node.node_key,
      jsonb_build_object('title', 'Gathered in Whispering Grove', 'reason', 'Discovered at Moonberry Grove', 'worldEventId', v_event_id)
    );
  else
    update public.user_items set quantity = quantity + v_node.reward_quantity, updated_at = now()
    where id = v_owned_row_id;
  end if;

  v_cooldown_until := now() + make_interval(secs => v_node.cooldown_seconds);
  v_result := jsonb_build_object(
    'status', 'success', 'itemKey', v_item.item_key, 'itemTitle', v_item.title,
    'quantity', v_node.reward_quantity, 'cooldownUntil', v_cooldown_until,
    'reaction', v_reaction, 'inventoryHref', '/app/inventory'
  );
  insert into public.world_events(
    id, user_id, companion_id, node_id, event_type, idempotency_key, status, result_json
  ) values (
    v_event_id, p_user, v_companion.id, v_node.id, 'moonberry_gather',
    btrim(p_idempotency_key), 'succeeded', v_result
  );

  if v_companion.id is not null then
    insert into public.companion_journal_entries(
      companion_id, owner_id, source_type, source_id, title, body, meta_json
    ) values (
      v_companion.id, p_user, 'system', v_event_id, 'Moonberries in Whispering Grove', v_reaction,
      jsonb_build_object('kind', 'world_gather', 'itemKey', v_item.item_key, 'mapId', p_map_id)
    ) on conflict (owner_id, companion_id, source_type, source_id) do nothing;
  end if;

  return v_result || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.fn_world_gather_moonberry(uuid, text, integer, text, numeric, numeric, text)
from public, anon, authenticated;
grant execute on function public.fn_world_gather_moonberry(uuid, text, integer, text, numeric, numeric, text)
to service_role;
