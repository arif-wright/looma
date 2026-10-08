// Review-only constants. No hosted configuration or captured metadata belongs here.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sha256, candidatePath } from './moonberry-use-fixture.mjs';
export const wrapperPath = 'scripts/sql/review/moonberry-share-v1.sql';
export const wrapperSha256 = 'c2a400f412f3433085f5df12a599ffed9145736e1436ecf0cdcbeabd71a45cf1';
export const productSha256 = '84732dbc9f0bbd328f400d6c6d5a3f1786df7fb69ef0b9330c7890bfd7aa621f';
export const scenarios = [
  'synthetic hardened baseline matches all rollout prerequisites',
  'lost transaction-local settings abort before feature DDL',
  'consent shape drift aborts without repairs',
  'table ownership and RLS drift abort without repairs',
  'each non-player configuration drift aborts without repairs',
  'global creator default ACL aborts before private schema creation',
  'unexpected public function defaults abort without repairs',
  'client membership and protected preference authority drift abort',
  'late postflight failure rolls back every feature object and quantity check',
  'real relation blocker causes bounded lock timeout and releases all locks',
  'synthetic runner failure rolls back feature DDL and history together',
  'exact reviewed wrapper commits with strict private and RPC postconditions',
  'uncertain synthetic runner response is reconciled by fresh history readback',
  'committed feature names reject reapplication without mutation'
];
export const lockScenario = scenarios[9];
export const lockLabel = 'rollout ALTER TABLE waits for synthetic user_items holder';

// A small SQL framing scanner, not a PostgreSQL parser. It accounts for nested
// block comments, quoted strings/identifiers, and dollar-quoted DO/function bodies.
export function statements(sql) {
  const result = [];
  let current = '', i = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i); i = end < 0 ? sql.length : end + 1; current += ' '; continue;
    }
    if (sql.startsWith('/*', i)) {
      let depth = 1; i += 2;
      while (depth && i < sql.length) {
        if (sql.startsWith('/*', i)) { depth++; i += 2; }
        else if (sql.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      assert.equal(depth, 0, 'Unterminated SQL comment'); current += ' '; continue;
    }
    const quote = sql[i];
    if (quote === "'" || quote === '"') {
      const start = i++; let closed = false;
      while (i < sql.length) {
        if (sql[i++] === quote) {
          if (sql[i] === quote) i++;
          else { closed = true; break; }
        }
      }
      assert(closed, 'Unterminated SQL quote'); current += sql.slice(start, i); continue;
    }
    const dollar = /^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/.exec(sql.slice(i));
    if (dollar) {
      const start = i, end = sql.indexOf(dollar[0], i + dollar[0].length);
      assert(end >= 0, 'Unterminated dollar quote'); i = end + dollar[0].length;
      current += sql.slice(start, i); continue;
    }
    if (sql[i] === ';') { if (current.trim()) result.push(current.trim()); current = ''; i++; }
    else current += sql[i++];
  }
  assert.equal(current.trim(), '', 'Every statement must terminate'); return result;
}
export async function readContract(root) {
  const bytes = await readFile(resolve(root, wrapperPath));
  const candidate = await readFile(resolve(root, candidatePath));
  assert.equal(sha256(bytes), wrapperSha256, 'Reviewed wrapper bytes changed');
  assert.equal(sha256(candidate), productSha256, 'Reviewed product bytes changed');
  const wrapper = bytes.toString('utf8'), delimiter = '$moonberry_candidate$';
  const sections = wrapper.split(delimiter); assert.equal(sections.length, 3);
  assert.deepEqual(Buffer.from(sections[1], 'utf8'), candidate, 'Embedded product body must be byte-identical');
  const top = statements(wrapper);
  assert.deepEqual(top.slice(0, 5), [
    "SET LOCAL lock_timeout = '5s'", "SET LOCAL statement_timeout = '30s'",
    "SET LOCAL idle_in_transaction_session_timeout = '5s'", "SET LOCAL transaction_timeout = '60s'",
    "SET LOCAL search_path = ''"
  ]);
  assert.equal(top.length, 6, 'Only five SET LOCAL statements and one atomic DO are permitted');
  assert.match(top[5], /^DO \$rollout\$[\s\S]+END;\s*\$rollout\$$/);
  return { wrapper, wrapperPath, wrapperSha256, productSha256, topLevelStatementCount: top.length };
}
