create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  is_finance boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.admin_roles enable row level security;

create policy "nobody_reads_admin_roles" on public.admin_roles
for select to authenticated
using (false);
