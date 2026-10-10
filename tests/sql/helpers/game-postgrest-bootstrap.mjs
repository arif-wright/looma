// TEST ONLY. No hosted credentials, network database, or product changes.
// MEMVOYA_PG_TEST_ONLY=1 PGHOST=/private/socket PGPORT=55437 PGUSER=postgres \
//   node tests/sql/helpers/game-postgrest-bootstrap.mjs --fixture <json> --report <json>
// Creates, but never drops/reuses, memvoya_postgrest_test in a disposable cluster.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrap, FORWARD_MIGRATION } from './game-settlement-fixture.mjs';
import { Session, literal as q, identifier } from './native-postgres.mjs';

export const DATABASE = 'memvoya_postgrest_test';
export const AUTHENTICATOR = 'mv_api_authenticator';
export const SOURCE_TREE = '9636660534f1d6031b6e6e58edb3d5d0f1d850a9';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

export const LIMITATIONS = [
  'Targeted migration fixture, not a full production schema or hosted Supabase deployment.',
  'Supabase auth users, auth.uid(), platform roles/default grants, profile prerequisites, creatures and events are synthetic fixture infrastructure.',
  'Protected game/wallet/receipt RLS policies and settlement functions are exact source SQL. Authenticated table grants are SELECT-only test prerequisites; mutation failures establish table-ACL denial, not a separate write-policy stress test.',
  'player_stats uses the exact source view definition, with its default view-owner security. The synthetic underlying profiles/creatures/events have no invented owner RLS. Canonical owner-filtered XP reads are in scope; profile/view cross-owner confidentiality is not established.',
  'fn_add_points keeps the repository ACL unchanged, including default PUBLIC EXECUTE. Its separately managed live ACL is not reproduced and it is excluded from privileged-RPC pass criteria. This fixture is not a complete security audit.',
  'No JWT secret or token is created, accepted as an argument, or written to fixture/report JSON. JWT validation and real HTTP role switching must be tested by the external PostgREST runner.',
  'A PGlite smoke run checks SQL and fixture viability only; it does not establish native connection concurrency or real PostgREST behavior.'
];

