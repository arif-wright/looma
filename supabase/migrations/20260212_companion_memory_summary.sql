create table if not exists public.companion_memory_summary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  companion_id text not null,
  summary_text text not null default '',
  highlights_json jsonb not null default '[]'::jsonb,
  last_built_at timestamptz,
  source_window_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companion_memory_summary_unique_user_companion'
  ) then
    alter table public.companion_memory_summary
      add constraint companion_memory_summary_unique_user_companion
      unique (user_id, companion_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companion_memory_summary_highlights_array_check'
  ) then
    alter table public.companion_memory_summary
      add constraint companion_memory_summary_highlights_array_check
      check (jsonb_typeof(highlights_json) = 'array');
  end if;
end
$$;

create index if not exists companion_memory_summary_user_idx
  on public.companion_memory_summary(user_id);

create or replace function public.set_companion_memory_summary_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_companion_memory_summary_set_updated_at on public.companion_memory_summary;
create trigger trg_companion_memory_summary_set_updated_at
  before update on public.companion_memory_summary
  for each row
  execute function public.set_companion_memory_summary_updated_at();

alter table public.companion_memory_summary enable row level security;

drop policy if exists companion_memory_summary_owner_select on public.companion_memory_summary;
create policy companion_memory_summary_owner_select
  on public.companion_memory_summary
  for select
  using (user_id = auth.uid());

drop policy if exists companion_memory_summary_owner_insert on public.companion_memory_summary;
create policy companion_memory_summary_owner_insert
  on public.companion_memory_summary
  for insert
  with check (user_id = auth.uid());

drop policy if exists companion_memory_summary_owner_update on public.companion_memory_summary;
create policy companion_memory_summary_owner_update
  on public.companion_memory_summary
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
