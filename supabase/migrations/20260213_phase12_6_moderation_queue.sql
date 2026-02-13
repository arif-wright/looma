create table if not exists public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.message_reports(id) on delete cascade,
  status text not null default 'open',
  assigned_to uuid references auth.users(id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moderation_cases_status_check check (status in ('open', 'under_review', 'resolved', 'dismissed')),
  constraint moderation_cases_report_unique unique (report_id)
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_id uuid,
  duration_minutes int,
  reason text not null,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint moderation_actions_action_check check (action in ('warn', 'mute', 'suspend', 'ban', 'message_delete', 'circle_kick')),
  constraint moderation_actions_duration_check check (duration_minutes is null or duration_minutes > 0)
);

create index if not exists moderation_cases_status_created_idx
  on public.moderation_cases(status, created_at desc);

create index if not exists moderation_cases_assigned_idx
  on public.moderation_cases(assigned_to);

create index if not exists moderation_actions_user_idx
  on public.moderation_actions(user_id, created_at desc);

create index if not exists moderation_actions_action_idx
  on public.moderation_actions(action, created_at desc);

alter table if exists public.user_preferences
  add column if not exists moderation_status text not null default 'active',
  add column if not exists moderation_until timestamptz,
  add column if not exists role text not null default 'user';

alter table if exists public.user_preferences
  drop constraint if exists user_preferences_moderation_status_check;

alter table if exists public.user_preferences
  add constraint user_preferences_moderation_status_check
  check (moderation_status in ('active', 'muted', 'suspended', 'banned'));

alter table if exists public.user_preferences
  drop constraint if exists user_preferences_role_check;

alter table if exists public.user_preferences
  add constraint user_preferences_role_check
  check (role in ('user', 'moderator', 'admin'));

create or replace function public.set_moderation_cases_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_moderation_cases_set_updated_at on public.moderation_cases;
create trigger trg_moderation_cases_set_updated_at
  before update on public.moderation_cases
  for each row
  execute procedure public.set_moderation_cases_updated_at();

create or replace function public.is_moderator(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select up.role in ('moderator', 'admin')
      from public.user_preferences up
      where up.user_id = p_user
      limit 1
    ), false)
    or exists (
      select 1
      from public.admin_roles ar
      where ar.user_id = p_user
        and (ar.is_admin = true or ar.is_super = true)
    );
$$;

grant execute on function public.is_moderator(uuid) to authenticated;

alter table public.moderation_cases enable row level security;
alter table public.moderation_actions enable row level security;

drop policy if exists moderation_cases_moderator_select on public.moderation_cases;
create policy moderation_cases_moderator_select
  on public.moderation_cases
  for select
  to authenticated
  using (public.is_moderator(auth.uid()));

drop policy if exists moderation_cases_moderator_insert on public.moderation_cases;
create policy moderation_cases_moderator_insert
  on public.moderation_cases
  for insert
  to authenticated
  with check (public.is_moderator(auth.uid()));

drop policy if exists moderation_cases_moderator_update on public.moderation_cases;
create policy moderation_cases_moderator_update
  on public.moderation_cases
  for update
  to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

drop policy if exists moderation_actions_moderator_select on public.moderation_actions;
create policy moderation_actions_moderator_select
  on public.moderation_actions
  for select
  to authenticated
  using (public.is_moderator(auth.uid()));

drop policy if exists moderation_actions_moderator_insert on public.moderation_actions;
create policy moderation_actions_moderator_insert
  on public.moderation_actions
  for insert
  to authenticated
  with check (public.is_moderator(auth.uid()));
