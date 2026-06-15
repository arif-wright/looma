with ranked as (
  select
    id,
    owner_id,
    row_number() over (
      partition by owner_id
      order by is_active desc, slot_index asc nulls last, created_at asc, id asc
    ) as rank
  from public.companions
)
update public.companions companion
set
  is_active = ranked.rank = 1,
  state = case when ranked.rank = 1 then 'active' else 'idle' end
from ranked
where companion.id = ranked.id
  and (
    companion.is_active is distinct from (ranked.rank = 1)
    or companion.state is distinct from case when ranked.rank = 1 then 'active' else 'idle' end
  );

create unique index if not exists companions_one_active_per_owner_idx
  on public.companions (owner_id)
  where is_active = true;

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

  update public.companions as c
     set is_active = false,
         state = 'idle'
   where c.owner_id = u
     and c.id <> p_companion
     and (c.is_active = true or c.state = 'active');

  update public.companions as c
     set is_active = true,
         state = 'active',
         updated_at = now()
   where c.id = p_companion
   returning c.id, c.is_active into companion_id, is_active;

  return next;
end;
$$;

grant execute on function public.set_active_companion(uuid) to authenticated;

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

  if p_state = 'active' then
    perform public.set_active_companion(p_companion);
    return 'active';
  end if;

  update public.companions as c
     set state = p_state,
         updated_at = now()
   where c.id = p_companion
     and c.owner_id = u
   returning state into new_state;

  if not found then
    raise exception 'not_owner';
  end if;

  return new_state;
end;
$$;

grant execute on function public.set_companion_state(uuid, text) to authenticated;
