-- The Wilds Stage 5: isolated world location and discovery persistence.
-- Durable rewards/economy are intentionally absent.

create table if not exists public.world_maps (
  id text primary key,
  display_name text not null,
  map_type text not null check (map_type in ('town', 'exploration')),
  version integer not null default 1 check (version > 0),
  is_active boolean not null default true,
  is_default boolean not null default false,
  min_x numeric(10,3) not null,
  max_x numeric(10,3) not null,
  min_y numeric(10,3) not null,
  max_y numeric(10,3) not null,
  spawn_x numeric(10,3) not null,
  spawn_y numeric(10,3) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_maps_id_format check (id ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  constraint world_maps_bounds check (
    min_x < max_x and min_y < max_y and
    spawn_x between min_x and max_x and spawn_y between min_y and max_y
  )
);

create unique index if not exists world_maps_one_default_idx
  on public.world_maps (is_default) where is_default = true;
create index if not exists world_maps_active_type_idx
  on public.world_maps (is_active, map_type, id);

create table if not exists public.world_landmarks (
  id uuid primary key default gen_random_uuid(),
  map_id text not null references public.world_maps(id) on delete cascade,
  landmark_key text not null,
  display_name text not null,
  map_version integer not null check (map_version > 0),
  x numeric(10,3) not null,
  y numeric(10,3) not null,
  discovery_radius numeric(10,3) not null check (discovery_radius > 0 and discovery_radius <= 256),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_landmarks_key_format check (landmark_key ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  unique (map_id, landmark_key)
);

create index if not exists world_landmarks_active_map_idx
  on public.world_landmarks (map_id, map_version, is_active);

create table if not exists public.player_world_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  map_id text not null references public.world_maps(id),
  map_version integer not null check (map_version > 0),
  x numeric(10,3) not null,
  y numeric(10,3) not null,
  state_version bigint not null default 1 check (state_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_saved_at timestamptz not null default now()
);

create index if not exists player_world_state_map_idx
  on public.player_world_state (map_id, updated_at desc);

create table if not exists public.world_landmark_discoveries (
  user_id uuid not null references auth.users(id) on delete cascade,
  landmark_id uuid not null references public.world_landmarks(id) on delete cascade,
  map_id text not null references public.world_maps(id),
  map_version integer not null check (map_version > 0),
  idempotency_key text not null,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, landmark_id),
  constraint world_discovery_idempotency_format check (
    length(btrim(idempotency_key)) between 8 and 128
  ),
  unique (user_id, idempotency_key)
);

create index if not exists world_discoveries_user_map_idx
  on public.world_landmark_discoveries (user_id, map_id, discovered_at desc);

create or replace function public.set_world_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_world_maps_updated_at on public.world_maps;
create trigger trg_world_maps_updated_at before update on public.world_maps
for each row execute function public.set_world_updated_at();
drop trigger if exists trg_world_landmarks_updated_at on public.world_landmarks;
create trigger trg_world_landmarks_updated_at before update on public.world_landmarks
for each row execute function public.set_world_updated_at();
drop trigger if exists trg_player_world_state_updated_at on public.player_world_state;
create trigger trg_player_world_state_updated_at before update on public.player_world_state
for each row execute function public.set_world_updated_at();

alter table public.world_maps enable row level security;
alter table public.world_landmarks enable row level security;
alter table public.player_world_state enable row level security;
alter table public.world_landmark_discoveries enable row level security;

drop policy if exists player_world_state_owner_select on public.player_world_state;
create policy player_world_state_owner_select on public.player_world_state
for select using (user_id = auth.uid());
drop policy if exists world_discoveries_owner_select on public.world_landmark_discoveries;
create policy world_discoveries_owner_select on public.world_landmark_discoveries
for select using (user_id = auth.uid());

-- The browser has no direct mutation path. Catalog data also stays server-side for now.
revoke all on public.world_maps from anon, authenticated;
revoke all on public.world_landmarks from anon, authenticated;
revoke insert, update, delete on public.player_world_state from anon, authenticated;
revoke insert, update, delete on public.world_landmark_discoveries from anon, authenticated;
grant select on public.player_world_state to authenticated;
grant select on public.world_landmark_discoveries to authenticated;

create or replace function public.fn_world_load_state(
  p_user uuid,
  p_preferred_map text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_map public.world_maps%rowtype;
  v_state public.player_world_state%rowtype;
  v_valid boolean := false;
  v_discoveries jsonb := '[]'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'world_service_only' using errcode = '42501';
  end if;
  if p_user is null then raise exception 'user_required'; end if;
  if p_preferred_map is null or p_preferred_map !~ '^[a-z0-9][a-z0-9-]{1,47}$' then
    raise exception 'invalid_map';
  end if;

  select * into v_map from public.world_maps
  where id = p_preferred_map and is_active = true;
  if not found then
    select * into v_map from public.world_maps
    where is_active = true order by is_default desc, id asc limit 1;
  end if;
  if v_map.id is null then raise exception 'no_active_world_map'; end if;

  select * into v_state from public.player_world_state where user_id = p_user;
  v_valid := v_state.user_id is not null
    and v_state.map_id = v_map.id
    and v_state.map_version = v_map.version
    and v_state.x between v_map.min_x and v_map.max_x
    and v_state.y between v_map.min_y and v_map.max_y;

  if not v_valid then
    insert into public.player_world_state(user_id, map_id, map_version, x, y, state_version)
    values (p_user, v_map.id, v_map.version, v_map.spawn_x, v_map.spawn_y, 1)
    on conflict (user_id) do update set
      map_id = excluded.map_id,
      map_version = excluded.map_version,
      x = excluded.x,
      y = excluded.y,
      state_version = public.player_world_state.state_version + 1,
      last_saved_at = now()
    returning * into v_state;
  end if;

  select coalesce(jsonb_agg(l.landmark_key order by l.landmark_key), '[]'::jsonb)
    into v_discoveries
  from public.world_landmark_discoveries d
  join public.world_landmarks l on l.id = d.landmark_id
  where d.user_id = p_user and d.map_id = v_map.id;

  return jsonb_build_object(
    'mapId', v_state.map_id,
    'mapVersion', v_state.map_version,
    'x', v_state.x,
    'y', v_state.y,
    'stateVersion', v_state.state_version,
    'restored', v_valid,
    'discoveries', v_discoveries
  );
end;
$$;

create or replace function public.fn_world_save_state(
  p_user uuid,
  p_map_id text,
  p_map_version integer,
  p_x numeric,
  p_y numeric,
  p_expected_state_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_map public.world_maps%rowtype;
  v_state public.player_world_state%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'world_service_only' using errcode = '42501';
  end if;
  if p_user is null then raise exception 'user_required'; end if;
  if p_map_id is null or p_map_id !~ '^[a-z0-9][a-z0-9-]{1,47}$' then raise exception 'invalid_map'; end if;
  if p_x is null or p_y is null then raise exception 'invalid_coordinates'; end if;

  select * into v_map from public.world_maps
  where id = p_map_id and version = p_map_version and is_active = true;
  if not found then raise exception 'invalid_or_obsolete_map'; end if;
  if p_x not between v_map.min_x and v_map.max_x or p_y not between v_map.min_y and v_map.max_y then
    raise exception 'invalid_coordinates';
  end if;

  update public.player_world_state set
    x = round(p_x, 3), y = round(p_y, 3),
    state_version = state_version + 1, last_saved_at = now()
  where user_id = p_user and map_id = p_map_id and map_version = p_map_version
    and state_version = p_expected_state_version
  returning * into v_state;

  -- Version zero is create-if-absent for a room that started while storage was unavailable.
  if not found and p_expected_state_version = 0 then
    insert into public.player_world_state(user_id, map_id, map_version, x, y, state_version)
    values (p_user, p_map_id, p_map_version, round(p_x, 3), round(p_y, 3), 1)
    on conflict (user_id) do nothing
    returning * into v_state;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'conflict', true);
  end if;
  return jsonb_build_object('ok', true, 'conflict', false, 'stateVersion', v_state.state_version);
end;
$$;

create or replace function public.fn_world_record_landmark(
  p_user uuid,
  p_map_id text,
  p_map_version integer,
  p_landmark_key text,
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
  v_landmark public.world_landmarks%rowtype;
  v_inserted_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'world_service_only' using errcode = '42501';
  end if;
  if p_user is null then raise exception 'user_required'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 8 and 128 then
    raise exception 'invalid_idempotency_key';
  end if;

  select l.* into v_landmark
  from public.world_landmarks l
  join public.world_maps m on m.id = l.map_id
  where l.map_id = p_map_id and l.landmark_key = p_landmark_key
    and l.map_version = p_map_version and l.is_active = true
    and m.version = p_map_version and m.is_active = true;
  if not found then raise exception 'invalid_or_obsolete_landmark'; end if;
  if p_x is null or p_y is null or
     sqrt(power(p_x - v_landmark.x, 2) + power(p_y - v_landmark.y, 2)) > v_landmark.discovery_radius then
    raise exception 'landmark_out_of_range';
  end if;

  insert into public.world_landmark_discoveries(
    user_id, landmark_id, map_id, map_version, idempotency_key
  ) values (
    p_user, v_landmark.id, v_landmark.map_id, v_landmark.map_version, btrim(p_idempotency_key)
  )
  on conflict do nothing;
  get diagnostics v_inserted_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'newlyDiscovered', v_inserted_count = 1,
    'landmarkKey', v_landmark.landmark_key
  );
end;
$$;

revoke all on function public.fn_world_load_state(uuid, text) from public, anon, authenticated;
revoke all on function public.fn_world_save_state(uuid, text, integer, numeric, numeric, bigint) from public, anon, authenticated;
revoke all on function public.fn_world_record_landmark(uuid, text, integer, text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.fn_world_load_state(uuid, text) to service_role;
grant execute on function public.fn_world_save_state(uuid, text, integer, numeric, numeric, bigint) to service_role;
grant execute on function public.fn_world_record_landmark(uuid, text, integer, text, numeric, numeric, text) to service_role;

-- Canonical fixtures required by the initial world runtime.
insert into public.world_maps(
  id, display_name, map_type, version, is_active, is_default,
  min_x, max_x, min_y, max_y, spawn_x, spawn_y
) values
  ('wilds-town', 'Wayfarer Town', 'town', 1, true, true, 16, 944, 16, 524, 160, 270),
  ('wilds-exploration', 'The Wilds', 'exploration', 1, true, false, 16, 944, 16, 524, 120, 120)
on conflict (id) do update set
  display_name = excluded.display_name,
  map_type = excluded.map_type,
  is_active = excluded.is_active;

insert into public.world_landmarks(
  map_id, landmark_key, display_name, map_version, x, y, discovery_radius, is_active
) values
  ('wilds-town', 'town-well', 'Wayfarer Well', 1, 540, 270, 56, true),
  ('wilds-exploration', 'ancient-grove', 'Ancient Grove', 1, 800, 120, 64, true)
on conflict (map_id, landmark_key) do update set
  display_name = excluded.display_name,
  map_version = excluded.map_version,
  x = excluded.x,
  y = excluded.y,
  discovery_radius = excluded.discovery_radius,
  is_active = excluded.is_active;
