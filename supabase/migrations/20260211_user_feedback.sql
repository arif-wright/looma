create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text,
  message text not null,
  source text not null default 'in_app',
  meta jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_feedback_category_check'
  ) then
    alter table public.user_feedback
      add constraint user_feedback_category_check
      check (
        category is null
        or category in ('bug', 'idea', 'ux', 'content', 'other')
      );
  end if;
end
$$;

create index if not exists user_feedback_user_idx
  on public.user_feedback(user_id, inserted_at desc);

alter table public.user_feedback enable row level security;

drop policy if exists user_feedback_owner_select on public.user_feedback;
create policy user_feedback_owner_select
  on public.user_feedback
  for select
  using (user_id = auth.uid());

drop policy if exists user_feedback_owner_insert on public.user_feedback;
create policy user_feedback_owner_insert
  on public.user_feedback
  for insert
  with check (user_id = auth.uid());
