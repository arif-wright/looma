create table if not exists public.user_trust (
  user_id uuid primary key references auth.users(id) on delete cascade,
  score int not null default 50,
  tier text not null default 'new',
  forced_tier text,
  last_computed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_trust_score_check check (score between 0 and 100),
  constraint user_trust_tier_check check (tier in ('new', 'standard', 'trusted', 'restricted')),
  constraint user_trust_forced_tier_check check (forced_tier is null or forced_tier in ('new', 'standard', 'trusted', 'restricted'))
);

create table if not exists public.trust_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  delta int not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trust_events_user_created_idx
  on public.trust_events(user_id, created_at desc);

create index if not exists user_trust_tier_idx
  on public.user_trust(tier);

create or replace function public.set_user_trust_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_user_trust_set_updated_at on public.user_trust;
create trigger trg_user_trust_set_updated_at
  before update on public.user_trust
  for each row
  execute procedure public.set_user_trust_updated_at();

alter table public.user_trust enable row level security;
alter table public.trust_events enable row level security;

drop policy if exists user_trust_owner_select on public.user_trust;
create policy user_trust_owner_select
  on public.user_trust
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_trust_moderator_select on public.user_trust;
create policy user_trust_moderator_select
  on public.user_trust
  for select
  to authenticated
  using (public.is_moderator(auth.uid()));

drop policy if exists user_trust_moderator_insert on public.user_trust;
create policy user_trust_moderator_insert
  on public.user_trust
  for insert
  to authenticated
  with check (public.is_moderator(auth.uid()));

drop policy if exists user_trust_moderator_update on public.user_trust;
create policy user_trust_moderator_update
  on public.user_trust
  for update
  to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

drop policy if exists trust_events_owner_select on public.trust_events;
create policy trust_events_owner_select
  on public.trust_events
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists trust_events_moderator_select on public.trust_events;
create policy trust_events_moderator_select
  on public.trust_events
  for select
  to authenticated
  using (public.is_moderator(auth.uid()));

drop policy if exists trust_events_moderator_insert on public.trust_events;
create policy trust_events_moderator_insert
  on public.trust_events
  for insert
  to authenticated
  with check (public.is_moderator(auth.uid()));
