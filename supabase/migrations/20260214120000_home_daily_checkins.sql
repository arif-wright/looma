create table if not exists public.user_daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mood text not null,
  checkin_date date not null default current_date,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_daily_checkins_mood_check'
  ) then
    alter table public.user_daily_checkins
      add constraint user_daily_checkins_mood_check
      check (mood in ('calm', 'heavy', 'curious', 'energized', 'numb'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_daily_checkins_user_date_key'
  ) then
    alter table public.user_daily_checkins
      add constraint user_daily_checkins_user_date_key
      unique (user_id, checkin_date);
  end if;
end
$$;

create index if not exists user_daily_checkins_user_created_idx
  on public.user_daily_checkins (user_id, created_at desc);

alter table public.user_daily_checkins enable row level security;

drop policy if exists user_daily_checkins_owner_select on public.user_daily_checkins;
create policy user_daily_checkins_owner_select
  on public.user_daily_checkins
  for select
  using (user_id = auth.uid());

drop policy if exists user_daily_checkins_owner_insert on public.user_daily_checkins;
create policy user_daily_checkins_owner_insert
  on public.user_daily_checkins
  for insert
  with check (user_id = auth.uid());
