create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null,
  last_active_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_presence_status_check check (status in ('online', 'away', 'offline'))
);

create index if not exists user_presence_status_idx
  on public.user_presence(status);

create index if not exists user_presence_updated_idx
  on public.user_presence(updated_at desc);

alter table if exists public.user_preferences
  add column if not exists presence_visible boolean not null default true;

create or replace function public.set_user_presence_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_user_presence_set_updated_at on public.user_presence;
create trigger trg_user_presence_set_updated_at
  before update on public.user_presence
  for each row
  execute procedure public.set_user_presence_updated_at();

alter table public.user_presence enable row level security;

drop policy if exists user_presence_select_friends on public.user_presence;
create policy user_presence_select_friends
  on public.user_presence
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      exists (
        select 1
        from public.friends f
        where f.user_id = user_presence.user_id
          and f.friend_id = auth.uid()
      )
      and exists (
        select 1
        from public.user_preferences up
        where up.user_id = user_presence.user_id
          and coalesce(up.presence_visible, true) = true
      )
      and not exists (
        select 1
        from public.user_blocks b
        where (b.blocker_id = user_presence.user_id and b.blocked_id = auth.uid())
           or (b.blocker_id = auth.uid() and b.blocked_id = user_presence.user_id)
      )
    )
  );

drop policy if exists user_presence_insert_own on public.user_presence;
create policy user_presence_insert_own
  on public.user_presence
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_presence_update_own on public.user_presence;
create policy user_presence_update_own
  on public.user_presence
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table if exists public.user_presence replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'user_presence'
    ) then
      execute 'alter publication supabase_realtime add table public.user_presence';
    end if;
  else
    create publication supabase_realtime for table public.user_presence;
  end if;
end;
$$;