// Exported for an in-memory SQL smoke test as well as the native CLI.
// db needs exec(sql, options) and rows(sql) methods, matching Session.
export async function bootstrapApiFixture(db, sourceRoot = root, report = {}) {
  report.manifest ??= [];
  report.limitations = [...LIMITATIONS];
  report.reviewedProductBaseTree = SOURCE_TREE;
  report.forwardMigration = FORWARD_MIGRATION;
  const apply = async (name, sql, kind, sourcePath) => {
    await db.exec(sql, { failFast: true });
    const entry = { name, kind, sha256: sha256(sql), sql };
    if (sourcePath) {
      entry.sourcePath = sourcePath;
      entry.sourceSha256 = sha256(await readFile(resolve(sourceRoot, sourcePath), 'utf8'));
    }
    report.manifest.push(entry);
  };

  await bootstrap(db, sourceRoot, report.manifest);
  for (const entry of report.manifest) {
    const filename = entry.name.split(':')[0];
    entry.sourcePath = `supabase/migrations/${filename}`;
    const fullSource = await readFile(resolve(sourceRoot, entry.sourcePath), 'utf8');
    entry.sourceSha256 = sha256(fullSource);
    if (entry.kind === 'explicit extract') {
      if (entry.name.endsWith(': DDL prefix')) {
        const boundary = filename.includes('emotional_state')
          ? 'create or replace function public.fn_mission_complete_finalize_emotional('
          : 'create or replace function public.fn_economy_apply(';
        entry.extraction = { start: 0, endExclusive: fullSource.indexOf(boundary), endBoundary: boundary };
        entry.sql = fullSource.slice(0, entry.extraction.endExclusive);
      } else {
        const startBoundary = 'create or replace function public.calculate_bond_for_companion';
        const endBoundary = '-- Recalculate bonds for all companions';
        entry.extraction = { start: fullSource.indexOf(startBoundary), endExclusive: fullSource.indexOf(endBoundary), startBoundary, endBoundary };
        entry.sql = fullSource.slice(entry.extraction.start, entry.extraction.endExclusive);
      }
      assert.equal(sha256(entry.sql), entry.sha256, 'Manifest extract must match applied SQL');
    }
  }
  report.fixtureHelper = {
    path: 'tests/sql/helpers/game-settlement-fixture.mjs',
    sha256: sha256(await readFile(resolve(sourceRoot, 'tests/sql/helpers/game-settlement-fixture.mjs'), 'utf8')),
    note: 'This helper also defines synthetic auth/profile infrastructure, service-role default grants, and authenticated read prerequisites.'
  };

  // PostgREST v12 exposes the signed claims as request.jwt.claims. Preserve the
  // legacy sub GUC fallback used by the native settlement fixture tests.
  await apply('PostgREST test auth infrastructure', `
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid
    $$;
    CREATE ROLE ${identifier(AUTHENTICATOR)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    GRANT anon, authenticated, service_role TO ${identifier(AUTHENTICATOR)};
  `, 'synthetic infrastructure');

  const aclPath = 'supabase/migrations/20260612_lock_down_privileged_rpcs.sql';
  const aclSource = await readFile(resolve(sourceRoot, aclPath), 'utf8');
  const aclStart = aclSource.indexOf('revoke all on function public.fn_award_game_xp(');
  const aclEnd = aclSource.indexOf('revoke all on function public.fn_profile_spend_energy(');
  assert(aclStart >= 0 && aclEnd > aclStart, 'Exact privileged RPC ACL extract boundaries required');
  const acl = aclSource.slice(aclStart, aclEnd);
  assert.equal((acl.match(/revoke all on function/g) || []).length, 3);
  await apply('20260612_lock_down_privileged_rpcs.sql: XP and wallet ACL blocks', acl, 'explicit extract', aclPath);
  report.manifest.at(-1).extraction = { start: aclStart, endExclusive: aclEnd };

  await apply('player_stats synthetic referenced columns and relations', `
    ALTER TABLE public.profiles ADD COLUMN level integer NOT NULL DEFAULT 1,
      ADD COLUMN xp_next integer NOT NULL DEFAULT 100,
      ADD COLUMN energy integer NOT NULL DEFAULT 7,
      ADD COLUMN energy_max integer NOT NULL DEFAULT 10;
    CREATE TABLE public.creatures (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id uuid NOT NULL REFERENCES auth.users(id),
      species_id uuid NOT NULL,
      bonded boolean NOT NULL DEFAULT false
    );
    CREATE TABLE public.events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id),
      type text NOT NULL
    );
  `, 'synthetic prerequisites');
  const viewPath = 'supabase/sql/phase_9f_player_stats.sql';
  await apply(viewPath, await readFile(resolve(sourceRoot, viewPath), 'utf8'), 'full', viewPath);
  await apply('PostgREST test relation privilege prerequisites', `
    GRANT SELECT ON public.player_stats, public.achievements, public.user_achievements, public.user_points TO authenticated;
    GRANT SELECT ON public.game_sessions, public.game_rewards,
      public.game_grants, public.wallets, public.wallet_tx, public.economy_transactions TO authenticated;
  `, 'synthetic table ACL assumptions');

  const fixture = {
    version: 1, synthetic: true, database: DATABASE, authenticator: AUTHENTICATOR,
    reviewedProductBaseTree: SOURCE_TREE,
    game: { id: randomUUID(), slug: `postgrest-synthetic-${randomUUID()}` },
    achievement: randomUUID(),
    achievementDetails: { points: 25, threshold: 5000 },
    owners: [
      { label: 'A', id: randomUUID(), starting: { xp: 17, wallet: 9, points: 11 } },
      { label: 'B', id: randomUUID(), starting: { xp: 103, wallet: 211, points: 41 } }
    ],
    settlement: { score: 1000, durationMs: 60000, clientVersion: '1.0.0', success: true,
      stats: { synthetic: true }, maxRewardsPerHour: 20, streakMultiplierCap: 1.5,
      achievementShardFactor: 2, expectedXpDelta: 10, expectedCurrencyDelta: 22,
      expectedAchievementCount: 0 }
  };
  fixture.ownerA = fixture.owners[0].id;
  fixture.ownerB = fixture.owners[1].id;
  // Only exact test catalog entries can participate in settlement eligibility.
  await db.exec(`UPDATE public.achievements SET is_active=false;
    INSERT INTO public.game_titles(id,slug,name,min_version,max_score)
      VALUES (${q(fixture.game.id)},${q(fixture.game.slug)},'Synthetic PostgREST isolation game','1.0.0',100000);
    INSERT INTO public.game_config(game_id,min_duration_ms,max_duration_ms,max_score_per_min,min_client_ver)
      VALUES (${q(fixture.game.id)},10000,600000,8000,'1.0.0');
    INSERT INTO public.achievements(id,key,game_id,name,description,points,rule)
      VALUES (${q(fixture.achievement)},${q(`postgrest-${fixture.achievement}`)},${q(fixture.game.id)},
        'Synthetic PostgREST achievement','Fixture only',25,
        ${q(JSON.stringify({ kind: 'score_threshold', slug: fixture.game.slug, gte: fixture.achievementDetails.threshold }))}::jsonb);
  `, { failFast: true });
  for (const owner of fixture.owners) {
    owner.initialXp = owner.starting.xp;
    owner.initialWallet = owner.starting.wallet;
    owner.nonce = randomUUID();
    owner.sessions = Array.from({ length: 2 }, () => randomUUID());
    await db.exec(`INSERT INTO auth.users(id) VALUES (${q(owner.id)});
      INSERT INTO public.profiles(id,xp) VALUES (${q(owner.id)},${owner.starting.xp});
      INSERT INTO public.wallets(user_id,balance) VALUES (${q(owner.id)},${owner.starting.wallet});
      INSERT INTO public.user_points(user_id,points) VALUES (${q(owner.id)},${owner.starting.points});
      INSERT INTO public.creatures(owner_id,species_id,bonded) VALUES (${q(owner.id)},${q(randomUUID())},true);
      INSERT INTO public.events(user_id,type) VALUES (${q(owner.id)},'mission_complete');
      INSERT INTO public.game_sessions(id,user_id,game_id,nonce,started_at) VALUES
        ${owner.sessions.map(session => `(${q(session)},${q(owner.id)},${q(fixture.game.id)},${q(owner.nonce)},now()-interval '2 minutes')`).join(',')};
    `, { failFast: true });
  }

  report.functionPrivileges = await db.rows(`SELECT p.oid::regprocedure::text AS function,
    p.prosecdef AS security_definer,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
    has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('fn_game_complete','fn_settle_game_session','fn_settle_achievement_reward',
       'fn_award_game_xp','fn_wallet_grant','fn_wallet_spend','fn_add_points') ORDER BY p.proname`);
  for (const row of report.functionPrivileges) {
    if (row.function.startsWith('fn_add_points(')) continue;
    assert.equal(row.anon_execute, false, row.function);
    assert.equal(row.authenticated_execute, false, row.function);
    assert.equal(row.service_execute, !row.function.startsWith('fn_game_complete('), row.function);
  }
  assert.equal(report.functionPrivileges.length, 7);
  report.authenticatorRole = (await db.rows(`SELECT rolname,rolinherit,rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=${q(AUTHENTICATOR)}`))[0];
  assert.equal(report.authenticatorRole.rolinherit, false);
  assert.equal(report.authenticatorRole.rolcanlogin, true);
  assert.equal(report.authenticatorRole.rolsuper, false);
  assert.equal(report.authenticatorRole.rolbypassrls, false);
  report.policies = await db.rows(`SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('game_sessions','game_rewards','game_grants','wallets','wallet_tx','economy_transactions')
    ORDER BY tablename,policyname`);
  report.playerStats = await db.rows('SELECT * FROM public.player_stats ORDER BY xp');
  assert.deepEqual(report.playerStats.map(row => Number(row.xp)), fixture.owners.map(owner => owner.starting.xp));
  report.seededSessions = await db.rows('SELECT id,user_id,status,completed_at FROM public.game_sessions ORDER BY id');
  assert.equal(report.seededSessions.length, 4);
  assert(report.seededSessions.every(row => row.status === 'started' && row.completed_at === null));
  return fixture;
}

