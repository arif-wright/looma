-- LOCAL CANDIDATE ONLY: not applied. Review alongside world-server protocol 2.
-- Adds no rewards, items, credentials, tables or client permissions.
begin;

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

  -- A row lock cannot lock an absent checkpoint. Serialize first joins too.
  perform pg_advisory_xact_lock(hashtextextended('world-load:' || p_user::text, 0));
  -- Serialize against travel and preserve a supported saved area on fresh joins.
  select * into v_state from public.player_world_state where user_id = p_user for update;
  select * into v_map from public.world_maps
  where id = v_state.map_id and id in ('wilds-exploration', 'wilds-town')
    and version = v_state.map_version and is_active = true;
  if not found then
    select * into v_map from public.world_maps
    where id = p_preferred_map and id in ('wilds-exploration', 'wilds-town') and is_active = true;
  end if;
  if not found then
    select * into v_map from public.world_maps
    where is_active = true and id in ('wilds-exploration', 'wilds-town') order by is_default desc, id asc limit 1;
  end if;
  if v_map.id is null then raise exception 'no_active_world_map'; end if;

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

create or replace function public.fn_world_travel_portal(
  p_user uuid, p_map_id text, p_map_version integer, p_portal_id text,
  p_x numeric, p_y numeric, p_expected_state_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.world_maps%rowtype;
  v_destination public.world_maps%rowtype;
  v_target text;
  v_portal_x numeric;
  v_arrival_x numeric;
  v_version bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'world_service_only' using errcode = '42501';
  end if;
  if p_user is null then raise exception 'user_required'; end if;
  if p_expected_state_version is null or p_expected_state_version < 1 then raise exception 'invalid_version'; end if;
  if p_map_id = 'wilds-exploration' and p_portal_id = 'grove-to-hollow' then
    v_target := 'wilds-town'; v_portal_x := 880; v_arrival_x := 160;
  elsif p_map_id = 'wilds-town' and p_portal_id = 'hollow-to-grove' then
    v_target := 'wilds-exploration'; v_portal_x := 80; v_arrival_x := 804;
  else raise exception 'invalid_portal';
  end if;
  select * into v_source from public.world_maps
  where id = p_map_id and version = p_map_version and version = 1 and is_active = true;
  if not found then raise exception 'invalid_or_obsolete_map'; end if;
  select * into v_destination from public.world_maps where id = v_target and version = 1 and is_active = true;
  if not found then raise exception 'destination_unavailable'; end if;
  if p_x is null or p_y is null or p_x::text in ('NaN','Infinity','-Infinity') or p_y::text in ('NaN','Infinity','-Infinity')
    or p_x not between v_source.min_x and v_source.max_x or p_y not between v_source.min_y and v_source.max_y
    or sqrt(power(p_x - v_portal_x, 2) + power(p_y - 270, 2)) > 54 then
    raise exception 'portal_out_of_range';
  end if;
  if v_arrival_x not between v_destination.min_x and v_destination.max_x
    or 270 not between v_destination.min_y and v_destination.max_y then raise exception 'unsafe_destination'; end if;

  -- Account, source area, map revision and checkpoint version must all still match.
  update public.player_world_state set
    map_id = v_destination.id, map_version = v_destination.version,
    x = v_arrival_x, y = 270, state_version = state_version + 1, last_saved_at = now()
  where user_id = p_user and map_id = p_map_id and map_version = p_map_version
    and state_version = p_expected_state_version
  returning state_version into v_version;
  if not found then return jsonb_build_object('ok', false, 'conflict', true); end if;
  return jsonb_build_object('ok', true, 'conflict', false, 'stateVersion', v_version);
end;
$$;

revoke all on function public.fn_world_travel_portal(uuid,text,integer,text,numeric,numeric,bigint) from public, anon, authenticated;
grant execute on function public.fn_world_travel_portal(uuid,text,integer,text,numeric,numeric,bigint) to service_role;
revoke all on function public.fn_world_load_state(uuid,text) from public, anon, authenticated;
grant execute on function public.fn_world_load_state(uuid,text) to service_role;

commit;
