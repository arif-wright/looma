# Town/departure integration review — local candidate, 2026-10-09

## Baseline and scope

GitHub main was verified identical to deployed PR15 merge e80cb3565f71477a4f5a746dc4eba1ed0fdcc607. The local publication snapshot matches all 30 published-file hashes and its independently recomputed source tree c7342a54a765e88007bdfedceced679b3c32a7c1. Both frozen dungeon-foundation and untimed-town patches apply cleanly to that baseline.

This candidate remains local. No repository push, PR, deployment, hosted workflow execution, database change, permission change or art generation occurred. Concept art is not a runtime asset and is not included in this code change.

## Integration defects resolved

- Updated the inherited legacy ARPG fixture from automatic session start on mount to untimed town boot plus explicit departure. Preserved all nine Wrapper cases and eight ARPG lifecycle cases; no skipped coverage was used to hide the contract change.
- Added the existing dedicated town route/SDK suite and expedition/coordinator unit suites to the strict local startup runner and result contracts.
- Fixed control-layer ordering: buttons are now inserted after the panel instead of allowing the panel to draw over them. A scene-method regression checks actual child ordering.
- Independent review found a partial scene-entry failure could leave expeditionActive set while the coordinator offered another start. A second accepted session could then silently fail to enter. The coordinator now blocks after accepted-session entry failure; the route stops the damaged renderer and offers Refresh. A real Scene/coordinator regression proves that partial mutation cannot create a second session, and the actual-route DOM test covers shutdown, honest local-abandonment wording and blocked stale callbacks.

## Reviewed local metadata updates

Final source tree: dacfeeadab4041eb14af38422504dcfd08527c6c.

- startup-recovery.yml: exact source repin, 196 focused unit cases, 130 DOM cases; three expedition/town unit files and arpg-town DOM suite added.
- arpg-scene-readiness.yml and recovery-release.yml: candidate source repin only.
- tests/sql/helpers/game-postgrest-bootstrap.mjs: same source-pin metadata and explanatory comment only. No SQL logic changed or database executed.

Programmatic comparison against the live baseline verifies that permissions, action/runtime/dependency pins, baseline-comparison source, Supabase/static tree pins and network isolation remain unchanged. Source-tree hashing was reproduced independently. These are local proposed workflow updates; no external workflow was triggered.

## Actual-engine fixture adaptation

The fixture still uses the actual route, SDK, boot module, GameScene, Phaser and repository assets. It retains ten readiness/owner/unmount/replacement cases under zero-session town loading, and adds one bounded real-input departure/movement/return case. Signing/receipt transport is synthetic, tightly scoped to that case and cannot reach a backend.

The strict gate now expects eleven browser cases and five PNG screenshots, complete decoded-texture equality, one first-attempt success per case, no retries/skips/flakes, network isolation and genuine post-return render observations. Seventy-two negative/report/protocol tests exercise the gate. Discovery is zero execution and cannot satisfy its execution mode.

The fixture does not establish full combat, kill/loot balance, complete floor traversal, full-length timeout, touch/mobile, hosted authentication, server persistence or reward settlement. It does not fabricate images, emit readiness, mutate gameplay outcomes or substitute rendered proof.

## Verification and remaining limits

See the package VERIFICATION.md for the exact final counts and commands. Local runtime is Node24.19.0, while approved release workflows still require Node22. The prior local browser launch denial was not retried; this snapshot still lacks the repository PNG bytes. No browser-results.json exists for this candidate. Permitted exact-candidate release/browser/native/SQL gates and actual screenshot review remain necessary before publication or a playable/visual quality claim.

Production art generation remains paused pending style review. Run-local character levels/gold, placeholder town markers and the 90-second expedition cap retain their previously documented limitations. Town itself is untimed.

## Hosted review follow-up

After explicit approval, the exact candidate was published to the separate `codex/memvoya-untimed-town-20261009` branch and draft PR16, without merge or production replacement. Initial head e32dcb954069057f14baf6e045ed04d5f028eee9 used the source tree above. Its Node22 root suite passed 1,011 tests; startup gates passed 196 focused units, 130 DOM cases and 42 synthetic browser cases.

Actual-engine run 37986054143 passed ten readiness/lifecycle cases and failed the eleventh. Native observations show start response at 14,736.6ms, movement checkpoint at 19,288.5ms with 4,251.2ms expedition elapsed, then timeout signing at 19,917.5ms with duration 5000. The return control was sampled after the five-second synthetic cap had correctly rescued the hero. This is retained as a failing attempt, not relabeled as success.

The fixture-only correction uses a 20-second synthetic cap, >20-second native town-idle periods on each side, fewer readback roundtrips and a 120-second budget for case 11 only. It still requires actual keyboard/canvas input, explicit pretimeout retreat, frozen town elapsed, one session and one matching synthetic settlement; no retries, fake clocks or security changes. Its verifier now has 73 self-tests.

Genuine screenshot review also exposed foreground floor textures overpainting world actors and markers. A small rendering correction puts all floor tiles into a lower, internally y-sorted depth band; walls and actors retain their original sorting. The existing blue hero ring is visible above its shadow, both ground indicators track movement depth, and the town vignette is lighter while the dungeon value stays unchanged. Four regressions raise the scene suite to 25 and focused units to 200. New source tree: 5c77b21fb1a313170beb3b12ad92db76be59fc29; all four metadata pins and strict counts are updated accordingly.

These changes add no artwork. The existing dark patchwork floor, placeholder town markers, some HUD/marker overlap and small hero remain visual limitations. Neither these screenshots nor a passing fixture establish painterly art, full combat/two-floor balance, actual-phone performance or real account settlement. A fresh exact-head hosted run and screenshot review are required after this correction.
