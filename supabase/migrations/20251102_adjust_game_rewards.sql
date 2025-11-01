-- Function to increment player XP as part of game reward pipeline

create or replace function public.fn_award_game_xp(p_user uuid, p_xp int)
returns void
language plpgsql
security definer
as $$
declare
  v_delta int := greatest(coalesce(p_xp, 0), 0);
begin
  if v_delta = 0 then
    return;
  end if;

  update public.profiles
     set xp = coalesce(xp, 0) + v_delta
   where id = p_user;
end;
$$;

grant execute on function public.fn_award_game_xp(uuid, int) to authenticated;
