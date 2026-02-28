create table if not exists public.companion_chapter_rewards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  companion_id uuid not null references public.companions(id) on delete cascade,
  reward_key text not null,
  reward_title text not null,
  reward_body text not null default '',
  reward_tone text,
  unlocked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (owner_id, companion_id, reward_key)
);

create index if not exists companion_chapter_rewards_owner_idx
  on public.companion_chapter_rewards (owner_id, unlocked_at desc);

create index if not exists companion_chapter_rewards_companion_idx
  on public.companion_chapter_rewards (companion_id, unlocked_at desc);

alter table public.companion_chapter_rewards enable row level security;

drop policy if exists companion_chapter_rewards_owner_select on public.companion_chapter_rewards;
create policy companion_chapter_rewards_owner_select
  on public.companion_chapter_rewards
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists companion_chapter_rewards_owner_insert on public.companion_chapter_rewards;
create policy companion_chapter_rewards_owner_insert
  on public.companion_chapter_rewards
  for insert
  to authenticated
  with check (owner_id = auth.uid());
