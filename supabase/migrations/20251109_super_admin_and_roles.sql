alter table if exists public.admin_roles
  add column if not exists is_super boolean not null default false;

-- optional seed example:
-- insert into public.admin_roles (user_id, is_admin, is_finance, is_super)
-- values ('00000000-0000-0000-0000-000000000000', true, true, true)
-- on conflict (user_id) do update set is_super = excluded.is_super;
