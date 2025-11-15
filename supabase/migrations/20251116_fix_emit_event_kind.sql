-- Ensure events emitted by xp pipeline populate the required kind column

drop function if exists public.emit_event(uuid, text, text, jsonb);

create or replace function public.emit_event(
  p_user uuid,
  p_type text,
  p_message text,
  p_meta jsonb default '{}'::jsonb,
  p_is_public boolean default false
) returns void
language plpgsql
as $$
declare
  has_events_type boolean := false;
  has_events_message boolean := false;
  has_events_kind boolean := false;
begin
  select exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'type'
  ) into has_events_type;

  select exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'message'
  ) into has_events_message;

  select exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'kind'
  ) into has_events_kind;

  if has_events_kind then
    if has_events_type and has_events_message then
      insert into public.events (user_id, type, kind, message, meta, is_public)
      values (p_user, p_type, coalesce(p_type, 'custom'), p_message, coalesce(p_meta, '{}'::jsonb), coalesce(p_is_public, false));
    elsif has_events_type then
      insert into public.events (user_id, type, kind, meta, is_public)
      values (p_user, p_type, coalesce(p_type, 'custom'), coalesce(p_meta, '{}'::jsonb), coalesce(p_is_public, false));
    elsif has_events_message then
      insert into public.events (user_id, kind, message, meta, is_public)
      values (p_user, coalesce(p_type, 'custom'), p_message, coalesce(p_meta, '{}'::jsonb), coalesce(p_is_public, false));
    else
      insert into public.events (user_id, kind, meta, is_public)
      values (p_user, coalesce(p_type, 'custom'), coalesce(p_meta, '{}'::jsonb), coalesce(p_is_public, false));
    end if;
  else
    if has_events_type and has_events_message then
      insert into public.events (user_id, type, message, meta, is_public)
      values (p_user, p_type, p_message, coalesce(p_meta, '{}'::jsonb), coalesce(p_is_public, false));
    elsif has_events_type then
      insert into public.events (user_id, type, meta, is_public)
      values (p_user, p_type, coalesce(p_meta, '{}'::jsonb), coalesce(p_is_public, false));
    elsif has_events_message then
      insert into public.events (user_id, message, meta, is_public)
      values (p_user, p_message, coalesce(p_meta, '{}'::jsonb), coalesce(p_is_public, false));
    else
      insert into public.events (user_id, meta, is_public)
      values (p_user, coalesce(p_meta, '{}'::jsonb), coalesce(p_is_public, false));
    end if;
  end if;
end;
$$;
