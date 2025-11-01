create or replace function public.fn_game_start(p_slug text)
returns table(session_id uuid, nonce text)
language plpgsql
security definer as $$
declare
  v_game_id uuid;
  v_nonce text;
begin
  select id into v_game_id from public.game_titles where slug = p_slug and is_active = true;
  if v_game_id is null then
    raise exception 'Game not available';
  end if;
  v_nonce := encode(gen_random_bytes(16), 'hex');
  insert into public.game_sessions(user_id, game_id, nonce)
  values (auth.uid(), v_game_id, v_nonce)
  returning id into session_id;
  nonce := v_nonce;
  return next;
end;
$$;
