create table if not exists public.llm_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  intensity text not null,
  model text not null,
  output_chars int not null default 0,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'llm_usage_logs_intensity_check'
  ) then
    alter table public.llm_usage_logs
      add constraint llm_usage_logs_intensity_check
      check (intensity in ('light', 'peak'));
  end if;
end
$$;

create index if not exists llm_usage_logs_user_day_idx
  on public.llm_usage_logs(user_id, created_at desc);

alter table public.llm_usage_logs enable row level security;
