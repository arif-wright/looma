# Pause-resume sword impact: local candidate

Base: e7b0c975f59e01550c4d19331db45da1fa670e67. Local only; no publication or browser verification.

## Verified defect and fix

Published GameScene pauses hero/enemy animations but leaves the sword's 140 ms scene timer running (published lines 890–903 and 1327–1345). If that callback becomes due during pause, its guard discards the impact permanently. If the player resumes just before it becomes due, the hit instead arrives too early in active gameplay. Baseline characterization reproduces both using the actual installed Phaser Clock.

The candidate retains that one TimerEvent and pauses/resumes its remaining delay with the hero animation. No whole-Clock or whole-scene pause is introduced. The existing 90-second monotonic expedition deadline still includes pause/background time. The unrelated 120 ms enemy tint-reset timer stays active.

Cancellation clears the pending reference on area changes and scene shutdown/destroy. A callback identity check prevents cancelled or already-consumed closures from hitting again or clearing a new floor's timer. Existing area-epoch and deadline checks remain.

Two intentional adjacent safety changes: applyAttackHit also rejects a no-longer-current owner and a missing/dead player. These close existing callback-before-next-update windows; they are not changes to damage, range, cooldown, scoring or rewards.

## Scope

One production file changes: src/lib/games/arpg/scenes/GameScene.ts. One focused unit suite and this review document are new. Expedition/session code, damage/cooldown/range constants, loot amounts, account reward protocol, art and town geometry remain byte-for-byte at the base. No frozen objectives, E-helper, waypoint or paving package is modified.

## Verification

- Baseline source: 41 unchanged expedition/scene tests plus 3 deterministic characterization tests pass; these assert the defects are present.
- Final candidate: 7 suites, 126 tests pass. This comprises 109 unchanged published tests covering scene readiness, boot readiness/recovery, expedition state, scene wiring and town-session lifecycle, plus 17 new actual-Clock regressions.
- Regressions include preserved remaining delay, early/lost impact, pre-insertion pause, repeated pause/resume, single dispatch, stale closures, retreat/descent, shutdown/destroy, owner cancellation, player death, expired-before-frame and timeout-during-pause, unchanged 110 px offset / 85 px radius and 320 ms cooldown, and unaffected tint reset.
- Strict TypeScript compilation passes for GameScene and its dependency closure against the installed Phaser types, using strict, noImplicitAny, exactOptionalPropertyTypes and noUncheckedIndexedAccess.
- Independent review passed 20 tests including a 50-case timing matrix, plus 15 baseline characterizations. Its final source receipt is retained separately.

Rendering/animation collaborators are mocked. Clock/TimerEvent, scene methods, World and expedition logic are real. This is deterministic runtime/lifecycle evidence, not visual playtest evidence. A full application build, route DOM suite, hosted settlement, browser and human playthrough were not run for this small candidate.

## Alternative considered

Deferring an already elapsed callback until Resume would make the impact immediate after resume and move it out of alignment with the paused attack animation. Preserving the original remaining delay is narrower and retains active-gameplay timing. Pausing the whole Clock would also change unrelated tint timers, so it is intentionally avoided.

## Integrity

Original GameScene SHA256: cefc928702d6471357f9b0636a5c42a6cb8baa78310d2bc2a26f6eae497d5336

Candidate GameScene SHA256: f7bd90291940acc25d7eceb72e77cb621d307279cc91da090541c69916af2a31

No migrations, database changes, servers, browser launches, commits, pushes or publication occurred.
