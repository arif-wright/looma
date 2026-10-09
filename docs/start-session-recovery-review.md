# Start-session UI recovery: local candidate

Rebased locally on 2026-10-09 onto deployed release commit
`f314771573264e75267df68f56709a2dccf1c9ea`, complete repository tree
`b4a7a1fb53d929e0beb4cfad6b6304f8a3a87d00`, and production source tree
`7e9fcfb1af33d0a09db4b2dfaaccd63d6f23bc0e`. Both original startup patches
apply cleanly. The release's Playwright 1.57.0 lockfiles, workflows, browser fixes,
and existing verification helpers are inherited unchanged. The original startup
candidate and separate browser-readiness artifacts are preserved. This is a new,
distinct local candidate; the deployed release does not contain startup recovery.
No GitHub write, live gameplay/player API call, hosted SQL, deployment, security setting, billing change,
or account gameplay was performed for this work. Four existing Orbfield assets were restored
read-only from the original pinned source commit (historical main `98e9049c00b167200d39774a53f7edca77d9dc4e`) and verified against their recorded Git blob hashes;
their content is unchanged and is not part of the implementation delta.

## Observed failure and constraints

`startSession` previously awaited fetch and JSON indefinitely. Both maintained game
shells could remain at Starting with their start action disabled. The start route inserts
via `fn_game_start` before awaiting audit, analytics, player/wallet/companion/subscription
reads and event ingestion; a lost response can therefore follow a successful insert.

The current RPC always creates a fresh session and nonce. It has no idempotency key,
status lookup or cancellation command. The RPC itself grants no reward and spends no
energy, but every committed start counts toward the rolling daily session cap. This
candidate does not change those server semantics or apply the legacy start snapshot.

## Client behavior

- A single 30-second SDK deadline bounds Auth initialization, fetch and all body reads.
  A fetch abort is best effort; a promise race also releases the UI if transport ignores it.
- Session registration and start events occur only after the accepted response passes
  runtime identity/cap validation. Late responses from timeout/cancellation cannot register
  a session, emit a start, boot a game or replace a newer run.
- Network, malformed-success and server-error responses preserve uncertainty. Recovery
  explicitly starts a **new** run, with daily-limit guidance; no automatic request replay
  or fabricated completion/award is introduced.
- Browser Auth callbacks establish identity before POST and invalidate user-id changes.
  Rendered user identity protects the first asynchronous Auth callback too. Same-owner
  token refreshes do not cancel a start. This is stale-client-work protection, not an
  authorization decision; server authentication/ownership checks are unchanged.
- A changed account offers **Refresh page** so the rendered owner is refreshed before a
  new attempt. Signed-out users receive **Sign in**. Unavailable Auth fails before POST
  without crashing component mount.
- Runner and Orbfield cancel pending starts on explicit exit/unmount and owner changes
  during artwork preload or request handling. Synchronous click guards prevent duplicate
  starts. Existing background pause, practice and completion behavior is preserved.
- Legacy Wrapper, ARPG and integration-template startup are guarded separately so delayed
  preflight/import work cannot adopt abandoned starts. Template calls coalesce only an
  identical pending intent; a begin with an active session now rejects explicitly instead
  of silently replacing or reusing it. Finish that run before beginning another. See the accompanying tests and
  final verification report for their exact coverage.

## Deliberate boundaries

No unknown server session is recovered or cancelled. Abandoned starts may count toward
server quotas. Server-side post-insert optional effects remain unbounded; improving their
latency/delivery is a separate server-reliability change. Durable same-session start
recovery would need a separately reviewed idempotency/lookup design.

The screen-owner watcher protects startup, not the entire ongoing game or completion
lifecycle. Wrapper passes an AbortSignal to its optional `onLoaded` callback and rejects
late adoption; an already-running arbitrary callback must honor that signal to stop its
own side effects. The current repository callback is synchronous/no-op. Existing completion/legacy award behavior is not redesigned here. Local tests
simulate Auth, transport, renderers and engines. They cannot establish hosted cookie/Auth
integration, actual cross-tab delivery, server configuration, device rendering, touch
behavior, live rewards or deployed API health. No hosted smoke test was run. The new startup DOM runner is not wired into the
existing recovery workflow; that unrelated published workflow is deliberately unchanged.
Wire the startup runner into CI under a separately reviewed publication step.

