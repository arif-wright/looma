alter table if exists public.user_preferences
  add column if not exists consent_emotional_adaptation boolean not null default true,
  add column if not exists consent_cross_app_continuity boolean not null default false;

update public.user_preferences
set consent_emotional_adaptation = coalesce(consent_emotional_adaptation, consent_adaptation, true)
where consent_emotional_adaptation is null;

update public.user_preferences
set consent_cross_app_continuity = coalesce(consent_cross_app_continuity, false)
where consent_cross_app_continuity is null;
