alter table if exists public.profiles enable row level security;

drop policy if exists "profiles: owner can update" on public.profiles;
create policy "profiles: owner can update"
on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.emit_event(
  p_user uuid,
  p_type text,
  p_message text,
  p_meta jsonb default '{}'::jsonb,
  p_is_public boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.events (user_id, type, message, meta, is_public)
  values (p_user, p_type, p_message, coalesce(p_meta, '{}'::jsonb), coalesce(p_is_public,false));
end$$;

drop policy if exists "events: owner read" on public.events;
create policy "events: owner read"
on public.events for select
  to authenticated
  using (user_id = auth.uid());
