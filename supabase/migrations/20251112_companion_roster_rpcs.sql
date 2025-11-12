-- Phase 13.3 — Companion roster RPCs

drop function if exists public.ensure_slots();
create or replace function public.ensure_slots()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  mx int;
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  insert into public.player_companion_slots (user_id, max_slots)
  values (u, 3)
  on conflict (user_id) do nothing;

  select max_slots into mx
    from public.player_companion_slots
   where user_id = u;

  return coalesce(mx, 3);
end;
$$;

grant execute on function public.ensure_slots() to authenticated;

drop function if exists public.set_active_companion(uuid);
create or replace function public.set_active_companion(p_companion uuid)
returns table(companion_id uuid, is_active boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  owner uuid;
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  select owner_id
    into owner
    from public.companions
   where id = p_companion;

  if owner is null or owner <> u then
    raise exception 'not_owner';
  end if;

  update public.companions
     set is_active = false,
         state = 'idle'
   where owner_id = u
     and is_active = true
     and id <> p_companion;

  update public.companions
     set is_active = true,
         state = 'active',
         updated_at = now()
   where id = p_companion
   returning id, is_active into companion_id, is_active;

  return next;
end;
$$;

grant execute on function public.set_active_companion(uuid) to authenticated;

drop function if exists public.reorder_companions(uuid[]);
create or replace function public.reorder_companions(p_order uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  mx int;
  idx int := 0;
  cid uuid;
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  mx := public.ensure_slots();

  if p_order is null then
    return;
  end if;

  foreach cid in array p_order loop
    exit when idx >= mx;
    update public.companions
       set slot_index = idx
     where id = cid
       and owner_id = u;
    idx := idx + 1;
  end loop;
end;
$$;

grant execute on function public.reorder_companions(uuid[]) to authenticated;

drop function if exists public.rename_companion(uuid, text);
create or replace function public.rename_companion(p_companion uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  trimmed text := btrim(coalesce(p_name, ''));
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  if length(trimmed) < 1 or length(trimmed) > 32 then
    raise exception 'invalid_name';
  end if;

  update public.companions
     set name = trimmed,
         updated_at = now()
   where id = p_companion
     and owner_id = u;

  if not found then
    raise exception 'not_owner';
  end if;
end;
$$;

grant execute on function public.rename_companion(uuid, text) to authenticated;

drop function if exists public.set_companion_state(uuid, text);
create or replace function public.set_companion_state(p_companion uuid, p_state text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  new_state text;
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  if p_state not in ('idle', 'resting', 'active') then
    raise exception 'bad_state';
  end if;

  update public.companions
     set state = p_state,
         is_active = p_state = 'active',
         updated_at = now()
   where id = p_companion
     and owner_id = u
   returning state into new_state;

  if not found then
    raise exception 'not_owner';
  end if;

  if p_state = 'active' then
    update public.companions
       set is_active = false,
           state = 'idle'
     where owner_id = u
       and id <> p_companion
       and is_active = true;
  end if;

  return new_state;
end;
$$;

grant execute on function public.set_companion_state(uuid, text) to authenticated;
