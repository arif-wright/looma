// Embedded PostgreSQL semantics only: no sockets, hosted data, or concurrency claim.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const packagePath = process.env.PGLITE_PACKAGE_PATH;
assert(packagePath?.startsWith('/'), 'Set PGLITE_PACKAGE_PATH to an isolated installed @electric-sql/pglite dist/index.js');
const { PGlite } = await import(pathToFileURL(packagePath).href);
const db = new PGlite();
const root = new URL('../../', import.meta.url);
try {
  for (const file of [
    'tests/sql/connected-wilds-fixture.sql',
    'supabase/migrations/20260802210000_world_persistence.sql',
    'supabase/migrations/20261005052000_connected_wilds_portals.sql',
    'tests/sql/connected-wilds-portals.sql'
  ]) {
    await db.exec(await readFile(new URL(file, root), 'utf8'));
    console.log(`PASS ${file}`);
  }
  console.log('PASS embedded sequential PostgreSQL: no native concurrency, no live service, no migration applied outside this disposable in-memory database.');
} catch (error) {
  console.error('FAIL embedded sequential SQL', error.message, error.code, error.where ?? '');
  process.exitCode = 1;
} finally { await db.close(); }
