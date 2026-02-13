-- Phase 12.10 — Auth signup profile bootstrap hardening
-- Prevent auth signup failures when profile constraints evolve (e.g. non-null/unique handle).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_handle text;
  candidate_handle text;
  display_name_candidate text;
  suffix text;
begin
  base_handle := lower(
    regexp_replace(
      coalesce(
        nullif(trim(new.raw_user_meta_data->>'preferred_username'), ''),
        nullif(trim(new.raw_user_meta_data->>'user_name'), ''),
        nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
        'player'
      ),
      '[^a-z0-9_]+',
      '',
      'g'
    )
  );

  if base_handle is null or base_handle = '' then
    base_handle := 'player';
  end if;

  -- Leave room for suffix when collisions happen.
  base_handle := left(base_handle, 14);
  candidate_handle := base_handle;

  loop
    exit when not exists (
      select 1
      from public.profiles p
      where lower(p.handle) = lower(candidate_handle)
    );

    suffix := substring(replace(gen_random_uuid()::text, '-', '') from 1 for 5);
    candidate_handle := left(base_handle, 14) || '_' || suffix;
  end loop;

  display_name_candidate := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''),
    ''
  );

  insert into public.profiles (
    id,
    handle,
    display_name,
    avatar_url,
    joined_at,
    is_private,
    links
  )
  values (
    new.id,
    candidate_handle,
    display_name_candidate,
    nullif(trim(new.raw_user_meta_data->>'avatar_url'), ''),
    now(),
    false,
    '[]'::jsonb
  )
  on conflict (id) do update
    set display_name = case
      when public.profiles.display_name is null or trim(public.profiles.display_name) = ''
        then excluded.display_name
      else public.profiles.display_name
    end,
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    joined_at = coalesce(public.profiles.joined_at, excluded.joined_at),
    links = coalesce(public.profiles.links, excluded.links),
    is_private = coalesce(public.profiles.is_private, excluded.is_private),
    handle = coalesce(public.profiles.handle, excluded.handle);

  return new;
exception
  when others then
    -- Never block auth signup because of profile bootstrap failures.
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'users'
      and t.tgname = 'on_auth_user_created'
      and not t.tgisinternal
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute procedure public.handle_new_user();
  end if;
end;
$$;
