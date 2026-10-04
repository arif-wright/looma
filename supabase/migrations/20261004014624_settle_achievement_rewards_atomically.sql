-- Local forward migration: deployment requires separate approval.
-- One transaction owns the claim, points, shards and existing economy receipt.
-- Eligibility and authenticated-owner validation remain in the server evaluator's
-- callers. This RPC is deliberately unavailable to browser/session roles.
begin;

create or replace function public.fn_settle_achievement_reward(
  p_user uuid,
  p_achievement uuid,
  p_shard_factor integer,
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_achievement public.achievements%rowtype;
  v_unlock_id uuid;
  v_transaction_id uuid;
  v_shards bigint;
  v_key text;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_result jsonb;
begin
  if p_user is null or p_achievement is null then
    raise exception 'achievement_reward_identity_required';
  end if;
  if p_shard_factor is null or p_shard_factor <= 0 then
    raise exception 'achievement_reward_invalid_shard_factor';
  end if;
  if jsonb_typeof(v_meta) <> 'object' then
    raise exception 'achievement_reward_invalid_meta';
  end if;

  -- The caller passes a catalog ID and the existing private server conversion
  -- factor, never a client-selected reward amount. Hold the trusted row stable
  -- for this transaction; eligibility rules are not moved or broadened here.
  select * into v_achievement
  from public.achievements
  where id = p_achievement and is_active = true
  for share;
  if not found then
    raise exception 'achievement_reward_catalog_unavailable';
  end if;
  if v_achievement.points is null or v_achievement.points < 0 then
    raise exception 'achievement_reward_invalid_catalog_points';
  end if;
  v_shards := v_achievement.points::bigint * p_shard_factor::bigint;
  -- The existing JS/API summary represents amounts as exact safe integers.
  if v_shards > 9007199254740991 then
    raise exception 'achievement_reward_amount_out_of_range';
  end if;
  v_key := 'achievement:' || p_achievement::text;

  -- The existing unique (user_id, achievement_id) claim serializes contenders.
  -- A committed old unlock is a no-op: it is not evidence of past payment.
  insert into public.user_achievements(user_id, achievement_id, meta)
  values (p_user, p_achievement, v_meta)
  on conflict (user_id, achievement_id) do nothing
  returning id into v_unlock_id;
  if v_unlock_id is null then
    return jsonb_build_object('unlocked', false, 'reason', 'already_unlocked');
  end if;

  -- Reuse the existing ledger and its partial unique idempotency index.
  -- A receipt without its claim is inconsistent; fail closed, never re-pay or
  -- infer a legacy repair. The just-inserted claim is rolled back on this error.
  insert into public.economy_transactions(
    user_id, source, direction, amounts, meta, idempotency_key, applied, result
  ) values (
    p_user, 'achievement', 'grant',
    jsonb_build_object('points', v_achievement.points, 'shards', v_shards),
    jsonb_build_object('achievementId', p_achievement, 'key', v_achievement.key,
                      'unlockId', v_unlock_id, 'shardFactor', p_shard_factor),
    v_key, false, '{}'::jsonb
  )
  on conflict (user_id, source, idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_transaction_id;
  if v_transaction_id is null then
    raise exception 'achievement_reward_receipt_conflict';
  end if;

  if v_achievement.points > 0 then
    perform public.fn_add_points(p_user, v_achievement.points);
  end if;
  if v_shards > 0 then
    perform public.fn_wallet_grant(
      p_user, v_shards, 'achievement', p_achievement,
      jsonb_build_object('key', v_achievement.key, 'points', v_achievement.points,
                        'economyTransactionId', v_transaction_id)
    );
  end if;

  v_result := jsonb_build_object(
    'unlocked', true, 'achievementId', p_achievement,
    'key', v_achievement.key, 'name', v_achievement.name,
    'icon', v_achievement.icon, 'rarity', v_achievement.rarity,
    'points', v_achievement.points, 'shards', v_shards, 'meta', v_meta
  );
  update public.economy_transactions
  set applied = true, result = v_result
  where id = v_transaction_id;

  -- Do not catch errors or compensate in a second request: PostgreSQL rolls
  -- back every write above if any statement/function fails.
  return v_result;
end;
$$;

revoke all on function public.fn_settle_achievement_reward(uuid, uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.fn_settle_achievement_reward(uuid, uuid, integer, jsonb)
  to service_role;

commit;