## Local verification

Use Node 22 and the existing locked root and `scripts/testing/recovery-dom` dependencies.
The final evidence manifest records exact source hashes, commands, counts and outcomes.
New focused tests demonstrate stalled fetch/body/error-body reads, first-owner mismatch,
late responses after timeout/cancel, unauthorized starts, explicit fresh starts, metadata
compatibility, repeat-click exclusion, unmount, account refresh/sign-in and unchanged
practice. Existing completion tests are rerun to detect cross-flow regression.

The independent review found and prompted repairs for the initial Auth callback race and
stale-rendered-owner recovery loop. Final review and aggregate results are recorded with
the exact candidate. Browser/native/database integration evidence remains separate from
unit and synthetic component checks.


## Reviewed source identity

Independent Python and Node Git-object calculations agree on startup src tree
`1a4751e650e015656492ece5a484964d79ccee1d`. The baseline src tree remains
`7e9fcfb1af33d0a09db4b2dfaaccd63d6f23bc0e`, and both have Supabase tree
`0a420e027ca5ff8038408d43072ece95c6333c8c`. The local PostgREST bootstrap
refresh changes only its explanatory comment and expected src hash; every isolation
and permission guard is preserved. No SQL or native/PostgREST suite was executed
for this client-only candidate.


## Rebased execution and publication gates

The inherited Playwright 1.57.0 lockfiles select managed Chromium 143.0.7499.4,
revision 1200. The new actual-SDK startup browser fixture prepares 42 desktop
cases; discovery is not execution. No startup browser case has run in this
container. Its existing system Chromium 154.0.8037.57 cannot create the required
socket under the established environment restriction. No launch retry or
security-setting/flag change is permitted here. See the fixture README and the
rebased evidence for precise static, unit, component, and build results.

The unchanged `.github/workflows/recovery-release.yml` is specific to the
completion/portal release. Its native comparison uses historical baseline
`98e9049c00b167200d39774a53f7edca77d9dc4e` and expects candidate src
`7e9fcfb1af33d0a09db4b2dfaaccd63d6f23bc0e`; it will reject this startup source
`1a4751e650e015656492ece5a484964d79ccee1d`. It does not execute the new startup
DOM or browser cases. Before any publication, separately review the comparison's
intended subjects and exact source pins, retaining fail-closed isolation/toolchain
guards, and wire the startup DOM runner plus 42-case browser fixture with strict
nonempty, no-skips/no-retries result validation. Do not relax guards or reuse the
completed release's one-time merge exception. This local rebase deliberately
changes no workflow or dependency manifest.

A permitted environment with locked managed Chromium can execute the isolated
fixture without a production deployment. Using hosted repository CI additionally
requires authorized code publication and reviewed workflow wiring. Neither is
available under the current local-only continuation. After genuine execution,
retain/review reports, traces and screenshots against the final source. Real
Auth, native device interaction, actual engines and live settlement remain
separate integration evidence even if these synthetic-transport browser cases pass.


### ARPG real-engine boundary

ARPG `bootGame` awaits module imports but resolves immediately after constructing
`Phaser.Game`, before asynchronous `GameScene.preload/create`. The route clears
its boot deadline and startup owner/controller state at that constructor handoff.
The new guard bounds pending imports and constructor handoff only. It does not
bound later scene asset loading, establish that a playable scene exists, or
protect owner changes during that later scene loading. This pre-existing engine
contract is unchanged. The mocked ARPG tests and fake-engine 42-case maintained
shell fixture do not exercise it. An asset-readiness/ownership handshake would
be a separate real-engine follow-up requiring bounded design and browser tests.
