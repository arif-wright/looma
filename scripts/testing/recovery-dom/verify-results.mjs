import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOM_FILES, verifyVitest } from './verify-start-recovery-results.mjs';

// Keep the original DOM gate entry point, sharing the exact-file/count and
// no-skip/no-retry checks with the startup/town aggregate.
const [kind, filename, ...extra] = process.argv.slice(2);
assert(Object.hasOwn(DOM_FILES, kind) && filename && extra.length === 0,
  'Usage: node verify-results.mjs <neon|portal|start|legacy|arpg-town> <report.json>');
const report = JSON.parse(readFileSync(filename, 'utf8'));
console.log(verifyVitest(report, kind));
