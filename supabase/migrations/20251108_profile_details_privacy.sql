-- Phase 12.3 — Profile details + privacy flags

alter table if exists public.profiles
  add column if not exists display_name text,
  add column if not exists bio text,
  add column if not exists pronouns text,
  add column if not exists location text,
  add column if not exists links jsonb default '[]'::jsonb,
  add column if not exists show_shards boolean not null default true,
  add column if not exists show_level boolean not null default true,
  add column if not exists show_joined boolean not null default true;
