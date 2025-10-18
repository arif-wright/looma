-- XP pipeline trigger and helpers (Phase 9e)

create or replace function public.emit_event(
  p_user uuid,
  p_type text,
  p_message text,
  p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
as $$
begin
  insert into public.events (user_id, type, message, meta)
  values (p_user, p_type, p_message, coalesce(p_meta, '{}'::jsonb));
end;
$$;

create or replace function public.maybe_award_achievement(
  p_user uuid,
  p_key text
) returns void
language plpgsql
as $$
declare
  a_id uuid;
begin
  select id into a_id from public.achievements where key = p_key;
  if a_id is null then
    return;
  end if;

  insert into public.user_achievements (user_id, achievement_id)
  values (p_user, a_id)
  on conflict do nothing;
end;
$$;

create or replace function public.on_profiles_xp_update()
returns trigger
language plpgsql
as $$
declare
  delta int;
begin
  if new.xp is distinct from old.xp then
    delta := coalesce(new.xp, 0) - coalesce(old.xp, 0);

    if delta <> 0 then
      perform public.emit_event(
        new.id,
        'xp_gain',
        'Gained ' || delta || ' XP',
        jsonb_build_object('delta', delta, 'xp', new.xp, 'xp_next', new.xp_next)
      );
    end if;

    while new.xp >= new.xp_next loop
      new.xp := new.xp - new.xp_next;
      new.level := coalesce(new.level, 1) + 1;
      new.xp_next := greatest(50, floor(new.xp_next * 1.25)::int);

      perform public.emit_event(
        new.id,
        'level_up',
        'Reached Level ' || new.level,
        jsonb_build_object('level', new.level, 'xp', new.xp, 'xp_next', new.xp_next)
      );
    end loop;

    if coalesce(new.xp, 0) >= 250 then
      perform public.maybe_award_achievement(new.id, 'xp_250');
    end if;

    if exists (
      select 1
      from (
        select count(distinct species_id) as k
        from public.creatures
        where owner_id = new.id
          and bonded = true
      ) t
      where t.k >= 3
    ) then
      perform public.maybe_award_achievement(new.id, 'triad_bond');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_xp_update on public.profiles;
create trigger trg_profiles_xp_update
  before update on public.profiles
  for each row
  execute function public.on_profiles_xp_update();
