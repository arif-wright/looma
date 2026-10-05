// Isolated PostgreSQL/WASM regression suite. No hosted database connection.
// PGLITE_MODULE may point to a temporary @electric-sql/pglite@0.3.14 installation.
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const runFile = async (path) => db.exec(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'));
try {
  await db.exec(`create schema auth; create role authenticated; create role anon;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';`);
  // Apply original definitions and RLS instead of inventing permissive policies.
  for (const name of ['20251109_companion_core.sql', '20251112_companion_actions_mood.sql',
    '20260228_companion_journal_entries.sql', '20260613201500_fix_companion_journal_upsert_conflict.sql']) {
    await runFile(`supabase/migrations/${name}`);
  }
  // Only unrelated feature-schema prerequisites are stubbed.
  await db.exec(`alter table public.companions add column state text not null default 'idle';
    alter table public.companion_stats add column last_passive_tick timestamptz,
      add column last_meaningful_interaction_at timestamptz;
    create table public.companion_chapter_rewards(owner_id uuid,companion_id uuid,reward_key text,
      reward_title text,reward_body text,reward_tone text,unlocked_at timestamptz);`);
  for (const name of ['20260612201500_personal_sanctuary_mvp.sql', '20260612213000_unified_items_and_sanctuary_purpose.sql',
    '20260612223000_sanctuary_shared_rest.sql', '20261003210925_preserve_sanctuary_item_history.sql',
    '20261003212418_atomic_shared_rest.sql']) await runFile(`supabase/migrations/${name}`);
  await runFile('supabase/tests/atomic-shared-rest.sql');
  console.log('PASS: atomic rollback, replay, cooldown, ownership, no-absence penalties, zero-energy recovery');
} catch (error) {
  console.error(error.message, error.detail ?? '', error.where ?? '');
  process.exitCode = 1;
} finally { await db.close(); }
