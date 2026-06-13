alter table if exists public.companions
  add column if not exists first_bond_completed_at timestamptz;

update public.companions
set first_bond_completed_at = coalesce(first_bond_completed_at, created_at, now())
where first_bond_completed_at is null;
