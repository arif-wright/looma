create table if not exists public.companion_daily_arc_progress (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  companion_id uuid not null references public.companions(id) on delete cascade,
  arc_date date not null default current_date,
  arrive_complete boolean not null default false,
  ritual_complete boolean not null default false,
  express_complete boolean not null default false,
  remember_complete boolean not null default false,
  recap_unlocked_at timestamptz,
  recap_title text,
  recap_body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists companion_daily_arc_progress_unique_idx
  on public.companion_daily_arc_progress (owner_id, companion_id, arc_date);

create index if not exists companion_daily_arc_progress_owner_idx
  on public.companion_daily_arc_progress (owner_id, arc_date desc);

create or replace function public.set_companion_daily_arc_progress_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_companion_daily_arc_progress_set_updated_at on public.companion_daily_arc_progress;
create trigger trg_companion_daily_arc_progress_set_updated_at
  before update on public.companion_daily_arc_progress
  for each row
  execute function public.set_companion_daily_arc_progress_updated_at();

alter table public.companion_daily_arc_progress enable row level security;

drop policy if exists companion_daily_arc_progress_owner_select on public.companion_daily_arc_progress;
create policy companion_daily_arc_progress_owner_select
  on public.companion_daily_arc_progress
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists companion_daily_arc_progress_owner_insert on public.companion_daily_arc_progress;
create policy companion_daily_arc_progress_owner_insert
  on public.companion_daily_arc_progress
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists companion_daily_arc_progress_owner_update on public.companion_daily_arc_progress;
create policy companion_daily_arc_progress_owner_update
  on public.companion_daily_arc_progress
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
