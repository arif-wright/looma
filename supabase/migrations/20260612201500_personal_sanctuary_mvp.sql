create table if not exists public.sanctuary_decor_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text not null default '',
  tone text not null default 'bond',
  visual_key text not null,
  starter boolean not null default false,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  constraint sanctuary_decor_catalog_tone_check
    check (tone in ('care', 'memory', 'play', 'wonder', 'bond'))
);

create table if not exists public.sanctuary_placements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  companion_id uuid references public.companions(id) on delete set null,
  decor_id uuid not null references public.sanctuary_decor_catalog(id) on delete restrict,
  slot_key text not null,
  placed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sanctuary_placements_slot_check
    check (slot_key in ('left_grove', 'center_glade', 'right_grove', 'near_left', 'near_right')),
  unique (owner_id, slot_key)
);

create index if not exists sanctuary_placements_owner_idx
  on public.sanctuary_placements (owner_id, updated_at desc);

create or replace function public.set_sanctuary_placement_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sanctuary_placements_set_updated_at on public.sanctuary_placements;
create trigger trg_sanctuary_placements_set_updated_at
  before update on public.sanctuary_placements
  for each row
  execute function public.set_sanctuary_placement_updated_at();

alter table public.sanctuary_decor_catalog enable row level security;
alter table public.sanctuary_placements enable row level security;

drop policy if exists sanctuary_decor_catalog_read on public.sanctuary_decor_catalog;
create policy sanctuary_decor_catalog_read
  on public.sanctuary_decor_catalog
  for select
  to authenticated
  using (starter = true);

drop policy if exists sanctuary_placements_owner_select on public.sanctuary_placements;
create policy sanctuary_placements_owner_select
  on public.sanctuary_placements
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists sanctuary_placements_owner_insert on public.sanctuary_placements;
create policy sanctuary_placements_owner_insert
  on public.sanctuary_placements
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and (
      companion_id is null
      or exists (
        select 1 from public.companions
        where id = companion_id and owner_id = auth.uid()
      )
    )
    and exists (
      select 1 from public.sanctuary_decor_catalog
      where id = decor_id and starter = true
    )
  );

drop policy if exists sanctuary_placements_owner_update on public.sanctuary_placements;
create policy sanctuary_placements_owner_update
  on public.sanctuary_placements
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      companion_id is null
      or exists (
        select 1 from public.companions
        where id = companion_id and owner_id = auth.uid()
      )
    )
    and exists (
      select 1 from public.sanctuary_decor_catalog
      where id = decor_id and starter = true
    )
  );

drop policy if exists sanctuary_placements_owner_delete on public.sanctuary_placements;
create policy sanctuary_placements_owner_delete
  on public.sanctuary_placements
  for delete
  to authenticated
  using (owner_id = auth.uid());

insert into public.sanctuary_decor_catalog
  (slug, title, description, tone, visual_key, starter, sort)
values
  ('warm-lantern', 'Warm Lantern', 'A steady light for quiet returns.', 'care', 'lantern', true, 10),
  ('moss-seat', 'Moss Seat', 'A soft place to pause together.', 'bond', 'moss_seat', true, 20),
  ('memory-bloom', 'Memory Bloom', 'A flower that opens around remembered moments.', 'memory', 'memory_bloom', true, 30),
  ('starglass-pool', 'Starglass Pool', 'A small pool that catches impossible skies.', 'wonder', 'starglass_pool', true, 40),
  ('play-ribbons', 'Play Ribbons', 'Bright ribbons that invite motion and mischief.', 'play', 'play_ribbons', true, 50),
  ('whisper-chimes', 'Whisper Chimes', 'Chimes that make the sanctuary feel inhabited.', 'care', 'whisper_chimes', true, 60)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  tone = excluded.tone,
  visual_key = excluded.visual_key,
  starter = excluded.starter,
  sort = excluded.sort;
