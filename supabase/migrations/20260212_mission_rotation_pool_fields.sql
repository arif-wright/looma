-- Mission pool metadata for weighted rotation.

alter table if exists public.missions
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists weight integer not null default 1,
  add column if not exists min_level integer,
  add column if not exists requires jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'missions_weight_check'
  ) then
    alter table public.missions
      add constraint missions_weight_check
      check (weight > 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'missions_min_level_check'
  ) then
    alter table public.missions
      add constraint missions_min_level_check
      check (min_level is null or min_level >= 0);
  end if;
end
$$;

create index if not exists missions_tags_idx on public.missions using gin (tags);
create index if not exists missions_weight_idx on public.missions(weight desc);
