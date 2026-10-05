-- READ ONLY. Re-run immediately before an independently authorized migration.
-- Returns catalog data and aggregate counts only; never per-owner/session rows.
select jsonb_build_object(
  'duplicate_reward_sessions',(select count(*) from (select session_id from public.game_rewards group by session_id having count(*)>1) x),
  'duplicate_session_grants',(select count(*) from (select user_id,meta->>'session_id' from public.game_grants where source='game_session' group by user_id,meta->>'session_id' having count(*)>1) x),
  'duplicate_wallet_session_refs',(select count(*) from (select user_id,ref_id from public.wallet_tx where source='game_session' and kind='grant' group by user_id,ref_id having count(*)>1) x),
  'game_receipts',(select count(*) from public.economy_transactions where source='game_session'),
  'legacy_completed_without_receipt',(select count(*) from public.game_sessions s where status='completed' and not exists(
    select 1 from public.economy_transactions e where e.user_id=s.user_id and e.source='game_session' and e.idempotency_key='game-session:'||s.id::text))
) as aggregate_counts;
select p.proname, pg_get_function_identity_arguments(p.oid) arguments,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in ('fn_game_complete','fn_settle_game_session','fn_settle_achievement_reward','fn_add_points','fn_award_game_xp','fn_wallet_grant');
select tablename,indexname,indexdef from pg_indexes where schemaname='public'
  and tablename in ('game_config','game_rewards','game_grants','game_scores','wallet_tx','economy_transactions','companion_rituals');
select table_name,column_name,data_type from information_schema.columns where table_schema='public'
  and table_name in ('companion_emotional_state','companion_rituals','wallets','wallet_tx') order by table_name,ordinal_position;
