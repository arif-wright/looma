// Synthetic identities only. Targeted real migration definitions; no hosted access.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export const FORWARD_MIGRATION = '20261004194345_settle_game_sessions_atomically.sql';
export async function bootstrap(db, root, manifest = []) {
  const source = name => readFile(resolve(root,'supabase/migrations',name),'utf8');
  const apply = async (name,sql,kind='full') => { await db.exec(sql,{failFast:true}); manifest.push({name,kind,sha256:createHash('sha256').update(sql).digest('hex')}); };
  const full = async name => apply(name,await source(name));
  const prefix = async (name,boundary) => { const s=await source(name); assert(s.includes(boundary)); await apply(name+': DDL prefix',s.slice(0,s.indexOf(boundary)),'explicit extract'); };
  await db.exec(`DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
    END $$;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users, xp integer NOT NULL DEFAULT 0);
  `,{failFast:true});
  for(const name of ['20251101_phase10_games.sql','20251101_phase10_2a_caps.sql','20251101_phase10_3_leaderboards.sql',
    '20251101_phase10_4_achievements.sql','20251102_adjust_game_rewards.sql','20251102_phase10_6_economy.sql',
    '20251109_companion_core.sql','20251112_companion_actions_mood.sql','20251112_companion_roster.sql',
    '20251112_companion_roster_rpcs.sql','20251114_companion_passive_and_checkin.sql','20251115_companion_bond_level.sql',
    '20251117_companion_rituals.sql']) await full(name);
  await prefix('20260212_companion_emotional_state.sql','create or replace function public.fn_mission_complete_finalize_emotional(');
  await prefix('20260212_economy_transactions_and_mission_sessions.sql','create or replace function public.fn_economy_apply(');
  await full('20261004014624_settle_achievement_rewards_atomically.sql');
  // Exercise the actual replacement of the bond parent-before-child function,
  // not unrelated roster prerequisites from the later six-function migration.
  const lock = await source('20261004151936_enforce_companion_stats_lock_order.sql');
  const start=lock.indexOf('create or replace function public.calculate_bond_for_companion');
  const end=lock.indexOf('-- Recalculate bonds for all companions');
  assert(start>=0&&end>start);
  await apply('20261004151936_enforce_companion_stats_lock_order.sql: calculate_bond_for_companion',lock.slice(start,end),'explicit extract');
  await full(FORWARD_MIGRATION);
  await db.exec(`GRANT SELECT ON public.game_titles,public.game_config,public.game_sessions,public.game_rewards,
    public.game_grants,public.wallets,public.wallet_tx,public.economy_transactions TO authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.companion_rituals TO authenticated;`,{failFast:true});
}
