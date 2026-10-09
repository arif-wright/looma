# Untimed town and expedition session ownership — local second slice

## Status

Local implementation and tests only. Not published, merged, deployed or migrated. Actual Phaser rendering, original-art appearance, touch controls, human playthrough/balance and hosted authentication/settlement remain unverified. This builds on the separately frozen dungeon-loop foundation; it does not replace or enter the startup-reliability PR.

## What changes

Lantern Square loads before any reward session is requested. Town browsing is untimed. The gate requests departure, but the scene cannot begin an expedition until the route has received a valid current-owner session. Repeated departure requests share a guard; no automatic replacement session is started after an uncertain start.

The expedition retains the inherited 90-second ceiling, reduced if the server returns a smaller maximum. It uses a monotonic clock and includes pause/background time. A delayed frame or pointer return samples the logical deadline correctly. Floors preserve a single expedition; return, rescue or timeout leads to the already-rendered town and reports one frozen outcome. Town is not paused or destroyed while saving.

A separate asynchronous coordinator owns the reward session. Start, minimum-duration waiting, signing, saving, uncertain retry, definite rejection, and disposal are explicit states. The route uses the existing direct signing/completion APIs; no server endpoints, database schemas, score values, reward multipliers or account persistence rules changed.

## Saving and recovery

- Short returns remain visible in town until the existing server minimum session duration has genuinely elapsed. Gameplay duration is preserved separately in stats. The submission duration is frozen once and is not enlarged by a delayed timer or a later retry.
- There is no waiting to pad score rate. A definite server rejection is shown as rejected, rather than suggesting that an altered score or longer duration can rescue it.
- An uncertain save retains its session and exact score/duration/success/stats. Retry signs/posts the same immutable result; another departure is unavailable until a receipt confirms settlement.
- Owner changes and unmount dispose the coordinator, abort pending starts, clear waiting timers, disable old scene controls and suppress late signing/completion/player-state/leaderboard presentation updates.
- Local abandonment is described accurately: it forgets client bookkeeping and cannot cancel a server-created row or reverse a reward already committed.
- The direct SDK completion overload avoids optional old-run event/reaction continuations. Account rewards shown by this route still come only from the server receipt. Presentation failure cannot turn a committed result into an inert retry state.
- Cross-reload offline receipt recovery is not implemented. No nonce/authentication information is persisted in ad hoc browser storage.

## Bridge and integration boundary

`bootGame` still resolves only when its owned scene is initialized and still returns no value. Its optional `onControls` callback receives an ownership-guarded controller after readiness. The scene reports departure and save-retry intentions through callbacks; the route authorizes `beginExpedition(maxDurationMs)` and sets town ready/starting/saving/retry/blocked presentation.

Existing one-argument game-over callbacks retain their behavior when duration is omitted. The ARPG route now receives score and monotonic gameplay duration. Readiness failure, cancellation, stale-owner suppression and renderer cleanup remain inherited requirements.

The first foundation's 90-second *whole visit* limitation is superseded by this slice: town is now untimed, while individual expeditions remain limited to 90 seconds. That is still a short dungeon prototype, not a complete campaign. Hero levels, banked gold, and town markers remain run-local/provisional; no persistent inventory, merchant or quest system is claimed.

## Release gates

1. Integrate on top of the exact reviewed reliability source and first foundation, retaining startup fixes; rebase if either ancestor changes.
2. Run the final focused, full unit, actual-route DOM, full Svelte diagnostics and build checks. Update any release fixture/pin that still assumes a reward session starts when the ARPG page mounts; that is intentionally no longer true.
3. In a permitted browser with actual assets: stay in town beyond 90 seconds with zero starts, depart once, clear/retreat/rescue, return while saving, retry a lost receipt, depart again after confirmation, change account and navigate during every phase.
4. Measure both-floor completion times and score rates against actual returned server caps. The existing ten-kill/eight-crate maximum is 5,600 score; the repository migration's 9,000/minute requires at least 37.34 seconds, but hosted caps were not checked here. No gameplay balance claim is made.
5. Verify original town art, responsive HUD, touch controls, and persistence design separately before presenting this as a finished Diablo-style experience.

See the package verification report for exact completed checks and any remaining fixture limitations.
