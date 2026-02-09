alter table if exists public.notifications
  drop constraint if exists notifications_kind_check;

alter table if exists public.notifications
  add constraint notifications_kind_check
  check (kind in ('reaction', 'comment', 'share', 'achievement_unlocked', 'companion_nudge'));

alter table if exists public.notifications
  drop constraint if exists notifications_target_kind_check;

alter table if exists public.notifications
  add constraint notifications_target_kind_check
  check (target_kind in ('post', 'comment', 'achievement', 'companion'));
