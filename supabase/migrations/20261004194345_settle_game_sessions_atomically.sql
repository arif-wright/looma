-- LOCAL REVIEW CANDIDATE. Requires separately approved coordinated rollout.
-- Drain old completion writers before applying; deploy the matching server code.
-- No historical repair/backfill. Unreceipted completed/partially paid runs fail closed.
begin;

-- Abort rather than silently change historical duplicate data. These indexes also
-- defend the new invariant against accidental split-write callers.
create unique index game_rewards_session_settlement_unique on public.game_rewards(session_id);
create unique index game_grants_session_settlement_unique
  on public.game_grants(user_id, (meta->>'session_id')) where source = 'game_session';
create unique index wallet_tx_game_session_settlement_unique
  on public.wallet_tx(user_id, ref_id) where source = 'game_session' and kind = 'grant';
create index game_grants_user_hourly_settlement_idx
  on public.game_grants(user_id, inserted_at) where source = 'game_session';

-- The old authenticated mutation bypasses signature/cap validation and can rewrite
-- settled facts. Keep its identity for rollback review, but remove all API access.
revoke all on function public.fn_game_complete(uuid, integer, integer)
  from public, anon, authenticated, service_role;

create function public.fn_settle_game_session(
  p_user uuid, p_session uuid, p_score integer, p_duration_ms integer,
  p_nonce text, p_client_version text, p_success boolean, p_stats jsonb,
  p_max_rewards_per_hour integer, p_streak_multiplier_cap numeric,
  p_achievement_shard_factor integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.game_sessions%rowtype;
  v_game public.game_titles%rowtype;
  v_config public.game_config%rowtype;
  v_existing public.economy_transactions%rowtype;
  v_ritual public.companion_rituals%rowtype;
  v_companion public.companions%rowtype;
  v_active public.companions%rowtype;
  v_achievement public.achievements%rowtype;
  v_request jsonb;
  v_receipt jsonb;
  v_meta jsonb;
  v_transaction uuid;
  v_ritual_transaction uuid;
  v_ids uuid[];
  v_now timestamptz;
  v_date date;
  v_streak integer := 0;
  v_count integer;
  v_level integer := 0;
  v_base_xp integer;
  v_xp integer;
  v_base_currency integer;
  v_currency integer;
  v_xp_multiplier double precision := 1;
  v_currency_multiplier double precision;
  v_companion_json jsonb := 'null'::jsonb;
  v_rituals jsonb := 'null'::jsonb;
  v_ritual_completed boolean := false;
  v_achievements jsonb := '[]'::jsonb;
  v_unlock jsonb;
  v_eligible boolean;
  v_rule_meta jsonb;
  v_threshold numeric;
  v_rank integer;
  v_current text[];
  v_minimum text[];
  v_current_part numeric;
  v_minimum_part numeric;
  v_version_valid boolean := true;
  v_i integer;
  v_trust numeric;
  v_bond numeric;
  v_momentum numeric;
  v_mood text;
begin
  if p_user is null or p_session is null or nullif(p_nonce, '') is null then
    raise exception 'game_settlement_identity_required';
  end if;
  if p_score is null or p_score < 0 or p_duration_ms is null or p_duration_ms <= 0
     or (p_stats is not null and jsonb_typeof(p_stats) <> 'object')
     or octet_length(coalesce(p_stats::text, '')) > 16384 then
    raise exception 'game_settlement_invalid_input';
  end if;
  v_request := jsonb_build_object('score',p_score,'durationMs',p_duration_ms,
    'nonce',p_nonce,'clientVersion',p_client_version,'success',p_success,'stats',p_stats);

  -- Same first lock as achievement settlement: serializes all game awards for an
  -- owner (including hourly quota) and independent achievement callers. Reentrant.
  perform pg_advisory_xact_lock(hashtextextended('reward-settlement:' || p_user::text, 0));
  select * into v_session from public.game_sessions
    where id = p_session and user_id = p_user for update;
  if not found then raise exception 'game_settlement_not_found'; end if;
  if v_session.nonce is distinct from p_nonce then raise exception 'game_settlement_nonce_mismatch'; end if;

  select * into v_existing from public.economy_transactions
    where user_id = p_user and source = 'game_session'
      and idempotency_key = 'game-session:' || p_session::text;
  if found then
    if not v_existing.applied or v_existing.result->>'settlementVersion' is distinct from '1'
       or v_existing.result->>'sessionId' is distinct from p_session::text
       or v_session.status <> 'completed' or v_session.completed_at is null then
      raise exception 'game_settlement_receipt_inconsistent';
    end if;
    if v_existing.meta->'request' is distinct from v_request then
      raise exception 'game_settlement_conflict';
    end if;
    return jsonb_build_object('receipt',v_existing.result,'replayed',true);
  end if;
  if v_session.status <> 'started' or v_session.completed_at is not null
     or exists(select 1 from public.game_rewards where session_id = p_session)
     or exists(select 1 from public.game_scores where session_id = p_session)
     or exists(select 1 from public.game_grants where user_id = p_user and source = 'game_session' and meta->>'session_id' = p_session::text)
     or exists(select 1 from public.wallet_tx where user_id = p_user and source = 'game_session' and ref_id = p_session) then
    raise exception 'game_settlement_legacy_unreconciled';
  end if;

  if p_max_rewards_per_hour is null or p_max_rewards_per_hour <= 0
     or p_streak_multiplier_cap is null or p_streak_multiplier_cap <= 0
     or p_streak_multiplier_cap = 'NaN'::numeric
     or p_achievement_shard_factor is null or p_achievement_shard_factor <= 0 then
    raise exception 'game_settlement_invalid_config';
  end if;
  -- Use time after lock acquisition, not the start of a queued transaction.
  v_now := clock_timestamp();
  v_date := (v_now at time zone 'UTC')::date;
  select * into v_game from public.game_titles where id = v_session.game_id for share;
  if not found or v_game.is_active is distinct from true then raise exception 'game_settlement_game_unavailable'; end if;
  select * into v_config from public.game_config where game_id = v_game.id for share;
  if p_duration_ms < coalesce(v_config.min_duration_ms,10000)
     or p_duration_ms > coalesce(v_config.max_duration_ms,600000)
     -- 2s clock/network/frame tolerance, never an artificial minimum-duration delay.
     or p_duration_ms > extract(epoch from (v_now-v_session.started_at))*1000 + 2000 then
    raise exception 'game_settlement_invalid_duration';
  end if;
  if p_score > coalesce(v_game.max_score,100000) then raise exception 'game_settlement_invalid_score'; end if;
  if p_score::numeric * 60000 > coalesce(v_config.max_score_per_min,8000)::numeric * p_duration_ms then
    raise exception 'game_settlement_invalid_score_rate';
  end if;
  v_current := string_to_array(coalesce(p_client_version,''),'.');
  v_minimum := string_to_array(coalesce(v_config.min_client_ver,'1.0.0'),'.');
  if coalesce(v_config.min_client_ver,'1.0.0') <> '' then
    if p_client_version is null or p_client_version = '' then v_version_valid := false;
    else
      for v_i in 1..greatest(coalesce(array_length(v_current,1),0),coalesce(array_length(v_minimum,1),0)) loop
        v_current_part := case when v_current[v_i] ~ '^[0-9]+$' then v_current[v_i]::numeric else 0 end;
        v_minimum_part := case when v_minimum[v_i] ~ '^[0-9]+$' then v_minimum[v_i]::numeric else 0 end;
        if v_current_part > v_minimum_part then exit; end if;
        if v_current_part < v_minimum_part then v_version_valid := false; exit; end if;
      end loop;
    end if;
  end if;
  if not v_version_valid then raise exception 'game_settlement_client_outdated'; end if;
  select count(*) into v_count from public.game_grants
    where user_id=p_user and source='game_session' and inserted_at >= v_now-interval '1 hour';
  if v_count >= p_max_rewards_per_hour then raise exception 'game_settlement_cap_rewards_hourly'; end if;

  perform 1 from public.profiles where id=p_user for no key update;
  if not found then raise exception 'game_settlement_profile_missing'; end if;
  -- Freeze the roster and acquire parents in UUID order before any child stats.
  select coalesce(array_agg(locked.id order by locked.id),array[]::uuid[]) into v_ids from (
    select c.id from public.companions c where c.owner_id=p_user order by c.id for no key update of c
  ) locked;
  select * into v_companion from public.companions where owner_id=p_user and id=any(v_ids)
    order by is_active desc,state desc,slot_index asc nulls last,created_at asc,id asc limit 1;
  if found then
    select coalesce(bond_level,0) into v_level from public.companion_stats
      where companion_id=v_companion.id for update;
    v_level := greatest(coalesce(v_level,0),0);
    v_xp_multiplier := case when v_level>=8 then 1.10 when v_level>=6 then 1.08
      when v_level>=4 then 1.05 when v_level>=2 then 1.02 else 1 end;
    v_companion_json := jsonb_build_object('companionId',v_companion.id,'name',v_companion.name,
      'bondLevel',v_level,'xpMultiplier',v_xp_multiplier);
  end if;

  -- The candidate completion belongs to today's streak, as in the existing route.
  update public.game_sessions set status='completed',completed_at=v_now,
    score=p_score,duration_ms=p_duration_ms where id=p_session;
  insert into public.game_scores(user_id,game_id,session_id,score,duration_ms,inserted_at)
    values(p_user,v_game.id,p_session,p_score,p_duration_ms,v_now);
  while v_streak <= 45 loop
    exit when not exists(select 1 from public.game_sessions where user_id=p_user and status='completed'
      and completed_at >= ((v_date-v_streak)::timestamp at time zone 'UTC')
      and completed_at < ((v_date-v_streak+1)::timestamp at time zone 'UTC'));
    v_streak := v_streak+1;
  end loop;
  select count(*) into v_count from public.game_sessions where user_id=p_user and game_id=v_game.id and status='completed';
  v_base_xp := greatest(1,least(p_score/100,100));
  v_base_currency := greatest(1,least(p_score/50,200));
  -- Match the existing JavaScript Math.round/floor binary-floating formulas.
  v_xp := floor(v_base_xp*v_xp_multiplier + 0.5)::integer;
  v_currency_multiplier := least(1::double precision+0.1::double precision*v_streak,p_streak_multiplier_cap::double precision);
  v_currency := floor(v_base_currency*v_currency_multiplier)::integer;
  v_meta := jsonb_build_object('source','game_sdk','base_xp',v_base_xp,'xp_multiplier',v_xp_multiplier,
    'base_currency',v_base_currency,'multiplier',v_currency_multiplier,'session_id',p_session);
  insert into public.economy_transactions(user_id,source,direction,amounts,meta,idempotency_key,applied,result)
    values(p_user,'game_session','grant',jsonb_build_object('xp',v_xp,'shards',v_currency),
      jsonb_build_object('request',v_request,'gameId',v_game.id,'gameSlug',v_game.slug,'streakDays',v_streak,
        'companionBonus',v_companion_json),'game-session:'||p_session::text,false,'{}') returning id into v_transaction;

  -- Evaluate the same supported game rules from the protected catalog. Weekly
  -- rank reads the equivalent live aggregate, including this transaction's score;
  -- it does not depend on a separately refreshed materialized view.
  for v_achievement in select * from public.achievements where is_active=true
      and (game_id is null or game_id=v_game.id) order by id for share loop
    if jsonb_typeof(v_achievement.rule) <> 'object' then continue; end if;
    if jsonb_typeof(v_achievement.rule->'slug')='string' and v_achievement.rule->>'slug' <> ''
       and v_achievement.rule->>'slug' <> v_game.slug then continue; end if;
    v_eligible := false; v_rule_meta := '{}'; v_threshold := null;
    if coalesce(v_achievement.rule->>'gte','') ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then
      v_threshold := (v_achievement.rule->>'gte')::numeric;
    end if;
    case v_achievement.rule->>'kind'
      when 'first_clear' then
        v_eligible := v_count=1; v_rule_meta := jsonb_build_object('sessionId',p_session);
      when 'score_threshold' then
        v_eligible := p_score>=v_threshold; v_rule_meta := jsonb_build_object('score',p_score,'threshold',v_threshold);
      when 'sessions_completed' then
        v_eligible := v_count>=v_threshold; v_rule_meta := jsonb_build_object('sessions',v_count,'requirement',v_threshold);
      when 'streak_days' then
        v_eligible := v_streak>=v_threshold; v_rule_meta := jsonb_build_object('streakDays',v_streak,'requirement',v_threshold);
      when 'weekly_top_rank' then
        if coalesce(v_achievement.rule->>'rank_lte','') ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then
          v_threshold := greatest(1,floor((v_achievement.rule->>'rank_lte')::numeric));
          select position into v_rank from (
            select user_id,dense_rank() over(order by max(score) desc)::integer position
            from public.game_scores where game_id=v_game.id
              and date_trunc('week',inserted_at at time zone 'UTC')=date_trunc('week',v_now at time zone 'UTC')
            group by user_id
          ) ranked where user_id=p_user;
          v_eligible := v_rank<=v_threshold; v_rule_meta := jsonb_build_object('rank',v_rank,'cutoff',v_threshold);
        end if;
      else null;
    end case;
    if coalesce(v_eligible,false) then
      v_unlock := public.fn_settle_achievement_reward(p_user,v_achievement.id,p_achievement_shard_factor,v_rule_meta);
      if (v_unlock->>'unlocked')::boolean then
        v_achievements := v_achievements || jsonb_build_array(v_unlock);
      end if;
    end if;
  end loop;

  -- Preserve the daily play ritual's existing amounts and no-backfill semantics.
  -- Its public progress row is owner-writable, so only the protected economy
  -- receipt can guard a new daily payment after the owner resets/deletes that row.
  if v_companion.id is not null then
    insert into public.companion_rituals(owner_id,ritual_key,ritual_date,progress_goal,xp_reward,shard_reward,affection_reward,trust_reward)
      values(p_user,'care_once',v_date,1,15,2,1,1),
            (p_user,'play_game_with_companion',v_date,1,20,3,1,1),
            (p_user,'post_with_companion',v_date,1,10,2,1,1)
      on conflict(owner_id,ritual_key,ritual_date) do nothing;
    select * into v_ritual from public.companion_rituals where owner_id=p_user
      and ritual_key='play_game_with_companion' and ritual_date=v_date for update;
    if not v_ritual.completed and not v_ritual.reward_claimed then
      insert into public.economy_transactions(user_id,source,direction,amounts,meta,idempotency_key,applied,result)
        values(p_user,'companion_ritual','grant','{"xp":20,"shards":3}',
          jsonb_build_object('sessionId',p_session,'ritual','play_game_with_companion','ritualDate',v_date),
          'play_game_with_companion:'||v_date::text,false,'{}')
        on conflict(user_id,source,idempotency_key) where idempotency_key is not null do nothing
        returning id into v_ritual_transaction;
      if v_ritual_transaction is not null then
        v_ritual_completed := true;
        update public.companion_rituals set progress=1,progress_goal=1,xp_reward=20,shard_reward=3,
          affection_reward=1,trust_reward=1,completed=true,completed_at=v_now,reward_claimed=true
          where owner_id=p_user and ritual_key='play_game_with_companion' and ritual_date=v_date;
        perform public.fn_award_game_xp(p_user,20);
        perform public.fn_wallet_grant(p_user,3,'companion_ritual',p_session,
          jsonb_build_object('ritual','play_game_with_companion','ritualDate',v_date,'economyTransactionId',v_ritual_transaction));
        select * into v_active from public.companions where owner_id=p_user and id=any(v_ids) and is_active=true
          order by updated_at desc,id asc limit 1;
        if found then
          update public.companions set affection=least(100,greatest(0,affection+1)),trust=least(100,greatest(0,trust+1))
            where id=v_active.id returning * into v_active;
          -- Match syncEmotionalStateFromCompanionStats; preserve existing momentum,
          -- volatility and milestones. No care event, item, or memory is invented.
          insert into public.companion_emotional_state(user_id,companion_id) values(p_user,v_active.id::text)
            on conflict(user_id,companion_id) do nothing;
          select least(1,greatest(0,streak_momentum)) into v_momentum from public.companion_emotional_state
            where user_id=p_user and companion_id=v_active.id::text for update;
          v_trust := round(v_active.trust::numeric/100,3);
          v_bond := round((v_active.affection+v_active.trust)::numeric/200,3);
          v_mood := case when v_momentum>=0.62 and v_bond>=0.45 then 'luminous'
            when v_momentum<=0.14 and v_bond<=0.22 and v_trust<=0.3 then 'dim' else 'steady' end;
          update public.companion_emotional_state set trust=v_trust,bond=v_bond,mood=v_mood,
            recent_tone=case v_mood when 'luminous' then 'uplifted' when 'dim' then 'reserved' else 'calm' end
            where user_id=p_user and companion_id=v_active.id::text;
        end if;
        update public.economy_transactions set applied=true,result=jsonb_build_object('xp',20,'shards',3)
          where id=v_ritual_transaction;
      end if;
    end if;
    select jsonb_build_object('list',coalesce(jsonb_agg(item order by item->>'key'),'[]'::jsonb),
      'completed',coalesce(jsonb_agg(item) filter(where item->>'key'='play_game_with_companion' and v_ritual_completed),'[]'::jsonb))
      into v_rituals from (
        select jsonb_build_object('key',r.ritual_key,'title',d.title,'description',d.description,
          'progressMax',1,'xpReward',d.xp,'shardReward',d.shards,'affectionReward',1,'trustReward',1,
          'progress',least(1,greatest(0,r.progress)),'status',case when r.completed then 'completed' when r.progress>0 then 'in_progress' else 'pending' end,
          'completedAt',r.completed_at) item
        from public.companion_rituals r join (values
          ('care_once','Check in together','Perform any care action with your active companion.',15,2),
          ('play_game_with_companion','Play a round','Complete one game session while bonded.',20,3),
          ('post_with_companion','Share the vibe','Post or share a moment while your companion is active.',10,2)
        ) d(key,title,description,xp,shards) on d.key=r.ritual_key
        where r.owner_id=p_user and r.ritual_date=v_date
      ) mapped;
  end if;

  insert into public.game_rewards(session_id,xp_delta,currency_delta,meta,inserted_at)
    values(p_session,v_xp,v_currency,v_meta,v_now);
  insert into public.game_grants(user_id,source,amount,currency,meta,inserted_at)
    values(p_user,'game_session',v_currency,'shards',v_meta,v_now);
  perform public.fn_award_game_xp(p_user,v_xp);
  if v_currency>0 then
    perform public.fn_wallet_grant(p_user,v_currency,'game_session',p_session,
      jsonb_build_object('slug',v_game.slug,'score',p_score,'durationMs',p_duration_ms,
        'multiplier',v_currency_multiplier,'base_currency',v_base_currency,'economyTransactionId',v_transaction));
  end if;
  if exists(select 1 from public.wallets where user_id=p_user and currency <> 'shards') then
    raise exception 'game_settlement_wallet_currency_mismatch';
  end if;
  v_receipt := jsonb_build_object('settlementVersion',1,'sessionId',p_session,
    'xpDelta',v_xp,'baseXpDelta',v_base_xp,'xpMultiplier',v_xp_multiplier,
    'baseXp',v_base_xp,'finalXp',v_xp,'xpFromCompanion',v_xp-v_base_xp,'xpFromStreak',0,
    'companionBonus',v_companion_json,'currencyDelta',v_currency,'baseCurrencyDelta',v_base_currency,
    'currencyMultiplier',v_currency_multiplier,'rewardsGranted',jsonb_build_object('xpGained',v_xp,
      'shardsGained',v_currency,'xpMultiplier',v_xp_multiplier,'currencyMultiplier',v_currency_multiplier),
    'rituals',v_rituals,'achievements',v_achievements);
  update public.economy_transactions set applied=true,result=v_receipt where id=v_transaction;
  return jsonb_build_object('receipt',v_receipt,'replayed',false);
end;
$$;

revoke all on function public.fn_settle_game_session(uuid,uuid,integer,integer,text,text,boolean,jsonb,integer,numeric,integer)
  from public, anon, authenticated;
grant execute on function public.fn_settle_game_session(uuid,uuid,integer,integer,text,text,boolean,jsonb,integer,numeric,integer)
  to service_role;

-- Same function signature, formula, authorization and grants; shared first lock.
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
  -- Shared with game settlement; acquire before catalog/claim/points/wallet locks.
  perform pg_advisory_xact_lock(hashtextextended('reward-settlement:' || p_user::text, 0));
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


commit;
