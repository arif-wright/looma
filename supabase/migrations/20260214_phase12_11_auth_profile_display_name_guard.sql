-- Phase 12.11 — Guard profile defaults during auth bootstrap
-- Fixes signup failures when any legacy path inserts NULL display_name.

create or replace function public.profiles_apply_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.display_name is null then
    new.display_name := '';
  end if;

  if new.links is null then
    new.links := '[]'::jsonb;
  end if;

  if new.is_private is null then
    new.is_private := false;
  end if;

  if new.joined_at is null then
    new.joined_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_apply_defaults on public.profiles;
create trigger trg_profiles_apply_defaults
before insert or update on public.profiles
for each row execute procedure public.profiles_apply_defaults();

-- Force auth trigger to point at the current public.handle_new_user implementation.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
