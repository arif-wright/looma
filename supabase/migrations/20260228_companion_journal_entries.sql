create table if not exists public.companion_journal_entries (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references public.companions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  title text not null,
  body text not null default '',
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companion_journal_entries_source_type_check'
  ) then
    alter table public.companion_journal_entries
      add constraint companion_journal_entries_source_type_check
      check (source_type in ('post', 'message', 'circle_announcement', 'system'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companion_journal_entries_meta_json_object_check'
  ) then
    alter table public.companion_journal_entries
      add constraint companion_journal_entries_meta_json_object_check
      check (jsonb_typeof(meta_json) = 'object');
  end if;
end
$$;

create index if not exists companion_journal_entries_companion_idx
  on public.companion_journal_entries (companion_id, created_at desc);

create index if not exists companion_journal_entries_owner_idx
  on public.companion_journal_entries (owner_id, created_at desc);

create unique index if not exists companion_journal_entries_source_unique_idx
  on public.companion_journal_entries (owner_id, companion_id, source_type, source_id)
  where source_id is not null;

create or replace function public.set_companion_journal_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_companion_journal_entries_set_updated_at on public.companion_journal_entries;
create trigger trg_companion_journal_entries_set_updated_at
  before update on public.companion_journal_entries
  for each row
  execute function public.set_companion_journal_entries_updated_at();

alter table public.companion_journal_entries enable row level security;

drop policy if exists companion_journal_entries_owner_select on public.companion_journal_entries;
create policy companion_journal_entries_owner_select
  on public.companion_journal_entries
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists companion_journal_entries_owner_insert on public.companion_journal_entries;
create policy companion_journal_entries_owner_insert
  on public.companion_journal_entries
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists companion_journal_entries_owner_update on public.companion_journal_entries;
create policy companion_journal_entries_owner_update
  on public.companion_journal_entries
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
