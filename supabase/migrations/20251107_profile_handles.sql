-- Phase 12.2b — Handle uniqueness and reservations

alter table if exists public.profiles
  add column if not exists handle text;

do $$
begin
  if exists (
    select 1
    from pg_indexes
    where indexname in ('profiles_handle_key', 'profiles_handle_idx')
  ) then
    begin
      execute 'drop index if exists profiles_handle_key';
      execute 'drop index if exists profiles_handle_idx';
    exception when others then
      null;
    end;
  end if;
end$$;

create unique index if not exists profiles_handle_ci_uq
  on public.profiles ((lower(handle)));

create table if not exists public.reserved_handles (
  handle text primary key
);
