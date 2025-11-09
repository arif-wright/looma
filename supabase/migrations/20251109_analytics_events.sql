create table if not exists public.events (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

alter table public.events
  add column if not exists kind text;

update public.events
set kind = coalesce(kind, 'custom')
where kind is null;

alter table public.events
  alter column kind set default 'custom';

alter table public.events
  alter column kind set not null;

alter table public.events
  alter column kind drop default;

alter table public.events enable row level security;

create index if not exists events_kind_created_idx on public.events(kind, created_at desc);
create index if not exists events_user_created_idx on public.events(user_id, created_at desc);

create policy "insert own events" on public.events
for insert to authenticated
with check (auth.uid() = user_id);

create or replace function public.count_distinct_event_users(window_start timestamptz)
returns bigint
language sql
stable
as $$
  select coalesce(count(distinct user_id), 0)::bigint
  from public.events
  where created_at >= window_start
    and user_id is not null;
$$;
