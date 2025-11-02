-- Phase 10.4 — Achievements & Milestones

-- Catalog of achievements
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  game_id uuid references public.game_titles(id) on delete set null,
  name text not null,
  description text not null,
  icon text not null default 'trophy',
  rarity text not null default 'common',
  points integer not null default 10 check (points >= 0),
  is_active boolean not null default true,
  rule jsonb not null,
  inserted_at timestamptz not null default now()
);

alter table if exists public.achievements
  add column if not exists inserted_at timestamptz;

update public.achievements
  set inserted_at = coalesce(inserted_at, now());

alter table if exists public.achievements
  alter column inserted_at set default now();

-- Per-user unlocks
create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  unique (user_id, achievement_id)
);

alter table if exists public.user_achievements
  add column if not exists id uuid;

update public.user_achievements
  set id = coalesce(id, gen_random_uuid());

alter table if exists public.user_achievements
  alter column id set default gen_random_uuid();

alter table if exists public.user_achievements
  drop constraint if exists user_achievements_pkey;

alter table if exists public.user_achievements
  add constraint user_achievements_pkey
  primary key (id);

alter table if exists public.user_achievements
  add column if not exists unlocked_at timestamptz;

update public.user_achievements
  set unlocked_at = coalesce(unlocked_at, now());

alter table if exists public.user_achievements
  alter column unlocked_at set default now();

alter table if exists public.user_achievements
  add column if not exists meta jsonb;

update public.user_achievements
  set meta = coalesce(meta, '{}'::jsonb);

alter table if exists public.user_achievements
  alter column meta set default '{}'::jsonb;

create index if not exists user_achievements_user_idx on public.user_achievements(user_id);
create index if not exists user_achievements_achievement_idx on public.user_achievements(achievement_id);

-- Fast points tally for profile (optional denorm)
create table if not exists public.user_points (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_points enable row level security;

alter table if exists public.user_achievements
  drop constraint if exists user_achievements_achievement_fk;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'user_achievements'
      and constraint_name = 'user_achievements_achievement_id_fkey'
      and constraint_type = 'FOREIGN KEY'
  ) then
    execute 'alter table public.user_achievements
      add constraint user_achievements_achievement_id_fkey
      foreign key (achievement_id)
      references public.achievements(id)
      on delete cascade';
  end if;
end;
$$;

alter table if exists public.achievements
  add column if not exists game_id uuid references public.game_titles(id) on delete set null;

alter table if exists public.achievements
  add column if not exists title text;

alter table if exists public.achievements
  add column if not exists name text;

alter table if exists public.achievements
  add column if not exists description text;

alter table if exists public.achievements
  add column if not exists icon text not null default 'trophy';

alter table if exists public.achievements
  add column if not exists rarity text not null default 'common';

alter table if exists public.achievements
  add column if not exists is_active boolean not null default true;

update public.achievements
  set icon = 'trophy'
  where icon is null or icon = '';

update public.achievements
  set rarity = 'common'
  where rarity is null or rarity not in ('common', 'rare', 'epic', 'legendary');

update public.achievements
  set is_active = true
  where is_active is null;

update public.achievements
  set title = coalesce(title, name, key)
  where title is null;

update public.achievements
  set name = coalesce(name, key)
  where name is null;

update public.achievements
  set description = coalesce(description, 'Achievement unlocked')
  where description is null;

alter table if exists public.achievements
  alter column title drop not null;

alter table if exists public.achievements
  add column if not exists rule jsonb;

alter table if exists public.achievements
  add column if not exists points integer not null default 10;

update public.achievements
  set rule = coalesce(rule, '{}'::jsonb);

update public.achievements
  set points = coalesce(points, 10);

do $$
begin
  if not exists (
    select 1
    from information_schema.constraint_column_usage
    where table_schema = 'public'
      and table_name = 'achievements'
      and constraint_name = 'achievements_rarity_check'
  ) then
    execute 'alter table public.achievements
      add constraint achievements_rarity_check
      check (rarity in (''common'', ''rare'', ''epic'', ''legendary''))';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'achievements' and policyname = 'read active achievements'
  ) then
    execute 'create policy "read active achievements"
      on public.achievements for select to authenticated using (is_active = true)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_achievements' and policyname = 'own unlocks'
  ) then
    execute 'create policy "own unlocks"
      on public.user_achievements for select to authenticated using (user_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_points' and policyname = 'own points'
  ) then
    execute 'create policy "own points"
      on public.user_points for select to authenticated using (user_id = auth.uid())';
  end if;
end;
$$;

create or replace function public.fn_add_points(p_user uuid, p_delta integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_points(user_id, points)
  values (p_user, coalesce(p_delta, 0))
  on conflict (user_id) do update
    set points = public.user_points.points + excluded.points,
        updated_at = now();
$$;

alter table if exists public.notifications
  drop constraint if exists notifications_kind_check;

alter table if exists public.notifications
  add constraint notifications_kind_check
  check (kind in ('reaction', 'comment', 'share', 'achievement_unlocked'));

alter table if exists public.notifications
  drop constraint if exists notifications_target_kind_check;

alter table if exists public.notifications
  add constraint notifications_target_kind_check
  check (target_kind in ('post', 'comment', 'achievement'));

create or replace function public.fn_leader_weekly_rank(
  p_game uuid,
  p_user uuid,
  p_now timestamptz default now()
)
returns integer
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      user_id,
      dense_rank() over (order by best_score desc) as position
    from public.mv_leader_weekly
    where game_id = p_game
      and week_utc = date_trunc('week', p_now at time zone 'UTC')
  )
  select position from ranked where user_id = p_user limit 1;
$$;
