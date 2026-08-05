-- Phase 8C.4: Memvoya-owned base player body selection.
-- Existing accounts safely inherit the original placeholder-compatible body.

alter table public.profiles
  add column if not exists player_body text not null default 'male';

alter table public.profiles
  drop constraint if exists profiles_player_body_check;

alter table public.profiles
  add constraint profiles_player_body_check
  check (player_body in ('male', 'female'));

comment on column public.profiles.player_body is
  'Memvoya-owned renderer-neutral base player body; independent of authentication provider.';
