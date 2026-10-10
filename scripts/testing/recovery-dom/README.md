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


## Local startup and untimed-town integration

The local runner verifies 306 focused unit cases in 13 exact files:
SDK lifecycle 53, SDK start recovery 27, template start recovery 9, ARPG boot
start recovery 5, boot scene readiness 13, game scene readiness 20,
expedition model 8, expedition scene 33, town art 31, explorable plaza 34, responsive layout 25,
town coordinator 30 and fullscreen recovery 18.

It also verifies 130 real-component DOM cases: Neon completion 3, portal 52,
maintained-shell start 32, legacy Wrapper/ARPG 17 and dedicated ARPG town 26.
The nine Wrapper cases retain their prior coverage. The eight legacy ARPG cases
now exercise explicit departures after town boot, cancellation and owner changes,
uncertain-start recovery, fail-closed accepted-session cleanup when expedition entry partially fails,
and isolated town-load retries. The dedicated town suite covers untimed browsing,
repeat expeditions, frozen save retries, reward ownership and stale continuations.

From the root, with dependencies installed as above, run:

```sh
bash scripts/testing/recovery-dom/run-start-recovery.sh
# An installed Node 22 binary can be selected explicitly:
NODE_BIN=/absolute/path/to/node22 bash scripts/testing/recovery-dom/run-start-recovery.sh
```

The runner records the actual Node version, JSON reports and logs under
`artifacts/start-recovery/`, and first executes 190 report-verifier self-tests.
Both DOM verifier entry points use the same exact-file/count checks and reject
failed, skipped, pending, todo, duplicate and reported-retry cases. Every Vitest
invocation disables retries and focused-only tests. DOM runs deliberately use the
nested, locked fixture Vitest so happy-dom and jsdom resolve correctly. The
self-tests use synthetic report objects; they are not application test execution.

These tests exercise actual Svelte/SDK/coordinator/scene logic with synthetic
Auth, transport and engines. They do not establish hosted settlement, actual
browser rendering, fullscreen, orientation locking or mobile behavior. Browser
execution remains a separate gate. CI/release acceptance uses Node 22; a local
pass under another runtime must be identified as such.

### Workflow/source-pin integration

The startup workflow must run the same 13 focused unit files and all five DOM
suites as this local runner, with exact totals of 306 units and 130 DOM cases.
Compared with the inherited PR15 workflow (136 units and 104 DOM), this adds
`arpgExpedition.spec.ts`, `arpgExpeditionScene.spec.ts`, `arpgTownSession.spec.ts`,
`arpgTownCorner.spec.ts`, `arpgTownPlaza.spec.ts`, `arpgViewportLayout.spec.ts`
and the `arpg-town` DOM suite; the boot-readiness file also gains one case.
The existing no-retry, no-skip, isolation, browser and dependency guards must
remain intact.

The inherited PR15 source tree is
`c7342a54a765e88007bdfedceced679b3c32a7c1`. Every candidate source pin must match
the final reviewed source tree: the startup and ARPG-readiness workflows, the
candidate `expected_src` in `.github/workflows/recovery-release.yml`, and the
source guard in `tests/sql/helpers/game-postgrest-bootstrap.mjs`. The separate
recovery baseline comparison pin must not change. Keep unchanged database,
asset and toolchain pins unchanged. Neither a pin refresh nor this local aggregate
is proof that browser, native transport or disposable database gates ran.