async function main() {
  const args = process.argv.slice(2);
  assert.equal(args.length, 4, 'Usage: --fixture <json> --report <json>');
  const option = name => {
    const index = args.indexOf(name);
    assert(index >= 0 && args[index + 1] && !args[index + 1].startsWith('--'), `${name} is required`);
    return resolve(args[index + 1]);
  };
  const fixturePath = option('--fixture'), reportPath = option('--report');
  assert.notEqual(fixturePath, reportPath);
  assert.equal(process.env.MEMVOYA_PG_TEST_ONLY, '1', 'Disposable local-cluster opt-in required');
  assert(process.env.PGHOST?.startsWith('/') && !process.env.PGHOST.includes(','), 'Only one local Unix socket directory is allowed');
  assert.equal(process.env.PGPORT, '55437', 'Only private fixture port 55437 is allowed');
  assert.equal(process.env.PGUSER, 'postgres', 'Explicit disposable-cluster postgres role required');
  assert(!process.env.PGHOSTADDR, 'PGHOSTADDR is refused');
  assert(!process.env.PGPASSWORD, 'Passwords are refused');
  assert(!process.env.PGDATABASE || process.env.PGDATABASE === 'postgres', 'Bootstrap must connect to postgres');
  const sourceTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
  // Preserve exact-tree checking for the separate explorable-town prototype.
  // It inherits PR17 e73cad94f07309c1a126e5f2aa76bca5ab126db2 without merging.
  // Only this source-pin metadata changed here; no server/SQL logic changed.
  // Keep Supabase pinned independently; this is not a hosted-schema claim.
  for (const [directory, expected] of Object.entries({src:'0c081ed35b76c5356b5b8853e7582516f7da05fd',supabase:'0a420e027ca5ff8038408d43072ece95c6333c8c'})) {
    assert.equal(execFileSync('git',['rev-parse',`HEAD:${directory}`],{cwd:root,encoding:'utf8'}).trim(),expected,`Reviewed ${directory} product tree required; update this bounded gate after independent review`);
  }
  const report = { status: 'RUNNING', database: DATABASE, manifest: [], sourceTree, startedAt: new Date().toISOString() };
  const sessions = [];
  try {
    const admin = await new Session('postgres', 'postgrest-bootstrap-admin').init(); sessions.push(admin);
    assert.equal((await admin.rows('SELECT rolsuper FROM pg_roles WHERE rolname=current_user'))[0].rolsuper, true);
    // Refuse an existing DB rather than deleting data or hiding stale evidence.
    await admin.exec(`CREATE DATABASE ${identifier(DATABASE)};`, { failFast: true });
    const db = await new Session(DATABASE, 'postgrest-bootstrap-fixture').init(); sessions.push(db);
    report.serverVersion = (await db.rows('SELECT version() AS version'))[0].version;
    const fixture = await bootstrapApiFixture(db, root, report);
    await mkdir(dirname(fixturePath), { recursive: true });
    await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, { flag: 'wx' });
    report.fixtureSha256 = sha256(await readFile(fixturePath));
    report.status = 'PASSED';
    console.log(`Prepared synthetic PostgREST database ${DATABASE}; fixture ${fixturePath}`);
  } catch (error) {
    report.status = 'FAILED';
    report.error = { message: error.message, code: error.code, primaryMessage: error.primaryMessage };
    process.exitCode = 1;
    console.error(error);
  } finally {
    for (const session of sessions) session.kill();
    report.finishedAt = new Date().toISOString();
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Bootstrap report: ${reportPath}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
