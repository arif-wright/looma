// Check actual SvelteKit build routing without starting the app or a browser.
import assert from 'node:assert/strict';
import { manifest } from '../../../.svelte-kit/output/server/manifest-full.js';
for (const [path, expected] of [
  ['/app/games/tiles-run', '/app/(archive)/games/tiles-run'],
  ['/app/games/tiles-run/', '/app/(archive)/games/tiles-run'],
  ['/app/games/runner', '/app/(game)/games/runner'],
  ['/games/tiles-run/embed', '/games/tiles-run/embed']
]) {
  const route = manifest._.routes.find((entry) => entry.pattern.test(path));
  assert.equal(route?.id, expected, path);
  console.log(`PASS: ${path} resolves to ${expected}`);
}
