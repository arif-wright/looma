create table if not exists public.item_catalog (
  id uuid primary key default gen_random_uuid(),
  item_key text unique not null,
  title text not null,
  description text not null default '',
  kind text not null,
  tone text not null default 'bond',
  visual_key text not null,
  capabilities text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint item_catalog_kind_check
    check (kind in ('keepsake', 'gift', 'consumable', 'wearable', 'furniture')),
  constraint item_catalog_tone_check
    check (tone in ('care', 'memory', 'play', 'wonder', 'bond', 'social', 'mission'))
);

create table if not exists public.user_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  companion_id uuid references public.companions(id) on delete set null,
  item_id uuid not null references public.item_catalog(id) on delete restrict,
  quantity int not null default 1 check (quantity > 0),
  source_type text not null,
  source_key text,
  provenance_json jsonb not null default '{}'::jsonb,
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, companion_id, item_id, source_type, source_key)
);

create index if not exists user_items_owner_idx on public.user_items (owner_id, acquired_at desc);
create index if not exists user_items_companion_idx on public.user_items (companion_id, acquired_at desc);

create or replace function public.set_user_item_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_user_items_set_updated_at on public.user_items;
create trigger trg_user_items_set_updated_at
  before update on public.user_items
  for each row
  execute function public.set_user_item_updated_at();

alter table public.item_catalog enable row level security;
alter table public.user_items enable row level security;

drop policy if exists item_catalog_read on public.item_catalog;
create policy item_catalog_read on public.item_catalog
  for select to authenticated using (true);

drop policy if exists user_items_owner_select on public.user_items;
create policy user_items_owner_select on public.user_items
  for select to authenticated using (owner_id = auth.uid());

alter table public.sanctuary_placements
  add column if not exists item_id uuid references public.item_catalog(id) on delete restrict;

alter table public.sanctuary_placements
  alter column decor_id drop not null;

drop policy if exists sanctuary_placements_owner_insert on public.sanctuary_placements;
create policy sanctuary_placements_owner_insert
  on public.sanctuary_placements
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (
      companion_id is null
      or exists (
        select 1 from public.companions
        where id = companion_id and owner_id = auth.uid()
      )
    )
    and item_id is not null
    and exists (
      select 1
      from public.user_items owned
      join public.item_catalog item on item.id = owned.item_id
      where owned.owner_id = auth.uid()
        and owned.item_id = sanctuary_placements.item_id
        and 'placeable' = any(item.capabilities)
    )
  );

drop policy if exists sanctuary_placements_owner_update on public.sanctuary_placements;
create policy sanctuary_placements_owner_update
  on public.sanctuary_placements
  for update to authenticated
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
    and item_id is not null
    and exists (
      select 1
      from public.user_items owned
      join public.item_catalog item on item.id = owned.item_id
      where owned.owner_id = auth.uid()
        and owned.item_id = sanctuary_placements.item_id
        and 'placeable' = any(item.capabilities)
    )
  );

insert into public.item_catalog
  (item_key, title, description, kind, tone, visual_key, capabilities)
values
  (
    'care-moss-seat',
    'Moss Seat',
    'Earned after three moments of care. It holds the memory of learning how your companion likes to be tended.',
    'furniture',
    'bond',
    'moss_seat',
    '{placeable,interactive,keepsake}'
  ),
  (
    'chapter-care-lantern',
    'Care Lantern',
    'A keepsake formed by a chapter of steady care.',
    'keepsake',
    'care',
    'lantern',
    '{placeable,keepsake}'
  ),
  (
    'chapter-social-ribbon',
    'Echo Ribbon',
    'A keepsake formed by shared expression and connection.',
    'keepsake',
    'social',
    'play_ribbons',
    '{placeable,keepsake}'
  ),
  (
    'chapter-mission-thread',
    'Wayfinder Thread',
    'A keepsake formed by purpose and shared direction.',
    'keepsake',
    'mission',
    'whisper_chimes',
    '{placeable,keepsake}'
  ),
  (
    'chapter-play-spark',
    'Play Spark',
    'A keepsake formed by joyful play.',
    'keepsake',
    'play',
    'starglass_pool',
    '{placeable,keepsake}'
  ),
  (
    'chapter-bond-sigil',
    'Bond Sigil',
    'A keepsake formed when trust and affection became mutual.',
    'keepsake',
    'bond',
    'memory_bloom',
    '{placeable,keepsake}'
  )
on conflict (item_key) do update set
  title = excluded.title,
  description = excluded.description,
  kind = excluded.kind,
  tone = excluded.tone,
  visual_key = excluded.visual_key,
  capabilities = excluded.capabilities;

insert into public.user_items
  (owner_id, companion_id, item_id, source_type, source_key, provenance_json, acquired_at)
select
  reward.owner_id,
  reward.companion_id,
  item.id,
  'chapter_reward',
  reward.reward_key,
  jsonb_build_object(
    'title', reward.reward_title,
    'body', reward.reward_body,
    'tone', reward.reward_tone
  ),
  reward.unlocked_at
from public.companion_chapter_rewards reward
join public.item_catalog item on item.item_key = reward.reward_key
on conflict (owner_id, companion_id, item_id, source_type, source_key) do nothing;
