// Only Supabase infrastructure/unrelated prerequisites are synthetic.
// Every gameplay RPC, trigger, ledger table and policy comes from real migrations.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const FORWARD_MIGRATION = '20261004151936_enforce_companion_stats_lock_order.sql';
export async function bootstrap(session, root, manifest) {
  const source = (name) => readFile(resolve(root, 'supabase/migrations', name), 'utf8');
  const apply = async (name, sql, kind = 'full') => {
    await session.exec(sql, { failFast: true });
    manifest.push({ name, kind, sha256: createHash('sha256').update(sql).digest('hex') });
  };
  const full = async (name) => apply(name, await source(name));
  await session.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
    END $$;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
    CREATE TABLE public.game_titles(id uuid PRIMARY KEY);
    CREATE TABLE public.mv_leader_weekly(game_id uuid,user_id uuid,week_utc timestamp,best_score integer);
  `, { failFast: true });
  for (const name of [
    '20251101_phase10_4_achievements.sql', '20251102_phase10_6_economy.sql',
    '20251109_analytics_events.sql', '20251109_companion_core.sql', '20251112_companion_actions_mood.sql',
    '20251112_companion_roster.sql', '20251112_companion_roster_rpcs.sql', '20251114_companion_passive_and_checkin.sql',
    '20251115_companion_bond_level.sql', '20251201_companion_care.sql'
  ]) await full(name);
  const economy = await source('20260212_economy_transactions_and_mission_sessions.sql');
  const boundary = 'create or replace function public.fn_economy_apply(';
  assert(economy.includes(boundary), 'economy extraction boundary missing');
  await apply('20260212_economy_transactions_and_mission_sessions.sql: ledger DDL prefix', economy.slice(0, economy.indexOf(boundary)), 'explicit extract');
  for (const name of [
    '20260228_companion_chapter_rewards.sql', '20260228_companion_daily_arc_progress.sql',
    '20260228_companion_journal_entries.sql', '20260612201500_personal_sanctuary_mvp.sql',
    '20260612213000_unified_items_and_sanctuary_purpose.sql', '20260612223000_sanctuary_shared_rest.sql'
  ]) await full(name);
  const locks = await source('20260612_lock_down_privileged_rpcs.sql');
  const aclBoundary = 'revoke all on function public.calculate_bond_for_companion(uuid)';
  assert(locks.includes(aclBoundary), 'bond ACL extraction boundary missing');
  const acl = locks.slice(locks.indexOf(aclBoundary));
  assert.equal((acl.match(/revoke all on function/g) || []).length, 2);
  await apply('20260612_lock_down_privileged_rpcs.sql: bond ACL blocks', acl, 'explicit extract');
  for (const name of [
    '20260613190000_companion_first_bond_state.sql', '20260613201500_fix_companion_journal_upsert_conflict.sql',
    '20260614190000_alive_companion_phase1.sql', '20260615120000_active_companion_state_coherence.sql',
    '20261003210925_preserve_sanctuary_item_history.sql', '20261003211051_preserve_companion_relationship_on_absence.sql',
    '20261003212418_atomic_shared_rest.sql', '20261003215132_qualify_care_moss_seat.sql',
    '20261004014624_settle_achievement_rewards_atomically.sql', FORWARD_MIGRATION
  ]) await full(name);
  await session.exec(`
    GRANT SELECT, UPDATE ON public.companions TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.companion_stats TO authenticated;
    GRANT SELECT, INSERT ON public.companion_care_events, public.companion_journal_entries, public.sanctuary_interactions TO authenticated;
    GRANT UPDATE ON public.companion_journal_entries TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.sanctuary_placements TO authenticated;
    GRANT SELECT ON public.item_catalog, public.user_items, public.achievements, public.user_achievements,
      public.user_points, public.wallets, public.wallet_tx, public.economy_transactions TO authenticated;
  `, { failFast: true });
}
