-- Phase 9.5 — Notifications schema alignment

-- Remove legacy indexes referencing dropped columns.
drop index if exists public.notifications_user_read_idx;

-- Drop legacy constraints and columns no longer used by the client.
alter table if exists public.notifications
  drop constraint if exists notifications_type_check,
  drop constraint if exists notifications_post_id_fkey,
  drop constraint if exists notifications_comment_id_fkey;

alter table if exists public.notifications
  drop column if exists type,
  drop column if exists post_id,
  drop column if exists comment_id,
  drop column if exists data,
  drop column if exists read_at;

-- Retire superseded RLS policies from the older notification model.
drop policy if exists notifications_select_recipient on public.notifications;
drop policy if exists notifications_insert_service on public.notifications;
drop policy if exists notifications_update_recipient on public.notifications;
drop policy if exists notifications_delete_service on public.notifications;
