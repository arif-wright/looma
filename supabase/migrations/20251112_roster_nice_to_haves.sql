-- Phase 13.3-N — Companion roster unlock helpers

-- Refresh ensure_slots helper to keep slot rows aligned
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

  select max_slots
    into mx
    from public.player_companion_slots
   where user_id = u;

  return coalesce(mx, 3);
end;
$$;

grant execute on function public.ensure_slots() to authenticated;

-- Placeholder unlock routine (future monetization hook)
create or replace function public.unlock_companion_slot(p_reason text default 'manual')
returns table(max_slots int)
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  old_slots int;
  new_slots int;
begin
  if u is null then
    raise exception 'unauthorized';
  end if;

  old_slots := public.ensure_slots();

  if old_slots >= 6 then
    return query select old_slots;
  end if;

  update public.player_companion_slots pcs
     set max_slots = old_slots + 1,
         updated_at = now()
   where user_id = u
   returning pcs.max_slots into new_slots;

  insert into public.events (user_id, type, kind, message, meta)
  values (
    u,
    'system',
    'unlock_companion_slot',
    concat('Unlocked slot (reason=', coalesce(p_reason, 'manual'), ')'),
    jsonb_build_object('from', old_slots, 'to', new_slots, 'reason', p_reason)
  );

  return query select coalesce(new_slots, old_slots);
end;
$$;

grant execute on function public.unlock_companion_slot(text) to authenticated;
