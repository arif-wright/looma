alter table if exists public.user_preferences
  add column if not exists featured_companion_reward_key text,
  add column if not exists featured_companion_reward_companion_id uuid references public.companions(id) on delete set null;

create index if not exists user_preferences_featured_companion_reward_companion_idx
  on public.user_preferences (featured_companion_reward_companion_id);
