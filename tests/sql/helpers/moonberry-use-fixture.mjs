// Native-only synthetic identity/consent infrastructure; gameplay comes from source migrations.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { bootstrap as companionBootstrap } from './companion-migration-fixture.mjs';
export const candidatePath = 'scripts/sql/moonberry-use-candidate.sql';
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export async function bootstrap(session, root, report) {
  report.appliedSources = [];
  report.syntheticInfrastructure = [
    'auth.users UUID identities, auth.uid()/auth.role(), anon/authenticated/service_role roles',
    'Existing companion fixture unrelated game_titles and mv_leader_weekly prerequisites and test grants',
    'Observed consent column types/defaults/nullability reproduced with synthetic rows; complete source migrations are absent',
    'Post-hardening preferences: ordinary column-scoped writes only; no client moderation/role writes or TRUNCATE/TRIGGER grants',
    'Other table ACLs remain the existing targeted fixture subset, not a complete hosted ACL mirror',
    'Owner UUIDs, companions, inventory acquisition data, preferences and discovery fixtures',
    'Failure-injection triggers created only for rollback tests and removed afterwards'
  ];
  await companionBootstrap(session, root, report.appliedSources);
  const apply = async (path, extract) => {
    const source = await readFile(resolve(root, path), 'utf8');
    const sql = extract ? extract(source) : source;
    await session.exec(sql, { failFast: true });
    report.appliedSources.push({ name: path, kind: extract ? 'explicit extract' : 'full', sha256: sha256(sql), sourceSha256: sha256(source) });
  };
  await session.exec(`CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('request.jwt.claim.role',true),'') $$;`, { failFast: true });
  await apply('supabase/migrations/20241030120000_phase_9_2c_home_preferences.sql', s => {
    const end = s.indexOf('-- Lightweight analytics event log.'); assert(end > 0); return s.slice(0, end);
  });
  await apply('supabase/migrations/20251110_bond_genesis.sql', s => {
    const start = s.indexOf('create table if not exists public.player_traits (');
    const end = s.indexOf('create table if not exists public.persona_profiles (');
    assert(start >= 0 && end > start); return s.slice(start, end);
  });
  await apply('supabase/migrations/20260509_emotional_profile_onboarding.sql');
  await apply('supabase/migrations/20260802210000_world_persistence.sql');
  await apply('supabase/migrations/20260803120000_world_moonberry_gather.sql');
  // Model the already-hardened baseline without restoring unsafe grants or
  // applying the historical hardening proposal. Consent columns are deliberately
  // added by the preflight test so missing/partial schema failures stay covered.
  await session.exec(`ALTER TABLE public.user_preferences
    ADD COLUMN role text NOT NULL DEFAULT 'user',
    ADD COLUMN moderation_status text NOT NULL DEFAULT 'active',
    ADD COLUMN moderation_until timestamptz;`, { failFast: true });
  report.candidateSource = { path: candidatePath, sha256: sha256(await readFile(resolve(root, candidatePath))) };
  // Reconcile full-file provenance even where the existing bootstrap applies explicit extracts.
  report.sourceFiles = [];
  const paths = new Set([candidatePath, 'docs/moonberry-use-review.md', 'tests/sql/helpers/native-postgres.mjs', 'tests/sql/helpers/companion-migration-fixture.mjs', 'tests/sql/helpers/moonberry-use-fixture.mjs', 'tests/sql/moonberry-use-transactions.mjs', 'tests/sql/moonberry-use-native.mjs']);
  for (const entry of report.appliedSources) paths.add(entry.name.startsWith('supabase/') ? entry.name : `supabase/migrations/${entry.name.split(':')[0]}`);
  for (const path of paths) report.sourceFiles.push({ path, sha256: sha256(await readFile(resolve(root, path))) });
}

export async function configureHardenedPreferences(session, report) {
  // These are synthetic minimum prerequisites matching preserved ordinary writes.
  // Never table-wide INSERT/UPDATE, protected-column writes, or TRUNCATE/TRIGGER.
  await session.exec(`
    GRANT SELECT ON public.user_preferences TO authenticated;
    GRANT INSERT (user_id,start_on,consent_memory,consent_reactions),
      UPDATE (user_id,start_on,consent_memory,consent_reactions)
      ON public.user_preferences TO authenticated;
  `, { failFast: true });
  report.hardenedPreferenceBaseline = {
    tableWideClientInsertUpdate: false,
    clientProtectedWrites: false,
    clientTruncateTrigger: false,
    consentMemory: { type: 'boolean', nullable: true, default: 'true' },
    consentReactions: { type: 'boolean', nullable: false, default: 'true' },
    interpretation: 'Stored true preferences may be defaults and do not prove explicit human opt-in.',
    liveEquivalent: false,
    limitation: 'Targeted synthetic least-privilege fixture; hosted authentication and full ACL equivalence are not established.'
  };
}
