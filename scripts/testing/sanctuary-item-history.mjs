// Isolated PostgreSQL/WASM regression harness. No network or hosted DB connection.
// Install @electric-sql/pglite@0.3.14 in a temporary directory, then pass its
// dist/index.js path as PGLITE_MODULE (or install it locally for normal resolution).
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    create schema auth;
    create role authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    create table public.companions(id uuid primary key, owner_id uuid references auth.users(id) on delete cascade);
    create table public.companion_care_events(action text);
    create table public.companion_chapter_rewards(
      owner_id uuid, companion_id uuid, reward_key text, reward_title text,
      reward_body text, reward_tone text, unlocked_at timestamptz);
  `);
  for (const path of [
    'supabase/migrations/20260612201500_personal_sanctuary_mvp.sql',
    'supabase/migrations/20260612213000_unified_items_and_sanctuary_purpose.sql',
    'supabase/migrations/20260612223000_sanctuary_shared_rest.sql',
    'supabase/tests/sanctuary-item-history-before.sql',
    'supabase/migrations/20261003210925_preserve_sanctuary_item_history.sql',
    'supabase/tests/sanctuary-item-history.sql'
  ]) await db.exec(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'));
  console.log('PASS: Sanctuary history, legacy attribution, identity, capacity, and authenticated ownership boundaries');
} finally { await db.close(); }
