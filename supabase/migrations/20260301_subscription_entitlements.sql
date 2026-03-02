create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'sanctuary_plus',
  status text not null default 'active',
  source text not null default 'admin',
  stripe_customer_id text,
  stripe_subscription_id text,
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  renewal_at timestamptz,
  granted_by uuid references auth.users(id) on delete set null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_tier_check check (tier in ('sanctuary_plus')),
  constraint user_subscriptions_status_check check (status in ('active', 'grace', 'canceled', 'revoked', 'expired')),
  constraint user_subscriptions_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists user_subscriptions_status_idx
  on public.user_subscriptions (status, ends_at desc);

create index if not exists user_subscriptions_granted_by_idx
  on public.user_subscriptions (granted_by, updated_at desc);

create or replace function public.touch_user_subscriptions()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_user_subscriptions_touch on public.user_subscriptions;
create trigger trg_user_subscriptions_touch
  before update on public.user_subscriptions
  for each row
  execute function public.touch_user_subscriptions();

alter table public.user_subscriptions enable row level security;

drop policy if exists user_subscriptions_select_own on public.user_subscriptions;
create policy user_subscriptions_select_own
  on public.user_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.admin_grant_subscription(
  p_user uuid,
  p_tier text default 'sanctuary_plus',
  p_duration_days int default 30,
  p_note text default null,
  p_granted_by uuid default null
)
returns public.user_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.user_subscriptions%rowtype;
  v_effective_start timestamptz;
  v_new_ends_at timestamptz;
  v_result public.user_subscriptions%rowtype;
begin
  if p_user is null then
    raise exception 'missing_user';
  end if;

  if p_tier is null or p_tier not in ('sanctuary_plus') then
    raise exception 'bad_tier';
  end if;

  if p_duration_days is null or p_duration_days <= 0 or p_duration_days > 3650 then
    raise exception 'bad_duration_days';
  end if;

  select *
    into v_existing
  from public.user_subscriptions
  where user_id = p_user
  for update;

  v_effective_start := greatest(coalesce(v_existing.ends_at, now()), now());
  if v_existing.user_id is null or coalesce(v_existing.status, 'expired') not in ('active', 'grace') then
    v_effective_start := now();
  end if;

  v_new_ends_at := v_effective_start + make_interval(days => p_duration_days);

  insert into public.user_subscriptions (
    user_id,
    tier,
    status,
    source,
    started_at,
    ends_at,
    renewal_at,
    granted_by,
    note,
    metadata
  )
  values (
    p_user,
    p_tier,
    'active',
    'admin',
    coalesce(v_existing.started_at, now()),
    v_new_ends_at,
    v_new_ends_at,
    p_granted_by,
    nullif(trim(coalesce(p_note, '')), ''),
    jsonb_build_object(
      'granted_via', 'admin',
      'duration_days', p_duration_days
    )
  )
  on conflict (user_id) do update
    set tier = excluded.tier,
        status = 'active',
        source = 'admin',
        ends_at = excluded.ends_at,
        renewal_at = excluded.renewal_at,
        granted_by = excluded.granted_by,
        note = excluded.note,
        metadata = coalesce(public.user_subscriptions.metadata, '{}'::jsonb) || excluded.metadata
  returning * into v_result;

  insert into public.events (user_id, kind, meta)
  values (
    p_user,
    'admin_grant_subscription',
    jsonb_build_object(
      'tier', p_tier,
      'duration_days', p_duration_days,
      'granted_by', p_granted_by,
      'ends_at', v_new_ends_at
    )
  );

  return v_result;
end;
$$;

create or replace function public.admin_revoke_subscription(
  p_user uuid,
  p_reason text default null,
  p_granted_by uuid default null
)
returns public.user_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.user_subscriptions%rowtype;
begin
  if p_user is null then
    raise exception 'missing_user';
  end if;

  update public.user_subscriptions
     set status = 'revoked',
         source = 'admin',
         ends_at = least(coalesce(ends_at, now()), now()),
         renewal_at = null,
         granted_by = p_granted_by,
         note = nullif(trim(coalesce(p_reason, '')), ''),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('revoked_via', 'admin')
   where user_id = p_user
  returning * into v_result;

  if v_result.user_id is null then
    raise exception 'subscription_not_found';
  end if;

  insert into public.events (user_id, kind, meta)
  values (
    p_user,
    'admin_revoke_subscription',
    jsonb_build_object(
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'granted_by', p_granted_by
    )
  );

  return v_result;
end;
$$;

revoke all on function public.admin_grant_subscription(uuid, text, int, text, uuid) from public, authenticated;
revoke all on function public.admin_revoke_subscription(uuid, text, uuid) from public, authenticated;

create or replace view public.admin_player_overview as
select
  u.id,
  u.email,
  u.created_at,
  p.display_name,
  p.handle,
  p.joined_at,
  coalesce(s.max_slots, 3) as max_slots,
  coalesce(l.qty, 0) as slot_license_count,
  us.tier as subscription_tier,
  us.status as subscription_status,
  us.ends_at as subscription_ends_at,
  (us.status in ('active', 'grace') and coalesce(us.ends_at, now() + interval '100 years') > now()) as subscription_active
from auth.users u
left join public.profiles p on p.id = u.id
left join public.player_companion_slots s on s.user_id = u.id
left join public.v_inventory_slot_license l on l.user_id = u.id
left join public.user_subscriptions us on us.user_id = u.id;
