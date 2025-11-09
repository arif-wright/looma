create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  note text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.feature_flags enable row level security;

create policy "read_flags" on public.feature_flags
for select to authenticated
using (true);

create table if not exists public.maintenance (
  id int primary key default 1,
  enabled boolean not null default false,
  message text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.maintenance enable row level security;

create policy "read_maint" on public.maintenance
for select to authenticated
using (true);
