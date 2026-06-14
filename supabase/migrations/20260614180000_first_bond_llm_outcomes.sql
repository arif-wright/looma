alter table if exists public.llm_usage_logs
  add column if not exists outcome text not null default 'success',
  add column if not exists reason text not null default 'legacy_success',
  add column if not exists event_type text,
  add column if not exists companion_id uuid references public.companions(id) on delete set null,
  add column if not exists archetype text,
  add column if not exists first_bond boolean not null default false;

alter table if exists public.llm_usage_logs
  drop constraint if exists llm_usage_logs_outcome_check;

alter table if exists public.llm_usage_logs
  add constraint llm_usage_logs_outcome_check
  check (outcome in ('success', 'fallback'));

create index if not exists llm_usage_logs_first_bond_outcome_idx
  on public.llm_usage_logs (first_bond, outcome, created_at desc);
