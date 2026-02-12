create table if not exists public.economy_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  direction text not null,
  amounts jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  idempotency_key text,
  applied boolean not null default false,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'economy_transactions_direction_check'
  ) then
    alter table public.economy_transactions
      add constraint economy_transactions_direction_check
      check (direction in ('spend', 'grant'));
  end if;
end
$$;

create unique index if not exists economy_transactions_idempotency_idx
  on public.economy_transactions(user_id, source, idempotency_key)
  where idempotency_key is not null;

create index if not exists economy_transactions_user_created_idx
  on public.economy_transactions(user_id, created_at desc);

create or replace function public.set_economy_transactions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_economy_transactions_set_updated_at on public.economy_transactions;
create trigger trg_economy_transactions_set_updated_at
  before update on public.economy_transactions
  for each row
  execute function public.set_economy_transactions_updated_at();

alter table public.economy_transactions enable row level security;

drop policy if exists economy_transactions_owner_select on public.economy_transactions;
create policy economy_transactions_owner_select
  on public.economy_transactions
  for select
  using (user_id = auth.uid());

create or replace function public.fn_economy_apply(
  p_user uuid,
  p_direction text,
  p_source text,
  p_amounts jsonb default '{}'::jsonb,
  p_meta jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx_id uuid;
  v_existing_result jsonb;
  v_energy int := greatest(coalesce((p_amounts ->> 'energy')::int, 0), 0);
  v_xp int := greatest(coalesce((p_amounts ->> 'xp')::int, 0), 0);
  v_shards bigint := greatest(coalesce((p_amounts ->> 'shards')::bigint, 0), 0);
  v_energy_cap int := nullif(greatest(coalesce((p_amounts ->> 'energyCap')::int, 0), 0), 0);
  v_spent int := 0;
  v_granted int := 0;
  v_wallet_balance bigint := 0;
  v_profile_xp int := 0;
  v_profile_energy int := 0;
  v_result jsonb;
begin
  if p_user is null then
    raise exception 'user is required';
  end if;

  if p_direction not in ('spend', 'grant') then
    raise exception 'direction must be spend or grant';
  end if;

  if p_source is null or btrim(p_source) = '' then
    raise exception 'source is required';
  end if;

  if p_idempotency_key is not null and btrim(p_idempotency_key) <> '' then
    insert into public.economy_transactions(
      user_id,
      source,
      direction,
      amounts,
      meta,
      idempotency_key,
      applied,
      result
    )
    values (
      p_user,
      p_source,
      p_direction,
      coalesce(p_amounts, '{}'::jsonb),
      coalesce(p_meta, '{}'::jsonb),
      btrim(p_idempotency_key),
      false,
      '{}'::jsonb
    )
    on conflict (user_id, source, idempotency_key)
    do nothing
    returning id into v_tx_id;

    if v_tx_id is null then
      select result
        into v_existing_result
      from public.economy_transactions
      where user_id = p_user
        and source = p_source
        and idempotency_key = btrim(p_idempotency_key)
      for update;

      return coalesce(v_existing_result, jsonb_build_object('ok', true, 'reused', true));
    end if;
  else
    insert into public.economy_transactions(
      user_id,
      source,
      direction,
      amounts,
      meta,
      applied,
      result
    )
    values (
      p_user,
      p_source,
      p_direction,
      coalesce(p_amounts, '{}'::jsonb),
      coalesce(p_meta, '{}'::jsonb),
      false,
      '{}'::jsonb
    )
    returning id into v_tx_id;
  end if;

  if p_direction = 'spend' then
    if v_xp > 0 then
      raise exception 'xp spend is not supported';
    end if;

    if v_energy > 0 then
      select spent
        into v_spent
      from public.fn_profile_spend_energy(p_user, v_energy)
      limit 1;

      if coalesce(v_spent, 0) < v_energy then
        raise exception 'insufficient energy';
      end if;
    end if;

    if v_shards > 0 then
      perform public.fn_wallet_spend(
        p_user,
        v_shards,
        p_source,
        null,
        coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('economyTransactionId', v_tx_id)
      );
    end if;
  else
    if v_xp > 0 then
      perform public.fn_award_game_xp(p_user, v_xp);
    end if;

    if v_energy > 0 then
      select granted
        into v_granted
      from public.fn_profile_grant_energy(p_user, v_energy, v_energy_cap)
      limit 1;
    end if;

    if v_shards > 0 then
      perform public.fn_wallet_grant(
        p_user,
        v_shards,
        p_source,
        null,
        coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('economyTransactionId', v_tx_id)
      );
    end if;
  end if;

  select coalesce(balance, 0)
    into v_wallet_balance
  from public.wallets
  where user_id = p_user;

  select coalesce(xp, 0), coalesce(energy, 0)
    into v_profile_xp, v_profile_energy
  from public.profiles
  where id = p_user;

  v_result := jsonb_build_object(
    'ok', true,
    'transactionId', v_tx_id,
    'reused', false,
    'direction', p_direction,
    'source', p_source,
    'amountsRequested', jsonb_build_object(
      'energy', v_energy,
      'xp', v_xp,
      'shards', v_shards
    ),
    'amountsApplied', jsonb_build_object(
      'energy', case when p_direction = 'grant' then coalesce(v_granted, 0) else v_energy end,
      'xp', v_xp,
      'shards', v_shards
    ),
    'balances', jsonb_build_object(
      'xp', coalesce(v_profile_xp, 0),
      'energy', coalesce(v_profile_energy, 0),
      'shards', coalesce(v_wallet_balance, 0)
    ),
    'idempotencyKey', nullif(btrim(coalesce(p_idempotency_key, '')), '')
  );

  update public.economy_transactions
     set applied = true,
         result = v_result
   where id = v_tx_id;

  return v_result;
exception
  when others then
    if v_tx_id is not null then
      update public.economy_transactions
         set applied = false,
             result = jsonb_build_object(
               'ok', false,
               'transactionId', v_tx_id,
               'error', sqlerrm,
               'direction', p_direction,
               'source', p_source,
               'idempotencyKey', nullif(btrim(coalesce(p_idempotency_key, '')), '')
             )
       where id = v_tx_id;
    end if;
    raise;
end;
$$;

grant execute on function public.fn_economy_apply(uuid, text, text, jsonb, jsonb, text) to authenticated;

drop function if exists public.fn_economy_get_balances(uuid);
create or replace function public.fn_economy_get_balances(p_user uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with profile as (
    select coalesce(xp, 0) as xp, coalesce(energy, 0) as energy
    from public.profiles
    where id = p_user
  ),
  wallet as (
    select coalesce(balance, 0) as shards
    from public.wallets
    where user_id = p_user
  )
  select jsonb_build_object(
    'xp', coalesce((select xp from profile), 0),
    'energy', coalesce((select energy from profile), 0),
    'shards', coalesce((select shards from wallet), 0)
  );
$$;

grant execute on function public.fn_economy_get_balances(uuid) to authenticated;

alter table if exists public.mission_sessions
  add column if not exists mission_type text,
  add column if not exists cost jsonb,
  add column if not exists rewards jsonb,
  add column if not exists idempotency_key text;

create unique index if not exists mission_sessions_idempotency_idx
  on public.mission_sessions(user_id, idempotency_key)
  where idempotency_key is not null;

update public.mission_sessions
set mission_type = coalesce(mission_type, meta ->> 'missionType', 'action')
where mission_type is null;

update public.mission_sessions
set cost = coalesce(cost, cost_snapshot)
where cost is null;

update public.mission_sessions
set idempotency_key = coalesce(idempotency_key, nullif(meta ->> 'idempotencyKey', ''))
where idempotency_key is null;
