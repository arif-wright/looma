# Phase 8C.4 player body contract

## Ownership and compatibility

`profiles.player_body` is the Memvoya-owned source of truth. It is independent of Supabase authentication metadata, Google OAuth, email, handle, pronouns, and companion identity. The initial allowlist is `male | female`; existing rows and missing legacy values resolve to `male`.

The migration `supabase/migrations/20260805180000_profile_player_body.sql` adds the non-null field, database default, and check constraint. Profile owners can update it through the existing authenticated profile-details endpoint. Existing profile RLS remains authoritative; no new public or service-role mutation path is introduced.

Rollback requires first deploying code that no longer selects or signs `player_body`, then dropping `profiles_player_body_check` and `profiles.player_body`. The field is presentation-only, so rollback does not touch world location, inventory, economy, or companion records.

## Authenticated network projection

The SvelteKit world-ticket endpoint reads `player_body` in the same owner-scoped profile query used for display identity. It normalizes the value and signs it as `playerBody`. The browser cannot submit a body to matchmaking. The world server validates the signed claim, defaults a missing legacy claim to `male`, and copies it into the synchronized `PlayerState.playerBody` field. A normal signed-ticket refresh can update body and companion presentation for an active session; neither value is accepted unsigned.

`PlayerVisualState.playerBody` and `PlayerSnapshot.playerBody` are renderer-neutral public presentation fields. Renderers consume authoritative snapshots and never query Supabase. Location persistence remains unchanged because body selection belongs to the profile, not `player_world_state`.

## Renderer selection

`src/lib/game/playerBody.ts` is the web runtime allowlist and resolver:

- `male` -> `/game/sprites/players/male/player.atlas.json`
- `female` -> `/game/sprites/players/female/player.atlas.json`
- absent or unsupported -> the safe `male` default

Both manifests now contain the supplied production player pixels. Each body provides authored N/NE/E/SE/S idle and walk sequences; NW/W/SW are explicit horizontal mirrors of NE/E/SE. Three.js changes only the manifest URL passed to `HdSpriteEntity`; animation, atlas caching, billboarding, grounding, shadows, labels, opacity, facing, and diagnostics use the existing shared path. A body change in an authoritative snapshot replaces that entity's atlas-backed billboard without changing gameplay state.

The Phaser rollback renderer continues to use its placeholder sprite and consumes the same authoritative snapshots. It does not become authoritative and requires no protocol or movement changes.

## Extension contract

Adding another base body requires an allowlist/migration update and a new `players/<body>/player.atlas.json`; it does not require a new profile column or synchronized schema shape. Future layered clothing, hairstyles, armor, and cosmetics should be separate validated appearance selections composed over the base body. They must not be encoded as more body columns or inferred from identity-provider data.

Equipment composition, palette swaps, customization onboarding, and cosmetic entitlement validation remain explicitly deferred.

## Production asset commands

Source sheets live in `art-source/world/players/<body>/production/v1`. They are 5×5 grids of 256×256 transparent cells. The checked-in isolated frames and runtime pages are reproducible with:

```bash
npm run world:player:male:ingest
npm run world:player:male:validate
npm run world:player:male:pack
npm run world:player:female:ingest
npm run world:player:female:validate
npm run world:player:female:pack
```

Packing writes reviewed output under `artifacts/world/players/<body>/v1`; deployment assets are promoted to `static/game/sprites/players/<body>` without resizing or reinterpretation.
