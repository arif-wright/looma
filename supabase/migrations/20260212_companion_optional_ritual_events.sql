create table if not exists public.companion_optional_ritual_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  companion_id uuid not null references public.companions(id) on delete cascade,
  ritual_key text not null,
  meta jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companion_optional_ritual_events_key_check'
  ) then
    alter table public.companion_optional_ritual_events
      add constraint companion_optional_ritual_events_key_check
      check (ritual_key in ('listen', 'focus', 'celebrate'));
  end if;
end
$$;

create index if not exists companion_optional_ritual_events_owner_idx
  on public.companion_optional_ritual_events (owner_id, ritual_key, inserted_at desc);

create index if not exists companion_optional_ritual_events_companion_idx
  on public.companion_optional_ritual_events (companion_id, inserted_at desc);

alter table public.companion_optional_ritual_events enable row level security;

drop policy if exists companion_optional_ritual_events_owner_select on public.companion_optional_ritual_events;
create policy companion_optional_ritual_events_owner_select
  on public.companion_optional_ritual_events
  for select
  using (owner_id = auth.uid());

drop policy if exists companion_optional_ritual_events_owner_insert on public.companion_optional_ritual_events;
create policy companion_optional_ritual_events_owner_insert
  on public.companion_optional_ritual_events
  for insert
  with check (owner_id = auth.uid());
