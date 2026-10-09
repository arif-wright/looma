# Recovery release verification

Classification: release-blocker reliability fixes. A stalled run completion must become recoverable without inventing a failure or submitting a new run; a portal response lost after arrival must not leave obsolete failure guidance.

## Product scope

- Game SDK signing and completion requests each have a 30-second deadline, including body reads. A timeout preserves uncertainty and the original frozen run for explicit same-run retry. Late responses cannot settle a newer attempt.
- Wilds portal feedback follows the current authoritative destination in either arrival/failure delivery order, with per-attempt isolation.
- A Three snapshot without the local player cannot manufacture an arrival at the fallback area.

No server transport, reward rates, settlement handlers, hosted SQL, inventory or permission changes are included.

## Local reproduction

Use Node 22, then run from the repository root:

```sh
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix scripts/testing/recovery-dom
./node_modules/.bin/svelte-kit sync
mkdir -p artifacts/recovery-release/dom
for suite in neon portal; do
  node scripts/testing/recovery-dom/node_modules/vitest/vitest.mjs run --config scripts/testing/recovery-dom/$suite.config.mjs --reporter=default --reporter=json --outputFile="$PWD/artifacts/recovery-release/dom/$suite.json"
  node scripts/testing/recovery-dom/verify-results.mjs "$suite" "$PWD/artifacts/recovery-release/dom/$suite.json"
done
```

The 3 Neon and 52 portal tests compile the actual Svelte components but use synthetic transport/renderers. They do not prove live settlement, browser rendering, touch behavior or accessibility. The separate browser fixture executes 80 portal cases across desktop/narrow Phaser/Three and landscape Phaser using actual renderers and checked-in assets.

`.github/workflows/recovery-release.yml` deliberately runs the affected/root units, full Svelte/core diagnostics and build, DOM55, portal80, the complete world-service suite including native transport, and four existing disposable PostgreSQL/PostgREST suites. Its final gate fails if any layer fails or is skipped. Existing Neon and Wilds browser workflows remain additional release evidence. No hosted database credentials are used.

## Reviewed source guard

On main `98e9049c00b167200d39774a53f7edca77d9dc4e`, the original src tree is `882236c59c42b5c14cb7f28a442295d9690d9ae5`. The reviewed five source replacements plus new Phaser test yield `7e9fcfb1af33d0a09db4b2dfaaccd63d6f23bc0e`. The Supabase tree remains `0a420e027ca5ff8038408d43072ece95c6333c8c`. The PostgREST bootstrap refresh changes only its expected src hash and explanation; all isolation, privilege and fixture guards remain unchanged.

Prepublication local checks under Node 22.20.0: 868 root units in 82 suites; 96 affected units; 55 DOM cases; Svelte 0 errors/0 warnings; core types pass. Hosted CI results on the exact candidate are the authority for native/browser acceptance.

## Rollback

Revert this code-only release or restore the previous production deployment if recovery regresses. No database rollback is needed. Keep the source pin aligned with whichever reviewed src tree is restored, and rerun the exact-commit release checks.


## Separate local start-session recovery candidate

The startup candidate adds SDK27, template9, ARPG boot5 and viewport18 focused unit
cases, plus 32 maintained-start and 17 legacy-start DOM cases. These exercise real
Svelte/SDK code with synthetic Auth/network/engines, and real viewport helper logic
with synthetic browser objects. They do not establish actual browser fullscreen,
orientation locking or hosted gameplay.

From the root on Node 22, run:

```sh
bash scripts/testing/recovery-dom/run-start-recovery.sh
```

This additionally reruns the 3 existing completion and 52 portal DOM cases (104 total).
The current recovery-release workflow is intentionally preserved unchanged; its DOM
job runs the original 55 cases. Before publishing this separate startup candidate,
add the startup runner as an independently reviewed CI step. Root Vitest already
includes the new focused unit files. See `docs/start-session-recovery-review.md` for
uncertainty, owner identity, verification and the local-only scope.

The reviewed startup source tree is `1a4751e650e015656492ece5a484964d79ccee1d`.
The local PostgREST bootstrap pin changes only to that reviewed source tree;
its isolation/permission guards and the Supabase pin remain unchanged. This pin
refresh is not evidence of a native/PostgREST run for the startup candidate.
