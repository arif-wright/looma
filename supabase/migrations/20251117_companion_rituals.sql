-- Phase 13.5 — Companion daily rituals

create table if not exists public.companion_rituals (
  owner_id uuid not null references auth.users(id) on delete cascade,
  ritual_key text not null,
  ritual_date date not null default current_date,
  progress int not null default 0,
  progress_goal int not null default 1,
  xp_reward int not null default 5,
  shard_reward int not null default 2,
  affection_reward int not null default 1,
  trust_reward int not null default 1,
  completed boolean not null default false,
  completed_at timestamptz,
  reward_claimed boolean not null default false,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, ritual_key, ritual_date)
);

create index if not exists companion_rituals_owner_date_idx
  on public.companion_rituals (owner_id, ritual_date);

alter table public.companion_rituals enable row level security;

drop policy if exists "rituals_owner_rw" on public.companion_rituals;
create policy "rituals_owner_rw"
  on public.companion_rituals
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.comp_rituals_touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_comp_rituals_touch on public.companion_rituals;
create trigger trg_comp_rituals_touch
  before update on public.companion_rituals
  for each row
  execute function public.comp_rituals_touch_updated();
