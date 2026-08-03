alter table if exists public.user_preferences
  add column if not exists premium_sanctuary_style text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_preferences_premium_sanctuary_style_check'
      and conrelid = 'public.user_preferences'::regclass
  ) then
    alter table public.user_preferences
      add constraint user_preferences_premium_sanctuary_style_check
      check (
        premium_sanctuary_style is null
        or premium_sanctuary_style in ('gilded_dawn', 'moon_glass', 'ember_bloom', 'tide_silk')
      );
  end if;
end
$$;

comment on column public.user_preferences.premium_sanctuary_style is
  'Optional premium sanctuary presentation selected by the account owner.';
