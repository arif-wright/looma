# Dungeon expedition foundation — local prototype

## Status and important limit

**Not published, not a finished ARPG, and not visually verified. The inherited 90-second visit limit still includes town and pause time.** This first slice makes the intended gameplay loop explicit without changing the server reward/session protocol. It is not yet the leisurely town-and-dungeon experience requested. Real-browser playtesting, timing, mobile controls, and dedicated original town art remain release gates.

## Inspection

The prior scene is one fixed 28×18 arena with four skeletons, four breakable loot props, movement/dash/melee, and a 90-second score session. There is no hidden town, level selection, floor progression, in-scene hero leveling, or equipment progression. Account XP/currency settlement exists on the route and is distinct from hero progression. The world architecture explicitly keeps its authoritative multiplayer work separate from the ARPG; this patch respects that boundary.

The floor/wall bug is real: preload registers `floor_0`/`wall_0` etc., while the old renderer supplied URL strings as texture keys. Rendering now uses registered keys. A collision sample accidentally used x=0 instead of the entity's x; that is corrected. Collected loot effects are now destroyed rather than removed from tracking while remaining visible.

## Implemented locally

- Lantern Square safe spawn: no enemy spawns or combat damage. A gate leads to the expedition; a hearth marker explains healing on return. A supply marker explicitly says services are coming later. These are original geometric placeholders, not finished vendor/NPC art or functional shops.
- Mossgate Ruins: first floor, four wardens, moss-colored tiles and a short interior obstacle.
- Ember Vault: second floor, six tougher wardens, warmer tiles and different interior obstacles.
- Clear every warden to unlock descent/home. Gate interaction uses E at the marker; visible HUD controls provide a direct accessible transition shortcut.
- Hero gains 25 local XP per kill; every 100 XP increases level, maximum HP by 20, and sword damage by 6. Floors preserve health/score; returning to town heals.
- Crate gold is run-local. Retreat banks carried gold; rescue loses unbanked gold. Returning cannot reenter the same visit or bank twice. The summary remains in town until Finish visit or timeout.
- Transition cleanup cancels pending scene timers/tweens, destroys actual Layer children, rebuilds the world, and rejects stale enemy attack callbacks. It does not restart Phaser or create another account session.
- No database writes, account inventory, server reward modifications, new assets, purchases, equipment drops, merchant transactions, or multiplayer were added. Existing score still settles exactly through the current route; the displayed gold does not grant account currency. “Banked” is within this visit only.

## Balance and timing, not playtest evidence

Floor 1 enemies have 45 HP; level-1 sword damage is 32, so each requires two hits. Clearing four yields level 2 (160 maximum HP, 38 damage). Floor 2 enemies have 60 HP and also require two hits; the eighth overall kill reaches level 3 (180 maximum HP, 44 damage). Normal damage cadence stays unchanged. This demonstrates both meanings of levels (floors and hero levels), but damage progression has not yet changed these particular enemy hit counts.

Both floors and the final return are exercised by deterministic tests. That proves transition reachability, not that a human can explore, clear ten enemies, loot and return comfortably within 90 seconds. The 28×18 room sizes and travel time make that cap a significant concern. No claim of balanced or enjoyable timing is made. The next playtest must measure novice and repeat-player completion time and damage taken, including exploration and hesitation.

With eight crates across two floors, maximum local scene score is 10×400 + 8×200 = 5,600. The repository migration specifies 9,000 score/minute and a 10–600 second session duration; that score needs at least 37.34 seconds to fit the rate. Actual hosted configuration has not been checked. Rapid early finishing/retreat should be checked against settlement validation, rather than hiding a new reward rule in this frontend patch. Existing page logic waits for the minimum session duration; the patch does not alter it.

## Next bounded slice: untimed town, independently bounded expedition

1. Render the safe town without starting a reward session. Start one only when the player chooses the gate, reusing startup cancellation and account ownership protection.
2. Pass the actual server-returned maximum/minimum duration into the expedition UI and define pause semantics explicitly. Keep the expedition bounded; town must not burn its clock.
3. Finish or abandon exactly once when returning, show pending/failed/settled state in the town, and permit another departure only when the previous session resolves. Never duplicate a reward on retry or navigation.
4. Reconcile early retreat, death, score rate, timeout, and offline return against the existing server rules before changing duration or reward economics. Any durable hero XP, equipment or gold needs a separate authoritative design and idempotent persistence contract.
5. Replace placeholders with original town/environment art, add a real quest giver and one useful town service, implement touch controls, and test the complete flow in a permitted browser with actual assets. Expand beyond two floors only after that loop feels good.

## Release checklist

- Real Phaser rendering with actual PNG assets: town, floors, labels, textures, camera, overlays, narrow layouts.
- Clear floor 1, descend, clear floor 2, return; retreat; die/rescue; timeout in town/dungeon/pause; finish repeatedly.
- Transition while attack animations, hit delays, loot glints and dash tweens are active; verify no old damage or render objects remain.
- Account change/navigation/unmount during loading and settlement; one reward at most.
- Measure completion time and revise town/session architecture before presenting this as the requested major game improvement.

See the accompanying verification report for checks actually run. The inherited scene-readiness documentation describes its separate candidate; it is not browser evidence for this patch.
