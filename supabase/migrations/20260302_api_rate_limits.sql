create table if not exists public.api_rate_limits (
  bucket text not null,
  rate_key text not null,
  window_started_at timestamptz not null default now(),
  hit_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket, rate_key)
);

create index if not exists api_rate_limits_updated_at_idx
  on public.api_rate_limits (updated_at asc);

create or replace function public.touch_api_rate_limits()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_api_rate_limits_touch on public.api_rate_limits;
create trigger trg_api_rate_limits_touch
  before update on public.api_rate_limits
  for each row
  execute function public.touch_api_rate_limits();

alter table public.api_rate_limits enable row level security;

drop policy if exists api_rate_limits_no_direct_access on public.api_rate_limits;
create policy api_rate_limits_no_direct_access
  on public.api_rate_limits
  for all
  to authenticated
  using (false)
  with check (false);

create or replace function public.consume_api_rate_limit(
  p_bucket text,
  p_rate_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.api_rate_limits%rowtype;
  v_window_started_at timestamptz;
  v_hit_count integer;
  v_retry_after integer;
begin
  if coalesce(trim(p_bucket), '') = '' then
    raise exception 'missing_bucket';
  end if;

  if coalesce(trim(p_rate_key), '') = '' then
    raise exception 'missing_rate_key';
  end if;

  if p_limit is null or p_limit <= 0 then
    raise exception 'bad_limit';
  end if;

  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'bad_window_seconds';
  end if;

  insert into public.api_rate_limits (bucket, rate_key, window_started_at, hit_count)
  values (p_bucket, p_rate_key, v_now, 0)
  on conflict (bucket, rate_key) do nothing;

  select *
    into v_row
  from public.api_rate_limits
  where bucket = p_bucket
    and rate_key = p_rate_key
  for update;

  if v_row.window_started_at <= v_now - make_interval(secs => p_window_seconds) then
    v_window_started_at := v_now;
    v_hit_count := 1;

    update public.api_rate_limits
       set window_started_at = v_window_started_at,
           hit_count = v_hit_count
     where bucket = p_bucket
       and rate_key = p_rate_key;

    return query
    select true, 0, greatest(p_limit - v_hit_count, 0), v_window_started_at + make_interval(secs => p_window_seconds);
    return;
  end if;

  if v_row.hit_count >= p_limit then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from ((v_row.window_started_at + make_interval(secs => p_window_seconds)) - v_now)))::integer
    );

    return query
    select false, v_retry_after, 0, v_row.window_started_at + make_interval(secs => p_window_seconds);
    return;
  end if;

  v_hit_count := v_row.hit_count + 1;

  update public.api_rate_limits
     set hit_count = v_hit_count
   where bucket = p_bucket
     and rate_key = p_rate_key;

  return query
  select true, 0, greatest(p_limit - v_hit_count, 0), v_row.window_started_at + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on table public.api_rate_limits from public, authenticated;
revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to authenticated;
