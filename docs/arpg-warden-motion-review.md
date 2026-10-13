# Warden locomotion animation: local candidate

Base: e7b0c975f59e01550c4d19331db45da1fa670e67. Local only. This independent candidate does not incorporate the separately saved sword-pause repair; those packages require deliberate integration before either is treated as a combined game build.

## Player-visible correction

Wardens can now switch from their looping spawn idle to walk, turn the walk animation with their actual direction, and return to idle when stopped. Published GameScene registered idle/walk as infinite loops but refused to change their animation while isPlaying was true (published lines 438, 957 and 1211–1217).

Only the existing syncSprites selection condition changes: a different desired key can replace a known idle/walk loop. Same-key updates never restart it. Playing attack/death/other action animations remain protected, and a paused AnimationState is explicitly excluded even though Phaser reports isPlaying=false while paused.

## Scope and preservation

The production diff is four added lines and one removed line in src/lib/games/arpg/scenes/GameScene.ts. No movement, speed, collision, attack initiation/completion, hit range, damage, cooldown, manifest/frame, texture, clock, score, gold or reward/session code changes. The existing 90-second pause/background deadline remains intact. Other 14 ARPG production files match exact base.

This candidate does not modify frozen objectives, E-helper, waypoint, paving or sword-pause packages. No asset changes or new gameplay features are included.

## Verification

- Baseline: four isolated characterization tests reproduce stuck spawn-idle and stuck facing/stop loops while preserving active-attack protection.
- Red/green evidence: the new actual-AnimationState spawn/chase regression fails against pristine e7 with idle-S received instead of walk-E, while actual ECS motion still reaches x=102.16. It passes on this candidate.
- Candidate: seven suites / 121 tests pass: 109 unchanged published scene-readiness, boot-readiness/recovery, expedition-state/scene and town-session lifecycle tests, plus 12 new real Animation/AnimationState regressions.
- New coverage: actual spawn and ECS speed, four directions, turn/stop, identical-key frame and accumulator preservation, paused idle/walk/attack, attack timing and exactly one 12 HP completion-driven hit, subsequent current-facing locomotion, death/old-attack suppression, area teardown and owner cancellation.
- Strict GameScene dependency compilation passes against actual installed Phaser types with strict, noImplicitAny, exactOptionalPropertyTypes and noUncheckedIndexedAccess.

Animation, AnimationState, frame sequencing, pause/resume, completion events, scene selection, World and movement logic are real. Texture lookup and sprite rendering collaborators are lightweight doubles. This proves local state/animation transitions; it does not prove rendered appearance or a human playthrough. Browser, full app build, route DOM and hosted settlement are not exercised here. Independent review and clean replay receipts are separate package evidence.

## Integrity

Original GameScene SHA256: cefc928702d6471357f9b0636a5c42a6cb8baa78310d2bc2a26f6eae497d5336

Candidate GameScene SHA256: f5c85c543608b9e2dc4486ec6f06fff7c178ea9e48274e6ddfa01364f47ba11b

No migrations, database operations, servers, browser launches, commits, pushes or publication occurred.
