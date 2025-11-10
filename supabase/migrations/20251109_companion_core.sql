-- Companion core tables, policies, and care RPC

-- Companions owned by a user
create table if not exists public.companions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  species text not null default 'looma',
  rarity text not null default 'common',
  level int not null default 1,
  xp int not null default 0,
  affection int not null default 0,
  trust int not null default 0,
  energy int not null default 100,
  mood text not null default 'neutral',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists companions_owner_idx on public.companions(owner_id);

alter table public.companions enable row level security;

alter table if exists public.companions
  add column if not exists rarity text not null default 'common',
  add column if not exists level int not null default 1,
  add column if not exists xp int not null default 0,
  add column if not exists affection int not null default 0,
  add column if not exists trust int not null default 0,
  add column if not exists energy int not null default 100,
  add column if not exists mood text not null default 'neutral',
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.companions
  alter column mood set default 'neutral';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companions' and column_name = 'bond_level'
  ) then
    update public.companions
       set level = greatest(coalesce(bond_level, level, 1), 1)
     where bond_level is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companions' and column_name = 'bond_xp'
  ) then
    update public.companions
       set xp = coalesce(bond_xp, xp, 0)
     where bond_xp is not null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'companions_affection_bounds'
  ) then
    alter table public.companions
      add constraint companions_affection_bounds check (affection between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'companions_trust_bounds'
  ) then
    alter table public.companions
      add constraint companions_trust_bounds check (trust between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'companions_energy_bounds'
  ) then
    alter table public.companions
      add constraint companions_energy_bounds check (energy between 0 and 100);
  end if;
end;
$$;

-- Per-companion stats snapshot (optional extension)
create table if not exists public.companion_stats (
  companion_id uuid primary key references public.companions(id) on delete cascade,
  fed_at timestamptz,
  played_at timestamptz,
  groomed_at timestamptz,
  care_streak int not null default 0
);

alter table public.companion_stats enable row level security;

-- Bond events (care actions, milestones)
create table if not exists public.bond_events (
  id bigserial primary key,
  companion_id uuid not null references public.companions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  delta_affection int default 0,
  delta_trust int default 0,
  delta_energy int default 0,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bond_events_companion_idx on public.bond_events(companion_id, created_at desc);
create index if not exists bond_events_owner_idx on public.bond_events(owner_id, created_at desc);

alter table public.bond_events enable row level security;

-- RLS policies
create policy "companion_owner_read" on public.companions
  for select to authenticated
  using (auth.uid() = owner_id);

create policy "companion_owner_write" on public.companions
  for insert to authenticated
  with check (auth.uid() = owner_id);

create policy "companion_owner_update" on public.companions
  for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "stats_owner_read" on public.companion_stats
  for select to authenticated
  using (
    exists (
      select 1 from public.companions c
      where c.id = companion_id and c.owner_id = auth.uid()
    )
  );

create policy "stats_owner_write" on public.companion_stats
  for insert to authenticated
  with check (
    exists (
      select 1 from public.companions c
      where c.id = companion_id and c.owner_id = auth.uid()
    )
  );

create policy "stats_owner_update" on public.companion_stats
  for update to authenticated
  using (
    exists (
      select 1 from public.companions c
      where c.id = companion_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.companions c
      where c.id = companion_id and c.owner_id = auth.uid()
    )
  );

create policy "events_owner_read" on public.bond_events
  for select to authenticated
  using (owner_id = auth.uid());

create policy "events_owner_insert" on public.bond_events
  for insert to authenticated
  with check (owner_id = auth.uid());

-- Helper: clamp to 0..100
create or replace function public._clamp(val int)
returns int
language sql
immutable
as $$
  select greatest(0, least(100, val));
$$;

-- Care RPCs with cooldowns (15m feed/play/groom)
create or replace function public.care_action(p_companion uuid, p_kind text)
returns table(affection int, trust int, energy int, mood text, streak int)
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  now_ts timestamptz := now();
  cd interval := interval '15 minutes';
  stats_row public.companion_stats%rowtype;
  last_ts timestamptz;
  last_date date;
  new_streak int;
  da int := 0;
  dt int := 0;
  de int := 0;
  a int;
  t int;
  e int;
  m text;
  s int;
begin
  if u is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from public.companions c where c.id = p_companion and c.owner_id = u) then
    raise exception 'not owner';
  end if;

  insert into public.companion_stats (companion_id)
  values (p_companion)
  on conflict (companion_id) do nothing;

  select *
    into stats_row
  from public.companion_stats
  where companion_id = p_companion
  for update;

  if not found then
    raise exception 'stats missing for %', p_companion;
  end if;

  last_ts := stats_row.fed_at;
  if stats_row.played_at is not null and (last_ts is null or stats_row.played_at > last_ts) then
    last_ts := stats_row.played_at;
  end if;
  if stats_row.groomed_at is not null and (last_ts is null or stats_row.groomed_at > last_ts) then
    last_ts := stats_row.groomed_at;
  end if;

  if last_ts is not null then
    last_date := date(last_ts);
  end if;

  if p_kind = 'feed' then
    if stats_row.fed_at is not null and now_ts - stats_row.fed_at < cd then
      raise exception 'cooldown';
    end if;
    da := 6; dt := 2; de := 15;
    update public.companion_stats
       set fed_at = now_ts
     where companion_id = p_companion;
  elsif p_kind = 'play' then
    if stats_row.played_at is not null and now_ts - stats_row.played_at < cd then
      raise exception 'cooldown';
    end if;
    da := 5; dt := 4; de := -10;
    update public.companion_stats
       set played_at = now_ts
     where companion_id = p_companion;
  elsif p_kind = 'groom' then
    if stats_row.groomed_at is not null and now_ts - stats_row.groomed_at < cd then
      raise exception 'cooldown';
    end if;
    da := 3; dt := 3; de := -2;
    update public.companion_stats
       set groomed_at = now_ts
     where companion_id = p_companion;
  else
    raise exception 'unknown action %', p_kind;
  end if;

  update public.companions c
     set affection = calc.new_affection,
         trust = calc.new_trust,
         energy = calc.new_energy,
         mood = case
           when calc.new_energy <= 15 then 'tired'
           when calc.new_affection >= 70 then 'happy'
           when calc.new_trust >= 60 then 'curious'
           else 'neutral'
         end,
         updated_at = now_ts
    from (
      select id,
             public._clamp(affection + da) as new_affection,
             public._clamp(trust + dt) as new_trust,
             public._clamp(energy + de) as new_energy
        from public.companions
       where id = p_companion
    ) as calc
   where c.id = calc.id
   returning c.affection, c.trust, c.energy, c.mood
    into a, t, e, m;

  if not found then
    raise exception 'companion missing';
  end if;

  insert into public.bond_events (companion_id, owner_id, kind, delta_affection, delta_trust, delta_energy)
  values (p_companion, u, p_kind, da, dt, de);

  insert into public.events (user_id, kind, meta)
  values (u, 'companion_care', jsonb_build_object('companion', p_companion, 'action', p_kind));

  if last_date is null then
    new_streak := 1;
  elsif last_date = current_date then
    new_streak := stats_row.care_streak;
  elsif last_date = current_date - 1 then
    new_streak := stats_row.care_streak + 1;
  else
    new_streak := 1;
  end if;

  update public.companion_stats
     set care_streak = greatest(new_streak, 0)
   where companion_id = p_companion
   returning care_streak into s;

  return query select a, t, e, m, s;
end;
$$;

grant execute on function public.care_action(uuid, text) to authenticated;
