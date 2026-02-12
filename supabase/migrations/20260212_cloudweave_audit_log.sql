create table if not exists public.cloudweave_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  companion_id text not null,
  action text not null,
  export_version text not null,
  signature_prefix text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cloudweave_audit_log_action_check'
  ) then
    alter table public.cloudweave_audit_log
      add constraint cloudweave_audit_log_action_check
      check (action in ('export', 'import_attempt', 'import_applied', 'import_rejected', 'clear_state', 'consent_change'));
  end if;
end
$$;

create index if not exists cloudweave_audit_log_user_created_idx
  on public.cloudweave_audit_log(user_id, created_at desc);

create index if not exists cloudweave_audit_log_signature_idx
  on public.cloudweave_audit_log(signature_prefix, created_at desc);

alter table public.cloudweave_audit_log enable row level security;

drop policy if exists cloudweave_audit_log_owner_select on public.cloudweave_audit_log;
create policy cloudweave_audit_log_owner_select
  on public.cloudweave_audit_log
  for select
  using (user_id = auth.uid());

drop policy if exists cloudweave_audit_log_owner_insert on public.cloudweave_audit_log;
create policy cloudweave_audit_log_owner_insert
  on public.cloudweave_audit_log
  for insert
  with check (user_id = auth.uid());
